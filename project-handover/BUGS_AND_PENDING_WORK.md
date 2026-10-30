# Bugs and Pending Work

This is a cautious snapshot, not a claim that every historical complaint remains open. Several older issues may have been fixed in current code; only verified outcomes should be marked closed.

## P0 — local database state could not be verified

During handoff:

- npm run db:check returned “Database connection failed. Check that PostgreSQL is running and backend/.env is correct.”
- npx prisma migrate status loaded backend/prisma.config.ts, identified campusx_dev at localhost:5432, then failed with a schema engine error and no actionable detail.
- The config output identifies the database name but does not confirm connection/migration state.
- Avoid printing .env or changing/resetting data. Check that PostgreSQL service is running, inspect private URL locally without sharing, confirm database name/user/port, then retry db:check and migrate status.
- Migration 20261030180000_add_private_messaging is present. Earlier tool output reported it deployed, but current run cannot independently confirm. Do not claim verified.

## P1 — messaging integration and authorization

Implementation exists, but no DB-backed tests or browser flow have been performed. Verify:

1. A buyer can open a conversation only for another seller's active listing.
2. Re-opening same listing returns same buyer/listing conversation.
3. Seller and buyer can read/send; unrelated account receives 404 and cannot send.
4. Messages persist and sort chronologically; inbox updates.
5. Auth cookie is sent through Angular proxy and protects all route calls.
6. Archived listing prevents a new chat; existing conversation behavior is acceptable.
7. Refresh button and route refresh work.

Manual refresh only; no real-time updates. Migration's current live status is unconfirmed.

## P1 — re-test historically reported wishlist failure

Historical UI error: “We could not update this wishlist. Please try again.” Current schema/controller use ListingFavorite(userId,listingId), and detail uses the individual listing ID. This is evidence of a corrected design, not proof of the old root cause or current runtime success.

Trace/retest exact flow: signed-in session → PUT /api/listings/:listingId/favorite with browser cookie → JSON isSaved → ListingFavorite row → GET /api/listings/favorites after refresh. Also test DELETE and two listings sharing Product. Check API responses and safe logs; never suppress failure or fake success.

## P1 — account data and seller profile consistency

Historical complaints: generic Seller #1, blank/incomplete My Profile and Items I’m Selling. Current code has dashboard and seller queries using account identity, but no live DB test in this handoff. Verify user's fullName, correct sellerId on listing creation, dashboard active/archived counts, saved seller list, public seller catalog and identity consistency across cards, details, reviews, messages, and orders.

## P1 — image persistence/display

Historical photos were missing in Explore/detail but shown in profile. Current backend stores local paths, serves /api/uploads/listings, frontend uses photoUrl with fallback. Verify actual path + GET image status, replacement/removal, restart persistence and page URLs. In cloud deployment local disk may be ephemeral and not shared.

## P1 — listing management/archive

Current handlers enforce ownership and only permanently delete archived listings with no orders; listing FK restricts deletion. Browser flows and modal cancel states remain unverified. Check archive disappears from Explore/search/details, archived items remain in seller dashboard, restore restores visibility and stock, permanent deletion refuses order history, and other users cannot mutate.

## P1 — order flow

Current COD order logic appears implemented but not end-to-end verified here. Test stock and status races, buyer/seller authorization, correct contact disclosure, seller acceptance scheduling, stock decrement, declines/cancel, both confirmations, and refresh persistence. Pending requests don't reserve stock; multiple buyers may request same remaining quantity and seller chooses; acceptance can fail if earlier accept consumed the stock.

## P2 — stale README/setup mismatch

README describes grouped Explore cards and old grouped seller offers. Actual GET /api/products currently returns individual listings. README .env example says database campusx, but previous setup context says campusx_dev and current migrate status resolved config to campusx_dev. Confirm developer's intended local DB and correct docs/sample config deliberately. Do not silently create a different DB.

## P2 — search scale/quality

Search currently loads active in-stock listings ordered by price, filters names in Node, and returns no pagination. Similarity matching may group/accept surprising terms because productNamesMatch uses prefix and edit-distance matching; old tests assert fuzzy product grouping but current Explore uses individual listing search. Need user-centered relevance examples, DB-side indexed search, paging and result caps before scaling. It is explicitly not NLP/LLM search and has no OpenAI cost.

## P2 — unit tests/build coverage gaps

Verified during handoff and chat continuation: backend node tests 16/16 pass; Angular unit tests 9/9 pass; Angular production build passes. CSS budget warnings exist (Explore, Messages, Home, Seller Profile, Dashboard). No DB-backed integration tests or live browser tests were run. Existing backend tests focus on validation/product matching and message body validation; they do not cover auth, wishlist, archive, order, or message authorization at the database boundary.

## P2 — production hardening

- Local upload storage is not durable/shared storage.
- No pagination, rate-limiting infrastructure for general APIs, observability or deployment config was found.
- cors() default config needs explicit production origin policy.
- No secrets should enter README, Git, logs, test output or generated handoff.
- Email reset is unavailable without SMTP.
- OAuth and production cookie URLs/domains require environment-specific validation.

## Prioritized verification checklist

- [ ] Confirm database endpoint/DB name privately; read-only check and migration status.
- [ ] Verify every migration is applied without reset.
- [ ] Exercise auth and cookie flow.
- [ ] Exercise listing create/edit/photo/stock and Explore per-listing result.
- [ ] Verify wishlist save/remove/refresh and unauthorized behavior.
- [ ] Verify dashboard/public seller identity and archive lifecycle.
- [ ] Verify full COD request transitions and stock updates.
- [ ] Verify listing questions/reviews and their actual eligibility policy.
- [ ] Verify messaging integration and participant isolation.
- [ ] Add regression tests before changing these workflows.
