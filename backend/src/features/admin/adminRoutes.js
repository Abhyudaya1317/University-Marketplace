import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { requireAdmin } from "../../middleware/adminAccess.js";
import { banUser, editAdminListing, getAdminListings, getAdminOverview, getAdminUsers, removeAdminListing, restoreAdminListing, unbanUser } from "./adminController.js";

// Protect the whole administration API with a valid account session and server-side allowlist.
const router = express.Router();
router.use(requireAuth, requireAdmin);
router.get("/overview", getAdminOverview);
router.get("/users", getAdminUsers);
router.patch("/users/:userId/ban", banUser);
router.patch("/users/:userId/unban", unbanUser);
router.get("/listings", getAdminListings);
router.patch("/listings/:listingId", editAdminListing);
router.patch("/listings/:listingId/remove", removeAdminListing);
router.patch("/listings/:listingId/restore", restoreAdminListing);
export default router;
