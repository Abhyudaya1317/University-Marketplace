import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
    createListing,
    getPublicListingDetails,
    getListingFavorite,
    getSavedListingIds,
    removeSavedListing,
    saveListing,
    updateListingStock
} from "./listingsController.js";
import {
    archiveListing,
    getListingForEdit,
    permanentlyDeleteListing,
    restoreListing,
    updateListing
} from "./listingManagementController.js";
import { uploadListingPhoto } from "./listingPhotoUpload.js";

// Keep the seller's listing action in its own feature route module.
const router = express.Router();

// Public product details use an individual seller listing ID, never the shared product ID.
router.get("/public/:listingId", getPublicListingDetails);

// A signed-in seller creates one priced offer for a shared product.
router.post("/", requireAuth, uploadListingPhoto, createListing);
router.get("/favorites", requireAuth, getSavedListingIds);
router.get("/:listingId/favorite", requireAuth, getListingFavorite);
router.put("/:listingId/favorite", requireAuth, saveListing);
router.delete("/:listingId/favorite", requireAuth, removeSavedListing);
router.get("/:listingId", requireAuth, getListingForEdit);
router.patch("/:listingId", requireAuth, uploadListingPhoto, updateListing);
router.patch("/:listingId/stock", requireAuth, updateListingStock);
router.patch("/:listingId/archive", requireAuth, archiveListing);
router.patch("/:listingId/restore", requireAuth, restoreListing);
router.delete("/:listingId", requireAuth, permanentlyDeleteListing);

export default router;
