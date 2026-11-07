import express from "express";
import { requireAuth } from "../../middleware/requireAuth.js";
import {
    getConversation,
    getMessageImage,
    getMyConversations,
    getUnreadMessageCount,
    deleteConversationMessages,
    deleteConversationMessage,
    editConversationMessage,
    sendContactMessage,
    sendConversationMessage,
    sendAttachmentMessage,
    sendStickerMessage,
    sendMeetupMessage,
    respondToMeetup,
    sendLocationMessage,
    startListingConversation,
    startSellerConversation,
} from "./messagesController.js";
import { uploadMessageFile } from "./messageImageUpload.js";

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
router.post("/sellers/:sellerId", startSellerConversation);
router.get("/unread-count", getUnreadMessageCount);
router.get("/", getMyConversations);
router.get("/:conversationId/files/:messageId", getMessageImage);
// Keep old image URLs alive for messages already stored in the database.
router.get("/:conversationId/images/:messageId", getMessageImage);
router.post("/:conversationId/files", uploadMessageFile, sendAttachmentMessage);
router.post("/:conversationId/stickers", sendStickerMessage);
router.post("/:conversationId/meetups", sendMeetupMessage);
router.post("/:conversationId/:messageId/meetup-response", respondToMeetup);
router.post("/:conversationId/contacts", sendContactMessage);
router.post("/:conversationId/location", sendLocationMessage);
router.get("/:conversationId", getConversation);
router.post("/:conversationId/bulk-delete", deleteConversationMessages);
router.delete("/:conversationId/:messageId", deleteConversationMessage);
router.patch("/:conversationId/:messageId", editConversationMessage);
router.post("/:conversationId", sendConversationMessage);

export default router;
