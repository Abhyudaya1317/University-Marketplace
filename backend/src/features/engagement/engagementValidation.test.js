import assert from "node:assert/strict";
import test from "node:test";
import { validateAnswer, validateQuestion, validateReview } from "./engagementValidation.js";

// Product questions need enough detail and must fit the stored text limit.
test("accepts useful product questions within the allowed length", () => {
    assert.equal(validateQuestion("Is this calculator in good condition?"), "Is this calculator in good condition?");
    assert.equal(validateQuestion("short"), null);
    assert.equal(validateQuestion("q".repeat(501)), null);
});

// Seller replies are trimmed and kept within the safe maximum length.
test("validates seller answers", () => {
    assert.equal(validateAnswer("  Yes, it works well.  "), "Yes, it works well.");
    assert.equal(validateAnswer(""), null);
    assert.equal(validateAnswer("a".repeat(1001)), null);
});

// Community reviews accept only whole star ratings from one through five.
test("validates community review ratings and comments", () => {
    assert.deepEqual(validateReview(5, "Seller was helpful."), { rating: 5, comment: "Seller was helpful." });
    assert.equal(validateReview(0, "Too low"), null);
    assert.equal(validateReview(3.5, "Helpful seller"), null);
    assert.equal(validateReview(4, "ok"), null);
});
