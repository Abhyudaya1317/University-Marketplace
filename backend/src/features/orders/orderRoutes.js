import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import { createOrder, getMyOrders, getSellerRequests, updateOrderStatus } from "./orderController.js";

// Keep buying actions inside their own protected API feature.
const router = express.Router();

router.post("/", requireAuth, createOrder);
router.get("/mine", requireAuth, getMyOrders);
router.get("/seller/requests", requireAuth, getSellerRequests);
router.patch("/:orderId", requireAuth, updateOrderStatus);

export default router;
