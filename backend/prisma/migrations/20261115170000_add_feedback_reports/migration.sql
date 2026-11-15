CREATE TABLE "FeedbackReport" (
    "id" SERIAL NOT NULL,
    "kind" VARCHAR(30) NOT NULL,
    "details" VARCHAR(2000) NOT NULL,
    "photoKeys" TEXT[] NOT NULL,
    "reporterId" INTEGER NOT NULL,
    "targetUserName" VARCHAR(100),
    "targetListingUrl" VARCHAR(500),
    "targetUserId" INTEGER,
    "targetListingId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "FeedbackReport_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "FeedbackReport_createdAt_idx" ON "FeedbackReport"("createdAt");
CREATE INDEX "FeedbackReport_kind_createdAt_idx" ON "FeedbackReport"("kind", "createdAt");

ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_targetUserId_fkey" FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "FeedbackReport" ADD CONSTRAINT "FeedbackReport_targetListingId_fkey" FOREIGN KEY ("targetListingId") REFERENCES "Listing"("id") ON DELETE SET NULL ON UPDATE CASCADE;
