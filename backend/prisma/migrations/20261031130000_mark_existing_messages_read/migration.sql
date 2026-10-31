-- Existing messages had no read state, so treat them as read when introducing unread badges.
UPDATE "Message"
SET "readAt" = "createdAt"
WHERE "readAt" IS NULL;