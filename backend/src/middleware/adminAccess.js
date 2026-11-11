// Keep administrator identities in backend environment configuration, never in browser data.
import { prisma } from "../lib/prisma.js";

export function configuredAdminEmails() {
    return new Set((process.env.ADMIN_EMAILS ?? "")
        .split(",")
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean));
}

export function isAdminEmail(email) {
    return typeof email === "string" && configuredAdminEmails().has(email.trim().toLowerCase());
}

// Verify administrator status from the database account attached to the valid session.
export async function requireAdmin(request, response, next) {
    try {
        const user = await prisma.user.findUnique({
            where: { id: request.user.id },
            select: { email: true, bannedAt: true }
        });
        if (!user || user.bannedAt || !isAdminEmail(user.email)) {
            return response.status(403).json({ success: false, message: "Administrator access is required." });
        }
        request.admin = { id: request.user.id, email: user.email };
        return next();
    } catch (error) {
        console.error("Administrator check failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not verify administrator access." });
    }
}

