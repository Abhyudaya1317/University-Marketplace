// Send opt-in browser push messages without exposing subscription endpoints or keys in logs.
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { prisma } from "../../lib/prisma.js";

const require = createRequire(import.meta.url);
const webPush = require("web-push");
let vapidConfigured = false;
let vapidConfigurationErrorLogged = false;

function getVapidConfiguration() {
    const publicKey = process.env.VAPID_PUBLIC_KEY?.trim();
    const privateKey = process.env.VAPID_PRIVATE_KEY?.trim();
    const subject = process.env.VAPID_SUBJECT?.trim();
    if (!publicKey || !privateKey || !subject) return null;

    if (!vapidConfigured) {
        try {
            webPush.setVapidDetails(subject, publicKey, privateKey);
            vapidConfigured = true;
        } catch (error) {
            if (!vapidConfigurationErrorLogged) {
                console.error("Browser push configuration is invalid:", error?.name ?? "UNKNOWN");
                vapidConfigurationErrorLogged = true;
            }
            return null;
        }
    }
    return { publicKey };
}

export function getPublicVapidKey() {
    return getVapidConfiguration()?.publicKey ?? null;
}

export async function savePushSubscription(userId, subscription) {
    const endpointHash = createHash("sha256").update(subscription.endpoint).digest("hex");
    await prisma.pushSubscription.upsert({
        where: { endpointHash },
        create: {
            endpoint: subscription.endpoint,
            endpointHash,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            userId,
        },
        update: {
            endpoint: subscription.endpoint,
            p256dh: subscription.keys.p256dh,
            auth: subscription.keys.auth,
            userId,
        },
    });
}

export async function removePushSubscription(userId, endpoint) {
    const endpointHash = createHash("sha256").update(endpoint).digest("hex");
    await prisma.pushSubscription.deleteMany({ where: { userId, endpointHash } });
}

// Push failures never roll back a request, decision, or message already saved in the database.
export async function sendPushNotification(userId, notification) {
    try {
        if (!getVapidConfiguration()) return;

        const subscriptions = await prisma.pushSubscription.findMany({ where: { userId } });
        await Promise.all(subscriptions.map(async (subscription) => {
            try {
                await webPush.sendNotification({
                    endpoint: subscription.endpoint,
                    keys: { p256dh: subscription.p256dh, auth: subscription.auth },
                }, JSON.stringify(notification), { TTL: 60 });
            } catch (error) {
                // Remove endpoints that push providers have permanently expired or revoked.
                if (error?.statusCode === 404 || error?.statusCode === 410) {
                    await prisma.pushSubscription.deleteMany({ where: { endpointHash: subscription.endpointHash } });
                } else {
                    console.error("Browser push delivery failed:", error?.statusCode ?? error?.code ?? "UNKNOWN");
                }
            }
        }));
    } catch (error) {
        console.error("Browser push lookup failed:", error?.code ?? error?.name ?? "UNKNOWN");
    }
}
