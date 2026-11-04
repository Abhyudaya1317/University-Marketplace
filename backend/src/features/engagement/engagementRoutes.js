import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { answerProductQuestion, askListingQuestion, deleteProductAnswer, deleteProductQuestion, getListingEngagement } from "./engagementController.js";

// Keep public offer discussion and authenticated question actions together.
const router = express.Router();

router.get("/:listingId/engagement", getListingEngagement);
router.post("/:listingId/questions", requireAuth, askListingQuestion);
router.post("/questions/:questionId/answers", requireAuth, answerProductQuestion);
router.delete("/questions/:questionId", requireAuth, deleteProductQuestion);
router.delete("/questions/:questionId/answers/:answerId", requireAuth, deleteProductAnswer);

export default router;
