-- Add product questions and replies without changing existing marketplace records.
CREATE TABLE "ProductQuestion" (
    "id" SERIAL NOT NULL,
    "productId" INTEGER NOT NULL,
    "askerId" INTEGER NOT NULL,
    "question" VARCHAR(500) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProductQuestion_pkey" PRIMARY KEY ("id")
);

-- Store one editable seller answer per question.
CREATE TABLE "ProductAnswer" (
    "id" SERIAL NOT NULL,
    "questionId" INTEGER NOT NULL,
    "sellerId" INTEGER NOT NULL,
    "answer" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProductAnswer_pkey" PRIMARY KEY ("id")
);

-- Store one community review per user and seller offer.
CREATE TABLE "ListingReview" (
    "id" SERIAL NOT NULL,
    "listingId" INTEGER NOT NULL,
    "reviewerId" INTEGER NOT NULL,
    "rating" INTEGER NOT NULL,
    "comment" VARCHAR(1000) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ListingReview_pkey" PRIMARY KEY ("id")
);

-- Index question and review lookups used by product pages.
CREATE INDEX "ProductQuestion_productId_createdAt_idx" ON "ProductQuestion"("productId", "createdAt");
CREATE INDEX "ProductQuestion_askerId_createdAt_idx" ON "ProductQuestion"("askerId", "createdAt");
CREATE INDEX "ProductAnswer_sellerId_createdAt_idx" ON "ProductAnswer"("sellerId", "createdAt");
CREATE INDEX "ListingReview_listingId_createdAt_idx" ON "ListingReview"("listingId", "createdAt");

-- Enforce one reply per seller/question and one review per user/offer.
CREATE UNIQUE INDEX "ProductAnswer_questionId_sellerId_key" ON "ProductAnswer"("questionId", "sellerId");
CREATE UNIQUE INDEX "ListingReview_listingId_reviewerId_key" ON "ListingReview"("listingId", "reviewerId");

-- Delete dependent discussion if its product, question, listing, or account is removed.
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_productId_fkey"
    FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductQuestion" ADD CONSTRAINT "ProductQuestion_askerId_fkey"
    FOREIGN KEY ("askerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnswer" ADD CONSTRAINT "ProductAnswer_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "ProductQuestion"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ProductAnswer" ADD CONSTRAINT "ProductAnswer_sellerId_fkey"
    FOREIGN KEY ("sellerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_listingId_fkey"
    FOREIGN KEY ("listingId") REFERENCES "Listing"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ListingReview" ADD CONSTRAINT "ListingReview_reviewerId_fkey"
    FOREIGN KEY ("reviewerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
