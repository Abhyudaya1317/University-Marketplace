-- Add optional public profile details without changing existing account records.
ALTER TABLE "User"
ADD COLUMN "fullName" VARCHAR(100),
ADD COLUMN "avatarUrl" VARCHAR(500);
