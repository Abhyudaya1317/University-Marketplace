// Give configured administrators safe user and listing management operations.
import { prisma } from "../../lib/prisma.js";
import { isAdminEmail } from "../../middleware/adminAccess.js";
import { COLOR_EXCLUDED_CATEGORIES, normalizeCommaSeparatedValues, normalizeListingHashtags, normalizeProductName, parseProteinRich, validateListingDetails, validateListingHashtags } from "../listings/listingsValidation.js";

const userSelect = {
    id: true, email: true, fullName: true, avatarUrl: true, createdAt: true,
    bannedAt: true, banReason: true, _count: { select: { listings: true } }
};

const listingSelect = {
    id: true, title: true, description: true, price: true, quantityAvailable: true, phoneNumber: true,
    location: true, condition: true, customCondition: true, clothingGender: true,
    clothingSizes: true, color: true, proteinRich: true, posterSize: true, hashtags: true, photoUrl: true,
    photoUrl2: true, photoUrl3: true, photoUrl4: true, status: true, archivedAt: true, createdAt: true,
    product: { select: { id: true, name: true, category: true } },
    seller: { select: { id: true, fullName: true, email: true, bannedAt: true } },
    _count: { select: { orders: true } }
};

// Return real account and listing totals for the administrator overview.
export async function getAdminOverview(_request, response) {
    try {
        const [users, bannedUsers, activeListings, removedListings, orders] = await Promise.all([
            prisma.user.count(),
            prisma.user.count({ where: { bannedAt: { not: null } } }),
            prisma.listing.count({ where: { status: "ACTIVE" } }),
            prisma.listing.count({ where: { status: { in: ["ARCHIVED", "HIDDEN"] } } }),
            prisma.order.count()
        ]);
        return response.json({ success: true, overview: { users, bannedUsers, activeListings, removedListings, orders } });
    } catch (error) {
        logAdminFailure("load overview", error);
        return response.status(500).json({ success: false, message: "The administrator overview could not be loaded." });
    }
}

// Search users by email or display name, with only the fields used by the admin screen.
export async function getAdminUsers(request, response) {
    const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
    try {
        const users = await prisma.user.findMany({
            where: search ? { OR: [
                { email: { contains: search, mode: "insensitive" } },
                { fullName: { contains: search, mode: "insensitive" } }
            ] } : {},
            orderBy: { createdAt: "desc" },
            take: 100,
            select: userSelect
        });
        return response.json({ success: true, users: users.map(formatUser) });
    } catch (error) {
        logAdminFailure("search users", error);
        return response.status(500).json({ success: false, message: "Users could not be loaded." });
    }
}

// Ban an account and revoke its current browser sessions immediately.
export async function banUser(request, response) {
    const userId = parseId(request.params.userId);
    const reason = typeof request.body?.reason === "string" ? request.body.reason.trim() : "";
    if (userId === null) return response.status(400).json({ success: false, message: "Enter a valid user ID." });
    if (userId === request.admin.id) return response.status(400).json({ success: false, message: "You cannot ban your own administrator account." });
    if (reason.length > 250) return response.status(400).json({ success: false, message: "Ban reason must be 250 characters or fewer." });

    try {
        const target = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true } });
        if (!target) return response.status(404).json({ success: false, message: "That user was not found." });
        if (isAdminEmail(target.email)) return response.status(409).json({ success: false, message: "Administrator accounts cannot be banned here." });
        const bannedAt = new Date();
        await prisma.$transaction([
            prisma.user.update({ where: { id: userId }, data: { bannedAt, banReason: reason || null } }),
            prisma.loginSession.deleteMany({ where: { userId } }),
            // Hide that account's active offers immediately, while keeping them restorable by an admin.
            prisma.listing.updateMany({ where: { sellerId: userId, status: "ACTIVE" }, data: { status: "ARCHIVED", archivedAt: bannedAt } })
        ]);
        return response.json({ success: true, user: { id: userId, bannedAt, banReason: reason || null } });
    } catch (error) {
        logAdminFailure("ban user", error);
        return response.status(500).json({ success: false, message: "This user could not be banned." });
    }
}

// Restore sign-in access without changing the user's profile or marketplace history.
export async function unbanUser(request, response) {
    const userId = parseId(request.params.userId);
    if (userId === null) return response.status(400).json({ success: false, message: "Enter a valid user ID." });
    try {
        const result = await prisma.user.updateMany({ where: { id: userId, bannedAt: { not: null } }, data: { bannedAt: null, banReason: null } });
        if (result.count !== 1) return response.status(404).json({ success: false, message: "That banned user was not found." });
        return response.json({ success: true, user: { id: userId, bannedAt: null, banReason: null } });
    } catch (error) {
        logAdminFailure("unban user", error);
        return response.status(500).json({ success: false, message: "This user could not be unbanned." });
    }
}

// Search current and removed offers for administrator review and editing.
export async function getAdminListings(request, response) {
    const search = typeof request.query.q === "string" ? request.query.q.trim().slice(0, 100) : "";
    const status = typeof request.query.status === "string" ? request.query.status.toUpperCase() : "ALL";
    const allowedStatuses = new Set(["ALL", "ACTIVE", "SOLD", "ARCHIVED", "HIDDEN"]);
    if (!allowedStatuses.has(status)) return response.status(400).json({ success: false, message: "Choose a valid listing status." });
    try {
        const listings = await prisma.listing.findMany({
            where: {
                ...(status === "ALL" ? {} : { status }),
                ...(search ? { OR: [
                    { title: { contains: search, mode: "insensitive" } },
                    { description: { contains: search, mode: "insensitive" } },
                    { seller: { email: { contains: search, mode: "insensitive" } } },
                    { seller: { fullName: { contains: search, mode: "insensitive" } } }
                ] } : {})
            },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 100,
            select: listingSelect
        });
        return response.json({ success: true, listings: listings.map(formatListing) });
    } catch (error) {
        logAdminFailure("search listings", error);
        return response.status(500).json({ success: false, message: "Listings could not be loaded." });
    }
}

// Edit listing fields with the same validation used by seller-created offers.
export async function editAdminListing(request, response) {
    const listingId = parseId(request.params.listingId);
    if (listingId === null) return response.status(400).json({ success: false, message: "Enter a valid listing ID." });
    const validationMessage = validateListingDetails(request.body ?? {});
    if (validationMessage) return response.status(400).json({ success: false, message: validationMessage });
    const hashtagError = validateListingHashtags(request.body?.hashtags);
    if (hashtagError) return response.status(400).json({ success: false, message: hashtagError });
    const photoFields = ["photoUrl", "photoUrl2", "photoUrl3", "photoUrl4"];
    for (const field of photoFields) {
        const value = request.body?.[field];
        if (value !== undefined && value !== null && (typeof value !== "string" || value.length > 500 || (value !== "" && !isSafePhotoUrl(value)))) {
            return response.status(400).json({ success: false, message: "Photo links must be HTTPS URLs or listing upload paths." });
        }
    }

    const name = request.body.name.trim();
    const normalizedName = normalizeProductName(name);
    try {
        const listing = await prisma.$transaction(async (transaction) => {
            const current = await transaction.listing.findUnique({ where: { id: listingId }, select: { id: true } });
            if (!current) return null;
            const product = await transaction.product.upsert({
                where: { normalizedName_category: { normalizedName, category: request.body.category } },
                create: { name, normalizedName, category: request.body.category },
                update: {}
            });
            await transaction.listing.update({ where: { id: listingId }, data: {
                productId: product.id,
                title: name,
                description: request.body.description.trim(),
                hashtags: normalizeListingHashtags(request.body.hashtags),
                price: String(request.body.price).trim(),
                phoneNumber: request.body.phoneNumber.trim(),
                quantityAvailable: Number(request.body.quantityAvailable),
                location: request.body.location.trim(),
                condition: request.body.condition,
                customCondition: request.body.condition === "CUSTOM" ? request.body.customCondition.trim() : null,
                clothingGender: request.body.category === "CLOTHING" ? request.body.clothingGender : null,
                clothingSizes: request.body.category === "CLOTHING" ? normalizeCommaSeparatedValues(request.body.clothingSizes) : null,
                color: COLOR_EXCLUDED_CATEGORIES.has(request.body.category) ? null : normalizeCommaSeparatedValues(request.body.color),
                proteinRich: request.body.category === "FOOD" ? parseProteinRich(request.body.proteinRich) : false,
                proteinGrams: null,
                posterSize: request.body.category === "POSTERS" ? request.body.posterSize.trim() : null,
                ...(photoFields.some((field) => Object.hasOwn(request.body ?? {}, field)) ? {
                    photoUrl: normalizePhotoUrl(request.body.photoUrl),
                    photoUrl2: normalizePhotoUrl(request.body.photoUrl2),
                    photoUrl3: normalizePhotoUrl(request.body.photoUrl3),
                    photoUrl4: normalizePhotoUrl(request.body.photoUrl4)
                } : {})
            } });
            return transaction.listing.findUnique({ where: { id: listingId }, select: listingSelect });
        });
        if (!listing) return response.status(404).json({ success: false, message: "This listing was not found." });
        return response.json({ success: true, listing: formatListing(listing) });
    } catch (error) {
        logAdminFailure("edit listing", error);
        return response.status(500).json({ success: false, message: "This listing could not be updated." });
    }
}

function isSafePhotoUrl(value) {
    if (value.startsWith("/api/uploads/listings/")) return true;
    try { return new URL(value).protocol === "https:"; } catch { return false; }
}

function normalizePhotoUrl(value) {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

// Remove a listing from public pages while retaining its history and allowing restoration.
export async function removeAdminListing(request, response) {
    const listingId = parseId(request.params.listingId);
    if (listingId === null) return response.status(400).json({ success: false, message: "Enter a valid listing ID." });
    try {
        const result = await prisma.listing.updateMany({
            where: { id: listingId, status: { in: ["ACTIVE", "SOLD"] } },
            data: { status: "ARCHIVED", archivedAt: new Date() }
        });
        if (result.count !== 1) return response.status(404).json({ success: false, message: "This listing was not found or is already removed." });
        return response.json({ success: true, status: "ARCHIVED", message: "Listing removed from the marketplace. Its records remain available for restoration." });
    } catch (error) {
        logAdminFailure("remove listing", error);
        return response.status(500).json({ success: false, message: "This listing could not be removed." });
    }
}

// Restore a removed listing to the public catalog without changing its saved details.
export async function restoreAdminListing(request, response) {
    const listingId = parseId(request.params.listingId);
    if (listingId === null) return response.status(400).json({ success: false, message: "Enter a valid listing ID." });
    try {
        const result = await prisma.listing.updateMany({ where: { id: listingId, status: { in: ["ARCHIVED", "HIDDEN"] } }, data: { status: "ACTIVE", archivedAt: null } });
        if (result.count !== 1) return response.status(404).json({ success: false, message: "This removed listing was not found." });
        return response.json({ success: true, status: "ACTIVE" });
    } catch (error) {
        logAdminFailure("restore listing", error);
        return response.status(500).json({ success: false, message: "This listing could not be restored." });
    }
}

function parseId(value) {
    const id = Number(value);
    return Number.isSafeInteger(id) && id > 0 ? id : null;
}

function formatUser(user) {
    return { id: user.id, email: user.email, fullName: user.fullName, avatarUrl: user.avatarUrl,
        createdAt: user.createdAt, bannedAt: user.bannedAt, banReason: user.banReason, listingCount: user._count.listings };
}

function formatListing(listing) {
    return { id: listing.id, title: listing.title, description: listing.description, price: listing.price.toFixed(2),
        quantityAvailable: listing.quantityAvailable, location: listing.location, condition: listing.condition,
        customCondition: listing.customCondition, clothingGender: listing.clothingGender,
        clothingSizes: listing.clothingSizes, color: listing.color,
        proteinRich: listing.proteinRich, posterSize: listing.posterSize, phoneNumber: listing.phoneNumber,
        hashtags: listing.hashtags, photoUrl: listing.photoUrl, photoUrl2: listing.photoUrl2,
        photoUrl3: listing.photoUrl3, photoUrl4: listing.photoUrl4, status: listing.status,
        archivedAt: listing.archivedAt, createdAt: listing.createdAt, product: listing.product,
        seller: listing.seller, orderCount: listing._count.orders };
}

function logAdminFailure(action, error) {
    console.error(`Admin operation failed (${action}):`, error?.code ?? error?.name ?? "UNKNOWN");
}
