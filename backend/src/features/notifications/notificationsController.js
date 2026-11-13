// Keep each saved browser endpoint attached to the authenticated account that enabled it.
import { getPublicVapidKey, removePushSubscription, savePushSubscription } from "./pushNotifications.js";

export function getVapidPublicKey(_request, response) {
    const publicKey = getPublicVapidKey();
    return response.json({ success: true, enabled: Boolean(publicKey), publicKey });
}

export async function createPushSubscription(request, response) {
    const endpoint = request.body?.endpoint;
    const p256dh = request.body?.keys?.p256dh;
    const auth = request.body?.keys?.auth;

    if (typeof endpoint !== "string" || endpoint.length > 2048 || typeof p256dh !== "string" || typeof auth !== "string") {
        return response.status(400).json({ success: false, message: "The browser notification subscription is invalid." });
    }
    try {
        const endpointUrl = new URL(endpoint);
        if (endpointUrl.protocol !== "https:" || p256dh.length > 255 || auth.length > 255 || !p256dh || !auth) {
            return response.status(400).json({ success: false, message: "The browser notification subscription is invalid." });
        }
    } catch {
        return response.status(400).json({ success: false, message: "The browser notification subscription is invalid." });
    }

    if (!getPublicVapidKey()) {
        return response.status(503).json({ success: false, message: "Browser notifications are not configured on this server yet." });
    }

    try {
        await savePushSubscription(request.user.id, { endpoint, keys: { p256dh, auth } });
        return response.status(201).json({ success: true });
    } catch (error) {
        console.error("Browser subscription save failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not enable browser notifications." });
    }
}

export async function deletePushSubscriptions(request, response) {
    const endpoint = request.body?.endpoint;
    if (typeof endpoint !== "string" || endpoint.length > 2048) {
        return response.status(400).json({ success: false, message: "The browser notification subscription is invalid." });
    }
    try {
        await removePushSubscription(request.user.id, endpoint);
        return response.json({ success: true });
    } catch (error) {
        console.error("Browser subscription removal failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not disable browser notifications." });
    }
}
