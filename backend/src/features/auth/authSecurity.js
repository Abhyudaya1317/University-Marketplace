// Keep local authentication secrets and account settings out of source control.
import { createHmac, randomBytes, randomInt, timingSafeEqual } from "node:crypto";

// Require long random secrets from backend/.env and fail without exposing values.
function getSecret(name) {
    const secret = process.env[name];
    if (!secret || secret.length < 32) throw new Error(`${name} must contain at least 32 characters in backend/.env.`);
    return secret;
}

// Make a six-digit reset code using Node's cryptographically secure random generator.
export function createEmailCode() {
    return String(randomInt(100000, 1000000));
}

// Store a keyed hash tied to the email so a database leak does not reveal valid codes.
export function hashEmailCode(email, code) {
    return createHmac("sha256", getSecret("OTP_SECRET")).update(`${email}:${code}`).digest("hex");
}

// Compare equal-sized hashes in constant time to reduce timing-based information leaks.
export function emailCodeMatches(email, code, storedHash) {
    const suppliedHash = Buffer.from(hashEmailCode(email, code), "hex");
    const expectedHash = Buffer.from(storedHash, "hex");
    return suppliedHash.length === expectedHash.length && timingSafeEqual(suppliedHash, expectedHash);
}

// Issue a random browser credential but store only its keyed hash in PostgreSQL.
export function createSessionToken() {
    return randomBytes(32).toString("base64url");
}

export function hashSessionToken(token) {
    return createHmac("sha256", getSecret("SESSION_SECRET")).update(token).digest("hex");
}
