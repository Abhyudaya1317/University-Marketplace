# CampusX

CampusX is a marketplace intended for the LPU community. The Angular welcome page is still temporary; the backend now includes account access and the first product/listing APIs, with more marketplace features to be added in small steps.

## Run locally

Start the backend in one terminal:

```sh
cd backend
npm run dev
```

Start the frontend in another terminal:

```sh
cd frontend
npm start
```

Open `http://localhost:4200` for the temporary welcome page or `/auth` for account access. During local development, Angular forwards `/api` requests to the backend on port 5000.

The backend uses port 5000 by default. Set `PORT` to use a different port, and update `frontend/proxy.conf.json` to match.

## PostgreSQL setup (Milestone 2)

PostgreSQL stores the app's data. Prisma describes that data as a model, generates a typed JavaScript client, and uses migrations to create or change database tables in a repeatable way.

### Connect the local database

1. In pgAdmin, create a new database named `campusx_dev` with owner `postgres`.
2. Copy `backend/.env.example` to `backend/.env` if needed.
3. In `backend/.env`, replace `REPLACE_WITH_YOUR_PASSWORD` with the password chosen during PostgreSQL installation. Keep this file private; it is excluded from Git. If the password contains URL-reserved characters, percent-encode those characters in the URL.
4. From the `backend` folder, generate the Prisma client, apply the initial migration, and check the connection:

```powershell
npm run prisma:generate
npm run db:migrate -- --name init
npm run db:check
```

The migration is intended for the new `campusx_dev` database. If Prisma proposes resetting a database, stop and review the database target before accepting anything.

`npm run db:check` sends a read-only `SELECT 1` query. It prints a generic success or failure message and does not display the connection string or database contents.

## Account access (Milestone 3)

CampusX supports personal-email/password signup and login, password recovery by email code, and Google sign-in. Accounts are not checked against student ID cards or LPU email domains. The site explains that it is intended for the LPU community.

### Local settings needed for email and Google

The app keeps private settings in `backend/.env`; the file is ignored by Git. The local `.env` now has two different random secrets for hashing reset codes and browser sessions. Do not copy their values into chat, README, or source files.

Password reset email requires SMTP details. Copy the relevant host, port, username, password, and sender address from your email provider into `backend/.env`. For Google OAuth, create an OAuth 2.0 **Web application** client in Google Cloud, set its authorized redirect URI to exactly `http://localhost:5000/api/auth/google/callback`, then enter the client ID and client secret in the matching `.env` settings. Keep the client secret private. Google's server-side flow redirects to its authorization page, handles the callback at the registered redirect URI, and validates the returned identity before creating a local session.

Restart the backend after editing `.env`. Open `http://localhost:4200/auth` to use the account page. Google sign-in will be available once its three Google variables are set. Password reset codes will be delivered once SMTP is configured. Signup and password login do not depend on SMTP.

The session token is an `HttpOnly` cookie; browser JavaScript cannot read it. The database stores only a hash of that token. Passwords are stored as bcrypt hashes, and password-reset codes are short-lived, limited to five attempts, and stored as keyed hashes.

### Account API routes

- `POST /api/auth/signup` — accepts `{ "email", "password" }`.
- `POST /api/auth/login` — accepts `{ "email", "password" }`.
- `POST /api/auth/password-reset/request-code` — accepts `{ "email" }`.
- `POST /api/auth/password-reset/verify-code` — accepts `{ "email", "code", "newPassword" }`.
- `GET /api/auth/google` — begins Google sign-in; Google returns to `/api/auth/google/callback`.
- `GET /api/auth/me` and `POST /api/auth/logout` — inspect or revoke the current browser session.

Email and Google provider credentials are intentionally left for the developer to configure locally; this project does not contain live provider secrets.

## Marketplace listing foundation

The backend separates a shared `Product` from each seller's `Listing`. A normalized product name plus category groups matching offers. Product search uses keyword matching and does not call OpenAI or another AI service. `GET /api/products` returns one record per product with its lowest in-stock price and total available stock; a search returns matching active seller offers sorted from lowest to highest price. `GET /api/products/:productId/offers` returns active offers for one product. `POST /api/listings` creates an offer for the signed-in seller and requires a product name, category, description, price, stock quantity, and phone number.

Seller phone numbers are stored with offers but are not returned by public product endpoints. They can be connected to a buyer/seller contact flow in a later feature.

The category values accepted by the API are `CLOTHING`, `ACCESSORIES`, `SHOES`, `FOOD`, `ELECTRONICS`, `BEAUTY`, `ARTWORK`, `SPORTS_EQUIPMENT`, `MUSICAL_INSTRUMENTS`, `ROOM_DECOR`, `KITCHEN_ITEMS`, `DAILY_USE`, and `OTHER`. Matching is exact after the backend normalizes the product name; include model or variant details in the name when they affect comparability.

Listings are free right now; there is no fourth-listing fee gate. The seller form is available at `/sell` and requires a signed-in account. Sellers can add a photo, campus pickup location, available stock count (including zero for out of stock), optional clothing gender, and food protein details. Sellers can change stock from their own seller profile. Product pages show other seller offers and the existing questions and reviews sections.

### Seller profiles and dashboard

Each seller offer links to a public page at `/sellers/:sellerId`. It shows that seller's active listings and public review totals; phone numbers and email addresses are not included. Signed-in users can save another seller from this page. `/dashboard` shows the current user's listings and saved sellers. These saved relationships are stored in the additive `SellerFavorite` table and are private to the account that created them.

The related API is mounted at `/api/sellers`: `GET /:sellerId` returns a public profile, `GET /dashboard` returns the current account's summary, and authenticated `GET`, `PUT`, and `DELETE /:sellerId/favorite` routes read or change one saved-seller relationship.

### Cash-on-delivery orders

Buyers can request an in-stock seller offer with cash on delivery, selecting a quantity and optionally adding a note. Pending requests do not reserve stock, so sellers can review multiple buyers and choose which request to accept. From their own seller profile, sellers can review requests under each product, accept with a meetup date, time, and location, or decline. Accepting checks and reduces available stock; an out-of-stock offer cannot receive new requests. The buyer can cancel a still-pending request. After the in-person exchange, the seller records that the item was handed over and cash received, then the buyer confirms receipt and payment. No online payment provider, card details, or payment secrets are used.

The order API is mounted at `/api/orders`: `POST /` creates a COD request, `GET /mine` lists the signed-in user's purchases and sales, `GET /seller/requests` returns that seller's pending requests, and `PATCH /:orderId` performs an allowed order action. Additive migrations add stock quantity and order records without dropping existing tables or records. Messaging and renting remain future milestones.

The listing endpoints use the session cookie established by email/password or Google sign-in. For a quick read-only check after starting the backend, open `http://localhost:5000/api/products`; it currently returns an empty list until the first listing is created.

