-- Give existing listings one available item by default and let sellers set their stock.
ALTER TABLE "Listing"
ADD COLUMN "quantityAvailable" INTEGER NOT NULL DEFAULT 1;
