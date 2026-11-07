CREATE TYPE "MeetupStatus" AS ENUM ('PENDING', 'CONFIRMED', 'DENIED');

ALTER TABLE "Message" ADD COLUMN "meetupStatus" "MeetupStatus";
ALTER TABLE "Message" ALTER COLUMN "attachmentName" TYPE VARCHAR(240);

CREATE INDEX "Message_conversationId_type_meetupStatus_createdAt_idx"
ON "Message" ("conversationId", "type", "meetupStatus", "createdAt" DESC);

-- Keep chat photos and files in a separate private Supabase Storage bucket.
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'message-attachments',
  'message-attachments',
  false,
  10485760,
  ARRAY['image/jpeg', 'image/png', 'image/webp', 'application/pdf', 'text/plain', 'text/csv']
)
ON CONFLICT (id) DO UPDATE SET
  public = false,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;
