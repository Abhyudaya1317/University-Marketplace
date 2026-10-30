# CampusX UI/UX Specification

## Visual language

- Background: cream/off-white; global CSS currently uses #faf9f5.
- Main text: charcoal; global CSS currently uses #242520.
- Accent: orange, used for eyebrows, highlights, hearts, and primary marketplace actions.
- Cards: rounded corners, subtle neutral borders, restrained shadows.
- Typography: Segoe UI, Arial, sans-serif at global level.
- Layout: responsive page widths, listing grids and clear spacing.
- Interactions: meaningful loading, empty, validation, success, and API error feedback.
- Keep controls visually consistent and avoid browser alert/confirm for core product actions.

Global baseline: frontend/src/styles.css. Most page colors and dimensions are component-local CSS; no centralized token/variables layer exists yet. Do not introduce an unrelated style system.

## Main navigation

Shared account navigation is in frontend/src/app/shared/account-navigation.html/css/ts. Signed-in navigation includes Explore, Sell an item, Profile, Items I’m selling/dashboard, My orders, Messages and Sign out as provided by current template/route setup. The dashboard combines the signed-in profile and seller inventory. Public seller profile is /sellers/:sellerId.

## Explore page

Route /explore. Header/brand, marketplace intro, search field, category selector, optional Clothing → Gender and Food → Protein filters, Search, suggestions while typing, randomize control, responsive card grid. Each card is one active in-stock Listing and shows image or placeholder, category, title, condition, price, stock and actual seller name, linking to /products/:listingId. Empty/error/loading states are explicit.

Search is universal: current server ignores category/detail filters when search is present (search selects all categories). Search suggestion UI shows up to six matched listing titles, not the full catalog. Search while typing is debounced by 250ms and also has a submit button. Randomize shuffles currently loaded results only.

## Product details page

Route /products/:listingId. Should represent one specific seller offer. Current UI shows offer image, name, description, price, category/condition, stock, location, actual seller and reputation; individual listing wishlist; purchase request; listing-scoped questions and reviews; signed-in buyer message-seller entry. Seller contact details are not publicly rendered.

Direct URL and browser refresh load from API; invalid/unavailable listing should show a clear error. Stock 0 cannot be requested. Guest save/chat/request actions should route/describe sign-in as implemented. Verify behavior after any UI refactor.

## Sell/edit listing

Route /sell; edit mode uses ?edit=ListingID. Form uses the same component for create/update. Fields: name, category, description, price, quantity, seller phone, pickup location, condition, optional image. Clothing requires gender. Food requires protein grams per serving. Image accepts JPG/PNG/WebP ≤5 MB, browser preview and server signature validation. Reset category-specific values when changing category.

## Dashboard / profile

Route /dashboard. Combines account's profile, editable display name, email/avatar and seller rating summary, active item cards with stock/edit/archive controls, archived listing restore/delete, pending buyer requests and saved sellers/listings. Exact visibility depends on backend response. The old screenshot showed Seller #1 and missing items; current code intends actual fullName and listing data. Validate against authenticated account before claiming fixed.

Seller archive removal and permanent deletion should use in-app confirmation modals with clear consequences. Never let UI ownership replace backend ownership checks.

## Public seller

Route /sellers/:sellerId. Public seller identity, active seller listings and reviews summary, favorite-seller control if signed in. Do not expose seller phone/email as public profile contact by default.

## Orders

Route /orders. Buyer and seller see their own requests/orders; seller accepts/declines with meeting time/location; buyer can cancel pending, confirms receipt after seller handoff. Avoid describing as paid checkout. COD label should be clear.

## Messages

Routes /messages and /messages/:conversationId. Current UI includes inbox, thread, product context, message bubbles, plain-text composer and manual refresh. No typing indicator, read state, attachments or realtime transport. Empty, sign-in required, loading, error and send feedback should remain clear.

## Responsive behavior and accessibility

Listing cards should be square-like and equalized; images use fixed upper aspect region with object-fit: cover, placeholder on missing/broken image. Target 3 columns desktop, 2 tablet, 1 mobile as intended product spec, though inspect current CSS widths before claiming exact breakpoints. Use semantic labels, button text/aria labels, visible focus states and status roles. Do not make a card's wishlist control nested in a link if it intercepts card navigation.

## Previous design/reference inputs

User supplied screenshots for seller offer cards, Explore search, seller profile and listing-management UI. The current latest browsing direction is individual listings directly on Explore; do not revert to grouped seller offers based on older screenshots.
