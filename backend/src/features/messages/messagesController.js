// Keep private buyer-seller messages scoped to participants and a single listing.
import { prisma } from "../../lib/prisma.js";
import { normalizeMessageBody } from "./messageValidation.js";

// Match the current account to either allowed participant role in a conversation.
function participantFilter(userId) {
    return { OR: [{ buyerId: userId }, { sellerId: userId }] };
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
                buyer: { select: { id: true, fullName: true } },
                seller: { select: { id: true, fullName: true } },
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
                    select: { body: true, createdAt: true, senderId: true },
                },
            },
        });

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
                    },
                    listing: {
                        id: conversation.listing.id,
                        title: conversation.listing.title,
                        price: conversation.listing.price.toFixed(2),
                        photoUrl: conversation.listing.photoUrl,
                        status: conversation.listing.status,
                    },
                    lastMessage,
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
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                ...participantFilter(request.user.id),
            },
            select: {
                id: true,
                buyerId: true,
                sellerId: true,
                buyer: { select: { id: true, fullName: true } },
                seller: { select: { id: true, fullName: true } },
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

        const messages = conversation.messages.reverse().map((message) => ({
            id: message.id,
            senderId: message.senderId,
            senderName: message.sender.fullName || "CampusX Member",
            body: message.body,
            createdAt: message.createdAt,
        }));
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
                },
                listing: {
                    id: conversation.listing.id,
                    title: conversation.listing.title,
                    price: conversation.listing.price.toFixed(2),
                    photoUrl: conversation.listing.photoUrl,
                    status: conversation.listing.status,
                },
                messages,
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
    const conversationId = Number(request.params.conversationId);
    const body = normalizeMessageBody(request.body?.body);
    if (!Number.isSafeInteger(conversationId) || conversationId < 1) {
        return response
            .status(400)
            .json({
                success: false,
                message: "Conversation ID must be a positive integer.",
            });
    }
    if (!body) {
        return response
            .status(400)
            .json({
                success: false,
                message: "Write a message up to 2,000 characters.",
            });
    }

    try {
        const conversation = await prisma.conversation.findFirst({
            where: {
                id: conversationId,
                ...participantFilter(request.user.id),
            },
            select: { id: true },
        });
        if (!conversation)
            return response
                .status(404)
                .json({
                    success: false,
                    message: "This conversation was not found.",
                });

        const message = await prisma.$transaction(async (transaction) => {
            const savedMessage = await transaction.message.create({
                data: { conversationId, senderId: request.user.id, body },
                select: {
                    id: true,
                    senderId: true,
                    body: true,
                    createdAt: true,
                    sender: { select: { fullName: true } },
                },
            });
            await transaction.conversation.update({
                where: { id: conversationId },
                data: { updatedAt: new Date() },
            });
            return savedMessage;
        });

        return response.status(201).json({
            success: true,
            message: {
                id: message.id,
                senderId: message.senderId,
                senderName: message.sender.fullName || "CampusX Member",
                body: message.body,
                createdAt: message.createdAt,
            },
        });
    } catch (error) {
        console.error(
            "Message send failed:",
            error?.code ?? error?.name ?? "UNKNOWN",
        );
        return response
            .status(500)
            .json({
                success: false,
                message: "We could not send this message.",
            });
    }
}
