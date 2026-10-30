# CampusX Database Schema

Source: backend/prisma/schema.prisma. The database is PostgreSQL. Table and enum state below describes the current schema source, not a live database introspection. Live DB/migration verification failed in the handoff run; see the master handoff.

## Entity map

~~~mermaid
erDiagram
  User ||--o{ LoginSession : has
  User ||--o{ Listing : sells
  Product ||--o{ Listing : categorizes
  User ||--o{ ListingFavorite : saves
  Listing ||--o{ ListingFavorite : saved_as
  User ||--o{ SellerFavorite : favorites_as_fan
  User ||--o{ SellerFavorite : favorited_seller
  Listing ||--o{ Order : ordered
  User ||--o{ Order : buyer
  User ||--o{ Order : seller
  Product ||--o{ ProductQuestion : shared_product
  Listing ||--o{ ProductQuestion : specific_offer
  User ||--o{ ProductQuestion : asks
  ProductQuestion ||--o{ ProductAnswer : receives
  User ||--o{ ProductAnswer : answers
  Listing ||--o{ ListingReview : reviewed
  User ||--o{ ListingReview : writes
  Listing ||--o{ Conversation : discussed
  User ||--o{ Conversation : buyer
  User ||--o{ Conversation : seller
  Conversation ||--o{ Message : contains
  User ||--o{ Message : sends
~~~

## Models

Prisma scalar labels: Int is PostgreSQL integer, String is text unless bounded with @db.VarChar(n), Decimal uses the declared precision, DateTime is timestamp, enums are PostgreSQL enum types. @default(now()) and @updatedAt are as in schema.

### User

| Field | Type / constraints | Meaning |
|---|---|---|
| id | Int primary key, autoincrement | User identity. |
| email | String unique, required | Normalized personal email. |
| fullName | String? VarChar(100) | Display name. |
| avatarUrl | String? VarChar(500) | Provider avatar URL. |
| passwordHash | String? | Null for Google-only account. |
| createdAt | DateTime default now | Account creation time. |
| freeListingsUsed | Int default 0 | Present for fee idea; no fee gate exists. |

Relations: LoginSession, Listing, ProductQuestion, ProductAnswer, ListingReview, buyer/seller Order relations, SellerFavorite as fan/seller, ListingFavorite, Conversation buyer/seller and Message sender.

### PasswordResetCode

| Field | Type / constraints | Meaning |
|---|---|---|
| id | Int primary key, autoincrement | Row identity. |
| email | String unique | Account email for active code. |
| codeHash | String | Keyed code hash, not raw code. |
| attempts | Int default 0 | Failed guesses. |
| expiresAt | DateTime | Expiration. |
| createdAt | DateTime default now | Resend-throttle timestamp. |

No explicit User foreign key; email association is application-enforced.

### LoginSession

| Field | Type / constraints | Meaning |
|---|---|---|
| id | String primary key, cuid | Session row ID. |
| tokenHash | String unique | Hash of opaque cookie token. |
| userId | Int FK User.id | Owner. |
| expiresAt | DateTime | Expiration. |
| createdAt | DateTime default now | Created time. |

User deletion cascades to sessions.

### Product

| Field | Type / constraints | Meaning |
|---|---|---|
| id | Int primary key, autoincrement | Shared catalog ID. |
| name | String required | Canonical visible product name. |
| normalizedName | String required | Search/grouping key. |
| category | ProductCategory enum | Controlled category. |
| createdAt | DateTime default now | Created time. |

Unique composite: normalizedName + category. Relations to Listing and ProductQuestion. Product ID is not Listing ID.

### ListingFavorite

| Field | Type / constraints | Meaning |
|---|---|---|
| id | Int primary key, autoincrement | Join row ID. |
| userId | Int FK User.id | Account that saves. |
| listingId | Int FK Listing.id | Concrete seller offer saved. |
| createdAt | DateTime default now | Save time. |

Unique [userId, listingId] prevents duplicate saves. Index [listingId, createdAt]. Deleting user/listing cascades.

### SellerFavorite

id Int primary key autoincrement; fanId Int and sellerId Int both User foreign keys; createdAt DateTime default now. Unique [fanId,sellerId]; index [sellerId,createdAt]. Both user relations cascade.

### Listing

| Field | Type / constraints | Meaning |
|---|---|---|
| id | Int primary key, autoincrement | One seller's offer. |
| productId | Int FK Product.id | Shared catalog identity. |
| sellerId | Int FK User.id | Owner. |
| title | String required | This offer's title. |
| description | String required | Description. |
| price | Decimal(10,2) | Offer price. |
| phoneNumber | String required | Seller contact, kept private in public APIs. |
| photoUrl | String? | Local upload URL or null. |
| location | String VarChar(120), default “LPU campus” | Pickup point. |
| clothingGender | ClothingGender? | Clothing-only detail. |
| proteinGrams | Decimal(6,2)? | Food-only nutrition detail. |
| condition | ProductCondition default GOOD | Item condition. |
| status | ListingStatus default ACTIVE | Active/sold/hidden/archived. |
| archivedAt | DateTime? | Archive timestamp. |
| quantityAvailable | Int default 1 | Stock; zero means unavailable. |
| createdAt | DateTime default now | Listing timestamp. |

Indexes [productId,status,price] and [sellerId,createdAt]. Relations include reviews, questions, orders, savedBy, conversations. Product and User deletions cascade; Order->Listing uses Restrict, protecting order history.

### Conversation

id Int primary key autoincrement; listingId/buyerId/sellerId Int foreign keys; createdAt now; updatedAt @updatedAt. Unique [listingId,buyerId] means one buyer conversation per listing. Index [buyerId,updatedAt], [sellerId,updatedAt]. Listing, buyer and seller deletions cascade. Related Message rows cascade.

### Message

id Int primary key autoincrement; conversationId and senderId Int foreign keys; body VarChar(2000); createdAt now. Indexes [conversationId,createdAt] and [senderId,createdAt]. Deletes cascade from Conversation/User. Current business authorization is controller-enforced (sender must be one of thread participants).

### Order

| Field | Type / constraints | Meaning |
|---|---|---|
| id | Int primary key, autoincrement | Order/request ID. |
| listingId | Int FK Listing.id, onDelete Restrict | Specific offer. |
| buyerId | Int FK User.id, onDelete Cascade | Buyer. |
| sellerId | Int FK User.id, onDelete Cascade | Seller. |
| buyerPhone | VarChar(30) | Buyer contact. |
| price | Decimal(10,2) | Price copied at request time. |
| quantity | Int | Requested quantity. |
| buyerMessage | VarChar(500)? | Optional buyer note. |
| paymentMethod | PaymentMethod default CASH_ON_DELIVERY | COD only. |
| status | OrderStatus default PENDING | Workflow state. |
| meetingAt | DateTime? | Seller-proposed time. |
| meetingLocation | VarChar(120)? | Seller-proposed pickup location. |
| createdAt | DateTime default now | Request creation. |
| updatedAt | DateTime @updatedAt | Last change. |

Indexes [buyerId,createdAt], [sellerId,createdAt], [listingId,status]. Deleting an associated listing is restricted; this is why permanent deletion rejects listings with order history.

### ProductQuestion

id Int primary key; productId Int FK Product; listingId Int? FK Listing; askerId Int FK User; question VarChar(500); createdAt now. Indexes [productId,createdAt], [listingId,createdAt], [askerId,createdAt]. Product/listing/user deletion cascades. Current creation attaches both product and exact listing; listingId nullable for historical/legacy rows.

### ProductAnswer

id Int primary key; questionId Int FK ProductQuestion; sellerId Int FK User; answer VarChar(1000); createdAt now; updatedAt @updatedAt. Unique [questionId,sellerId], index [sellerId,createdAt]. Answer relation cascades.

### ListingReview

id Int primary key; listingId Int FK Listing; reviewerId Int FK User; rating Int; comment VarChar(1000); createdAt now; updatedAt @updatedAt. Unique [listingId,reviewerId] (upsert allows reviewer to edit); index [listingId,createdAt]. There is no DB check constraint visible for rating 1–5; controller validates. Deletion cascades.

## Enums

- ProductCategory: CLOTHING, ACCESSORIES, SHOES, FOOD, ELECTRONICS, BEAUTY, ARTWORK, SPORTS_EQUIPMENT, MUSICAL_INSTRUMENTS, ROOM_DECOR, KITCHEN_ITEMS, DAILY_USE, OTHER.
- ListingStatus: ACTIVE, SOLD, HIDDEN, ARCHIVED.
- ProductCondition: NEW, LIKE_NEW, GOOD, FAIR.
- PaymentMethod: CASH_ON_DELIVERY.
- OrderStatus: PENDING, ACCEPTED, SELLER_CONFIRMED, COMPLETED, DECLINED, CANCELLED.
- ClothingGender: MEN, WOMEN, UNISEX, OTHER.

## IDs and relationship risks

Never send Product.id where a route expects Listing.id. ProductCategory is an enum, not its own table. ListingFavorite.id is internal join-row ID; UI operations send Listing.id. User IDs are integer IDs; Conversation and Order IDs are distinct entities. Questions have both productId and optional listingId due historical grouping; current UI endpoint explicitly filters exact listing.

## Migration history

Current checked-in migration directories:

1. 20261027053148_init
2. 20261027102950_add_password_auth
3. 20261028151452_add_product_listings
4. 20261028164500_add_product_engagement
5. 20261029120000_add_listing_details
6. 20261029150000_add_seller_favorites
7. 20261029180000_add_listing_stock_quantity
8. 20261029180100_create_cash_on_delivery_orders
9. 20261030120000_scope_questions_to_listing
10. 20261030130000_add_product_favorites
11. 20261030140000_scope_favorites_to_listing
12. 20261030150000_add_listing_management
13. 20261030160000_add_user_profile_details
14. 20261030180000_add_private_messaging

These are timestamped additive migrations. Current live status is NOT VERIFIED: Prisma migrate status failed with a schema engine error in this documentation run. The earlier same-session operation reported migration 14 as deployed, but it could not be confirmed now. Never reset the database to reconcile this; inspect database URL and server first.
