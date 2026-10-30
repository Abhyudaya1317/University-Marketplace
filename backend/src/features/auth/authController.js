// Keep account creation, password checks, reset codes, and browser sessions together.
import bcrypt from "bcryptjs";
import { OAuth2Client } from "google-auth-library";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { prisma } from "../../lib/prisma.js";
import {
    createEmailCode,
    createSessionToken,
    emailCodeMatches,
    hashEmailCode,
    hashSessionToken
} from "./authSecurity.js";
import { isEmailDeliveryConfigured, sendPasswordResetCode } from "./emailService.js";

const CODE_LIFETIME_MS = 10 * 60 * 1000;
const RESEND_WAIT_MS = 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_SALT_ROUNDS = 12;
const SESSION_COOKIE = "campusx_session";
const OAUTH_STATE_COOKIE = "campusx_google_state";

// Normalize email so case or surrounding spaces cannot create duplicate accounts.
function normalizeEmail(value) {
    if (typeof value !== "string") { //Someone could accidentally pass a number, an object, or undefined instead of an email string.
        return null;
    }

    const email = value.trim().toLowerCase();
    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/; //This is a regular expression, often called a regex. It checks whether text follows a particular pattern.

    return email.length <= 254 && emailPattern.test(email) ? email : null; //validation of value
}

// Keep names readable and bounded before storing them in a public profile.
function normalizeFullName(value) {
    if (typeof value !== "string") return null;
    const fullName = value.trim().replace(/\s+/g, " ");
    return fullName.length >= 2 && fullName.length <= 100 ? fullName : null;
}

// Accept only HTTPS profile pictures from a verified identity provider.
function normalizeAvatarUrl(value) {
    if (typeof value !== "string" || value.length > 500) return null;
    try {
        const url = new URL(value);
        return url.protocol === "https:" ? url.toString() : null;
    } catch {
        return null;
    }
}

// Instead of writing cookie security settings repeatedly in different places, we define them once and reuse them.
function sessionCookieOptions() {
    return {
        httpOnly: true, //This prevents ordinary JavaScript running in the browser from reading the cookie through document.cookie.
        secure: process.env.NODE_ENV === "production",  //secure determines whether the browser should send the cookie only over HTTPS.
        sameSite: "lax", //This setting helps protect against Cross-Site Request Forgery (CSRF) attacks.
        path: "/" //This tells the browser that the cookie is available to requests throughout the website's URL paths.
    };
}

//Create a login session
// Issue an opaque browser token while storing only its hash in PostgreSQL.
async function createUserSession(user, response) {
    const token = createSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_LIFETIME_MS);

    //This part stores the session in our database using Prisma
    await prisma.loginSession.create({ 
        data: {
            tokenHash: hashSessionToken(token), //stored hashed token
            userId: user.id, 
            expiresAt //This saves the expiration date calculated earlier.
        }
    });
    
    response.cookie(SESSION_COOKIE, token, {
        ...sessionCookieOptions(),
        expires: expiresAt
    });
}

// Return a uniform validation error without disclosing account or password details.
function invalidCredentials(response) {
    return response.status(400).json({
        success: false,
        message: "Check your email and password, then try again."
    });
}

// Accept personal email and password for a new account without checking student status.
export async function signUp(request, response) {
    const email = normalizeEmail(request.body?.email);
    const fullName = normalizeFullName(request.body?.fullName);
    const password = request.body?.password;

    if (!email || !fullName || typeof password !== "string" || password.length < 10 || password.length > 128) {
        return response.status(400).json({
            success: false,
            message: "Enter your full name, a valid email, and a password between 10 and 128 characters."
        });
    }

    try {
        const passwordHash = await bcrypt.hash(password, PASSWORD_SALT_ROUNDS);
        const user = await prisma.user.create({ data: { email, fullName, passwordHash } });
        await createUserSession(user, response);

        return response.status(201).json({
            success: true,
            user: { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl }
        });
    } catch (error) {
        if (error?.code === "P2002") {
            return response.status(409).json({ success: false, message: "An account with this email already exists. Sign in instead." });
        }

        return response.status(500).json({ success: false, message: "We could not create your account. Please try again." });
    }
}

// Compare the submitted password only with a stored one-way password hash.
export async function signIn(request, response) {
    const email = normalizeEmail(request.body?.email);
    const password = request.body?.password;

    if (!email || typeof password !== "string" || password.length > 128) {
        return invalidCredentials(response);
    }

    try {
        const user = await prisma.user.findUnique({ where: { email } });
        const passwordMatches = user?.passwordHash
            ? await bcrypt.compare(password, user.passwordHash)
            : false;

        if (!user || !passwordMatches) {
            return response.status(401).json({ success: false, message: "Email or password is incorrect." });
        }

        await createUserSession(user, response);
        return response.json({ success: true, user: { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl } });
    } catch {
        return response.status(500).json({ success: false, message: "We could not sign you in. Please try again." });
    }
}

// Start password recovery with the same response whether an account exists or not.
export async function requestPasswordResetCode(request, response) {
    const email = normalizeEmail(request.body?.email);

    if (!email) {
        return response.status(400).json({ success: false, message: "Enter a valid email address." });
    }

    if (!isEmailDeliveryConfigured()) {
        return response.status(503).json({ success: false, message: "Email delivery is not configured yet. Add SMTP settings to backend/.env." });
    }

    try {
        const user = await prisma.user.findUnique({ where: { email }, select: { id: true } });
        const previousCode = await prisma.passwordResetCode.findUnique({ where: { email } });
        const resendAllowedAt = previousCode ? previousCode.createdAt.getTime() + RESEND_WAIT_MS : 0;

        if (Date.now() < resendAllowedAt) {
            return response.status(429).json({ success: false, message: "Please wait a minute before requesting another code." });
        }

        if (user) {
            const code = createEmailCode();
            const codeHash = hashEmailCode(email, code);
            const expiresAt = new Date(Date.now() + CODE_LIFETIME_MS);

            await prisma.passwordResetCode.upsert({
                where: { email },
                create: { email, codeHash, expiresAt },
                update: { codeHash, expiresAt, attempts: 0, createdAt: new Date() }
            });

            try {
                await sendPasswordResetCode(email, code);
            } catch (error) {
                // Record transport metadata only; never log the code, address, or credentials.
                console.error("Password reset email delivery failed:", {
                    code: error?.code,
                    responseCode: error?.responseCode,
                    command: error?.command,
                    originalCode: error?.originalCode
                });
                await prisma.passwordResetCode.deleteMany({ where: { email, codeHash } });
                return response.status(503).json({ success: false, message: "We could not send the email right now. Check the mail settings and try again." });
            }
        }

        return response.json({ success: true, message: "If an account uses that email, a password-reset code has been sent." });
    } catch {
        return response.status(500).json({ success: false, message: "We could not start password recovery. Please try again." });
    }
}

// Verify one short-lived reset code and replace the password in one transaction.
export async function resetPassword(request, response) {
    const email = normalizeEmail(request.body?.email);
    const code = request.body?.code;
    const newPassword = request.body?.newPassword;

    if (!email || typeof code !== "string" || !/^\d{6}$/.test(code)
        || typeof newPassword !== "string" || newPassword.length < 10 || newPassword.length > 128) {
        return response.status(400).json({ success: false, message: "Enter the email, six-digit code, and a password between 10 and 128 characters." });
    }

    try {
        const savedCode = await prisma.passwordResetCode.findUnique({ where: { email } });
        if (!savedCode || savedCode.expiresAt.getTime() <= Date.now() || savedCode.attempts >= MAX_CODE_ATTEMPTS) {
            if (savedCode) await prisma.passwordResetCode.deleteMany({ where: { id: savedCode.id } });
            return response.status(400).json({ success: false, message: "That code is invalid or expired. Request a new one." });
        }

        if (!emailCodeMatches(email, code, savedCode.codeHash)) {
            const attempts = savedCode.attempts + 1;
            if (attempts >= MAX_CODE_ATTEMPTS) {
                await prisma.passwordResetCode.deleteMany({ where: { id: savedCode.id } });
            } else {
                await prisma.passwordResetCode.updateMany({ where: { id: savedCode.id, attempts: savedCode.attempts }, data: { attempts } });
            }
            return response.status(400).json({ success: false, message: "That code is invalid or expired. Request a new one." });
        }

        const passwordHash = await bcrypt.hash(newPassword, PASSWORD_SALT_ROUNDS);
        await prisma.$transaction(async (transaction) => {
            const consumed = await transaction.passwordResetCode.deleteMany({
                where: { id: savedCode.id, codeHash: savedCode.codeHash, expiresAt: { gt: new Date() } }
            });
            if (consumed.count !== 1) throw new Error("The reset code was already used.");
            await transaction.user.update({ where: { email }, data: { passwordHash } });
            await transaction.loginSession.deleteMany({ where: { user: { email } } });
        });

        response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
        return response.json({ success: true, message: "Password updated. Sign in with your new password." });
    } catch {
        return response.status(500).json({ success: false, message: "We could not reset your password. Please try again." });
    }
}

// Redirect to Google's official consent page using a random anti-forgery state value.
export function startGoogleSignIn(request, response) {
    const { googleClient, callbackUrl } = getGoogleConfiguration();
    if (!googleClient) {
        return response.status(503).json({ success: false, message: "Google sign-in is not configured yet. Add Google OAuth settings to backend/.env." });
    }

    const state = randomBytes(32).toString("base64url");
    response.cookie(OAUTH_STATE_COOKIE, state, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/auth/google",
        maxAge: 10 * 60 * 1000
    });

    const url = googleClient.generateAuthUrl({
        redirect_uri: callbackUrl,
        response_type: "code",
        scope: ["openid", "email", "profile"],
        state
    });
    return response.redirect(url);
}

// Validate Google's response, then create or reuse a local account and session.
export async function finishGoogleSignIn(request, response) {
    const { googleClient, callbackUrl } = getGoogleConfiguration();
    const savedState = request.cookies?.[OAUTH_STATE_COOKIE];
    const receivedState = request.query?.state;
    const frontendUrl = process.env.FRONTEND_URL || "http://localhost:4200";

    response.clearCookie(OAUTH_STATE_COOKIE, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/api/auth/google"
    });

    if (!googleClient) {
        return redirectAfterGoogleFailure(response, frontendUrl, "google_not_configured");
    }

    if (!savedState) {
        return redirectAfterGoogleFailure(response, frontendUrl, "google_state_cookie_missing");
    }

    if (typeof receivedState !== "string" || !safeStringMatch(savedState, receivedState)) {
        return redirectAfterGoogleFailure(response, frontendUrl, "google_state_mismatch");
    }

    if (request.query?.error) {
        return redirectAfterGoogleFailure(response, frontendUrl, "google_sign_in_cancelled");
    }

    if (typeof request.query?.code !== "string") {
        return redirectAfterGoogleFailure(response, frontendUrl, "google_code_missing");
    }

    try {
        const { tokens } = await googleClient.getToken({ code: request.query.code, redirect_uri: callbackUrl });
        const ticket = await googleClient.verifyIdToken({ idToken: tokens.id_token, audience: process.env.GOOGLE_CLIENT_ID });
        const profile = ticket.getPayload();
        const email = profile?.email_verified ? normalizeEmail(profile.email) : null;

        if (!email) {
            return redirectAfterGoogleFailure(response, frontendUrl, "google_email_unverified");
        }

        const googleName = normalizeFullName(profile.name);
        const googleAvatar = normalizeAvatarUrl(profile.picture);
        const existingUser = await prisma.user.findUnique({ where: { email } });
        const user = existingUser
            ? await prisma.user.update({
                where: { id: existingUser.id },
                data: {
                    fullName: existingUser.fullName ?? googleName,
                    avatarUrl: existingUser.avatarUrl ?? googleAvatar
                }
            })
            : await prisma.user.create({ data: { email, fullName: googleName, avatarUrl: googleAvatar } });
        await createUserSession(user, response);
        return response.redirect(`${frontendUrl}/`);
    } catch (error) {
        // Log only safe provider error identifiers, never OAuth codes or client secrets.
        console.error("Google OAuth callback failed:", {
            name: error?.name,
            code: error?.code,
            status: error?.response?.status,
            providerError: safeProviderError(error?.response?.data?.error)
        });
        return redirectAfterGoogleFailure(response, frontendUrl, "google_callback_failed");
    }
}

// Give the account page a safe reason code and record the failure stage for local debugging.
function redirectAfterGoogleFailure(response, frontendUrl, reason) {
    console.warn("Google OAuth sign-in did not complete:", reason);
    return response.redirect(`${frontendUrl}/auth?error=${reason}`);
}

// Only permit a short provider error identifier into logs; do not print response bodies.
function safeProviderError(value) {
    return typeof value === "string" && /^[a-z_]{1,48}$/i.test(value) ? value : undefined;
}

// Create the OAuth client only when all required provider settings exist.
function getGoogleConfiguration() {
    const clientId = process.env.GOOGLE_CLIENT_ID;
    const clientSecret = process.env.GOOGLE_CLIENT_SECRET;
    const callbackUrl = process.env.GOOGLE_CALLBACK_URL;

    if (!clientId || !clientSecret || !callbackUrl) return { googleClient: null, callbackUrl: null };
    return { googleClient: new OAuth2Client(clientId, clientSecret, callbackUrl), callbackUrl };
}

// Compare OAuth state values without returning early on the first differing character.
function safeStringMatch(first, second) {
    const firstBytes = Buffer.from(first);
    const secondBytes = Buffer.from(second);
    return firstBytes.length === secondBytes.length && timingSafeEqual(firstBytes, secondBytes);
}

// Return only the signed-in account's public fields when a valid session exists.
export async function getCurrentUser(request, response) {
    const token = request.cookies?.[SESSION_COOKIE];
    if (!token) return response.status(401).json({ success: false, message: "You are not signed in." });

    try {
        const tokenHash = hashSessionToken(token);
        const session = await prisma.loginSession.findUnique({ where: { tokenHash }, include: { user: true } });
        if (!session || session.expiresAt.getTime() <= Date.now()) {
            await prisma.loginSession.deleteMany({ where: { tokenHash } });
            response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
            return response.status(401).json({ success: false, message: "You are not signed in." });
        }
        return response.json({ success: true, user: {
            id: session.user.id,
            email: session.user.email,
            fullName: session.user.fullName,
            avatarUrl: session.user.avatarUrl
        } });
    } catch {
        return response.status(500).json({ success: false, message: "We could not check your sign-in." });
    }
}

// Let a signed-in account maintain its own display name without exposing edit access to others.
export async function updateCurrentProfile(request, response) {
    const fullName = normalizeFullName(request.body?.fullName);
    if (!fullName) {
        return response.status(400).json({ success: false, message: "Enter a name between 2 and 100 characters." });
    }

    try {
        const user = await prisma.user.update({
            where: { id: request.user.id },
            data: { fullName },
            select: { id: true, email: true, fullName: true, avatarUrl: true }
        });
        return response.json({ success: true, user });
    } catch {
        return response.status(500).json({ success: false, message: "We could not update your profile. Please try again." });
    }
}

// Revoke the current server-side session and remove its browser cookie.
export async function signOut(request, response) {
    const token = request.cookies?.[SESSION_COOKIE];
    if (token) {
        try {
            await prisma.loginSession.deleteMany({ where: { tokenHash: hashSessionToken(token) } });
        } catch {
            return response.status(500).json({ success: false, message: "We could not sign you out." });
        }
    }
    response.clearCookie(SESSION_COOKIE, sessionCookieOptions());
    return response.json({ success: true });
}
