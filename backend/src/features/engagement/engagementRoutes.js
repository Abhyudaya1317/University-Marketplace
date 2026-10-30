import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { answerProductQuestion, askListingQuestion, getListingEngagement } from "./engagementController.js";

// Keep public offer discussion and authenticated question actions together.
const router = express.Router();

router.get("/:listingId/engagement", getListingEngagement);
router.post("/:listingId/questions", requireAuth, askListingQuestion);
router.post("/questions/:questionId/answers", requireAuth, answerProductQuestion);

export default router;
