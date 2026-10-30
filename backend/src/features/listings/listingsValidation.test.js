// Use Node's built-in test tools so validation checks need no extra dependencies.
import assert from "node:assert/strict";
import test from "node:test";
import {
    isValidPhoneNumber,
    isValidPrice,
    isValidProteinGrams,
    normalizeProductName,
    PRODUCT_CATEGORIES
} from "./listingsValidation.js";
import { buildProductGroups, filterProductGroups, productNamesMatch } from "./productGrouping.js";

// Similar capitalization and punctuation should group under the same product key.
test("normalizes product names for shared-offer grouping", () => {
    assert.equal(normalizeProductName("  Adidas Campus-Shoes! "), "adidas campus shoes");
    assert.equal(normalizeProductName("Cafe\u0301 Mug"), "café mug");
    assert.equal(normalizeProductName("---"), "");
});

// Prefixes and repeated-letter typos are matched without listing product-specific aliases.
test("matches generic product keywords and close spellings", () => {
    assert.equal(productNamesMatch("calc", "calculator"), true);
    assert.equal(productNamesMatch("jeans", "jeanssss"), true);
    assert.equal(productNamesMatch("shirt", "calculator"), false);
});

// Old rows with mixed categories still form one product card and one sorted deal list.
test("groups duplicate offers across categories and keeps the cheapest price", () => {
    const products = [
        { id: 3, name: "calculator", category: "ELECTRONICS", listings: [{ id: 3, sellerId: 3, price: "50.01", createdAt: new Date("2026-01-03") }] },
        { id: 1, name: "calculator", category: "CLOTHING", listings: [{ id: 1, sellerId: 1, price: "49.91", createdAt: new Date("2026-01-01") }] },
        { id: 2, name: "calc", category: "ELECTRONICS", listings: [{ id: 2, sellerId: 2, price: "50.00", createdAt: new Date("2026-01-02") }] }
    ];

    const [group] = buildProductGroups(products);
    assert.equal(group.name, "calculator");
    assert.equal(group.category, "ELECTRONICS");
    assert.equal(group.lowestPrice, "49.91");
    assert.equal(group.sellerCount, 3);
    assert.deepEqual(group.offers.map((offer) => offer.id), [1, 2, 3]);

    const groups = buildProductGroups(products);
    assert.equal(filterProductGroups(groups, { search: "calculator" }).length, 1);
    assert.equal(filterProductGroups(groups, { search: "a different product" }).length, 0);
    assert.equal(filterProductGroups(groups, { category: "CLOTHING" })[0].lowestPrice, "49.91");
    assert.deepEqual(filterProductGroups(groups, { category: "CLOTHING" })[0].productIds, [1]);
    assert.equal(filterProductGroups(groups, { category: "ELECTRONICS" }).length, 1);
    assert.equal(filterProductGroups(groups, { category: "ELECTRONICS" })[0].lowestPrice, "50.00");
});

// Category details filter the matching seller offers and recalculate the visible lowest price.
test("filters clothing by gender and food by minimum protein", () => {
    const groups = buildProductGroups([
        { id: 21, name: "hoodie", category: "CLOTHING", listings: [
            { id: 21, sellerId: 1, price: "50.00", clothingGender: "MEN", createdAt: new Date() },
            { id: 22, sellerId: 2, price: "40.00", clothingGender: "WOMEN", createdAt: new Date() }
        ] },
        { id: 23, name: "protein bar", category: "FOOD", listings: [
            { id: 23, sellerId: 3, price: "20.00", proteinGrams: "8.00", createdAt: new Date() },
            { id: 24, sellerId: 4, price: "25.00", proteinGrams: "20.00", createdAt: new Date() }
        ] }
    ]);

    const [mensHoodie] = filterProductGroups(groups, { category: "CLOTHING", gender: "MEN" });
    assert.equal(mensHoodie.lowestPrice, "50.00");
    assert.equal(mensHoodie.sellerCount, 1);

    const [highProteinFood] = filterProductGroups(groups, { category: "FOOD", minProtein: "10" });
    assert.equal(highProteinFood.lowestPrice, "25.00");
    assert.equal(highProteinFood.sellerCount, 1);
    assert.equal(filterProductGroups(groups, { category: "FOOD", minProtein: "30" }).length, 0);
});

// Search works with a category selected, and both controls narrow results together.
test("search and category filters work together", () => {
    const groups = buildProductGroups([
        { id: 11, name: "jeans", category: "CLOTHING", listings: [{ id: 11, sellerId: 1, price: "100.00", createdAt: new Date() }] },
        { id: 12, name: "jeanssss", category: "CLOTHING", listings: [{ id: 12, sellerId: 2, price: "90.00", createdAt: new Date() }] },
        { id: 13, name: "shirt", category: "CLOTHING", listings: [{ id: 13, sellerId: 3, price: "50.00", createdAt: new Date() }] }
    ]);

    assert.equal(filterProductGroups(groups, { search: "jeans", category: "CLOTHING" }).length, 1);
    assert.equal(filterProductGroups(groups, { search: "jeans", category: "ELECTRONICS" }).length, 0);
    assert.equal(filterProductGroups(groups, { search: "calculator" }).length, 0);
    assert.equal(filterProductGroups(groups, { category: "ELECTRONICS" }).length, 0);
});

// The backend accepts only categories included in its controlled list.
test("contains the expected campus product categories", () => {
    assert.equal(PRODUCT_CATEGORIES.has("ELECTRONICS"), true);
    assert.equal(PRODUCT_CATEGORIES.has("UNLISTED_CATEGORY"), false);
});

// Phone validation permits common separators but enforces a plausible digit count.
test("accepts formatted phone numbers with 7 to 15 digits", () => {
    assert.equal(isValidPhoneNumber("+91 98765-43210"), true);
    assert.equal(isValidPhoneNumber("(987) 654-3210"), true);
    assert.equal(isValidPhoneNumber("123-456"), false);
    assert.equal(isValidPhoneNumber("98765abc210"), false);
    assert.equal(isValidPhoneNumber("1234567890123456"), false);
});

// Prices must be positive and fit the database's two-decimal rupee field.
test("accepts valid listing prices and rejects invalid amounts", () => {
    assert.equal(isValidPrice("1"), true);
    assert.equal(isValidPrice("249.50"), true);
    assert.equal(isValidPrice(99999999.99), true);
    assert.equal(isValidPrice("0"), false);
    assert.equal(isValidPrice("-2"), false);
    assert.equal(isValidPrice("12.345"), false);
    assert.equal(isValidPrice("100000000"), false);
    assert.equal(isValidPrice("1e3"), false);
});

// Protein values stay numeric, non-negative, and capped at five thousand grams per serving.
test("validates protein amounts per serving", () => {
    assert.equal(isValidProteinGrams("0"), true);
    assert.equal(isValidProteinGrams("12.5"), true);
    assert.equal(isValidProteinGrams("5000"), true);
    assert.equal(isValidProteinGrams("5001"), false);
    assert.equal(isValidProteinGrams("-1"), false);
    assert.equal(isValidProteinGrams("12.555"), false);
});
