import { prisma } from "../../lib/prisma.js";
import { validateAnswer, validateQuestion, validateReview } from "./engagementValidation.js";

// Return discussion and reviews for exactly one active seller offer.
export async function getListingEngagement(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing id must be a positive integer." });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            select: { id: true, sellerId: true, seller: { select: { fullName: true } } }
        });
        if (!listing) return response.status(404).json({ success: false, message: "This seller offer was not found." });

        const [questions, reviews] = await Promise.all([
            prisma.productQuestion.findMany({
                where: { listingId: listing.id },
                orderBy: { createdAt: "desc" },
                take: 50,
                include: {
                    asker: { select: { fullName: true } },
                    answers: {
                        orderBy: { createdAt: "asc" },
                        select: { id: true, sellerId: true, answer: true, createdAt: true, seller: { select: { fullName: true } } }
                    }
                }
            }),
            prisma.listingReview.findMany({
                where: { listingId: listing.id, listing: { status: "ACTIVE" } },
                orderBy: { createdAt: "desc" },
                take: 100,
                select: {
                    id: true,
                    listingId: true,
                    reviewerId: true,
                    rating: true,
                    comment: true,
                    createdAt: true,
                    reviewer: { select: { fullName: true } },
                    listing: { select: { sellerId: true } }
                }
            })
        ]);

        return response.json({
            success: true,
            eligibleSellerIds: [listing.sellerId],
            questions: questions.map((question) => ({
                id: question.id,
                askerId: question.askerId,
                askerName: question.asker.fullName || "CampusX Member",
                question: question.question,
                createdAt: question.createdAt,
                answers: question.answers.map((answer) => ({
                    id: answer.id,
                    sellerId: answer.sellerId,
                    sellerName: answer.seller.fullName || "CampusX Member",
                    answer: answer.answer,
                    createdAt: answer.createdAt
                }))
            })),
            reviews: reviews.map((review) => ({
                id: review.id,
                listingId: review.listingId,
                reviewerId: review.reviewerId,
                reviewerName: review.reviewer.fullName || "CampusX Member",
                sellerId: review.listing.sellerId,
                sellerName: listing.seller.fullName || "CampusX Member",
                rating: review.rating,
                comment: review.comment,
                createdAt: review.createdAt
            }))
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load this offer's questions and reviews." });
    }
}

// Save a question against its listing so it cannot appear on another offer or product.
export async function askListingQuestion(request, response) {
    const listingId = Number(request.params.listingId);
    const questionText = validateQuestion(request.body?.question);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing id must be a positive integer." });
    }
    if (!questionText) {
        return response.status(400).json({ success: false, message: "Write a question between 10 and 500 characters." });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            select: { id: true, productId: true }
        });
        if (!listing) return response.status(404).json({ success: false, message: "This seller offer was not found." });

        const recentQuestionCount = await prisma.productQuestion.count({
            where: { listingId: listing.id, askerId: request.user.id, createdAt: { gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } }
        });
        if (recentQuestionCount >= 20) {
            return response.status(429).json({ success: false, message: "You have reached today's question limit for this offer." });
        }

        const question = await prisma.productQuestion.create({
            data: { productId: listing.productId, listingId: listing.id, askerId: request.user.id, question: questionText }
        });

        return response.status(201).json({
            success: true,
            question: { id: question.id, askerId: question.askerId, question: question.question, createdAt: question.createdAt, answers: [] }
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not post your question. Please try again." });
    }
}

// Only the seller who owns this exact offer can answer its questions.
export async function answerProductQuestion(request, response) {
    const questionId = Number(request.params.questionId);
    const answerText = validateAnswer(request.body?.answer);
    if (!Number.isSafeInteger(questionId) || questionId < 1) {
        return response.status(400).json({ success: false, message: "Question id must be a positive integer." });
    }
    if (!answerText) {
        return response.status(400).json({ success: false, message: "Write an answer between 2 and 1,000 characters." });
    }

    try {
        const question = await prisma.productQuestion.findUnique({
            where: { id: questionId },
            include: { listing: { select: { sellerId: true } } }
        });
        if (!question) return response.status(404).json({ success: false, message: "Question not found." });
        if (!question.listing || question.listing.sellerId !== request.user.id) {
            return response.status(403).json({ success: false, message: "Only the seller of this offer can answer." });
        }

        const answer = await prisma.productAnswer.upsert({
            where: { questionId_sellerId: { questionId, sellerId: request.user.id } },
            create: { questionId, sellerId: request.user.id, answer: answerText },
            update: { answer: answerText }
        });

        return response.status(201).json({
            success: true,
            answer: { id: answer.id, sellerId: answer.sellerId, answer: answer.answer, createdAt: answer.createdAt }
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not save your answer. Please try again." });
    }
}

// Let only the person who asked a question remove it; its answers cascade with it.
export async function deleteProductQuestion(request, response) {
    const questionId = Number(request.params.questionId);
    if (!Number.isSafeInteger(questionId) || questionId < 1) {
        return response.status(400).json({ success: false, message: "Question id must be a positive integer." });
    }

    try {
        const question = await prisma.productQuestion.findUnique({
            where: { id: questionId },
            select: { id: true, askerId: true }
        });
        if (!question) return response.status(404).json({ success: false, message: "Question not found." });
        if (question.askerId !== request.user.id) {
            return response.status(403).json({ success: false, message: "You can delete only your own question." });
        }

        await prisma.productQuestion.delete({ where: { id: questionId } });
        return response.json({ success: true });
    } catch {
        return response.status(500).json({ success: false, message: "We could not delete your question. Please try again." });
    }
}

// Let only the seller who wrote an answer remove that reply.
export async function deleteProductAnswer(request, response) {
    const questionId = Number(request.params.questionId);
    const answerId = Number(request.params.answerId);
    if (!Number.isSafeInteger(questionId) || questionId < 1 || !Number.isSafeInteger(answerId) || answerId < 1) {
        return response.status(400).json({ success: false, message: "Question and answer ids must be positive integers." });
    }

    try {
        const answer = await prisma.productAnswer.findUnique({
            where: { id: answerId },
            select: { id: true, questionId: true, sellerId: true }
        });
        if (!answer || answer.questionId !== questionId) {
            return response.status(404).json({ success: false, message: "Answer not found for this question." });
        }
        if (answer.sellerId !== request.user.id) {
            return response.status(403).json({ success: false, message: "You can delete only your own answer." });
        }

        await prisma.productAnswer.delete({ where: { id: answerId } });
        return response.json({ success: true });
    } catch {
        return response.status(500).json({ success: false, message: "We could not delete your answer. Please try again." });
    }
}

// Save one community review per signed-in user and offer, while blocking seller self-reviews.
export async function reviewListing(request, response) {
    const listingId = Number(request.params.listingId);
    const reviewInput = validateReview(request.body?.rating, request.body?.comment);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing id must be a positive integer." });
    }
    if (!reviewInput) {
        return response.status(400).json({ success: false, message: "Choose 1 to 5 stars and write a review between 3 and 1,000 characters." });
    }

    try {
        const listing = await prisma.listing.findUnique({ where: { id: listingId }, select: { id: true, sellerId: true, status: true } });
        if (!listing || listing.status !== "ACTIVE") {
            return response.status(404).json({ success: false, message: "This offer is no longer available for review." });
        }
        if (listing.sellerId === request.user.id) {
            return response.status(403).json({ success: false, message: "You cannot review your own offer." });
        }

        const review = await prisma.listingReview.upsert({
            where: { listingId_reviewerId: { listingId, reviewerId: request.user.id } },
            create: { listingId, reviewerId: request.user.id, ...reviewInput },
            update: reviewInput
        });

        return response.status(201).json({
            success: true,
            review: { id: review.id, listingId: review.listingId, rating: review.rating, comment: review.comment, createdAt: review.createdAt }
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not save your review. Please try again." });
    }
}

// Confirm the review belongs to both this offer and the signed-in reviewer.
export async function deleteListingReview(request, response) {
    const listingId = Number(request.params.listingId);
    const reviewId = Number(request.params.reviewId);
    if (!Number.isSafeInteger(listingId) || listingId < 1 || !Number.isSafeInteger(reviewId) || reviewId < 1) {
        return response.status(400).json({ success: false, message: "Listing and review ids must be positive integers." });
    }

    try {
        const review = await prisma.listingReview.findUnique({
            where: { id: reviewId },
            select: { id: true, listingId: true, reviewerId: true }
        });
        if (!review || review.listingId !== listingId) {
            return response.status(404).json({ success: false, message: "Review not found for this offer." });
        }
        if (review.reviewerId !== request.user.id) {
            return response.status(403).json({ success: false, message: "You can delete only your own review." });
        }

        await prisma.listingReview.delete({ where: { id: reviewId } });
        return response.json({ success: true });
    } catch {
        return response.status(500).json({ success: false, message: "We could not delete your review. Please try again." });
    }
}
