-- Add optional category-specific details and a development photo URL to seller offers.
CREATE TYPE "ClothingGender" AS ENUM ('MEN', 'WOMEN', 'UNISEX', 'OTHER');

ALTER TABLE "Listing"
ADD COLUMN "photoUrl" TEXT,
ADD COLUMN "location" VARCHAR(120) NOT NULL DEFAULT 'LPU campus',
ADD COLUMN "clothingGender" "ClothingGender",
ADD COLUMN "proteinGrams" DECIMAL(6,2);
