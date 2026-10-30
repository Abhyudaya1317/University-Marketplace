import express from "express";
import { getExploreProducts } from "./listingsController.js";

// Keep public product browsing separate from seller-only listing creation.
const router = express.Router();

// Return one Explore result for each active seller listing.
router.get("/", getExploreProducts);

export default router;
