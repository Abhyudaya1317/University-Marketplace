# CampusX Architecture

## Repository layout

~~~text
CampusX/
├── README.md
├── backend/
│   ├── package.json, package-lock.json, prisma.config.ts
│   ├── prisma/schema.prisma
│   ├── prisma/migrations/<timestamp_name>/migration.sql
│   ├── src/server.js
│   ├── src/lib/prisma.js
│   ├── src/middleware/requireAuth.js
│   ├── src/routes/healthRoutes.js
│   ├── src/features/{auth,engagement,listings,messages,orders,sellers}/
│   ├── src/scripts/checkDatabase.js
│   ├── src/generated/prisma/       generated Prisma client
│   └── uploads/listings/           local uploaded photos (ignored)
└── frontend/
    ├── package.json, angular.json, proxy.conf.json
    └── src/app/
        ├── auth/
        ├── dashboard/
        ├── engagement/
        ├── explore/
        ├── home/
        ├── listings/
        ├── messages/
        ├── orders/
        ├── products/
        ├── sellers/
        └── shared/
~~~

Generated client code and node_modules are not hand-maintained. backend/.env and backend/uploads are excluded by backend/.gitignore. Do not inspect or copy secret values into docs.

## Frontend

Angular 21 uses standalone components and a small root app shell. App routing is in frontend/src/app/app.routes.ts; app providers are in app.config.ts. The shell renders RouterOutlet. The current page components generally own their API calls and local signals rather than using a shared domain service layer.

| Folder/file | Responsibility |
|---|---|
| auth/auth.ts/html/css | Signup, login, password reset, Google sign-in and session error feedback. |
| home/home.ts/html/css | Temporary welcome/health page. |
| explore/explore.ts/html/css | Search, category/gender/protein filters, suggestions, randomize, listing cards and saved state. |
| explore/product-matching.ts | Client-side search/name normalization and filter helpers; inspect this alongside backend matching before changing search semantics. |
| listings/create-listing.ts/html/css | Create/edit form, image selection and preview, category fields, validation feedback. Edit is selected with ?edit=<listingId>. |
| products/product-details.ts/html/css | Public detail by individual Listing ID; save, COD request, engagement and message-seller entry. |
| engagement/product-engagement.ts/html/css | Listing questions, seller answers and reviews UI/API calls. |
| dashboard/dashboard.ts/html/css | Signed-in account profile, own listings, archived listing controls, stock/order request handling and saved items/favorites. Verify exact displayed sections before claiming completeness. |
| sellers/seller-profile.ts/html/css | Public seller view and seller catalog; favorite seller action. |
| orders/my-orders.ts/html/css | Buyer/seller order list and confirmation actions. |
| messages/messages.ts/html/css | In-progress inbox and conversation view with manual refresh. |
| shared/account-navigation.* | Header/navigation and sign-out/session display shared by pages. |

Routes: /, /home, /auth, /sell, /explore, /products/:listingId, /sellers/:sellerId, /dashboard, /items-selling, /orders, /messages, /messages/:conversationId. /profile redirects to /dashboard. Unknown routes redirect to /. Message route ordering puts the parameter route before the base inbox. /items-selling currently reuses the Dashboard component.

Angular HttpClient sends same-origin /api calls through frontend/proxy.conf.json. The backend default is port 5000, but the current local private backend/.env sets PORT=5002 and the proxy targets http://127.0.0.1:5002. Keep these values matched and restart both dev servers after changing them. No explicit interceptors/guards were found in app.config.ts. Components call /api/auth/me to determine the current user. Server authorization remains authoritative; hiding a button is not security.

State is mostly component-local Angular signals. This matters for async UI refresh, especially with modern zoneless behavior. Direct mutable property assignment may not refresh all UI; use signals or established Angular reactivity. Forms use template-driven FormsModule in several components; validation is repeated in the backend and frontend for UX.

CSS is scoped per component, with global baseline in frontend/src/styles.css. No shared CSS variable/token system was found. Current global colors include cream #faf9f5 and charcoal #242520; orange and card styling appear in page-level styles. CSS budgets warn in Explore, Home, Seller Profile, Dashboard, and Messages.

## Backend

Node ES modules, Express 5.3.0. Entry point backend/src/server.js loads dotenv, CORS, cookie-parser, JSON parsing, static listing-image serving and mounts feature routers. PORT defaults to 5000. CORS currently uses cors() defaults; development frontend calls via proxy.

Prisma 7.10.1 uses the prisma-client generator and @prisma/adapter-pg. prisma.config.ts supplies DATABASE_URL to CLI tooling; src/lib/prisma.js loads dotenv and constructs one adapter/client pool. The generated client is emitted to src/generated/prisma and excluded from version control.

Feature modules:

- auth: authRoutes.js, authController.js, authSecurity.js, emailService.js.
- listings: listingsRoutes.js, productsRoutes.js, listingsController.js, listingManagementController.js, listingsValidation.js, listingPhotoUpload.js, productGrouping.js.
- engagement: engagementRoutes.js, reviewRoutes.js, engagementController.js, engagementValidation.js.
- sellers: sellerRoutes.js and sellerController.js.
- orders: orderRoutes.js and orderController.js.
- messages: messagesRoutes.js, messagesController.js, messageValidation.js; this is newly present in the current uncommitted tree.
- shared: middleware/requireAuth.js, lib/prisma.js, routes/healthRoutes.js.

Errors usually return JSON { success:false, message }. Some unexpected errors intentionally log only error code/name to avoid leaking private values.

## Authentication and authorization

Signup hashes passwords with bcryptjs (12 salt rounds). A random opaque token is issued to an HttpOnly cookie named campusx_session; only its SHA-based hash is saved in LoginSession. Session lifetime is 30 days. requireAuth checks hash and expiry on each protected request and puts only user ID in request.user. SameSite is lax; Secure becomes true in production. Logout deletes the server row and clears cookie. Password reset codes are six digits, expire after 10 minutes, use a keyed hash and are limited to five attempts with a 60-second resend delay. SMTP is needed for email delivery.

Google OAuth is a server redirect/callback flow. It uses random state in HttpOnly cookie, exchanges OAuth code, verifies ID token audience and verified email, then creates/reuses local user. Requires Google client ID, secret, callback URL. Failure redirects to frontend URL with a safe reason query.

Ownership is checked in controllers (listing sellerId, order buyerId/sellerId, thread participant IDs), not only Angular. Inspect each mutation path on future changes.

## Product/listing model

Product is shared normalized name + category metadata. Listing is a concrete seller offer and owns price, stock, phone, location, condition and image. The current Explore endpoint queries active in-stock Listing rows directly and serializes listing IDs. ProductGrouping helper still exists for old grouping/search tests and historical behavior; do not infer from that utility that current Explore groups results.

Product search is deterministic local keyword matching, prefix and one-edit tolerance through productGrouping.js. It does not use NLP/LLM or OpenAI API. It loads active records then filters in application code, so scaling/pagination should be reviewed for a large catalog.

## Images

Listing creation accepts 2–4 JPG/PNG/WebP photos (up to 5 MB each before browser optimization). In production, listing images are stored in the public Supabase `listing-photos` bucket; local development stores them under backend/uploads/listings and serves them under /api/uploads/listings. Listing records have photoUrl through photoUrl4. The authenticated profile-photo endpoint still stores avatars under backend/uploads/profiles and serves them under /api/uploads/profiles. Profile-photo durability in cloud deployment, multi-instance sharing, image transformations, malware scanning, quotas and CDN are not demonstrated.

## Payment architecture

No Razorpay SDK, payment route, payment model, webhook, capture/escrow, refund or payout code exists in the inspected project. Order.paymentMethod is CASH_ON_DELIVERY only. Never describe COD order requests as online checkout or seller payout. Razorpay was an idea that requires provider capability/compliance verification before design.

## Database and migration strategy

PostgreSQL schema lives in backend/prisma/schema.prisma; sequential SQL migrations are in backend/prisma/migrations. There are 15 migration directories, ending in 20261101120000_add_second_listing_photo_custom_condition. Migrations are additive across the project history. On 2026-11-01, local backend health and Explore product reads were verified through the frontend proxy; the API returned five listings, confirming live database reads. Prisma migrate status was not rerun, so migration bookkeeping remains unconfirmed. Never use migrate reset or drop/recreate to solve a connection problem.

## Architecture risks and discrepancies

1. README describes old product-group cards and lists a checked-in sample DB name campusx, while current API and Explore are per-listing and setup context mentions campusx_dev. Fix docs/config only after confirming the developer's actual DB target.
2. productGrouping.js has grouping functions/tests that may be obsolete for the current Explore contract.
3. API calls are spread through page components; there is no centralized typed API client/interceptor.
4. CORS uses defaults rather than an explicit origin allowlist. Development proxy avoids many browser CORS issues, but production policy must be deliberate.
5. Search filters in application memory without pagination. A 1000s-of-listings marketplace needs indexed DB search/pagination or deliberate bounded APIs.
6. Local uploads are not production-grade shared storage.
7. Messages currently have no integration test and no live push; schema is present but database status is unconfirmed in this handoff.
8. The current workspace has uncommitted source changes on branch angular-vercel. Inspect git status before editing and preserve user changes; do not rely on a previous handoff's branch or clean-tree snapshot.
