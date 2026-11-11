// Require a valid browser session before accepting seller-only marketplace changes.
import { prisma } from "../lib/prisma.js";
import { hashSessionToken } from "../features/auth/authSecurity.js";

const SESSION_COOKIE = "campusx_session";

// Reject missing or expired sessions and attach only the current user's public identity.
export async function requireAuth(request, response, next) {
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) {
        return response.status(401).json({ success: false, message: "Sign in before continuing." });
    }

    try {
        const tokenHash = hashSessionToken(token);
        const session = await prisma.loginSession.findUnique({ where: { tokenHash }, include: { user: { select: { id: true, bannedAt: true } } } });

        if (!session || session.expiresAt.getTime() <= Date.now()) {
            await prisma.loginSession.deleteMany({ where: { tokenHash } });
            response.clearCookie(SESSION_COOKIE, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/"
            });
            return response.status(401).json({ success: false, message: "Your sign-in expired. Please sign in again." });
        }

        if (session.user.bannedAt) {
            await prisma.loginSession.deleteMany({ where: { tokenHash } });
            response.clearCookie(SESSION_COOKIE, {
                httpOnly: true,
                secure: process.env.NODE_ENV === "production",
                sameSite: "lax",
                path: "/"
            });
            return response.status(403).json({ success: false, message: "This account is suspended. Contact support if you think this is a mistake." });
        }

        request.user = { id: session.userId };
        return next();
    } catch {
        return response.status(500).json({ success: false, message: "We could not verify your sign-in." });
    }
}
