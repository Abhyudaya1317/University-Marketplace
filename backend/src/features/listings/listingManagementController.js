// Handle seller-owned listing edits, archival, restoration, and guarded deletion.
import { prisma } from "../../lib/prisma.js";
import { COLOR_EXCLUDED_CATEGORIES, normalizeCommaSeparatedValues, normalizeListingHashtags, normalizeProductName, parseProteinRich, validateListingDetails, validateListingHashtags } from "./listingsValidation.js";
import { listingPhotoUrl, removeListingPhotos, removeListingPhotoByUrl } from "./listingPhotoUpload.js";

// Return only the owner's active listing data needed to prefill the existing sell form.
export async function getListingForEdit(request, response) {
    response.setHeader("Cache-Control", "private, no-store");
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
            select: {
                id: true, title: true, description: true, price: true, quantityAvailable: true,
                phoneNumber: true, location: true, photoUrl: true, photoUrl2: true, photoUrl3: true, photoUrl4: true,
                condition: true, customCondition: true,
                clothingGender: true, clothingSizes: true, color: true, proteinRich: true, posterSize: true, hashtags: true,
                product: { select: { category: true } }
            }
        });
        if (!listing) return response.status(404).json({ success: false, message: "This active listing was not found on your account." });

        return response.json({
            success: true,
            listing: {
                id: listing.id,
                name: listing.title,
                category: listing.product.category,
                description: listing.description,
                price: listing.price.toFixed(2),
                quantityAvailable: listing.quantityAvailable,
                phoneNumber: listing.phoneNumber,
                location: listing.location,
                photoUrl: listing.photoUrl,
                photoUrl2: listing.photoUrl2,
                photoUrl3: listing.photoUrl3,
                photoUrl4: listing.photoUrl4,
                condition: listing.condition,
                customCondition: listing.customCondition,
                clothingGender: listing.clothingGender,
                clothingSizes: listing.clothingSizes,
                color: listing.color,
                proteinRich: listing.proteinRich,
                posterSize: listing.posterSize,
                hashtags: listing.hashtags
            }
        });
    } catch (error) {
        logListingFailure("load edit form", error);
        return response.status(500).json({ success: false, message: "We could not load this listing for editing." });
    }
}

// Update the owner's active offer and its shared catalog link in one transaction.
export async function updateListing(request, response) {
    response.setHeader("Cache-Control", "private, no-store");
    const listingId = Number(request.params.listingId);
    const uploadedPhotos = request.files ?? [];
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    if (uploadedPhotos.length !== 0 && uploadedPhotos.length > 4) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: "Choose either no new photos or between 1 and 4 replacement photos." });
    }

    const validationMessage = validateListingDetails(request.body ?? {});
    if (validationMessage) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: validationMessage });
    }

    const hashtagValidationMessage = validateListingHashtags(request.body?.hashtags);
    if (hashtagValidationMessage) {
        await removeListingPhotos(uploadedPhotos);
        return response.status(400).json({ success: false, message: hashtagValidationMessage });
    }

    const name = request.body.name.trim();
    const description = request.body.description.trim();
    const location = request.body.location.trim();
    const price = String(request.body.price).trim();
    const normalizedName = normalizeProductName(name);
    try {
        const updatedListing = await prisma.$transaction(async (transaction) => {
            const current = await transaction.listing.findFirst({
                where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
                select: { photoUrl: true, photoUrl2: true, photoUrl3: true, photoUrl4: true }
            });
            if (!current) return { error: "NOT_FOUND" };

            const product = await transaction.product.upsert({
                where: { normalizedName_category: { normalizedName, category: request.body.category } },
                create: { name, normalizedName, category: request.body.category },
                update: {}
            });
            const photoUrls = uploadedPhotos.length
                ? uploadedPhotos.map(listingPhotoUrl)
                : [current.photoUrl, current.photoUrl2, current.photoUrl3, current.photoUrl4];
            const changed = await transaction.listing.updateMany({
                where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
                data: {
                    productId: product.id,
                    title: name,
                    description,
                    hashtags: normalizeListingHashtags(request.body?.hashtags),
                    price,
                    phoneNumber: request.body.phoneNumber.trim(),
                    quantityAvailable: Number(request.body.quantityAvailable),
                    location,
                    photoUrl: photoUrls[0] ?? null,
                    photoUrl2: photoUrls[1] ?? null,
                    photoUrl3: photoUrls[2] ?? null,
                    photoUrl4: photoUrls[3] ?? null,
                    condition: request.body.condition,
                    customCondition: request.body.condition === "CUSTOM" ? request.body.customCondition.trim() : null,
                    clothingGender: request.body.category === "CLOTHING" ? request.body.clothingGender : null,
                    clothingSizes: request.body.category === "CLOTHING" ? normalizeCommaSeparatedValues(request.body.clothingSizes) : null,
                    color: COLOR_EXCLUDED_CATEGORIES.has(request.body.category) ? null : normalizeCommaSeparatedValues(request.body.color),
                    proteinRich: request.body.category === "FOOD" ? parseProteinRich(request.body.proteinRich) : false,
                    proteinGrams: null,
                    posterSize: request.body.category === "POSTERS" ? request.body.posterSize.trim() : null
                }
            });
            if (changed.count !== 1) return { error: "NOT_FOUND" };

            const listing = await transaction.listing.findUnique({
                where: { id: listingId },
                select: {
                    id: true, title: true, description: true, price: true, quantityAvailable: true,
                    photoUrl: true, photoUrl2: true, photoUrl3: true, photoUrl4: true,
                    location: true, condition: true, customCondition: true, clothingGender: true,
                    clothingSizes: true, color: true, proteinRich: true, posterSize: true, hashtags: true, product: { select: { id: true, name: true, category: true } }
                }
            });
            return { listing, previousPhotoUrls: [current.photoUrl, current.photoUrl2, current.photoUrl3, current.photoUrl4] };
        });

        if (updatedListing.error === "NOT_FOUND") {
            await removeListingPhotos(uploadedPhotos);
            return response.status(404).json({ success: false, message: "This active listing was not found on your account." });
        }

        const updatedPhotoUrls = [updatedListing.listing.photoUrl, updatedListing.listing.photoUrl2, updatedListing.listing.photoUrl3, updatedListing.listing.photoUrl4];
        for (const oldPhotoUrl of updatedListing.previousPhotoUrls) {
            if (oldPhotoUrl && !updatedPhotoUrls.includes(oldPhotoUrl)) {
                await removeListingPhotoByUrl(oldPhotoUrl).catch((error) => logListingFailure("remove replaced photo", error));
            }
        }

        return response.json({
            success: true,
            listing: {
                id: updatedListing.listing.id,
                title: updatedListing.listing.title,
                product: updatedListing.listing.product,
                description: updatedListing.listing.description,
                price: updatedListing.listing.price.toFixed(2),
                quantityAvailable: updatedListing.listing.quantityAvailable,
                photoUrl: updatedListing.listing.photoUrl,
                photoUrl2: updatedListing.listing.photoUrl2,
                photoUrl3: updatedListing.listing.photoUrl3,
                photoUrl4: updatedListing.listing.photoUrl4,
                location: updatedListing.listing.location,
                condition: updatedListing.listing.condition,
                customCondition: updatedListing.listing.customCondition,
                clothingGender: updatedListing.listing.clothingGender,
                clothingSizes: updatedListing.listing.clothingSizes,
                color: updatedListing.listing.color,
                proteinRich: updatedListing.listing.proteinRich,
                posterSize: updatedListing.listing.posterSize,
                hashtags: updatedListing.listing.hashtags
            }
        });
    } catch (error) {
        await removeListingPhotos(uploadedPhotos);
        logListingFailure("update listing", error);
        return response.status(500).json({ success: false, message: "We could not update this listing. Please try again." });
    }
}

// Hide an offer from every public query but retain its details for its original seller.
export async function archiveListing(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    try {
        const archivedAt = new Date();
        const result = await prisma.$transaction(async (transaction) => {
            const listing = await transaction.listing.findFirst({
                where: { id: listingId, sellerId: request.user.id, status: { in: ["ACTIVE", "SOLD"] } },
                select: { id: true }
            });
            if (!listing) return { error: "NOT_FOUND" };

            // Keep accepted and pending exchanges visible until both sides finish the handoff.
            const openOrder = await transaction.order.findFirst({
                where: {
                    listingId,
                    status: { in: ["PENDING", "ACCEPTED", "SELLER_CONFIRMED"] }
                },
                select: { id: true }
            });
            if (openOrder) return { error: "OPEN_ORDERS" };

            const archived = await transaction.listing.updateMany({
                where: { id: listingId, sellerId: request.user.id, status: { in: ["ACTIVE", "SOLD"] } },
                data: { status: "ARCHIVED", archivedAt }
            });
            return archived.count === 1 ? { archivedAt } : { error: "NOT_FOUND" };
        }, { isolationLevel: "Serializable" });

        if (result.error === "OPEN_ORDERS") {
            return response.status(409).json({ success: false, message: "This listing has an open buyer request or meetup. Finish or decline it before archiving the listing." });
        }
        if (result.error === "NOT_FOUND") return response.status(404).json({ success: false, message: "This listing was not found or is already archived." });
        return response.json({ success: true, status: "ARCHIVED", archivedAt: result.archivedAt });
    } catch (error) {
        if (error?.code === "P2034") {
            return response.status(409).json({ success: false, message: "A buyer request changed while archiving. Refresh the listing and try again." });
        }
        logListingFailure("archive listing", error);
        return response.status(500).json({ success: false, message: "We could not move this listing to your archive." });
    }
}

// Return only this seller's archived offer to the public catalog.
export async function restoreListing(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    try {
        const result = await prisma.listing.updateMany({
            where: { id: listingId, sellerId: request.user.id, status: "ARCHIVED" },
            data: { status: "ACTIVE", archivedAt: null }
        });
        if (result.count !== 1) return response.status(404).json({ success: false, message: "This archived listing was not found on your account." });
        return response.json({ success: true, status: "ACTIVE" });
    } catch (error) {
        logListingFailure("restore listing", error);
        return response.status(500).json({ success: false, message: "We could not restore this listing." });
    }
}

// Permanently delete only archived listings without order history; the foreign key also protects races.
export async function permanentlyDeleteListing(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    try {
        const archivedListing = await prisma.listing.findFirst({
            where: { id: listingId, sellerId: request.user.id, status: "ARCHIVED" },
            select: { id: true, photoUrl: true, photoUrl2: true, photoUrl3: true, photoUrl4: true, _count: { select: { orders: true } } }
        });
        if (!archivedListing) return response.status(404).json({ success: false, message: "This archived listing was not found on your account." });
        if (archivedListing._count.orders > 0) {
            return response.status(409).json({ success: false, message: "This listing has order history, so it must remain archived." });
        }

        const deleted = await prisma.listing.deleteMany({
            where: { id: listingId, sellerId: request.user.id, status: "ARCHIVED", orders: { none: {} } }
        });
        if (deleted.count !== 1) return response.status(409).json({ success: false, message: "This listing gained order history and must remain archived." });

        for (const photoUrl of [archivedListing.photoUrl, archivedListing.photoUrl2, archivedListing.photoUrl3, archivedListing.photoUrl4]) {
            if (photoUrl) await removeListingPhotoByUrl(photoUrl).catch((error) => logListingFailure("remove deleted listing photo", error));
        }
        return response.json({ success: true, deleted: true });
    } catch (error) {
        logListingFailure("permanently delete listing", error);
        if (error?.code === "P2003") {
            return response.status(409).json({ success: false, message: "This listing has related order history and must remain archived." });
        }
        return response.status(500).json({ success: false, message: "We could not permanently delete this listing." });
    }
}

// Log only a database error code or safe error name, never request data or connection strings.
function logListingFailure(action, error) {
    console.error(`Listing operation failed (${action}):`, error?.code ?? error?.name ?? "UNKNOWN");
}
