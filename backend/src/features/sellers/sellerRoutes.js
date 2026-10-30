import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
    getFavoriteStatus,
    getSellerDashboard,
    getSellerProfile,
    removeFavoriteSeller,
    saveFavoriteSeller
} from "./sellerController.js";

// Keep public seller browsing separate from signed-in dashboard and favorite actions.
const router = express.Router();

router.get("/dashboard", requireAuth, getSellerDashboard);
router.get("/:sellerId/favorite", requireAuth, getFavoriteStatus);
router.put("/:sellerId/favorite", requireAuth, saveFavoriteSeller);
router.delete("/:sellerId/favorite", requireAuth, removeFavoriteSeller);
router.get("/:sellerId", getSellerProfile);

export default router;
