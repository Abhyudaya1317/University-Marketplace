-- Add two optional photo slots while preserving every existing listing image.
ALTER TABLE "Listing"
ADD COLUMN "photoUrl3" TEXT,
ADD COLUMN "photoUrl4" TEXT;
