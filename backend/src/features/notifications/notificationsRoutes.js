import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { createPushSubscription, deletePushSubscriptions, getVapidPublicKey } from "./notificationsController.js";

const router = express.Router();

router.get("/vapid-public-key", getVapidPublicKey);
router.post("/subscriptions", requireAuth, createPushSubscription);
router.delete("/subscriptions", requireAuth, deletePushSubscriptions);

export default router;
