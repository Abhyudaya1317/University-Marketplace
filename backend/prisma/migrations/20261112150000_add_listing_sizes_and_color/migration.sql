-- Add seller-provided appearance details without changing existing listings.
ALTER TABLE "Listing"
ADD COLUMN "clothingSizes" VARCHAR(200),
ADD COLUMN "color" VARCHAR(120);
