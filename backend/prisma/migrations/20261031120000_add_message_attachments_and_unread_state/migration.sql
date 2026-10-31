-- Add message metadata with defaults that preserve existing plain-text messages.
CREATE TYPE "MessageType" AS ENUM ('TEXT', 'IMAGE', 'CONTACT', 'LOCATION');

ALTER TABLE "Message"
    ADD COLUMN "type" "MessageType" NOT NULL DEFAULT 'TEXT',
    ADD COLUMN "attachmentName" VARCHAR(100),
    ADD COLUMN "contactName" VARCHAR(100),
    ADD COLUMN "contactPhone" VARCHAR(30),
    ADD COLUMN "locationLabel" VARCHAR(120),
    ADD COLUMN "latitude" DOUBLE PRECISION,
    ADD COLUMN "longitude" DOUBLE PRECISION,
    ADD COLUMN "readAt" TIMESTAMP(3);

-- Support unread counts without changing or deleting existing messages.
CREATE INDEX "Message_conversationId_readAt_senderId_idx"
    ON "Message"("conversationId", "readAt", "senderId");
CREATE INDEX "Message_senderId_readAt_idx"
    ON "Message"("senderId", "readAt");
