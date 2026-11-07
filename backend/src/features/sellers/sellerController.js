// Serve public seller profiles and keep each person's saved sellers private to their account.
import { prisma } from "../../lib/prisma.js";
import { parseSellerId } from "./sellerValidation.js";

// Keep the public offer fields in one selection so seller email and phone are never returned.
const activeListingSelection = {
    where: { status: "ACTIVE" },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    select: {
        id: true,
        productId: true,
        title: true,
        description: true,
        price: true,
        quantityAvailable: true,
        photoUrl: true,
        photoUrl2: true,
        photoUrl3: true,
        photoUrl4: true,
        location: true,
        clothingGender: true,
        proteinGrams: true,
        condition: true,
        customCondition: true,
        createdAt: true,
        product: { select: { id: true, name: true, category: true } }
    }
};

// Show the seller's active listings and public review average without exposing account data.
export async function getSellerProfile(request, response) {
    const sellerId = parseSellerId(request.params.sellerId);
    if (sellerId === null) {
        return response.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }

    try {
        const [seller, reviewSummary] = await Promise.all([
            prisma.user.findUnique({
                where: { id: sellerId },
                select: {
                    id: true,
                    fullName: true,
                    avatarUrl: true,
                    bio: true,
                    listings: activeListingSelection,
                    _count: { select: { savedBy: true, savedSellers: true } }
                }
            }),
            prisma.listingReview.aggregate({
                where: { listing: { sellerId, status: "ACTIVE" } },
                _avg: { rating: true },
                _count: { _all: true }
            })
        ]);

        if (!seller) {
            return response.status(404).json({ success: false, message: "This seller profile was not found." });
        }

        return response.json({
            success: true,
            seller: {
                id: seller.id,
                fullName: seller.fullName || "CampusX Member",
                avatarUrl: seller.avatarUrl,
                bio: seller.bio,
                activeListingCount: seller.listings.length,
                followerCount: seller._count.savedBy,
                followingCount: seller._count.savedSellers,
                averageRating: reviewSummary._avg.rating === null ? null : Number(reviewSummary._avg.rating.toFixed(1)),
                reviewCount: reviewSummary._count._all
            },
            listings: seller.listings.map((listing) => ({
                id: listing.id,
                productId: listing.productId,
                product: listing.product,
                title: listing.title,
                description: listing.description,
                price: listing.price.toFixed(2),
                quantityAvailable: listing.quantityAvailable,
                photoUrl: listing.photoUrl,
                photoUrl2: listing.photoUrl2,
                photoUrl3: listing.photoUrl3,
                photoUrl4: listing.photoUrl4,
                location: listing.location,
                clothingGender: listing.clothingGender,
                proteinGrams: listing.proteinGrams?.toFixed(2) ?? null,
                condition: listing.condition,
                customCondition: listing.customCondition,
                createdAt: listing.createdAt
            }))
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load this seller profile." });
    }
}

// Show the signed-in user's listings and saved sellers together on their dashboard.
export async function getSellerDashboard(request, response) {
    try {
        const [account, reviewSummary] = await Promise.all([
            prisma.user.findUnique({
                where: { id: request.user.id },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    avatarUrl: true,
                    bio: true,
                    _count: { select: { savedBy: true } },
                    listings: {
                        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
                        select: {
                            id: true,
                            title: true,
                            description: true,
                            price: true,
                            quantityAvailable: true,
                            photoUrl: true,
                            photoUrl2: true,
                            photoUrl3: true,
                            photoUrl4: true,
                            location: true,
                            status: true,
                            archivedAt: true,
                            condition: true,
                            customCondition: true,
                            createdAt: true,
                            product: { select: { id: true, name: true, category: true } }
                        }
                    },
                    savedSellers: {
                        orderBy: { createdAt: "desc" },
                        select: {
                            createdAt: true,
                            seller: {
                                select: {
                                    id: true,
                                    fullName: true,
                                    avatarUrl: true,
                                    listings: {
                                        ...activeListingSelection,
                                        take: 1
                                    }
                                }
                            }
                        }
                    },
                    savedListings: {
                        orderBy: { createdAt: "desc" },
                        select: {
                            createdAt: true,
                            listing: {
                                select: {
                                    id: true,
                                    description: true,
                                    price: true,
                                    photoUrl: true,
                                    photoUrl2: true,
                                    photoUrl3: true,
                                    photoUrl4: true,
                                    sellerId: true,
                                    title: true,
                                    seller: { select: { fullName: true, avatarUrl: true } },
                                    product: { select: { id: true, name: true, category: true } }
                                }
                            }
                        }
                    }
                }
            }),
            prisma.listingReview.aggregate({
                where: { listing: { sellerId: request.user.id, status: "ACTIVE" } },
                _avg: { rating: true },
                _count: { _all: true }
            })
        ]);

        if (!account) {
            return response.status(404).json({ success: false, message: "This account was not found." });
        }

        return response.json({
            success: true,
            profile: {
                id: account.id,
                email: account.email,
                fullName: account.fullName || "CampusX Member",
                avatarUrl: account.avatarUrl,
                bio: account.bio,
                activeListingCount: account.listings.filter((listing) => listing.status === "ACTIVE").length,
                followerCount: account._count.savedBy,
                followingCount: account.savedSellers.length,
                archivedListingCount: account.listings.filter((listing) => listing.status === "ARCHIVED").length,
                averageRating: reviewSummary._avg.rating === null ? null : Number(reviewSummary._avg.rating.toFixed(1)),
                reviewCount: reviewSummary._count._all
            },
            myListings: account.listings.map((listing) => ({
                id: listing.id,
                title: listing.title,
                product: listing.product,
                description: listing.description,
                price: listing.price.toFixed(2),
                quantityAvailable: listing.quantityAvailable,
                photoUrl: listing.photoUrl,
                photoUrl2: listing.photoUrl2,
                photoUrl3: listing.photoUrl3,
                photoUrl4: listing.photoUrl4,
                location: listing.location,
                status: listing.status,
                archivedAt: listing.archivedAt,
                condition: listing.condition,
                customCondition: listing.customCondition,
                createdAt: listing.createdAt
            })),
            favoriteSellers: account.savedSellers.map((favorite) => ({
                sellerId: favorite.seller.id,
                sellerName: favorite.seller.fullName || "CampusX Member",
                sellerAvatarUrl: favorite.seller.avatarUrl,
                savedAt: favorite.createdAt,
                latestListing: favorite.seller.listings[0] ? {
                    product: favorite.seller.listings[0].product,
                    price: favorite.seller.listings[0].price.toFixed(2)
                } : null
            })),
            savedListings: account.savedListings.map((favorite) => ({
                savedAt: favorite.createdAt,
                listingId: favorite.listing.id,
                sellerId: favorite.listing.sellerId,
                sellerName: favorite.listing.seller.fullName || "CampusX Member",
                title: favorite.listing.title,
                sellerAvatarUrl: favorite.listing.seller.avatarUrl,
                product: favorite.listing.product,
                description: favorite.listing.description,
                price: favorite.listing.price.toFixed(2),
                photoUrl: favorite.listing.photoUrl,
                photoUrl2: favorite.listing.photoUrl2,
                photoUrl3: favorite.listing.photoUrl3,
                photoUrl4: favorite.listing.photoUrl4
            }))
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load your dashboard." });
    }
}

// Return whether the current user already follows a seller, without disclosing follower data.
export async function getFavoriteStatus(request, response) {
    const sellerId = parseSellerId(request.params.sellerId);
    if (sellerId === null) {
        return response.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }

    if (sellerId === request.user.id) {
        return response.json({ success: true, isFavorite: false });
    }

    try {
        const favorite = await prisma.sellerFavorite.findUnique({
            where: { fanId_sellerId: { fanId: request.user.id, sellerId } },
            select: { id: true }
        });
        return response.json({ success: true, isFavorite: Boolean(favorite) });
    } catch {
        return response.status(500).json({ success: false, message: "We could not check this favorite." });
    }
}

// Save an active seller once; the unique database key makes repeat clicks safe.
export async function saveFavoriteSeller(request, response) {
    const sellerId = parseSellerId(request.params.sellerId);
    if (sellerId === null) {
        return response.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }
    if (sellerId === request.user.id) {
        return response.status(400).json({ success: false, message: "You cannot save your own seller profile." });
    }

    try {
        const seller = await prisma.user.findUnique({
            where: { id: sellerId },
            select: { id: true }
        });
        if (!seller) {
            return response.status(404).json({ success: false, message: "This seller profile was not found." });
        }

        await prisma.sellerFavorite.upsert({
            where: { fanId_sellerId: { fanId: request.user.id, sellerId } },
            create: { fanId: request.user.id, sellerId },
            update: {}
        });
        return response.status(201).json({ success: true, isFavorite: true });
    } catch {
        return response.status(500).json({ success: false, message: "We could not save this seller. Please try again." });
    }
}

// Remove only this user's saved-seller record; repeated removals are harmless.
export async function removeFavoriteSeller(request, response) {
    const sellerId = parseSellerId(request.params.sellerId);
    if (sellerId === null) {
        return response.status(400).json({ success: false, message: "Seller ID must be a positive integer." });
    }

    try {
        await prisma.sellerFavorite.deleteMany({ where: { fanId: request.user.id, sellerId } });
        return response.json({ success: true, isFavorite: false });
    } catch {
        return response.status(500).json({ success: false, message: "We could not remove this seller. Please try again." });
    }
}
