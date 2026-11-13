// Create seller listings and return individual active marketplace offers.
import { prisma } from "../../lib/prisma.js";
import { CLOTHING_GENDERS, COLOR_EXCLUDED_CATEGORIES, isValidQuantity, matchesExploreFilters, normalizeCommaSeparatedValues, normalizeListingHashtags, normalizeProductName, parseProteinRich, PRODUCT_CATEGORIES, validateListingDetails, validateListingHashtags } from "./listingsValidation.js";
import { productNamesMatch } from "./productGrouping.js";
import { listingPhotoUrl, removeListingPhotos } from "./listingPhotoUpload.js";

// Create a seller offer and reuse a shared product record for the same name/category.
export async function createListing(request, response) {
    const { name, category, description, hashtags: rawHashtags, price, phoneNumber, location, clothingGender, clothingSizes, color, proteinRich, posterSize, quantityAvailable, condition, customCondition } = request.body ?? {};
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedDescription = typeof description === "string" ? description.trim() : "";
    const priceText = typeof price === "number" || typeof price === "string" ? String(price).trim() : "";
    const trimmedLocation = typeof location === "string" ? location.trim() : "";
    const uploadedPhotos = request.files ?? [];
    if (uploadedPhotos.length < 1 || uploadedPhotos.length > 4) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: "Choose between 1 and 4 product photos before publishing." });
    }
    const [photoUrl, photoUrl2, photoUrl3, photoUrl4] = uploadedPhotos.map(listingPhotoUrl);

    // Use the same server-side validation rules for creating and editing offers.
    const validationMessage = validateListingDetails(request.body ?? {});
    if (validationMessage) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: validationMessage });
    }
    const hashtagValidationMessage = validateListingHashtags(rawHashtags);
    if (hashtagValidationMessage) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: hashtagValidationMessage });
    }
    const hashtags = normalizeListingHashtags(rawHashtags);

    try {
        const normalizedName = normalizeProductName(trimmedName);
        // Save the shared product and seller offer together so neither can be left half-created.
        const result = await prisma.$transaction(async (transaction) => {
            const product = await transaction.product.upsert({
                where: { normalizedName_category: { normalizedName, category } },
                create: { name: trimmedName, normalizedName, category },
                update: {}
            });

            const listing = await transaction.listing.create({
                data: {
                    productId: product.id,
                    sellerId: request.user.id,
                    title: trimmedName,
                    description: trimmedDescription,
                    hashtags,
                    price: priceText,
                    phoneNumber: phoneNumber.trim(),
                    quantityAvailable: Number(quantityAvailable),
                    photoUrl,
                    photoUrl2,
                    photoUrl3: photoUrl3 ?? null,
                    photoUrl4: photoUrl4 ?? null,
                    location: trimmedLocation,
                    condition,
                    customCondition: condition === "CUSTOM" ? customCondition.trim() : null,
                    clothingGender: category === "CLOTHING" ? clothingGender : null,
                    clothingSizes: category === "CLOTHING" ? normalizeCommaSeparatedValues(clothingSizes) : null,
                    color: !COLOR_EXCLUDED_CATEGORIES.has(category)
                        ? normalizeCommaSeparatedValues(color) : null,
                    proteinRich: category === "FOOD" ? parseProteinRich(proteinRich) : false,
                    proteinGrams: null,
                    posterSize: category === "POSTERS" ? posterSize.trim() : null
                },
                include: { product: { select: { id: true, name: true, category: true } } }
            });

            return { listing };
        });

        const { listing } = result;

        return response.status(201).json({
            success: true,
            listing: {
                id: listing.id,
                title: listing.title,
                product: listing.product,
                description: listing.description,
                hashtags: listing.hashtags,
                price: listing.price.toFixed(2),
                photoUrl: listing.photoUrl,
                photoUrl2: listing.photoUrl2,
                photoUrl3: listing.photoUrl3,
                photoUrl4: listing.photoUrl4,
                location: listing.location,
                condition: listing.condition,
                customCondition: listing.customCondition,
                clothingGender: listing.clothingGender,
                clothingSizes: listing.clothingSizes,
                color: listing.color,
                proteinRich: listing.proteinRich,
                posterSize: listing.posterSize,
                status: listing.status,
                quantityAvailable: Number.isSafeInteger(listing.quantityAvailable) ? listing.quantityAvailable : null,
                createdAt: listing.createdAt
            }
        });
    } catch {
        await removeListingPhotos(uploadedPhotos);
        return response.status(500).json({ success: false, message: "We could not create the listing. Please try again." });
    }
}

// Let a seller adjust only their own active offer's available whole-item count.
export async function updateListingStock(request, response) {
    const listingId = Number(request.params.listingId);
    const quantityAvailable = request.body?.quantityAvailable;
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }
    if (!isValidQuantity(quantityAvailable)) {
        return response.status(400).json({ success: false, message: "Enter available stock as a whole number from 0 to 9,999." });
    }

    try {
        const updated = await prisma.listing.updateMany({
            where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
            data: { quantityAvailable: Number(quantityAvailable) }
        });
        if (updated.count !== 1) {
            return response.status(404).json({ success: false, message: "This active listing was not found on your account." });
        }
        return response.json({ success: true, quantityAvailable: Number(quantityAvailable) });
    } catch {
        return response.status(500).json({ success: false, message: "We could not update the stock count." });
    }
}

// Return a fast, cacheable page of in-stock seller listings for Explore.
export async function getExploreProducts(request, response) {
    const search = typeof request.query.search === "string" ? request.query.search.trim().slice(0, 100) : "";
    const category = typeof request.query.category === "string" ? request.query.category.trim().toUpperCase() : "";
    const gender = typeof request.query.gender === "string" ? request.query.gender.trim().toUpperCase() : "";
    const proteinOnly = request.query.proteinOnly === "true";
    const pageSize = 24;
    const cursorId = typeof request.query.cursor === "string" && /^\d+$/.test(request.query.cursor)
        ? Number(request.query.cursor)
        : null;

    // Reject unknown category values rather than silently returning confusing results.
    if (category && !PRODUCT_CATEGORIES.has(category)) {
        return response.status(400).json({ success: false, message: "Choose a valid product category." });
    }
    if (gender && (!CLOTHING_GENDERS.has(gender) || category !== "CLOTHING")) {
        return response.status(400).json({ success: false, message: "Choose a valid clothing gender filter." });
    }
    if (proteinOnly && category !== "FOOD") {
        return response.status(400).json({ success: false, message: "The protein-only filter is available for food listings." });
    }
    if (request.query.cursor !== undefined && (!Number.isSafeInteger(cursorId) || cursorId < 1 || search)) {
        return response.status(400).json({ success: false, message: "This listing page cursor is invalid." });
    }

    try {
        // Search keeps the existing fuzzy matching behavior; regular browsing reads one indexed page.
        const browsingCategory = category;
        const listings = await prisma.listing.findMany({
            where: {
                status: "ACTIVE",
                quantityAvailable: { gt: 0 },
                ...(browsingCategory ? { product: { category: browsingCategory } } : {}),
                ...(gender ? { clothingGender: gender } : {}),
                ...(proteinOnly ? { proteinRich: true } : {})
            },
            orderBy: [{ price: "asc" }, { createdAt: "desc" }, { id: "desc" }],
            ...(!search ? {
                take: pageSize + 1,
                ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {})
            } : {}),
            select: {
                id: true,
                sellerId: true,
                title: true,
                price: true,
                quantityAvailable: true,
                photoUrl: true,
                photoUrl2: true,
                photoUrl3: true,
                photoUrl4: true,
                condition: true,
                customCondition: true,
                clothingGender: true,
                clothingSizes: true,
                color: true,
                proteinRich: true,
                posterSize: true,
                hashtags: true,
                createdAt: true,
                product: { select: { category: true } },
                seller: { select: { fullName: true } }
            }
        });

        // Return only category availability for the Explore filter, not every listing.
        const availableCategoryRows = await prisma.product.findMany({
            where: { listings: { some: { status: "ACTIVE", quantityAvailable: { gt: 0 } } } },
            select: { category: true },
            distinct: ["category"]
        });
        const availableCategories = availableCategoryRows.map(({ category }) => category);

        const hasMore = !search && listings.length > pageSize;
        const pageListings = hasMore ? listings.slice(0, pageSize) : listings;
        // Re-check category-specific filters in memory as a safety net as well as in SQL.
        const filteredListings = pageListings.filter((listing) =>
            matchesExploreFilters(listing, { category, gender, proteinOnly })
        );
        const matchingListings = search
            ? filteredListings.filter((listing) => productSearchMatches(search, listing.title, listing.hashtags))
            : filteredListings;
        const results = matchingListings.map((listing) => ({
            id: listing.id,
            sellerId: listing.sellerId,
            sellerName: listing.seller.fullName || "CampusX Member",
            title: listing.title,
            hashtags: listing.hashtags,
            category: listing.product.category,
            price: listing.price.toFixed(2),
            quantityAvailable: listing.quantityAvailable,
            photoUrl: listing.photoUrl,
            photoUrl2: listing.photoUrl2,
            photoUrl3: listing.photoUrl3,
            photoUrl4: listing.photoUrl4,
            condition: listing.condition,
            customCondition: listing.customCondition,
            clothingGender: listing.clothingGender,
            proteinRich: listing.proteinRich,
            color: listing.color,
            posterSize: listing.posterSize
        }));

        const suggestions = search
            ? [...new Map(matchingListings.map((listing) => [
                normalizeProductName(listing.title),
                { id: listing.id, name: listing.title, category: listing.product.category }
            ])).values()].slice(0, 6)
            : [];

        // Listing edits should be visible immediately across browsers and deployments.
        response.setHeader("Cache-Control", "no-store");
        return response.json({
            success: true,
            listings: results,
            availableCategories,
            suggestions,
            nextCursor: hasMore ? String(pageListings.at(-1)?.id ?? "") || null : null
        });
    } catch (error) {
        // Log only Prisma's safe error code/name; never expose database details to clients or logs.
        console.error("Product feed query failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not load products right now." });
    }
}

// Match every typed word to a listing title, retaining the existing close-keyword behavior.
function productSearchMatches(search, title, hashtags = []) {
    const queryTokens = search.trim().split(/[\s,]+/u).filter(Boolean);
    const normalizedTags = new Set((hashtags ?? []).map((tag) =>
        tag.normalize("NFKC").replace(/^#+/u, "").toLocaleLowerCase("en")
    ));
    return queryTokens.every((token) => {
        // Keep hashtag punctuation intact so #campus-project and #campus_project stay searchable.
        const hashtagKeyword = token.normalize("NFKC").replace(/^#+/u, "").toLocaleLowerCase("en");
        const titleWords = normalizeProductName(token).split(" ").filter(Boolean);
        const matchesTitle = titleWords.length > 0 && titleWords.every((word) => productNamesMatch(word, title));
        return matchesTitle || normalizedTags.has(hashtagKeyword);
    });
}

// Return one public listing by its own ID, including only safe seller identity and reputation.
export async function getPublicListingDetails(request, response) {
    response.setHeader("Cache-Control", "no-store");
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            select: {
                id: true,
                sellerId: true,
                title: true,
                description: true,
                hashtags: true,
                price: true,
                quantityAvailable: true,
                photoUrl: true,
                photoUrl2: true,
                photoUrl3: true,
                photoUrl4: true,
                location: true,
                condition: true,
                customCondition: true,
                clothingGender: true,
                clothingSizes: true,
                color: true,
                proteinRich: true,
                posterSize: true,
                createdAt: true,
                product: { select: { id: true, category: true } },
                seller: { select: { id: true, fullName: true, avatarUrl: true } }
            }
        });
        if (!listing) return response.status(404).json({ success: false, message: "This listing is no longer available." });

        const reputation = await prisma.listingReview.aggregate({
            where: { listing: { sellerId: listing.sellerId, status: "ACTIVE" } },
            _avg: { rating: true },
            _count: { _all: true }
        });

        return response.json({
            success: true,
            listing: {
                id: listing.id,
                title: listing.title,
                description: listing.description,
                hashtags: listing.hashtags,
                price: listing.price.toFixed(2),
                quantityAvailable: listing.quantityAvailable,
                photoUrl: listing.photoUrl,
                photoUrl2: listing.photoUrl2,
                photoUrl3: listing.photoUrl3,
                photoUrl4: listing.photoUrl4,
                location: listing.location,
                condition: listing.condition,
                customCondition: listing.customCondition,
                clothingGender: listing.clothingGender,
                clothingSizes: listing.clothingSizes,
                color: listing.color,
                proteinRich: listing.proteinRich,
                posterSize: listing.posterSize,
                category: listing.product.category,
                productId: listing.product.id,
                createdAt: listing.createdAt,
                seller: {
                    id: listing.seller.id,
                    fullName: listing.seller.fullName || "CampusX Member",
                    avatarUrl: listing.seller.avatarUrl,
                    averageRating: reputation._avg.rating === null ? null : Number(reputation._avg.rating.toFixed(1)),
                    reviewCount: reputation._count._all
                }
            }
        });
    } catch {
        return response.status(500).json({ success: false, message: "We could not load this listing right now." });
    }
}

// Return this account's saved active offers without loading the rest of seller inventory.
export async function getSavedListings(request, response) {
    try {
        const favorites = await prisma.listingFavorite.findMany({
            where: { userId: request.user.id, listing: { status: "ACTIVE" } },
            orderBy: { createdAt: "desc" },
            select: {
                createdAt: true,
                listing: {
                    select: {
                        id: true, sellerId: true, title: true, description: true, hashtags: true,
                        price: true, photoUrl: true, condition: true, customCondition: true,
                        product: { select: { category: true } },
                        seller: { select: { fullName: true, avatarUrl: true } }
                    }
                }
            }
        });
        return response.json({
            success: true,
            listings: favorites.map(({ createdAt, listing }) => ({
                savedAt: createdAt,
                listingId: listing.id,
                sellerId: listing.sellerId,
                sellerName: listing.seller.fullName || "CampusX Member",
                sellerAvatarUrl: listing.seller.avatarUrl,
                title: listing.title,
                description: listing.description,
                hashtags: listing.hashtags,
                price: listing.price.toFixed(2),
                photoUrl: listing.photoUrl,
                condition: listing.condition,
                customCondition: listing.customCondition,
                category: listing.product.category
            }))
        });
    } catch (error) {
        console.error("Saved listings read failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not load your wishlist." });
    }
}

// Return this account's saved offer IDs in one request so cards avoid N status calls.
export async function getSavedListingIds(request, response) {
    try {
        const favorites = await prisma.listingFavorite.findMany({
            where: { userId: request.user.id },
            select: { listingId: true }
        });
        return response.json({ success: true, listingIds: favorites.map((favorite) => favorite.listingId) });
    } catch (error) {
        console.error("Wishlist read failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not load your saved offers." });
    }
}

// Check a single seller offer's saved state for the signed-in account.
export async function getListingFavorite(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing id must be a positive integer." });
    }

    try {
        const favorite = await prisma.listingFavorite.findUnique({
            where: { userId_listingId: { userId: request.user.id, listingId } },
            select: { id: true }
        });
        return response.json({ success: true, isSaved: Boolean(favorite) });
    } catch (error) {
        console.error("Wishlist status check failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not check this saved offer." });
    }
}

// Save one active listing idempotently; the database unique key prevents duplicate hearts.
export async function saveListing(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing id must be a positive integer." });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, status: "ACTIVE" },
            select: { id: true }
        });
        if (!listing) {
            return response.status(404).json({ success: false, message: "This offer is no longer active." });
        }

        await prisma.listingFavorite.upsert({
            where: { userId_listingId: { userId: request.user.id, listingId } },
            create: { userId: request.user.id, listingId },
            update: {}
        });
        return response.status(201).json({ success: true, isSaved: true });
    } catch (error) {
        console.error("Wishlist save failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not save this offer. Please try again." });
    }
}

// Remove only this account's saved offer; repeating the request is harmless.
export async function removeSavedListing(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing id must be a positive integer." });
    }

    try {
        await prisma.listingFavorite.deleteMany({ where: { userId: request.user.id, listingId } });
        return response.json({ success: true, isSaved: false });
    } catch (error) {
        console.error("Wishlist removal failed:", error?.code ?? error?.name ?? "UNKNOWN");
        return response.status(500).json({ success: false, message: "We could not remove this saved offer. Please try again." });
    }
}

