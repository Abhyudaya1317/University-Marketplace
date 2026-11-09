-- Rename the category in place so existing room-decor listings become poster listings without losing data.
ALTER TYPE "ProductCategory" RENAME VALUE 'ROOM_DECOR' TO 'POSTERS';

-- Store the size specified by sellers for new poster listings; existing listings remain intact.
ALTER TABLE "Listing" ADD COLUMN "posterSize" VARCHAR(40);
