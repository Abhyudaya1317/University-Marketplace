# CampusX — Master Project Handoff

**Updated:** 2026-11-02
**Repository inspected:** current working tree at handoff time  
**Status:** handover notes refreshed; application source was not changed in this update.

## Purpose of this handoff

This folder transfers product intent, actual architecture, current implementation evidence, known gaps, and practical development instructions to a new developer or Codex account. The repository is the source of truth when old notes conflict; product decisions below are user-provided context rather than inferred from code history.

## What CampusX is

CampusX is a university-focused marketplace initially intended for Lovely Professional University (LPU). Students can list campus goods, compare individual seller offers, contact sellers, submit purchase requests, and build trust through profiles and reviews. The present implementation accepts personal email/password and Google sign-in; it does not verify LPU enrollment. The UI may describe the service as intended for the LPU community, but that text is not an access control.

The goal is to make used and new goods accessible within the campus community, establish an initial supply of listings before launch, and develop marketplace trust with seller identity, stock, questions, reviews, and eventually moderated transactions.

Renting was considered and postponed. Theft, damage, and failure to return rented goods need appropriate safeguards before rental is reconsidered.

## Current product decisions

- Signup uses personal email and password or Google OAuth. Do not require student ID photos, student email, or identity-card recognition. No student verification is implemented.
- Three free listings followed by ₹2 per additional listing was proposed. **The fee is not implemented**; listing creation currently has no fee gate.
- Sellers provide email through their account and a phone number per listing. Phone numbers are private and exposed only in an accepted order flow, not public Explore/detail responses.
- Explore should show individual active seller listings, not one aggregated card per matching product. The current API does return individual listings. Search and category filters remain available; category-specific gender and food protein filters exist.
- Listing detail URL is /products/:listingId and refers to a specific seller offer. It must work by direct navigation and page refresh.
- Each wishlist entry refers to an individual Listing ID. The database unique key prevents a user saving the same listing twice.
- Seller public identity should use the registered full name, falling back to “CampusX Member”; never display generated labels such as “Seller #1”.
- Buyer purchase requests are requests, not completed/paid orders. A seller can accept or decline; the buyer selects a quantity and may add a note. Pending requests do not reserve stock. Seller acceptance decrements stock and sets proposed meeting time/location.
- Cash on delivery is the only payment method represented. No online payment, escrow, payment capture, refund, or payout is implemented.
- Reviews are community reviews and are not transaction verified.
- Listing questions and answers are scoped to a single listing, rather than shared across all similar items.
- In-app buyer/seller messaging is implemented with an inbox and thread UI. It is plain text with periodic/manual refresh; there is no push/WebSocket delivery. Integration still needs testing.
- Current UI direction is a Windows 95/Y2K retro marketplace: OS gray panels, navy title bars, electric-blue controls, teal grid on the home page, pixel display headings with readable body text. Home retains yellow/cyan/pink accents; other pages use a restrained gray/white/blue palette.

See BUSINESS_RULES.md for more nuance.

## Actual stack and runtime shape

- Frontend: Angular 21 standalone components, TypeScript 5.9, RxJS 7.8, Angular signals, Angular Router and HttpClient.
- Backend: Node.js ES modules, Express 5.
- Database: PostgreSQL, accessed through Prisma 7 with the PostgreSQL driver adapter.
- Images: listings accept 2–4 photos. Production listing photos use the public Supabase `listing-photos` bucket; local development uses `backend/uploads/listings`. Profile photos remain local-only.
- Auth: opaque random session token in an HttpOnly cookie; only the token hash is persisted in LoginSession.
- Frontend development server: port 4200; current proxy maps /api to http://127.0.0.1:5002.
- Backend default: port 5000, configurable by PORT; current private local backend/.env sets PORT=5002. Never copy this ignored file into Git or handoff output.
- Local database URL uses PostgreSQL on localhost:5432. The checked-in backend/.env.example names campusx while prior setup context said campusx_dev; confirm the intended existing DB locally without exposing private environment values.

The repo uses feature folders rather than a generic services/controllers/models directory. Details and current routes are in ARCHITECTURE.md and API_REFERENCE.md.

## Current status snapshot

Earlier checks on 2026-10-30 found backend unit tests 16/16 passing, Angular tests 9/9 passing, Angular production build passing, and Prisma schema validation passing. On 2026-11-01 the Angular production build also passed after the component CSS error budget was increased to 10kB. Local GET /api/health returned success; GET /api/products returned five database-backed listings; and /explore rendered all five through the proxy. This confirms local read connectivity, not the migration table's exact applied state or any write workflow. Prisma migrate status was not re-run.

At this update the branch is angular-vercel with existing uncommitted application changes, including a new listing migration and profile photo upload. Preserve the current worktree; inspect git status before editing and do not reset, clean, or overwrite user changes.

## Feature overview

| Area | Current evidence/status |
|---|---|
| Email/password signup/login and cookie sessions | Implemented; unit/integration coverage is limited. Full browser flow not re-run for handoff. |
| Google OAuth | Implemented with state cookie and token verification; requires private Google settings. Provider flow not re-tested now. |
| Password reset by email code | Implemented in code; requires SMTP; delivery not verified. |
| Profile name | Implemented for current account; account page and seller pages read the actual user identity. |
| Listing creation/editing | Implemented in Angular/API; listing creation requires two local photos. Full create/edit flow not transaction-tested in this documentation run. |
| Explore/search/filter/randomize | Implemented; local API and browser path verified with five listings on 2026-11-01. Other filters remain unverified. Search includes keyword matching; see limitations. |
| Listing details | Implemented at /products/:listingId; public identity/reputation, favorite, request, questions/reviews, message seller actions present. |
| Wishlist | Individual listing IDs, persisted in ListingFavorite with unique user/listing constraint. Previous user-reported bug history remains a regression risk; no live DB test in this handoff. |
| Seller dashboard/profile/catalog/archive | Implemented in feature code; profile image upload is present. Upload, follow, archive, and dashboard write flows not verified this run. |
| Orders | Cash-on-delivery purchase requests and state transitions implemented. These are not paid checkout transactions. |
| Questions/reviews | Implemented per listing, but review eligibility is not tied to completed orders and is not verified-purchase feedback. |
| Messaging | Routes, controller, schema migration, Angular inbox/thread and product-detail entry are present. Database persistence and participant isolation are not integration tested. |
| Listing fees | Not implemented. |
| Online payments, protected holding, seller payouts, disputes | Not implemented and should remain blocked until provider/business/legal mechanics are confirmed. |
| Leaderboard, Seller of the Week, AI image cleanup | Planned only. |

Full status and file references are in FEATURES_AND_STATUS.md and BUGS_AND_PENDING_WORK.md.

## Current highest-priority work

1. Run a read-only Prisma migration status check against the confirmed local DB; do not reset or delete data.
2. Validate messaging against a real local database with two accounts: participant-only visibility, sender authorization, open/resume behavior, message persistence, and front-to-back flow. Decide whether periodic refresh is adequate for the first release.
3. Re-test listing creation with two photos, detail images, wishlist persistence, seller follow, profile-photo upload, dashboard/my listings, archive/restore and COD order flow against actual DB data.
4. Resolve the README and .env.example database-name mismatch.
5. Add meaningful backend integration tests and Angular tests for critical flows; the current 16 backend tests are unit tests around validators/matching, not end-to-end coverage.
6. Consider production-grade image storage, rate limits, deployment, monitoring, and a reviewed threat model only after core behavior is reliable.

## Important IDs and data model concepts

- User.id: account identity.
- Product.id: a shared catalog term/category grouping record. It is not a buyer-selectable seller offer.
- Listing.id: one specific seller's product offer; use this for Explore navigation, favorite, detail, order, review, and question.
- Product.category: enum value, not a standalone category table/ID.
- ListingFavorite.id: join row ID; APIs accept Listing.id, never this join ID.
- Order.id: buyer request/order workflow record, associated to listing and buyer/seller.
- Conversation.id: one buyer + one listing conversation; Message.id identifies one text message.

## How a new Codex should work

Read the handover documents, then verify current files and git status before changes. The current workspace is dirty on branch angular-vercel. Preserve every file and local setting. Never print private env values. Avoid destructive database operations; do not run reset/fresh/seed without explicit need and approval. Explain substantial architectural changes, keep implementation focused, and verify the full frontend → API → database path when possible. Do not mark a UI feature complete merely because it renders.

The exact actual API, schema, setup, feature statuses, and backlog are in the sibling documents.
