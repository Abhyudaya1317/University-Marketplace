import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { createFeedbackReport } from "./feedbackController.js";
import { uploadFeedbackPhotos } from "./feedbackPhotoUpload.js";

const router = express.Router();
router.use(requireAuth);
router.post("/", uploadFeedbackPhotos, createFeedbackReport);
export default router;
