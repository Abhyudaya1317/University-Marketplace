-- Support the active listing feed's common price and newest-first ordering.
CREATE INDEX "Listing_status_price_createdAt_id_idx"
ON "Listing" ("status", "price", "createdAt" DESC, "id" DESC);
