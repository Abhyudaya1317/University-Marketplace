import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
    getConversation,
    getMyConversations,
    sendConversationMessage,
    startListingConversation,
} from "./messagesController.js";

// Keep every messaging endpoint behind the existing cookie-backed session check.
const router = express.Router();
router.use(requireAuth);

// Let a buyer open a private conversation from one seller listing.
router.post("/listings/:listingId", startListingConversation);
router.get("/", getMyConversations);
router.get("/:conversationId", getConversation);
router.post("/:conversationId", sendConversationMessage);

export default router;
