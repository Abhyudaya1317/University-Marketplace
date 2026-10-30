import test from "node:test";
import assert from "node:assert/strict";
import { normalizeMessageBody } from "./messageValidation.js";

test("accepts a trimmed direct message within the limit", () => {
    assert.equal(normalizeMessageBody("  Hello seller  "), "Hello seller");
});

test("rejects empty, non-text, and oversized messages", () => {
    assert.equal(normalizeMessageBody("   "), null);
    assert.equal(normalizeMessageBody({ text: "hello" }), null);
    assert.equal(normalizeMessageBody("x".repeat(2001)), null);
});
