-- Allow an administrator to choose one active listing for the homepage Hot Find.
ALTER TABLE "Listing"
ADD COLUMN "isHotFind" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "Listing_single_hot_find_key"
ON "Listing" ("isHotFind")
WHERE "isHotFind" = true;
