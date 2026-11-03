-- Extend private chat messages for editing, document attachments, stickers, and meetup proposals.
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'FILE';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'STICKER';
ALTER TYPE "MessageType" ADD VALUE IF NOT EXISTS 'MEETUP';

ALTER TABLE "Message"
  ADD COLUMN "attachmentOriginalName" VARCHAR(180),
  ADD COLUMN "attachmentMimeType" VARCHAR(100),
  ADD COLUMN "stickerKey" VARCHAR(40),
  ADD COLUMN "meetupAt" TIMESTAMP(3),
  ADD COLUMN "meetupLocation" VARCHAR(120),
  ADD COLUMN "editedAt" TIMESTAMP(3);
