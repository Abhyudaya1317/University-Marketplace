// Keep product categories controlled so filtering and grouping use consistent values.
export const PRODUCT_CATEGORIES = new Set([
    "CLOTHING", "ACCESSORIES", "SHOES", "FOOD", "ELECTRONICS", "BEAUTY", "TEMPORARY_TATTOOS", "ARTWORK",
    "PROJECTS", "SPORTS_EQUIPMENT", "MUSICAL_INSTRUMENTS", "POSTERS", "KITCHEN_ITEMS", "DAILY_USE", "WAX_CANDLES", "GIFTS"
]);

// Use one stable set of clothing values in forms, storage, and filters.
export const CLOTHING_GENDERS = new Set(["MEN", "WOMEN", "UNISEX", "OTHER"]);
export const FOOD_CONDITIONS = new Set(["FRESH", "PACKAGED", "OPENED", "PREPARED", "FROZEN", "CUSTOM"]);
export const PRODUCT_CONDITIONS = new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "OLD", ...FOOD_CONDITIONS]);
export const COLOR_EXCLUDED_CATEGORIES = new Set(["DAILY_USE", "FOOD", "KITCHEN_ITEMS", "POSTERS", "PROJECTS", "SPORTS_EQUIPMENT"]);

// Normalize short comma-separated seller attributes before storing them as plain text.
export function normalizeCommaSeparatedValues(value) {
    if (typeof value !== "string") return "";
    const values = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    const uniqueValues = [...new Map(values.map((entry) => [entry.toLocaleLowerCase("en"), entry])).values()];
    return uniqueValues.join(", ");
}

// Keep seller-entered search tags small, unique, and safe to render as plain text.
export function validateListingHashtags(value) {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value !== "string") return "Enter hashtags as text separated by spaces or commas.";
    const rawTags = value.split(/[\s,]+/u).filter(Boolean);
    const tags = rawTags.map((tag) => tag.replace(/^#+/u, "").normalize("NFKC").toLocaleLowerCase("en"));
    if (new Set(tags).size > 10) return "Use no more than 10 hashtags per listing.";
    if (tags.some((tag) => !/^[\p{L}\p{N}][\p{L}\p{N}_-]{0,29}$/u.test(tag))) {
        return "Each hashtag must start with a letter or number and contain only letters, numbers, underscores, or hyphens (30 characters max).";
    }
    return null;
}

export function normalizeListingHashtags(value) {
    if (typeof value !== "string") return [];
    return [...new Set(value.split(/[\s,]+/u)
        .filter(Boolean)
        .map((tag) => tag.replace(/^#+/u, "").normalize("NFKC").toLocaleLowerCase("en")))];
}

// Re-check category-specific filters against each listing returned from storage.
export function matchesExploreFilters(listing, { category = "", gender = "", proteinOnly = false } = {}) {
    if (category && listing.product.category !== category) return false;
    if (gender && (listing.product.category !== "CLOTHING" || listing.clothingGender !== gender)) return false;
    if (proteinOnly && (listing.product.category !== "FOOD" || Number(listing.proteinGrams) <= 0)) return false;
    return true;
}

// Validate the listing fields shared by create and edit without trusting browser checks.
export function validateListingDetails({ name, category, description, price, phoneNumber, location, clothingGender, clothingSizes, color, proteinGrams, posterSize, quantityAvailable, condition, customCondition }) {
    const trimmedName = typeof name === "string" ? name.trim() : "";
    const trimmedDescription = typeof description === "string" ? description.trim() : "";
    const trimmedLocation = typeof location === "string" ? location.trim() : "";

    if (trimmedName.length < 2 || trimmedName.length > 100) return "Product name must be between 2 and 100 characters.";
    if (!PRODUCT_CATEGORIES.has(category)) return "Choose a valid product category.";
    if (trimmedDescription.length < 5 || trimmedDescription.length > 1500) return "Description must be between 5 and 1,500 characters.";
    if (!isValidPrice(price)) return "Enter a positive price with at most two decimal places.";
    if (!isValidQuantity(quantityAvailable)) return "Enter available stock as a whole number from 0 to 9,999.";
    if (!isValidPhoneNumber(phoneNumber)) return "Enter a valid phone number with 7 to 15 digits.";
    if (trimmedLocation.length < 2 || trimmedLocation.length > 120) return "Enter a campus pickup location between 2 and 120 characters.";
    if (category === "CLOTHING" && !CLOTHING_GENDERS.has(clothingGender)) return "Choose a gender option for this clothing listing.";
    if (category === "CLOTHING" && !isValidCommaSeparatedValues(clothingSizes, 200, 20)) return "Enter available clothing sizes separated by commas, for example S, M, L.";
    if (!COLOR_EXCLUDED_CATEGORIES.has(category) && !isValidCommaSeparatedValues(color, 120, 20)) return "Enter the available color or colors separated by commas.";
    if (category === "FOOD" && !isValidProteinGrams(proteinGrams)) return "Enter protein per serving in grams, from 0 to 5,000.";
    if (category === "POSTERS" && (typeof posterSize !== "string" || posterSize.trim().length < 1 || posterSize.trim().length > 40)) return "Enter the poster size, for example A3 or 30 × 40 cm.";
    const allowedConditions = category === "FOOD"
        ? FOOD_CONDITIONS
        : new Set(["NEW", "LIKE_NEW", "GOOD", "FAIR", "OLD", "CUSTOM"]);
    if (!allowedConditions.has(condition)) return category === "FOOD"
        ? "Choose a valid food condition."
        : "Choose a valid product condition.";
    if (condition === "CUSTOM" && (typeof customCondition !== "string" || customCondition.trim().length < 2 || customCondition.trim().length > 80)) return "Describe the custom item condition in 2 to 80 characters.";
    if (!normalizeProductName(trimmedName)) return "Product name must include letters or numbers.";
    return null;
}

function isValidCommaSeparatedValues(value, maxLength, maxEntries) {
    if (typeof value !== "string") return false;
    const values = value.split(",").map((entry) => entry.trim()).filter(Boolean);
    return value.trim().length > 0 && value.length <= maxLength && values.length > 0 && values.length <= maxEntries &&
        values.every((entry) => entry.length <= 30 && !/[<>\r\n]/u.test(entry));
}

// Convert a submitted product name into a stable key for grouping equivalent offers.
export function normalizeProductName(name) {
    return name.normalize("NFKC")
        .toLocaleLowerCase("en")
        .replace(/[^\p{L}\p{N}\s]/gu, " ")
        .replace(/\s+/g, " ")
        .trim();
}

// Keep the product name normalized; keyword similarity is handled by the grouping feature.
export function canonicalProductName(name) {
    return normalizeProductName(name);
}

// Accept common international phone formatting while requiring 7 to 15 digits.
export function isValidPhoneNumber(value) {
    if (typeof value !== "string" || !/^[+\d\s().-]+$/.test(value.trim())) return false;
    const digitCount = value.replace(/\D/g, "").length;
    return digitCount >= 7 && digitCount <= 15;
}

// Accept positive rupee amounts that fit Decimal(10, 2) without floating notation.
export function isValidPrice(value) {
    if (typeof value !== "number" && typeof value !== "string") return false;
    const priceText = String(value).trim();
    return /^(?:0|[1-9]\d{0,7})(?:\.\d{1,2})?$/.test(priceText) && Number(priceText) > 0;
}

// Keep seller inventory a non-negative whole number within a practical listing limit.
export function isValidQuantity(value) {
    if (typeof value !== "number" && typeof value !== "string") return false;
    const quantity = String(value).trim();
    return /^(?:0|[1-9]\d{0,3})$/.test(quantity) && Number(quantity) <= 9999;
}

// Protein is entered in grams per serving and stored with at most two decimal places.
export function isValidProteinGrams(value) {
    if (typeof value !== "number" && typeof value !== "string") return false;
    const amount = String(value).trim();
    return /^(?:0|[1-9]\d{0,3})(?:\.\d{1,2})?$/.test(amount) && Number(amount) <= 5000;
}
