-- Add reversible account suspension fields without changing existing user records.
ALTER TABLE "User"
ADD COLUMN "bannedAt" TIMESTAMP(3),
ADD COLUMN "banReason" VARCHAR(250);
