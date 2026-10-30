// Handle cash-on-delivery order requests and keep each listing's availability consistent.
import { prisma } from "../../lib/prisma.js";
import { isValidPhoneNumber } from "../listings/listingsValidation.js";

// Select only item details needed by the buyer or seller in their private order view.
const orderSelection = {
    id: true,
    status: true,
    paymentMethod: true,
    price: true,
    buyerId: true,
    sellerId: true,
    buyer: { select: { fullName: true } },
    seller: { select: { fullName: true } },
    buyerPhone: true,
    quantity: true,
    buyerMessage: true,
    meetingAt: true,
    meetingLocation: true,
    createdAt: true,
    updatedAt: true,
    listing: {
        select: {
            id: true,
            title: true,
            description: true,
            photoUrl: true,
            location: true,
            phoneNumber: true,
            quantityAvailable: true,
            product: { select: { id: true, name: true, category: true } }
        }
    }
};

// Shape private contact details for the current buyer or seller only.
function presentOrder(order, viewerId) {
    const isBuyer = order.buyerId === viewerId;
    return {
        id: order.id,
        role: isBuyer ? "BUYER" : "SELLER",
        status: order.status,
        paymentMethod: order.paymentMethod,
        price: order.price.toFixed(2),
        quantity: order.quantity,
        createdAt: order.createdAt,
        updatedAt: order.updatedAt,
        buyerPhone: isBuyer ? null : order.buyerPhone,
        sellerPhone: isBuyer && order.status !== "PENDING" ? order.listing.phoneNumber : null,
        buyerMessage: order.buyerMessage,
        meetingAt: order.meetingAt,
        meetingLocation: order.meetingLocation,
        sellerId: order.sellerId,
        buyerName: order.buyer.fullName || "CampusX Member",
        sellerName: order.seller.fullName || "CampusX Member",
        listing: {
            id: order.listing.id,
            title: order.listing.title,
            description: order.listing.description,
            photoUrl: order.listing.photoUrl,
            location: order.listing.location,
            product: order.listing.product
        }
    };
}

// Create a pending COD request without reserving stock so the seller can choose among buyers.
export async function createOrder(request, response) {
    const listingId = Number(request.body?.listingId);
    const buyerPhone = typeof request.body?.buyerPhone === "string" ? request.body.buyerPhone.trim() : "";
    const quantity = Number(request.body?.quantity);
    const buyerMessage = typeof request.body?.buyerMessage === "string" ? request.body.buyerMessage.trim() : "";

    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Choose a valid seller offer." });
    }
    if (!isValidPhoneNumber(buyerPhone)) {
        return response.status(400).json({ success: false, message: "Enter a valid phone number so the seller can arrange pickup." });
    }
    if (!Number.isSafeInteger(quantity) || quantity < 1 || quantity > 9999) {
        return response.status(400).json({ success: false, message: "Choose a whole-number quantity from 1 to 9,999." });
    }
    if (buyerMessage.length > 500) {
        return response.status(400).json({ success: false, message: "Keep your optional note under 500 characters." });
    }

    try {
        const createdOrder = await prisma.$transaction(async (transaction) => {
            const listing = await transaction.listing.findUnique({
                where: { id: listingId },
                select: { id: true, sellerId: true, price: true, status: true, quantityAvailable: true }
            });

            if (!listing || listing.status !== "ACTIVE") return { error: "UNAVAILABLE" };
            if (listing.sellerId === request.user.id) return { error: "OWN_LISTING" };
            if (listing.quantityAvailable < 1) return { error: "OUT_OF_STOCK" };
            if (quantity > listing.quantityAvailable) return { error: "QUANTITY_UNAVAILABLE" };

            return transaction.order.create({
                data: {
                    listingId: listing.id,
                    buyerId: request.user.id,
                    sellerId: listing.sellerId,
                    buyerPhone,
                    price: listing.price,
                    quantity,
                    buyerMessage: buyerMessage || null
                },
                select: orderSelection
            });
        }, { isolationLevel: "Serializable" });

        if (createdOrder.error === "OWN_LISTING") {
            return response.status(400).json({ success: false, message: "You cannot request your own listing." });
        }
        if (createdOrder.error === "UNAVAILABLE") {
            return response.status(409).json({ success: false, message: "This offer is no longer available." });
        }
        if (createdOrder.error === "OUT_OF_STOCK") {
            return response.status(409).json({ success: false, message: "This offer is out of stock." });
        }
        if (createdOrder.error === "QUANTITY_UNAVAILABLE") {
            return response.status(409).json({ success: false, message: "That quantity is no longer available. Choose a smaller amount." });
        }

        return response.status(201).json({ success: true, order: presentOrder(createdOrder, request.user.id) });
    } catch {
        return response.status(500).json({ success: false, message: "We could not place the order. Please try again." });
    }
}

// Let each participant see only their own purchases or sales and the contact needed for handoff.
export async function getMyOrders(request, response) {
    try {
        const orders = await prisma.order.findMany({
            where: { OR: [{ buyerId: request.user.id }, { sellerId: request.user.id }] },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            select: orderSelection
        });

        return response.json({ success: true, orders: orders.map((order) => presentOrder(order, request.user.id)) });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load your orders." });
    }
}

// Give the signed-in seller a private queue of pending requests grouped by their own products.
export async function getSellerRequests(request, response) {
    try {
        const orders = await prisma.order.findMany({
            where: { sellerId: request.user.id, status: "PENDING" },
            orderBy: [{ createdAt: "asc" }, { id: "asc" }],
            select: {
                id: true,
                listingId: true,
                buyerPhone: true,
                quantity: true,
                buyerMessage: true,
                price: true,
                createdAt: true,
                buyer: { select: { fullName: true } },
                listing: { select: { title: true, product: { select: { name: true } } } }
            }
        });
        return response.json({
            success: true,
            requests: orders.map((order) => ({
                id: order.id,
                listingId: order.listingId,
                productName: order.listing.product.name,
                listingTitle: order.listing.title,
                buyerName: order.buyer.fullName || "CampusX Member",
                buyerPhone: order.buyerPhone,
                quantity: order.quantity,
                buyerMessage: order.buyerMessage,
                price: order.price.toFixed(2),
                createdAt: order.createdAt
            }))
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load your buyer requests." });
    }
}

// Apply only the next allowed buyer/seller confirmation and decrement stock when the seller accepts.
export async function updateOrderStatus(request, response) {
    const orderId = Number(request.params.orderId);
    const action = request.body?.action;
    if (!Number.isSafeInteger(orderId) || orderId < 1) {
        return response.status(400).json({ success: false, message: "Order ID must be a positive integer." });
    }

    const meetingLocation = typeof request.body?.meetingLocation === "string" ? request.body.meetingLocation.trim() : "";
    const meetingAtValue = typeof request.body?.meetingAt === "string" ? request.body.meetingAt : "";
    const meetingAt = new Date(meetingAtValue);
    const transitions = {
        accept: { role: "seller", from: "PENDING", to: "ACCEPTED", schedule: true },
        decline: { role: "seller", from: "PENDING", to: "DECLINED" },
        cancel: { role: "buyer", from: "PENDING", to: "CANCELLED" },
        confirmHandoff: { role: "seller", from: "ACCEPTED", to: "SELLER_CONFIRMED" },
        confirmReceipt: { role: "buyer", from: "SELLER_CONFIRMED", to: "COMPLETED" }
    };
    const transition = transitions[action];
    if (!transition) {
        return response.status(400).json({ success: false, message: "Choose a valid order action." });
    }
    if (transition.schedule && (!meetingAtValue || Number.isNaN(meetingAt.getTime()) || meetingAt.getTime() <= Date.now())) {
        return response.status(400).json({ success: false, message: "Choose a meeting date and time in the future." });
    }
    if (transition.schedule && (meetingLocation.length < 2 || meetingLocation.length > 120)) {
        return response.status(400).json({ success: false, message: "Enter a meeting location between 2 and 120 characters." });
    }

    try {
        const result = await prisma.$transaction(async (transaction) => {
            const order = await transaction.order.findUnique({
                where: { id: orderId },
                select: { id: true, buyerId: true, sellerId: true, listingId: true, quantity: true, status: true }
            });
            if (!order) return { error: "NOT_FOUND" };

            const isParticipant = transition.role === "buyer"
                ? order.buyerId === request.user.id
                : order.sellerId === request.user.id;
            if (!isParticipant) return { error: "FORBIDDEN" };
            if (order.status !== transition.from) return { error: "CONFLICT" };

            if (transition.schedule) {
                // Pending requests do not consume stock; only the seller's acceptance does.
                const stockUpdate = await transaction.listing.updateMany({
                    where: { id: order.listingId, status: "ACTIVE", quantityAvailable: { gte: order.quantity } },
                    data: { quantityAvailable: { decrement: order.quantity } }
                });
                if (stockUpdate.count !== 1) return { error: "INSUFFICIENT_STOCK" };
            }

            const updated = await transaction.order.updateMany({
                where: { id: order.id, status: transition.from },
                data: {
                    status: transition.to,
                    ...(transition.schedule ? { meetingAt, meetingLocation } : {})
                }
            });
            if (updated.count !== 1) throw new Error("Order changed while a seller action was being processed.");

            return { status: transition.to };
        });

        if (result.error === "NOT_FOUND") return response.status(404).json({ success: false, message: "This order was not found." });
        if (result.error === "FORBIDDEN") return response.status(403).json({ success: false, message: "Only the other participant in this order can take that action." });
        if (result.error === "CONFLICT") return response.status(409).json({ success: false, message: "This order has changed. Refresh your orders and try again." });
        if (result.error === "INSUFFICIENT_STOCK") return response.status(409).json({ success: false, message: "There is not enough stock left for this request. Decline it or ask the buyer to request a smaller quantity." });

        return response.json({ success: true, status: result.status });
    } catch {
        return response.status(500).json({ success: false, message: "We could not update this order. Please try again." });
    }
}
