import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { reviewListing } from "./engagementController.js";

// Require a signed-in account before accepting a review of a seller offer.
const router = express.Router();
router.post("/:listingId/reviews", requireAuth, reviewListing);

export default router;
