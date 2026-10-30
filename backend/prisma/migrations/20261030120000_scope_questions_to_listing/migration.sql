-- Keep existing product questions intact, but scope new discussion to one seller listing.
-- Old rows stay unassigned because their original seller offer cannot be inferred safely.
ALTER TABLE "ProductQuestion" ADD COLUMN "listingId" INTEGER;

-- Look up questions by the exact seller offer shown on the product comparison page.
CREATE INDEX "ProductQuestion_listingId_createdAt_idx" ON "ProductQuestion"("listingId", "createdAt");

-- Delete a listing's questions if that listing is removed.
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
