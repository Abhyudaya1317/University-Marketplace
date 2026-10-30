# CampusX Business Rules and Product Decisions

## Audience and access

CampusX is intended for LPU students/community. The accepted signup decision is personal email/password and Google OAuth. Do not identify students from ID-card photos and do not block non-LPU email domains. Current code has no student verification. Public positioning is not proof of exclusivity.

## Listing and contact

- A listing is one seller's individual offer; a shared Product row is just catalog/name/category metadata.
- Required by current backend: name/title, supported category, description, price, valid phone, location, condition, quantity; clothing must include gender; food must include protein grams.
- Listing phone belongs to offer; user email belongs to account. Public product responses avoid both private contact values. Buyer order requests supply their phone; seller contact is shown to buyer only after acceptance per order response shaping.
- Images are optional and currently one local image, with JPG, PNG, WebP, max 5 MB.
- Location defaults at schema level to “LPU campus,” but API validation/form behavior should be confirmed; do not assume this default means no seller confirmation.

## Fee policy idea

Proposed: first 3 listings free, each later listing ₹2. This is not active in UI/API or tested. User previously objected to a message implying the 4th listing was blocked by a ₹2 charge. Do not add a paywall or fee logic until explicitly requested, and do not make misleading fee statements. User should decide whether/when this proposed pricing becomes active.

## Catalog and discovery

- Explore displays every active, in-stock individual Listing once; matching titles from different sellers remain separate cards.
- Selecting a card opens that listing directly. Current architecture does not have a seller-offers comparison page.
- Search is universal even if a category is selected; current backend deliberately ignores category/gender/protein constraints when search text exists.
- When no search exists, selected category applies; Clothing shows gender filter, Food shows minimum-protein filter.
- Current order is price low-to-high with recent tie-break. Randomize changes only front-end ordering of currently returned results.
- Search is local keyword/prefix/edit-distance logic, not OpenAI or NLP model search.

## Favorites

Wishlist saves one exact Listing ID per account. A person can independently save two offers in one Product group. Duplicate save is prevented by a DB unique key. Seller favorite is a different User-to-User relationship and must not be conflated with a saved listing.

## Order and COD agreement

The accepted interim approach is cash on delivery, no online payment integration. Workflow:

1. Buyer selects exact listing and quantity, adds required phone and optional note.
2. System creates a PENDING order request. Pending requests do not reserve inventory.
3. Seller chooses which request to accept; seller can decline other requests.
4. Seller acceptance requires meeting date/time and location. The backend decrements stock within transaction, provided sufficient stock remains.
5. Seller confirms handoff, moving ACCEPTED → SELLER_CONFIRMED.
6. Buyer confirms receipt, moving SELLER_CONFIRMED → COMPLETED.

Buyer can cancel only while pending. The current code does not implement disputes, refunds, delivery tracking, online payments, platform escrow or seller payouts. COD means payment occurs offline at handoff and does not guarantee buyer/seller protections.

Razorpay was considered previously, but do not implement until actual marketplace payment/payout/settlement capabilities and applicable requirements are verified. A normal payment capture should not be called escrow.

## Questions and ratings

- Questions belong to one Listing even when Product metadata is shared.
- Seller of that exact listing may answer; one upserted answer per seller/question.
- Reviews belong to one listing and one reviewer; the backend allows update through upsert and blocks self-review.
- Reviews are not purchase-verified; the current API does not require a completed order.
- Seller rating can aggregate reviews across seller's active listings. Product/UI copy must avoid “verified purchaser” claims.

## Messaging

Current implementation intent: one private buyer/seller conversation per listing and buyer. Participants only; plain text up to 2,000 chars. New conversations start only on active listing, and a user cannot message self. No real-time guarantee.

## Deferred ideas

Renting remains postponed pending protection against theft, damage, and non-return. Leaderboards, Seller of the Week, AI image cleanup and community features remain future ideas, not current business guarantees.
