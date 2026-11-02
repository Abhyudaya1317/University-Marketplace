// Keep private buyer-seller messages scoped to participants and a single listing.
import { prisma } from "../../lib/prisma.js";
import { normalizeMessageBody } from "./messageValidation.js";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
    messageImageContentType,
    messageImageDirectory,
    removeMessageImage,
} from "./messageImageUpload.js";

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
        body: message.body,
        contactName: message.contactName,
        contactPhone: message.contactPhone,
        locationLabel: message.locationLabel,
        latitude: message.latitude,
        longitude: message.longitude,
        attachmentUrl: message.type === "IMAGE"
            ? `/api/messages/${message.conversationId}/images/${message.id}`
            : null,
        readAt: message.readAt,
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
                    select: { body: true, createdAt: true, senderId: true, type: true },
                },
            },
        });

        const conversationIds = conversations.map((conversation) => conversation.id);
        const unreadGroups = conversationIds.length
            ? await prisma.message.groupBy({
                by: ["conversationId"],
                where: {
                    conversationId: { in: conversationIds },
                    senderId: { not: request.user.id },
                    readAt: null,
                },
                _count: { _all: true },
            })
            : [];
        const unreadByConversation = new Map(unreadGroups.map((group) => [group.conversationId, group._count._all]));

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
                    listing: {
                        id: conversation.listing.id,
                        title: conversation.listing.title,
                        price: conversation.listing.price.toFixed(2),
                        photoUrl: conversation.listing.photoUrl,
                        status: conversation.listing.status,
                    },
                    lastMessage: lastMessage ? {
                        ...lastMessage,
                        body: lastMessage.type === "IMAGE" ? "Photo" : lastMessage.type === "CONTACT" ? "Shared a contact" : lastMessage.type === "LOCATION" ? "Shared a location" : lastMessage.body,
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
        const conversations = await prisma.conversation.findMany({
            where: participantFilter(request.user.id),
            select: { id: true },
        });
        const conversationIds = conversations.map((conversation) => conversation.id);
        const count = conversationIds.length
            ? await prisma.message.count({
                where: {
                    conversationId: { in: conversationIds },
                    senderId: { not: request.user.id },
                    readAt: null,
                },
            })
            : 0;
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
            where: { conversationId, senderId: { not: request.user.id }, readAt: null },
            data: { readAt: new Date() },
        });

        const conversation = await prisma.conversation.findFirst({
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
                        sender: { select: { fullName: true } },
                    },
                },
            },
        });
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
                listing: {
                    id: conversation.listing.id,
                    title: conversation.listing.title,
                    price: conversation.listing.price.toFixed(2),
                    photoUrl: conversation.listing.photoUrl,
                    status: conversation.listing.status,
                },
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
    if (!body) {
        return response.status(400).json({ success: false, message: "Write a message up to 2,000 characters." });
    }
    return createConversationMessage(request, response, { type: "TEXT", body });
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
    if (!request.file) return response.status(400).json({ success: false, message: "Choose an image to send." });
    const caption = normalizeMessageBody(request.body?.caption);
    return createConversationMessage(request, response, {
        type: "IMAGE",
        body: caption || "Shared a photo",
        attachmentName: request.file.filename,
    });
}

// Serve a chat image only after checking the requester belongs to its conversation.
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
                type: "IMAGE",
                conversation: { is: participantFilter(request.user.id) },
            },
            select: { attachmentName: true },
        });
        if (!message?.attachmentName) return response.status(404).json({ success: false, message: "This image was not found." });
        const contentType = messageImageContentType(message.attachmentName);
        if (!contentType) return response.status(404).json({ success: false, message: "This image was not found." });

        const image = await readFile(path.join(messageImageDirectory, message.attachmentName));
        response.setHeader("Content-Type", contentType);
        response.setHeader("Content-Disposition", "inline");
        response.setHeader("Cache-Control", "private, no-store");
        response.setHeader("X-Content-Type-Options", "nosniff");
        return response.send(image);
    } catch (error) {
        if (error?.code !== "ENOENT") console.error("Private image read failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(404).json({ success: false, message: "This image was not found." });
    }
}
