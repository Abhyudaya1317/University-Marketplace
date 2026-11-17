import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireAdmin } from "../../middleware/adminAccess.js";
import { banUser, editAdminListing, getAdminListings, getAdminOrders, getAdminOverview, getAdminUsers, permanentlyDeleteAdminListing, removeAdminListing, restoreAdminListing, setHotFindListing, unbanUser } from "./adminController.js";
import { getAdminFeedbackPhoto, getAdminFeedbackReports } from "../feedback/feedbackController.js";

// Protect the whole administration API with a valid account session and server-side allowlist.
const router = express.Router();
router.use(requireAuth, requireAdmin);
router.get("/feedback", getAdminFeedbackReports);
router.get("/feedback/:reportId/photos/:photoIndex", getAdminFeedbackPhoto);
router.get("/overview", getAdminOverview);
router.get("/orders", getAdminOrders);
router.get("/users", getAdminUsers);
router.patch("/users/:userId/ban", banUser);
router.patch("/users/:userId/unban", unbanUser);
router.get("/listings", getAdminListings);
router.patch("/listings/:listingId/hot-find", setHotFindListing);
router.patch("/listings/:listingId", editAdminListing);
router.patch("/listings/:listingId/remove", removeAdminListing);
router.patch("/listings/:listingId/restore", restoreAdminListing);
router.delete("/listings/:listingId", permanentlyDeleteAdminListing);
export default router;
