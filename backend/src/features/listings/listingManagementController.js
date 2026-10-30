// Handle seller-owned listing edits, archival, restoration, and guarded deletion.
import { prisma } from "../../lib/prisma.js";
import { normalizeProductName, validateListingDetails } from "./listingsValidation.js";
import { listingPhotoUrl, removeListingPhoto, removeListingPhotoByUrl } from "./listingPhotoUpload.js";

// Return only the owner's active listing data needed to prefill the existing sell form.
export async function getListingForEdit(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    try {
        const listing = await prisma.listing.findFirst({
            where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
            select: {
                id: true, title: true, description: true, price: true, quantityAvailable: true,
                phoneNumber: true, location: true, photoUrl: true, condition: true,
                clothingGender: true, proteinGrams: true,
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
                condition: listing.condition,
                clothingGender: listing.clothingGender,
                proteinGrams: listing.proteinGrams?.toFixed(2) ?? null
            }
        });
    } catch (error) {
        logListingFailure("load edit form", error);
        return response.status(500).json({ success: false, message: "We could not load this listing for editing." });
    }
}

// Update the owner's active offer and its shared catalog link in one transaction.
export async function updateListing(request, response) {
    const listingId = Number(request.params.listingId);
    if (!Number.isSafeInteger(listingId) || listingId < 1) {
        await removeListingPhoto(request.file?.path);
        return response.status(400).json({ success: false, message: "Listing ID must be a positive integer." });
    }

    const validationMessage = validateListingDetails(request.body ?? {});
    if (validationMessage) {
        await removeListingPhoto(request.file?.path);
        return response.status(400).json({ success: false, message: validationMessage });
    }

    const name = request.body.name.trim();
    const description = request.body.description.trim();
    const location = request.body.location.trim();
    const price = String(request.body.price).trim();
    const normalizedName = normalizeProductName(name);
    const removeCurrentPhoto = request.body.removePhoto === "true";

    try {
        const updatedListing = await prisma.$transaction(async (transaction) => {
            const current = await transaction.listing.findFirst({
                where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
                select: { photoUrl: true }
            });
            if (!current) return { error: "NOT_FOUND" };

            const product = await transaction.product.upsert({
                where: { normalizedName_category: { normalizedName, category: request.body.category } },
                create: { name, normalizedName, category: request.body.category },
                update: {}
            });
            const photoUrl = request.file
                ? listingPhotoUrl(request.file.filename)
                : removeCurrentPhoto ? null : current.photoUrl;
            const changed = await transaction.listing.updateMany({
                where: { id: listingId, sellerId: request.user.id, status: "ACTIVE" },
                data: {
                    productId: product.id,
                    title: name,
                    description,
                    price,
                    phoneNumber: request.body.phoneNumber.trim(),
                    quantityAvailable: Number(request.body.quantityAvailable),
                    location,
                    photoUrl,
                    condition: request.body.condition,
                    clothingGender: request.body.category === "CLOTHING" ? request.body.clothingGender : null,
                    proteinGrams: request.body.category === "FOOD" ? String(request.body.proteinGrams).trim() : null
                }
            });
            if (changed.count !== 1) return { error: "NOT_FOUND" };

            const listing = await transaction.listing.findUnique({
                where: { id: listingId },
                select: {
                    id: true, title: true, description: true, price: true, quantityAvailable: true,
                    photoUrl: true, location: true, condition: true, clothingGender: true,
                    proteinGrams: true, product: { select: { id: true, name: true, category: true } }
                }
            });
            return { listing, previousPhotoUrl: current.photoUrl };
        });

        if (updatedListing.error === "NOT_FOUND") {
            await removeListingPhoto(request.file?.path);
            return response.status(404).json({ success: false, message: "This active listing was not found on your account." });
        }

        if (updatedListing.previousPhotoUrl && updatedListing.previousPhotoUrl !== updatedListing.listing.photoUrl) {
            await removeListingPhotoByUrl(updatedListing.previousPhotoUrl).catch((error) => logListingFailure("remove replaced photo", error));
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
                location: updatedListing.listing.location,
                condition: updatedListing.listing.condition,
                clothingGender: updatedListing.listing.clothingGender,
                proteinGrams: updatedListing.listing.proteinGrams?.toFixed(2) ?? null
            }
        });
    } catch (error) {
        await removeListingPhoto(request.file?.path);
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
        const result = await prisma.listing.updateMany({
            where: { id: listingId, sellerId: request.user.id, status: { in: ["ACTIVE", "SOLD"] } },
            data: { status: "ARCHIVED", archivedAt }
        });
        if (result.count !== 1) return response.status(404).json({ success: false, message: "This listing was not found or is already archived." });
        return response.json({ success: true, status: "ARCHIVED", archivedAt });
    } catch (error) {
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
            select: { id: true, photoUrl: true, _count: { select: { orders: true } } }
        });
        if (!archivedListing) return response.status(404).json({ success: false, message: "This archived listing was not found on your account." });
        if (archivedListing._count.orders > 0) {
            return response.status(409).json({ success: false, message: "This listing has order history, so it must remain archived." });
        }

        const deleted = await prisma.listing.deleteMany({
            where: { id: listingId, sellerId: request.user.id, status: "ARCHIVED", orders: { none: {} } }
        });
        if (deleted.count !== 1) return response.status(409).json({ success: false, message: "This listing gained order history and must remain archived." });

        if (archivedListing.photoUrl) {
            await removeListingPhotoByUrl(archivedListing.photoUrl).catch((error) => logListingFailure("remove deleted listing photo", error));
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
