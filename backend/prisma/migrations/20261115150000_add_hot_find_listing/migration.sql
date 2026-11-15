-- Allow an administrator to choose one active listing for the homepage Hot Find.
ALTER TABLE "Listing"
ADD COLUMN IF NOT EXISTS "isHotFind" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX IF NOT EXISTS "Listing_single_hot_find_key"
ON "Listing" ("isHotFind")
WHERE "isHotFind" = true;
