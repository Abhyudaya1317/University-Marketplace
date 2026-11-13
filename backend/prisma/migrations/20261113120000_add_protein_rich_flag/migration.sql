-- Store the food toggle directly while preserving existing protein metadata.
ALTER TABLE "Listing"
ADD COLUMN "proteinRich" BOOLEAN NOT NULL DEFAULT false;

-- Existing listings with a positive grams value were marked protein-rich.
UPDATE "Listing"
SET "proteinRich" = true
WHERE "proteinGrams" > 0;
