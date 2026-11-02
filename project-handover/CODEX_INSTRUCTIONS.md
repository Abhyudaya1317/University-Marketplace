# Instructions for Future CampusX Codex Sessions

These are persistent collaboration and implementation expectations for this repository.

## Before changing anything

1. Read CAMPUSX_MASTER_HANDOFF.md and the relevant feature/API/schema docs.
2. Inspect actual current source and Git status. These docs are a snapshot; code may change.
3. Inspect the current branch and worktree before edits. Preserve all tracked and untracked user changes. Never clean/reset/rewrite the tree to make it look tidy.
4. Check whether local-only secrets/uploads exist, but never read or print secret values into output.
5. Explain significant architectural decisions before substantial implementation.

## Build quality

- Work feature by feature; keep scope limited and code readable.
- Reuse current Angular/Express/Prisma patterns; do not build duplicate systems.
- Keep frontend and backend separated in frontend/ and backend/.
- Preserve the current CampusX retro Windows/Y2K visual identity: OS-gray panels, navy title bars, blue controls and pixel headings; keep the home page's teal grid and yellow/cyan/pink accents while product and account pages use the restrained gray/white/blue palette.
- Explain important code in beginner-friendly terms; use clear comments for logical blocks, not noisy line-by-line narration.
- Use Angular signals/reactive state for async updates where this codebase does.
- Validate inputs on backend even if frontend validates them too.
- Preserve loading/error/success/empty states.
- Do not hardcode user or seller identities; use real user IDs/names and fallback “CampusX Member”.
- Do not use fake data to conceal missing backend functionality.
- Use Listing.id for item actions; do not substitute Product.id, enum category, favorite join ID, or Order.id.
- Enforce ownership and participant checks on the server for listing/order/message changes.
- Keep secrets in private backend/.env; never commit, echo, log or copy them. Never expose backend secrets in Angular.
- Explain exactly what changed and what was verified. Avoid claiming tests or DB flows that were not run.

## Database safety

- Do not reset/drop/overwrite database or data. Do not run prisma migrate reset.
- Confirm DATABASE_URL target privately before migrations.
- Prefer additive schema migrations; inspect SQL and migration status.
- If migration status or connectivity fails, diagnose the service/URL before changing any data.
- Never delete a listing with order history; current DB relationship uses Restrict and controller uses guarded deletion.

## Marketplace decisions to preserve

- Personal email/password and Google sign-in; no student ID image recognition or domain restriction.
- LPU audience is intended but not verified.
- Listing fee proposal (3 free, ₹2 after) is not implemented; do not add/paywall without new request.
- Current payment is COD only. Do not introduce Razorpay, escrow, or seller payout without explicit request and payment capability research.
- Explore shows individual active listings directly.
- Wishlist and questions/reviews are specific to individual listings.
- Reviews are not purchase-verified.
- Renting is postponed.
- Messaging is plain text and participant-only unless product decisions change.

## Verify end-to-end

Use tests/builds without overstating their scope. For DB-backed functionality, verify frontend request → Express route → auth/validation → Prisma operation → response → refreshed UI. Use two distinct accounts for ownership/privacy flows. Test failure and unauthenticated cases. Never “fix” an error by hiding it or faking success.

## Keep roadmap separate from implementation

Do not implement future features without being asked. Current future ideas include fees, online payments, renting, leaderboard, Seller of the Week, AI image tools, production hosting, and larger infrastructure. First close high-priority reliability gaps in BUGS_AND_PENDING_WORK.md.
