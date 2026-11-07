// Keep private buyer-seller messages scoped to participants and a single listing.
import { prisma } from "../../lib/prisma.js";
import { normalizeMessageBody } from "./messageValidation.js";
import {
    messageImageContentType,
    removeMessageImage,
    readMessageImage,
    storeMessageImage,
} from "./messageImageUpload.js";

// Reserve a database-stored tombstone so deleting a message needs no new database column.
const DELETED_MESSAGE_BODY = "[[CAMPUSX_MESSAGE_DELETED]]";

function isDeletedMessage(message) {
    return message.type === "TEXT" && message.body === DELETED_MESSAGE_BODY;
}

// Match the current account to either allowed participant role in a conversation.
function participantFilter(userId) {
    return { OR: [{ buyerId: userId }, { sellerId: userId }] };
}

// Keep image URLs protected by the same participant check as the message itself.
function presentMessage(message) {
    return {
        id: message.id,
        senderId: message.senderId,
        senderName: message.sender.fullName || "CampusX Member",
        type: message.type,
        body: isDeletedMessage(message) ? "This message was deleted." : message.body,
        attachmentName: message.attachmentOriginalName,
        stickerKey: message.stickerKey,
        meetupAt: message.meetupAt,
        meetupLocation: message.meetupLocation,
        meetupStatus: message.type === "MEETUP" ? message.meetupStatus ?? "PENDING" : null,
        contactName: message.contactName,
        contactPhone: message.contactPhone,
        locationLabel: message.locationLabel,
        latitude: message.latitude,
        longitude: message.longitude,
        attachmentUrl: message.type === "IMAGE" || message.type === "FILE"
            ? `/api/messages/${message.conversationId}/files/${message.id}`
            : null,
        editedAt: message.editedAt,
        readAt: message.readAt,
        // A synthetic timestamp lets the existing UI show the deleted state without a schema migration.
        deletedAt: isDeletedMessage(message) ? message.createdAt : null,
        createdAt: message.createdAt,
    };
}

// Validate a conversation ID and confirm the requester is one of its participants.
async function findParticipantConversation(conversationId, userId) {
    return prisma.conversation.findFirst({
        where: { id: conversationId, ...participantFilter(userId) },
        select: { id: true },
    });
}

// Save a typed message and update conversation activity in one database transaction.
async function createConversationMessage(request, response, data) {
    const conversationId = Number(request.params.conversationId);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
        if (data.attachmentName) await removeMessageImage(data.attachmentName);
        return response.status(400).json({ success: false, message: "Conversation ID must be a positive integer." });
    }

    try {
        const conversation = await findParticipantConversation(conversationId, request.user.id);
        if (!conversation) {
            if (data.attachmentName) await removeMessageImage(data.attachmentName);
            return response.status(404).json({ success: false, message: "This conversation was not found." });
        }

        const message = await prisma.$transaction(async (transaction) => {
            const created = await transaction.message.create({
                data: { conversationId, senderId: request.user.id, ...data },
                include: { sender: { select: { fullName: true } } },
            });
            await transaction.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
            return created;
        });

        return response.status(201).json({ success: true, message: presentMessage(message) });
    } catch (error) {
        if (data.attachmentName) await removeMessageImage(data.attachmentName);
        console.error("Message send failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not send this message." });
    }
}

// Start or reopen this buyer's conversation for one active listing.
export async function startListingConversation(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response
            .status(400)
            .json({
                success: false,
                message: "Listing ID must be a positive integer.",
            });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            select: { id: true, sellerId: true },
        });
        if (!listing)
            return response
                .status(404)
                .json({
                    success: false,
                    message: "This listing is no longer available.",
                });
        if (listing.sellerId === request.user.id) {
            return response
                .status(400)
                .json({
                    success: false,
                    message:
                        "You cannot message yourself about your own listing.",
                });
        }

        const conversation = await prisma.conversation.upsert({
            where: {
                listingId_buyerId: { listingId, buyerId: request.user.id },
            },
            create: {
                listingId,
                buyerId: request.user.id,
                sellerId: listing.sellerId,
            },
            update: {},
        });

        return response
            .status(200)
            .json({ success: true, conversation: { id: conversation.id } });
    } catch (error) {
        console.error(
            "Conversation start failed:",
            error?.code ?? error?.name ?? "UNKNOWN",
        );
        return response
            .status(500)
            .json({
                success: false,
                message: "We could not open this conversation.",
            });
    }
}

// Open one seller conversation even when the seller has no active listing.
export async function startSellerConversation(request, response) {
    const sellerId = Number(request.params.sellerId);
    if (!Number.isSafeInteger(sellerId) || sellerId < 1) {
        return response.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }
    if (sellerId === request.user.id) {
        return response.status(400).json({ success: false, message: "You cannot message yourself." });
    }

    try {
        const seller = await prisma.user.findUnique({ where: { id: sellerId }, select: { id: true } });
        if (!seller) return response.status(404).json({ success: false, message: "This seller was not found." });

        let conversation = await prisma.conversation.findFirst({
            where: { sellerId, buyerId: request.user.id, listingId: null },
            select: { id: true },
        });
        if (!conversation) {
            try {
                conversation = await prisma.conversation.create({
                    data: { sellerId, buyerId: request.user.id, listingId: null },
                    select: { id: true },
                });
            } catch (error) {
                // If two clicks arrive together, the partial unique index lets both reuse one thread.
                if (error?.code !== "P2002") throw error;
                conversation = await prisma.conversation.findFirst({
                    where: { sellerId, buyerId: request.user.id, listingId: null },
                    select: { id: true },
                });
                if (!conversation) throw error;
            }
        }
        return response.status(200).json({ success: true, conversation });
    } catch (error) {
        console.error("Seller conversation start failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not open this conversation." });
    }
}

// Return only the signed-in user's threads, newest activity first.
export async function getMyConversations(request, response) {
    try {
        const conversations = await prisma.conversation.findMany({
            where: participantFilter(request.user.id),
            orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
            select: {
                id: true,
                updatedAt: true,
                buyerId: true,
                sellerId: true,
                buyer: { select: { id: true, fullName: true, avatarUrl: true } },
                seller: { select: { id: true, fullName: true, avatarUrl: true } },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        price: true,
                        photoUrl: true,
                        status: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 1,
                    select: { body: true, createdAt: true, senderId: true, type: true, meetupStatus: true },
                },
            },
        });

        const conversationIds = conversations.map((conversation) => conversation.id);
        const [unreadGroups, confirmedMeetups] = conversationIds.length
            ? await Promise.all([prisma.message.groupBy({
                by: ["conversationId"],
                where: {
                    conversationId: { in: conversationIds },
                    senderId: { not: request.user.id },
                    readAt: null,
                    body: { not: DELETED_MESSAGE_BODY },
                },
                _count: { _all: true },
            }), prisma.message.findMany({
                where: {
                    conversationId: { in: conversationIds },
                    type: "MEETUP",
                    meetupStatus: "CONFIRMED",
                    meetupAt: { not: null },
                },
                orderBy: { createdAt: "desc" },
                select: { conversationId: true, meetupAt: true, meetupLocation: true },
            })])
            : [[], []];
        const unreadByConversation = new Map(unreadGroups.map((group) => [group.conversationId, group._count._all]));
        const confirmedMeetingByConversation = new Map();
        for (const meeting of confirmedMeetups) {
            if (!confirmedMeetingByConversation.has(meeting.conversationId)) {
                confirmedMeetingByConversation.set(meeting.conversationId, {
                    meetupAt: meeting.meetupAt,
                    meetupLocation: meeting.meetupLocation,
                });
            }
        }

        return response.json({
            success: true,
            conversations: conversations.map((conversation) => {
                const otherUser =
                    conversation.buyerId === request.user.id
                        ? conversation.seller
                        : conversation.buyer;
                const lastMessage = conversation.messages[0] ?? null;
                return {
                    id: conversation.id,
                    updatedAt: conversation.updatedAt,
                    otherUser: {
                        id: otherUser.id,
                        fullName: otherUser.fullName || "CampusX Member",
                        avatarUrl: otherUser.avatarUrl,
                    },
                    listing: conversation.listing ? {
                        id: conversation.listing.id,
                        title: conversation.listing.title,
                        price: conversation.listing.price.toFixed(2),
                        photoUrl: conversation.listing.photoUrl,
                        status: conversation.listing.status,
                    } : null,
                    confirmedMeeting: confirmedMeetingByConversation.get(conversation.id) ?? null,
                    lastMessage: lastMessage ? {
                        ...lastMessage,
                        body: isDeletedMessage(lastMessage) ? "This message was deleted." : lastMessage.type === "IMAGE" ? "Photo" : lastMessage.type === "CONTACT" ? "Shared a contact" : lastMessage.type === "LOCATION" ? "Shared a location" : lastMessage.type === "MEETUP" && lastMessage.meetupStatus === "DENIED" ? "Meeting request denied" : lastMessage.type === "MEETUP" && lastMessage.meetupStatus === "CONFIRMED" ? "Meeting confirmed" : lastMessage.body,
                    } : null,
                    unreadCount: unreadByConversation.get(conversation.id) ?? 0,
                };
            }),
        });
    } catch (error) {
        console.error(
            "Conversation list failed:",
            error?.code ?? error?.name ?? "UNKNOWN",
        );
        return response
            .status(500)
            .json({
                success: false,
                message: "We could not load your messages.",
            });
    }
}

// Return a small unread total for the Messages link in the site navigation.
export async function getUnreadMessageCount(request, response) {
    try {
        const count = await prisma.message.count({
            where: {
                conversation: { is: participantFilter(request.user.id) },
                senderId: { not: request.user.id },
                readAt: null,
                body: { not: DELETED_MESSAGE_BODY },
            },
        });
        return response.json({ success: true, unreadCount: count });
    } catch (error) {
        console.error("Unread message count failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not check unread messages." });
    }
}

// Fetch a thread only when the current account is its buyer or seller.
export async function getConversation(request, response) {
    const conversationId = Number(request.params.conversationId);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
        return response
            .status(400)
            .json({
                success: false,
                message: "Conversation ID must be a positive integer.",
            });
    }

    try {
        const participantConversation = await findParticipantConversation(conversationId, request.user.id);
        if (!participantConversation) {
            return response.status(404).json({ success: false, message: "This conversation was not found." });
        }

        // Opening a thread marks only messages from the other participant as read.
        await prisma.message.updateMany({
            where: { conversationId, senderId: { not: request.user.id }, readAt: null, body: { not: DELETED_MESSAGE_BODY } },
            data: { readAt: new Date() },
        });

        const [conversation, confirmedMeeting] = await Promise.all([prisma.conversation.findFirst({
            where: {
                id: conversationId,
                ...participantFilter(request.user.id),
            },
            select: {
                id: true,
                buyerId: true,
                sellerId: true,
                buyer: { select: { id: true, fullName: true, avatarUrl: true } },
                seller: { select: { id: true, fullName: true, avatarUrl: true } },
                listing: {
                    select: {
                        id: true,
                        title: true,
                        price: true,
                        photoUrl: true,
                        status: true,
                    },
                },
                messages: {
                    orderBy: { createdAt: "desc" },
                    take: 100,
                    select: {
                        id: true,
                        senderId: true,
                        body: true,
                        createdAt: true,
                        conversationId: true,
                        type: true,
                        contactName: true,
                        contactPhone: true,
                        locationLabel: true,
                        latitude: true,
                        longitude: true,
                        readAt: true,
                        attachmentName: true,
                        attachmentOriginalName: true,
                        stickerKey: true,
                        meetupAt: true,
                        meetupLocation: true,
                        meetupStatus: true,
                        editedAt: true,
                        sender: { select: { fullName: true } },
                    },
                },
            },
        }), prisma.message.findFirst({
            where: {
                conversationId,
                type: "MEETUP",
                meetupStatus: "CONFIRMED",
                meetupAt: { not: null },
            },
            orderBy: { createdAt: "desc" },
            select: { meetupAt: true, meetupLocation: true },
        })]);
        if (!conversation)
            return response
                .status(404)
                .json({
                    success: false,
                    message: "This conversation was not found.",
                });

        const messages = conversation.messages.reverse();
        const otherUser =
            conversation.buyerId === request.user.id
                ? conversation.seller
                : conversation.buyer;

        return response.json({
            success: true,
            conversation: {
                id: conversation.id,
                otherUser: {
                    id: otherUser.id,
                    fullName: otherUser.fullName || "CampusX Member",
                    avatarUrl: otherUser.avatarUrl,
                },
                listing: conversation.listing ? {
                    id: conversation.listing.id,
                    title: conversation.listing.title,
                    price: conversation.listing.price.toFixed(2),
                    photoUrl: conversation.listing.photoUrl,
                    status: conversation.listing.status,
                } : null,
                confirmedMeeting: confirmedMeeting ? {
                    meetupAt: confirmedMeeting.meetupAt,
                    meetupLocation: confirmedMeeting.meetupLocation,
                } : null,
                messages: messages.map(presentMessage),
            },
        });
    } catch (error) {
        console.error(
            "Conversation read failed:",
            error?.code ?? error?.name ?? "UNKNOWN",
        );
        return response
            .status(500)
            .json({
                success: false,
                message: "We could not load this conversation.",
            });
    }
}

// Save a plain-text message only when the sender belongs to the thread.
export async function sendConversationMessage(request, response) {
    const body = normalizeMessageBody(request.body?.body);
    if (!body || body === DELETED_MESSAGE_BODY) {
        return response.status(400).json({ success: false, message: "Write a message up to 2,000 characters." });
    }
    return createConversationMessage(request, response, { type: "TEXT", body });
}

// Edit only your own regular text; structured messages and deleted messages stay immutable.
export async function editConversationMessage(request, response) {
    const conversationId = Number(request.params.conversationId);
    const messageId = Number(request.params.messageId);
    const body = normalizeMessageBody(request.body?.body);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1 || !Number.isSafeInteger(messageId) || messageId < 1) {
        return response.status(400).json({ success: false, message: "Conversation and message IDs must be positive integers." });
    }
    if (!body || body === DELETED_MESSAGE_BODY) {
        return response.status(400).json({ success: false, message: "Write a message up to 2,000 characters." });
    }
    try {
        const updated = await prisma.message.updateMany({
            where: {
                id: messageId,
                conversationId,
                senderId: request.user.id,
                type: "TEXT",
                body: { not: DELETED_MESSAGE_BODY },
                conversation: { is: participantFilter(request.user.id) },
            },
            data: { body, editedAt: new Date() },
        });
        if (updated.count !== 1) return response.status(404).json({ success: false, message: "This text could not be edited." });
        await prisma.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
        return response.json({ success: true });
    } catch (error) {
        console.error("Message edit failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not edit this message." });
    }
}

// Send one of CampusX's built-in sticker designs by its allowlisted key.
export async function sendStickerMessage(request, response) {
    const stickerKey = request.body?.stickerKey;
    const stickerNames = new Map([
        ["campus-star", "Campus star"], ["tiny-heart", "Tiny heart"],
        ["party-ghost", "Party ghost"], ["cool-frog", "Cool frog"],
    ]);
    const name = stickerNames.get(stickerKey);
    if (!name) return response.status(400).json({ success: false, message: "Choose a sticker from the CampusX pack." });
    return createConversationMessage(request, response, { type: "STICKER", body: name, stickerKey });
}

// Send a meetup proposal; the other participant must still agree to it.
export async function sendMeetupMessage(request, response) {
    const meetupLocation = typeof request.body?.meetupLocation === "string" ? request.body.meetupLocation.trim() : "";
    const meetupAt = new Date(request.body?.meetupAt);
    const maximumDate = Date.now() + 365 * 24 * 60 * 60 * 1000;
    if (!meetupLocation || meetupLocation.length > 120 || !Number.isFinite(meetupAt.getTime())
        || meetupAt.getTime() <= Date.now() || meetupAt.getTime() > maximumDate) {
        return response.status(400).json({ success: false, message: "Choose a future date and time within a year, and a location up to 120 characters." });
    }
    return createConversationMessage(request, response, {
        type: "MEETUP", body: "Meetup request", meetupAt, meetupLocation, meetupStatus: "PENDING",
    });
}

// Only the other participant can confirm or deny a pending meetup request.
export async function respondToMeetup(request, response) {
    const conversationId = Number(request.params.conversationId);
    const messageId = Number(request.params.messageId);
    const action = request.body?.action;
    if (!Number.isSafeInteger(conversationId) || conversationId < 1
        || !Number.isSafeInteger(messageId) || messageId < 1
        || !["confirm", "deny"].includes(action)) {
        return response.status(400).json({ success: false, message: "Choose confirm or deny for this meetup request." });
    }

    try {
        const result = await prisma.$transaction(async (transaction) => {
            const updated = await transaction.message.updateMany({
                where: {
                    id: messageId,
                    conversationId,
                    senderId: { not: request.user.id },
                    type: "MEETUP",
                    conversation: { is: participantFilter(request.user.id) },
                    OR: [{ meetupStatus: "PENDING" }, { meetupStatus: null }],
                },
                data: { meetupStatus: action === "confirm" ? "CONFIRMED" : "DENIED" },
            });
            if (updated.count !== 1) return false;
            await transaction.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
            return true;
        });
        if (!result) {
            return response.status(409).json({ success: false, message: "This meetup request is no longer pending." });
        }
        return response.json({ success: true, meetupStatus: action === "confirm" ? "CONFIRMED" : "DENIED" });
    } catch (error) {
        console.error("Meetup response failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not update this meetup request." });
    }
}

// Soft-delete only the sender's message while preserving the conversation record.
export async function deleteConversationMessage(request, response) {
    const conversationId = Number(request.params.conversationId);
    const messageId = Number(request.params.messageId);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1
        || !Number.isSafeInteger(messageId) || messageId < 1) {
        return response.status(400).json({ success: false, message: "Conversation and message IDs must be positive integers." });
    }

    try {
        const message = await prisma.message.findFirst({
            where: {
                id: messageId,
                conversationId,
                senderId: request.user.id,
                conversation: { is: participantFilter(request.user.id) },
            },
            select: { id: true, body: true, type: true, attachmentName: true },
        });
        if (!message) {
            return response.status(404).json({ success: false, message: "This message was not found or cannot be deleted by your account." });
        }
        if (isDeletedMessage(message)) {
            return response.json({ success: true, message: { id: message.id, deletedAt: new Date().toISOString() } });
        }

        const deletedAt = new Date();
        const updated = await prisma.$transaction(async (transaction) => {
            const result = await transaction.message.updateMany({
                where: { id: messageId, conversationId, senderId: request.user.id, body: { not: DELETED_MESSAGE_BODY } },
                data: {
                    body: DELETED_MESSAGE_BODY,
                    type: "TEXT",
                    attachmentName: null,
                    contactName: null,
                    contactPhone: null,
                    locationLabel: null,
                    latitude: null,
                    longitude: null,
                    attachmentOriginalName: null,
                    attachmentMimeType: null,
                    stickerKey: null,
                    meetupAt: null,
                    meetupLocation: null,
                    meetupStatus: null,
                },
            });
            if (result.count !== 1) return false;
            await transaction.conversation.update({ where: { id: conversationId }, data: { updatedAt: deletedAt } });
            return true;
        });
        if (!updated) {
            return response.status(409).json({ success: false, message: "This message has already changed. Refresh the conversation and try again." });
        }

        if (message.attachmentName) {
            try {
                await removeMessageImage(message.attachmentName);
            } catch (error) {
                console.error("Deleted chat image cleanup failed:", error?.code ?? error?.name ?? "UNKNOWN");
            }
        }
        return response.json({ success: true, message: { id: message.id, deletedAt } });
    } catch (error) {
        console.error("Message delete failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not delete this message." });
    }
}

// Soft-delete selected messages authored by the current user, keeping the thread history intact.
export async function deleteConversationMessages(request, response) {
    const conversationId = Number(request.params.conversationId);
    const suppliedIds = request.body?.messageIds;
    if (!Number.isSafeInteger(conversationId) || conversationId < 1
        || !Array.isArray(suppliedIds) || suppliedIds.length < 1 || suppliedIds.length > 100
        || suppliedIds.some((id) => !Number.isSafeInteger(id) || id < 1)) {
        return response.status(400).json({ success: false, message: "Choose between 1 and 100 valid messages to delete." });
    }

    try {
        const conversation = await findParticipantConversation(conversationId, request.user.id);
        if (!conversation) return response.status(404).json({ success: false, message: "This conversation was not found." });

        const messageIds = [...new Set(suppliedIds)];
        const messages = await prisma.message.findMany({
            where: {
                id: { in: messageIds },
                conversationId,
                senderId: request.user.id,
                body: { not: DELETED_MESSAGE_BODY },
            },
            select: { id: true, attachmentName: true },
        });
        if (!messages.length) return response.status(404).json({ success: false, message: "No selected messages can be deleted by your account." });

        const deletedAt = new Date();
        const deletedIds = messages.map((message) => message.id);
        await prisma.$transaction(async (transaction) => {
            await transaction.message.updateMany({
                where: { id: { in: deletedIds }, conversationId, senderId: request.user.id, body: { not: DELETED_MESSAGE_BODY } },
                data: {
                    body: DELETED_MESSAGE_BODY,
                    type: "TEXT",
                    attachmentName: null,
                    contactName: null,
                    contactPhone: null,
                    locationLabel: null,
                    latitude: null,
                    longitude: null,
                    attachmentOriginalName: null,
                    attachmentMimeType: null,
                    stickerKey: null,
                    meetupAt: null,
                    meetupLocation: null,
                    meetupStatus: null,
                },
            });
            await transaction.conversation.update({ where: { id: conversationId }, data: { updatedAt: deletedAt } });
        });

        await Promise.all(messages.filter((message) => message.attachmentName).map(async (message) => {
            try {
                await removeMessageImage(message.attachmentName);
            } catch (error) {
                console.error("Deleted chat image cleanup failed:", error?.code ?? error?.name ?? "UNKNOWN");
            }
        }));
        return response.json({ success: true, deletedIds, deletedCount: deletedIds.length });
    } catch (error) {
        console.error("Bulk message delete failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not delete the selected messages." });
    }
}

// Share a contact only after the sender types the details they intend to reveal.
export async function sendContactMessage(request, response) {
    const contactName = typeof request.body?.contactName === "string" ? request.body.contactName.trim() : "";
    const contactPhone = typeof request.body?.contactPhone === "string" ? request.body.contactPhone.trim() : "";
    if (contactName.length < 2 || contactName.length > 100 || !/^[+()\d\s.-]{7,30}$/.test(contactPhone)) {
        return response.status(400).json({ success: false, message: "Enter a contact name and a valid phone number." });
    }
    return createConversationMessage(request, response, {
        type: "CONTACT",
        body: "Shared a contact",
        contactName,
        contactPhone,
    });
}

// Save coordinates only after the user chooses Share location in the chat.
export async function sendLocationMessage(request, response) {
    const latitude = Number(request.body?.latitude);
    const longitude = Number(request.body?.longitude);
    const locationLabel = typeof request.body?.locationLabel === "string" ? request.body.locationLabel.trim() : "Shared location";
    if (!Number.isFinite(latitude) || latitude < -90 || latitude > 90
        || !Number.isFinite(longitude) || longitude < -180 || longitude > 180
        || locationLabel.length > 120) {
        return response.status(400).json({ success: false, message: "Choose a valid location to share." });
    }
    return createConversationMessage(request, response, {
        type: "LOCATION",
        body: "Shared a location",
        locationLabel: locationLabel || "Shared location",
        latitude,
        longitude,
    });
}

// Store the uploaded image as a private message and remove it if the save fails.
export async function sendImageMessage(request, response) {
    return sendAttachmentMessage(request, response);
}

// Store an image or document as a private conversation attachment.
export async function sendAttachmentMessage(request, response) {
    if (!request.file) return response.status(400).json({ success: false, message: "Choose a file to send." });
    const conversationId = Number(request.params.conversationId);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
        return response.status(400).json({ success: false, message: "Conversation ID must be a positive integer." });
    }
    try {
        const conversation = await findParticipantConversation(conversationId, request.user.id);
        if (!conversation) return response.status(404).json({ success: false, message: "This conversation was not found." });
    } catch (error) {
        console.error("Attachment conversation check failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not send this file." });
    }

    const caption = normalizeMessageBody(request.body?.caption);
    const isImage = request.file.mimetype.startsWith("image/");
    let attachmentName;
    try {
        attachmentName = await storeMessageImage(request.file, conversationId);
    } catch (error) {
        console.error("Message attachment storage failed:", error?.code ?? error?.message ?? error?.name ?? "UNKNOWN");
        const storageNotConfigured = error?.message === "MESSAGE_STORAGE_NOT_CONFIGURED";
        return response.status(storageNotConfigured ? 503 : 502).json({
            success: false,
            message: storageNotConfigured
                ? "Photo storage is not configured on the backend yet. Add the Supabase storage settings and try again."
                : "We could not store this attachment. Please try again.",
        });
    }
    return createConversationMessage(request, response, {
        type: isImage ? "IMAGE" : "FILE",
        body: caption || (isImage ? "Shared a photo" : `Shared a file: ${request.file.originalname.slice(0, 120)}`),
        attachmentName,
        attachmentOriginalName: request.file.originalname.slice(0, 180),
        attachmentMimeType: request.file.mimetype,
    });
}

// Serve an attachment only to participants in its conversation, with safe content headers.
export async function getMessageImage(request, response) {
    const conversationId = Number(request.params.conversationId);
    const messageId = Number(request.params.messageId);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1
        || !Number.isSafeInteger(messageId) || messageId < 1) {
        return response.status(404).json({ success: false, message: "This image was not found." });
    }

    try {
        const message = await prisma.message.findFirst({
            where: {
                id: messageId,
                conversationId,
                type: { in: ["IMAGE", "FILE"] },
                body: { not: DELETED_MESSAGE_BODY },
                conversation: { is: participantFilter(request.user.id) },
            },
            select: { attachmentName: true, type: true },
        });
        if (!message?.attachmentName) return response.status(404).json({ success: false, message: "This file was not found." });
        const contentType = messageImageContentType(message.attachmentName);
        if (!contentType) return response.status(404).json({ success: false, message: "This file was not found." });

        const image = await readMessageImage(message.attachmentName);
        response.setHeader("Content-Type", contentType);
        response.setHeader("Content-Disposition", message.type === "IMAGE" ? "inline" : "attachment");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        return response.send(image);
    } catch (error) {
        if (error?.code !== "ENOENT") console.error("Private image read failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(404).json({ success: false, message: "This file was not found." });
    }
}
