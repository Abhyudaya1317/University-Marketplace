import { canonicalProductName } from "./listingsValidation.js";

// Split names into normalized terms and soften accidental repeated-key typos such as "jeanssss".
function productKeywords(name) {
    return canonicalProductName(name).replace(/(.)\1{2,}/gu, "$1$1").split(/\s+/).filter(Boolean);
}

// Match exact terms, word prefixes, and one-character spelling differences in longer words.
function keywordsMatch(first, second) {
    if (first === second) return true;
    if (Math.min(first.length, second.length) >= 3 && (first.startsWith(second) || second.startsWith(first))) return true;
    return Math.min(first.length, second.length) >= 5 && editDistance(first, second) <= 1;
}

// Compare names using their keywords so variants such as "calc" and "calculator" group together.
export function productNamesMatch(firstName, secondName) {
    const firstWords = productKeywords(firstName);
    const secondWords = productKeywords(secondName);
    return firstWords.some((word) => secondWords.some((candidate) => keywordsMatch(word, candidate)));
}

// Compare names with a bounded edit-distance calculation and stop after two changes.
function editDistance(first, second) {
    if (Math.abs(first.length - second.length) > 1) return 2;
    let previous = Array.from({ length: second.length + 1 }, (_, index) => index);

    for (let firstIndex = 1; firstIndex <= first.length; firstIndex += 1) {
        const current = [firstIndex];
        let rowMinimum = firstIndex;
        for (let secondIndex = 1; secondIndex <= second.length; secondIndex += 1) {
            const cost = first[firstIndex - 1] === second[secondIndex - 1] ? 0 : 1;
            current[secondIndex] = Math.min(
                current[secondIndex - 1] + 1,
                previous[secondIndex] + 1,
                previous[secondIndex - 1] + cost
            );
            rowMinimum = Math.min(rowMinimum, current[secondIndex]);
        }
        if (rowMinimum > 1) return 2;
        previous = current;
    }

    return previous[second.length];
}

// Merge stored product rows into one display item, even if old offers used different categories.
export function buildProductGroups(products) {
    const groups = [];

    for (const product of products) {
        const matchingGroups = groups.filter((group) => group.rows.some((row) => productNamesMatch(row.name, product.name)));
        if (matchingGroups.length === 0) {
            groups.push({ rows: [product] });
            continue;
        }

        const firstGroup = matchingGroups[0];
        firstGroup.rows.push(product);
        for (const extraGroup of matchingGroups.slice(1)) {
            firstGroup.rows.push(...extraGroup.rows);
            groups.splice(groups.indexOf(extraGroup), 1);
        }
    }

    return groups.map(({ rows }) => {
        const names = new Map();
        const categories = new Map();
        const productIds = [];
        const offers = [];
        for (const product of rows) {
            productIds.push(product.id, ...(product.productIds ?? []));
            names.set(product.name, (names.get(product.name) ?? 0) + 1);
            categories.set(product.category, (categories.get(product.category) ?? 0) + product.listings.length);
            offers.push(...product.listings.map((listing) => ({ ...listing, category: product.category, productId: product.id })));
        }

        const displayName = [...names.entries()]
            .sort((first, second) => second[1] - first[1] || second[0].length - first[0].length)[0]?.[0] ?? canonicalProductName(rows[0]?.name ?? "");
        const category = [...categories.entries()]
            .sort((first, second) => second[1] - first[1] || first[0].localeCompare(second[0]))[0]?.[0] ?? "OTHER";
        offers.sort((first, second) =>
            Number(first.price) - Number(second.price) || new Date(first.createdAt) - new Date(second.createdAt)
        );
        const hasKnownStock = offers.every((offer) => Number.isSafeInteger(offer.quantityAvailable));
        const quantityAvailable = hasKnownStock ? offers.reduce((total, offer) => total + offer.quantityAvailable, 0) : null;
        const lowestInStockOffer = offers.find((offer) => Number.isSafeInteger(offer.quantityAvailable) && offer.quantityAvailable > 0);
        const stockLabel = quantityAvailable === null ? "Availability unavailable"
            : quantityAvailable === 0 ? "Out of stock"
                : quantityAvailable <= 2 ? `Few left · ${quantityAvailable} available`
                    : `In stock · ${quantityAvailable} available`;

        return {
            id: Math.min(...productIds),
            productIds: [...new Set(productIds)].sort((first, second) => first - second),
            name: displayName,
            category,
            offers,
            photoUrl: (lowestInStockOffer ?? offers[0])?.photoUrl ?? offers.find((offer) => offer.photoUrl)?.photoUrl ?? null,
            lowestPrice: Number((lowestInStockOffer ?? offers[0])?.price ?? 0).toFixed(2),
            sellerCount: new Set(offers.map((offer) => offer.sellerId)).size,
            quantityAvailable,
            stockLabel
        };
    });
}

// Filter already-grouped products so search and category controls match the visible cards.
export function filterProductGroups(groups, { search = "", category = "", gender = "", minProtein = "" } = {}) {
    const searchWords = productKeywords(search);

    return groups.map((product) => {
        // Filter the underlying offers so a mixed-category group shows the right sellers and price.
        const offers = product.offers.filter((offer) => {
            if (category && offer.category !== category) return false;
            if (gender && offer.clothingGender !== gender) return false;
            if (minProtein !== "" && (offer.category !== "FOOD" || Number(offer.proteinGrams) < Number(minProtein))) return false;
            return true;
        });
        const productWords = productKeywords(product.name);
        const matchesSearch = searchWords.length === 0 || searchWords.every((word) =>
            productWords.some((candidate) => keywordsMatch(word, candidate))
        );
        const categoryCounts = new Map();
        for (const offer of offers) categoryCounts.set(offer.category, (categoryCounts.get(offer.category) ?? 0) + 1);
        const displayCategory = [...categoryCounts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]?.[0];
        const hasKnownStock = offers.every((offer) => Number.isSafeInteger(offer.quantityAvailable));
        const quantityAvailable = hasKnownStock ? offers.reduce((total, offer) => total + offer.quantityAvailable, 0) : null;
        const lowestInStockOffer = offers.find((offer) => Number.isSafeInteger(offer.quantityAvailable) && offer.quantityAvailable > 0);
        return {
            ...product,
            id: offers.length ? Math.min(...new Set(offers.map((offer) => offer.productId))) : product.id,
            productIds: [...new Set(offers.map((offer) => offer.productId))].sort((first, second) => first - second),
            offers,
            category: displayCategory ?? product.category,
            photoUrl: (lowestInStockOffer ?? offers[0])?.photoUrl ?? offers.find((offer) => offer.photoUrl)?.photoUrl ?? null,
            lowestPrice: Number((lowestInStockOffer ?? offers[0])?.price ?? 0).toFixed(2),
            sellerCount: new Set(offers.map((offer) => offer.sellerId)).size,
            quantityAvailable,
            stockLabel: quantityAvailable === null ? "Availability unavailable"
                : quantityAvailable === 0 ? "Out of stock"
                    : quantityAvailable <= 2 ? `Few left · ${quantityAvailable} available`
                        : `In stock · ${quantityAvailable} available`,
            matchesSearch
        };
    }).filter((product) => product.offers.length > 0 && product.matchesSearch)
        .map(({ matchesSearch: _matchesSearch, ...product }) => product);
}
