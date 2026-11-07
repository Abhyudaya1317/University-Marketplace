-- Add an optional public profile bio without changing existing account records.
ALTER TABLE "User"
ADD COLUMN "bio" VARCHAR(300);
