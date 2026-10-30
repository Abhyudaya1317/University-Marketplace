// Check seller route IDs without requiring PostgreSQL or a signed-in account.
import assert from "node:assert/strict";
import test from "node:test";
import { parseSellerId } from "./sellerValidation.js";

test("accepts positive numeric seller IDs", () => {
    assert.equal(parseSellerId("1"), 1);
    assert.equal(parseSellerId("42"), 42);
});

test("rejects missing, malformed, zero, and unsafe seller IDs", () => {
    assert.equal(parseSellerId(undefined), null);
    assert.equal(parseSellerId(""), null);
    assert.equal(parseSellerId("1.5"), null);
    assert.equal(parseSellerId("0"), null);
    assert.equal(parseSellerId("9007199254740992"), null);
});
