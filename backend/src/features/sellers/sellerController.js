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

// Keep the seller dashboard payload focused on the profile and own listings.
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
                    _count: { select: { savedBy: true, savedSellers: true } },
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
                followingCount: account._count.savedSellers,
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
            }))
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load your dashboard." });
    }
}

// Return followed seller profiles and one active listing for their dedicated page.
export async function getFollowedSellers(request, response) {
    try {
        const favorites = await prisma.sellerFavorite.findMany({
            where: { fanId: request.user.id },
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
                            take: 1,
                            select: {
                                title: true,
                                price: true,
                                photoUrl: true,
                                product: { select: { id: true, name: true, category: true } }
                            }
                        }
                    }
                }
            }
        });
        return response.json({
            success: true,
            sellers: favorites.map(({ createdAt, seller }) => ({
                sellerId: seller.id,
                sellerName: seller.fullName || "CampusX Member",
                sellerAvatarUrl: seller.avatarUrl,
                savedAt: createdAt,
                latestListing: seller.listings[0] ? {
                    title: seller.listings[0].title,
                    price: seller.listings[0].price.toFixed(2),
                    photoUrl: seller.listings[0].photoUrl,
                    product: seller.listings[0].product
                } : null
            }))
        });
    } catch (error) {
        console.error("Followed sellers read failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not load followed sellers." });
    }
}

// Return the signed-in seller's followers without exposing their email addresses.
export async function getFollowers(request, response) {
    try {
        const relationships = await prisma.sellerFavorite.findMany({
            where: { sellerId: request.user.id },
            orderBy: { createdAt: "desc" },
            select: {
                createdAt: true,
                fan: { select: { id: true, fullName: true, avatarUrl: true } }
            }
        });

        return response.json({
            success: true,
            followers: relationships.map(({ createdAt, fan }) => ({
                followerId: fan.id,
                followerName: fan.fullName || "CampusX Member",
                followerAvatarUrl: fan.avatarUrl,
                followedAt: createdAt
            }))
        });
    } catch (error) {
        console.error("Followers read failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not load your followers." });
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
