import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
    getConversation,
    getMessageImage,
    getMyConversations,
    getUnreadMessageCount,
    sendContactMessage,
    sendConversationMessage,
    sendImageMessage,
    sendLocationMessage,
    startListingConversation,
} from "./messagesController.js";
import { uploadMessageImage } from "./messageImageUpload.js";

// Keep every messaging endpoint behind the existing cookie-backed session check.
const router = express.Router();
// Message lists and unread counts change frequently; browsers must not reuse stale API responses.
router.use((_request, response, next) => {
    response.setHeader("Cache-Control", "no-store");
    next();
});
router.use(requireAuth);

// Let a buyer open a private conversation from one seller listing.
router.post("/listings/:listingId", startListingConversation);
router.get("/unread-count", getUnreadMessageCount);
router.get("/", getMyConversations);
router.get("/:conversationId/images/:messageId", getMessageImage);
router.post("/:conversationId/images", uploadMessageImage, sendImageMessage);
router.post("/:conversationId/contacts", sendContactMessage);
router.post("/:conversationId/location", sendLocationMessage);
router.get("/:conversationId", getConversation);
router.post("/:conversationId", sendConversationMessage);

export default router;
