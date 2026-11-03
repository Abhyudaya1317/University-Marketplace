-- Allow a conversation to belong to a seller rather than requiring an active listing.
ALTER TABLE "Conversation" ALTER COLUMN "listingId" DROP NOT NULL;

-- PostgreSQL treats NULL values as distinct in a normal unique index, so use a
-- partial index to ensure one listing-free conversation per buyer/seller pair.
CREATE UNIQUE INDEX "Conversation_general_seller_buyer_key"
ON "Conversation" ("sellerId", "buyerId")
WHERE "listingId" IS NULL;
