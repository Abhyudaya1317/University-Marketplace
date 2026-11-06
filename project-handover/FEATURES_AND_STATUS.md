# Features and Status

Status vocabulary follows the project request. “Implemented but not tested” means source code exists but this handoff did not verify the end-to-end flow. Backend unit tests and frontend production build passing do not imply database or browser integration was verified.

## Latest local runtime verification — 2026-11-01

Backend health returned success, GET /api/products returned five real listings, and Angular /explore rendered those five listings through the configured proxy. This verifies the local frontend → backend → database read path for Explore only; it does not verify write flows, auth, migration bookkeeping, or production. Local backend PORT is 5002 in ignored backend/.env and frontend/proxy.conf.json targets 127.0.0.1:5002; keep them matched.

## Identity, accounts and access

### Signup/login/logout/session — IMPLEMENTED BUT NOT TESTED end-to-end

- Purpose/workflow: create personal-email account or sign in, maintain a browser session, sign out.
- Frontend: frontend/src/app/auth/auth.ts, auth.html/css; frontend/src/app/shared/account-navigation.ts.
- Backend: backend/src/features/auth/authRoutes.js and authController.js; backend/src/features/auth/authSecurity.js; backend/src/middleware/requireAuth.js.
- Database: User, LoginSession. Opaque cookie token; DB stores token hash.
- API: POST /api/auth/signup; POST /api/auth/login; GET /api/auth/me; POST /api/auth/logout.
- Validation/security: email normalized; signup requires fullName 2–100 and password 10–128; bcrypt 12 rounds; cookie HttpOnly/SameSite lax, secure in production. Auth checks happen per request.
- Known limits: no LPU enrollment verification; no explicit frontend route guards; protected backend is authority. Integration not re-tested in this handoff.

### Google OAuth — IMPLEMENTED BUT NOT TESTED now

Google redirect/callback code is in authController.js, OAuth settings are private env values. Uses anti-forgery state cookie, validates ID token audience and verified email, creates/reuses user. Prior user reported the Google flow eventually worked after credentials were updated, but this run did not re-test it. Requires valid redirect URI settings.

### Password reset — IMPLEMENTED BUT NOT TESTED

Reset code API/controller and Nodemailer transport exist. OTP is short lived, keyed-hashed, max 5 attempts and resend throttled. SMTP settings are not in the sample env and delivery is not verified. Files: authController.js, authSecurity.js, emailService.js.

### LPU/student exclusivity — NOT IMPLEMENTED

Current product decision is not to inspect student ID images or restrict by LPU email. “For the LPU community” is positioning, not verification.

## Profile and seller identity

### My Profile — PARTIALLY IMPLEMENTED

Dashboard combines account profile, name editing, own inventory, favorites and archive controls; /items-selling currently reuses the Dashboard component. Public seller profile is separate. Full name, email and avatar are populated. A profile-photo upload endpoint/UI exists, but upload persistence and display were not end-to-end verified in this check. Source: frontend/src/app/dashboard/* and sellers/seller-profile.*; backend/src/features/sellers/sellerController.js and auth profile endpoint.

### Seller names — IMPLEMENTED in API responses, not end-to-end verified

Server uses registered fullName or “CampusX Member”. Explore and listing detail types show seller names. Re-test dashboard, orders, messages, reviews and public profile for consistency. Generic Seller #n should not return.

### Seller favorites — IMPLEMENTED BUT NOT TESTED

Public profile provides favorite seller controls. SellerFavorite has unique fan/seller pair. APIs GET/PUT/DELETE /api/sellers/:sellerId/favorite. Files: sellers feature controller/routes and seller-profile UI.

## Listings and inventory

### Create listing — IMPLEMENTED BUT NOT TESTED end-to-end

Form supports title/name, category, description, price, phone, campus pickup location, condition, stock, clothing gender and food protein. Listing creation accepts 2–4 photos. The browser optimizes large images for Vercel requests; the backend validates image signatures and stores production listing photos in the public Supabase `listing-photos` bucket. Configure that bucket and the backend-only Supabase environment variables before production uploads. OLD and CUSTOM condition values plus customCondition were added in migration 20261101120000_add_second_listing_photo_custom_condition.

Listing fee first-three-free / ₹2 later is NOT IMPLEMENTED. User email comes from account; phone number stored per listing. Category values are enum.

### Edit listing — IMPLEMENTED BUT NOT TESTED

Uses same form in edit mode, prefilled via GET /api/listings/:listingId and PATCH with multipart form. Owner and ACTIVE status are required. Updates product grouping/category and associated fields; replaces/removes image as requested. Deleting/replacing file operation should be covered by integration tests.

### Stock/availability — IMPLEMENTED BUT NOT TESTED

Quantity is integer 0–9999. Explore excludes zero quantity. Detail labels stock; stock PATCH route only permits own active listing. Seller acceptance of an order decrements stock transactionally.

### Archive/restore/permanent delete — IMPLEMENTED in code, not flow-tested

Dashboard has active and archive areas. Archive allows ACTIVE/SOLD offers, sets ARCHIVED and archivedAt. Restore clears archivedAt and sets ACTIVE. Permanent deletion only accepts own archived listing; rejects any order history and DB foreign key uses Restrict. Routes in listingManagementController. Photos are removed after delete. Confirm UI modals exist in the dashboard code but cancellation/authorization behavior needs browser testing.

## Product discovery

### Explore — IMPLEMENTED; local read path VERIFIED 2026-11-01

Current expected architecture is Explore → every active individual Listing card → /products/:listingId. API GET /api/products queries status ACTIVE and quantityAvailable > 0 and returns listings (singular offer cards), sorted by price ascending then recent date/ID. On 2026-11-01 the API returned five records and the browser rendered all five through the proxy. Explore includes category filter, search, clothing gender and food protein filters, loading/error/empty states, photo fallback, randomization and suggestions. Other filters and write flows remain unverified.

Frontend: frontend/src/app/explore/explore.ts/html/css, product-matching.ts. Backend: listingsController.getExploreProducts and productGrouping.js. Note productGrouping.js still contains old group logic and its tests, but it is not used to transform current Explore results. README text is stale and conflicts.

### Search/suggestions — PARTIALLY IMPLEMENTED

Search is non-AI normalized keyword matching; close keyword prefixes and one edit are supported via productNamesMatch. Category is universal only when search absent at backend (browsingCategory = empty for search). Suggestions are up to six distinct normalized titles among matching listings. Current backend queries the active in-stock catalog then filters in Node, with no pagination or relevance score. Search performance and matching quality for thousands of records are not production verified.

### Randomize — IMPLEMENTED BUT NOT TESTED in browser

Frontend Fisher-Yates shuffle of current results, keyed by Listing ID; no DB changes. Filter reload clears random order. Pagination does not exist.

### Price ordering — IMPLEMENTED for Explore, previous offers-page dropdown requirement OBSOLETE/NOT PRESENT

Explore defaults ascending price. No separate grouped seller-offers page is in current route list. Current architecture is individual Listing details. Do not reintroduce product grouping only to satisfy old seller-offer sorting UI. A buyer can sort Explore only if later requested; detail's exact listing has no sibling offers list.

### Product detail — IMPLEMENTED BUT NOT TESTED end-to-end

Public individual listing route, seller info and aggregate seller ratings, image fallback, stock, category data, save action, purchase request, questions/reviews, and in-progress message seller CTA. Direct URL supported by API lookup. Source frontend/src/app/products/product-details.*; API GET /api/listings/public/:listingId. Seller phone/email are not public.

## Wishlist

### Individual listing wishlist — IMPLEMENTED BUT NOT TESTED against DB/browser

ListingFavorite references userId + listingId and unique key prevents duplicates. APIs return exact Listing IDs; detail page uses listing.id and dashboard maps saved records. User previously reported “We could not update this wishlist” and photos/saved state issues. Current code path looks per Listing ID, but exact former root cause is not proven from current evidence. Verify login cookie, API response, database state and refresh persistence before marking verified.

## Buyer/seller engagement

### Questions and answers — IMPLEMENTED BUT NOT TESTED end-to-end

Questions are associated with exact listing; seller of that listing answers/upserts. Public GET includes up to 50 recent questions; owner answer route checks sellerId. Rate limit currently 20 questions/user/listing/day. Source engagement component/controller. Legacy productId remains in ProductQuestion and indexes.

### Reviews — PURCHASE-VERIFIED WRITES IMPLEMENTED

One review per user/listing (upsert), rating 1–5 and comment. Self-review is rejected. Creating or updating a review requires that the signed-in user is the buyer on a COMPLETED order for the exact offer; completion follows seller handoff confirmation and buyer receipt/cash confirmation. Public reviews and seller aggregates remain visible. Dispute moderation and abuse reporting are not implemented.

## Orders and payments

### COD request workflow — IMPLEMENTED BUT NOT TESTED end-to-end now

POST creates PENDING Order tied to Listing, Buyer and Seller, stores buyer phone, price snapshot, quantity and optional note. Pending order does not reserve stock. Seller accept requires future date/time and location and decrements stock. Seller can decline; buyer can cancel pending; seller confirms handoff, buyer confirms receipt -> COMPLETED. API GET returns only participant orders with role-specific phone data.

Current states are in schema. Actual pickup/delivery, dispute, refund and fraud handling are manual/absent. The UI calls them buyer requests/orders. This is not online checkout.

### Razorpay/online payments/escrow/payout — NOT IMPLEMENTED

No provider SDK, webhooks or payment table/routes exist. Only PaymentMethod.CASH_ON_DELIVERY.

## Messaging

### Buyer/seller direct messaging — IMPLEMENTED BUT NOT DATABASE-INTEGRATION-TESTED

Schema, migration SQL, routes/controller, validation unit tests, Angular inbox/thread page, navigation link and listing-detail “Message seller” action are present. Conversation is keyed to listing + buyer; both participants can read/send; message body trim length 1–2000; thread shows latest 100; inbox newest first. Current implementation uses periodic/manual refresh, no Socket.IO/WebSocket/SSE. Angular tests verify opening/loading/sending and display of a participant access error; backend unit tests cover normalization. PostgreSQL is now reachable for read queries, but messaging migration, authorization, persistence and end-to-end flows were not verified.

## Other roadmap

Leaderboard, Seller of the Week, listing fees, AI background remover, community activity feed, production image hosting, pagination, moderation/reporting, online payments, delivery disputes and payouts are planned or need product design. See FUTURE_ROADMAP.md.
