# Ready-to-paste prompt for the new Codex account

~~~text
You are continuing CampusX in the existing repository. First read every file in project-handover/, especially CAMPUSX_MASTER_HANDOFF.md, BUGS_AND_PENDING_WORK.md, DATABASE_SCHEMA.md, API_REFERENCE.md, and CODEX_INSTRUCTIONS.md. Then inspect the actual code and current Git status; treat source as truth if the handover and source differ.

The workspace is on branch angular-vercel and contains uncommitted changes. Preserve the entire tree and any local database/uploads. Never expose private environment values. Local frontend is http://localhost:4200; backend currently uses PORT=5002 in ignored backend/.env and frontend/proxy.conf.json points to 127.0.0.1:5002. Health and product reads were verified; /explore displayed five real listings on 2026-11-01.

Before feature work, run a read-only Prisma migration status check against the intended local database. Local runtime API reads now work, but Prisma migration bookkeeping was not verified. The latest schema migration is 20261101120000_add_second_listing_photo_custom_condition. Never run prisma migrate reset or destructive SQL.

Prioritize the existing user-reported marketplace reliability issues:
1. Test the profile photo upload and verify account/seller identity and follow state.
2. Test individual-listing wishlist save/remove, refresh persistence, and signed-out behavior.
3. Test listing creation with two photos, edit, archive/restore, and ownership protections.
4. Test COD request acceptance/decline/cancel/confirmation and stock updates.
5. Test messaging persistence, participant authorization, unread indicators, and periodic refresh.
6. Check listing image persistence and PostgreSQL migration status before further schema work.

Use real database records and separate accounts. Add focused tests for regressions. Do not fake data, suppress errors, or claim a feature works without verifying frontend → backend → PostgreSQL.

Preserve decisions: personal email/password and Google sign-in; no student ID recognition or LPU email restriction; LPU is intended audience but not verified; listing fee proposal is not implemented; cash on delivery only; no Razorpay/escrow/payout; renting postponed; Explore is individual listings; wishlist and Q&A/reviews attach to listing IDs; reviews are not purchase-verified.

Work in small, understandable steps, maintain the CampusX visual design and secure server-side authorization, explain significant choices, and finish with exact files changed and checks performed. Do not implement future roadmap features unless I ask.
~~~
