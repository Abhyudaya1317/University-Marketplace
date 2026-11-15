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

// Keep all account endpoints grouped under /api/auth.
const router = express.Router();

// Create and access a password account, then recover it with a one-time email code.
router.post("/signup", signUp);
router.post("/login", signIn);
router.post("/password-reset/request-code", requestPasswordResetCode);
router.post("/password-reset/verify-code", resetPassword);

// Send the browser through Google's consent page and receive its verified callback.
router.get("/google", startGoogleSignIn);
router.get("/google/callback", finishGoogleSignIn);

// Read or revoke the private server-side session cookie.
router.get("/me", getCurrentUser);
router.post("/logout", signOut);
router.patch("/profile", requireAuth, updateCurrentProfile);
router.post("/profile/photo", requireAuth, uploadProfilePhoto, updateCurrentProfilePhoto);

export default router;
