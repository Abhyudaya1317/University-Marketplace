-- Keep one browser push endpoint associated with one signed-in user.
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "endpointHash" VARCHAR(64) NOT NULL,
    "p256dh" VARCHAR(255) NOT NULL,
    "auth" VARCHAR(255) NOT NULL,
    "userId" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpointHash_key" ON "PushSubscription"("endpointHash");
CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Push endpoints and authentication keys must not be exposed through Supabase's public Data API.
-- The backend accesses this table through its database connection; no client-side policies are needed.
ALTER TABLE "PushSubscription" ENABLE ROW LEVEL SECURITY;
