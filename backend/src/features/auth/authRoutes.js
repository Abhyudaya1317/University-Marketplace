import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
    finishGoogleSignIn,
    getCurrentUser,
    requestPasswordResetCode,
    resetPassword,
    signIn,
    signOut,
    signUp,
    updateCurrentProfile,
    updateCurrentProfilePhoto,
    startGoogleSignIn
} from "./authController.js";
import { uploadProfilePhoto } from "./profilePhotoUpload.js";
import { createRateLimiter } from "../../middleware/requestProtection.js";

// Keep all account endpoints grouped under /api/auth.
const router = express.Router();

// Slow down password guessing and repeated account recovery requests.
const loginLimit = createRateLimiter({ name: "auth-login", limit: 30, windowMs: 15 * 60 * 1000 });
const signUpLimit = createRateLimiter({ name: "auth-signup", limit: 10, windowMs: 60 * 60 * 1000 });
const resetRequestLimit = createRateLimiter({ name: "auth-reset-request", limit: 6, windowMs: 60 * 60 * 1000 });
const resetVerifyLimit = createRateLimiter({ name: "auth-reset-verify", limit: 20, windowMs: 15 * 60 * 1000 });

// Create and access a password account, then recover it with a one-time email code.
router.post("/signup", signUpLimit, signUp);
router.post("/login", loginLimit, signIn);
router.post("/password-reset/request-code", resetRequestLimit, requestPasswordResetCode);
router.post("/password-reset/verify-code", resetVerifyLimit, resetPassword);

// Send the browser through Google's consent page and receive its verified callback.
router.get("/google", startGoogleSignIn);
router.get("/google/callback", finishGoogleSignIn);

// Read or revoke the private server-side session cookie.
router.get("/me", getCurrentUser);
router.post("/logout", signOut);
router.patch("/profile", requireAuth, updateCurrentProfile);
router.post("/profile/photo", requireAuth, uploadProfilePhoto, updateCurrentProfilePhoto);

export default router;
