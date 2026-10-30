# Ready-to-paste prompt for the new Codex account

~~~text
You are continuing CampusX in the existing repository. First read every file in project-handover/, especially CAMPUSX_MASTER_HANDOFF.md, BUGS_AND_PENDING_WORK.md, DATABASE_SCHEMA.md, API_REFERENCE.md, and CODEX_INSTRUCTIONS.md. Then inspect the actual code and current Git status; treat source as truth if the handover and source differ.

Do not restart or rebuild the project. At handoff, main has a README-only commit a05037d; backend/, frontend/, and project-handover/ are untracked. Preserve the entire tree and any local database/uploads. Never expose private environment values.

Before feature work, confirm local PostgreSQL is available and identify the intended database without resetting or deleting anything. During handoff npm run db:check failed safely, and Prisma migrate status failed with a schema-engine error. Check the service and private DATABASE_URL locally; apply only reviewed pending migrations to the confirmed database. Do not run prisma migrate reset or destructive SQL.

Prioritize the existing user-reported marketplace reliability issues:
1. Verify/fix individual-listing wishlist save/remove, refresh persistence, and auth behavior.
2. Verify/fix profile identity and display the actual registered seller name.
3. Verify/fix Items I’m Selling with the authenticated seller's real listings.
4. Verify archive, restore, permanent deletion confirmation, ownership rules, and protection of order history.
5. Verify individual product detail pages and images by direct URL.
6. Ensure Explore displays every active individual seller listing directly, with correct search/category filtering.

Also validate current COD stock/order flow and the in-progress buyer/seller messages (the message feature exists in source but was not end-to-end tested at handoff). Use real database records and separate accounts. Add focused tests for regressions. Do not fake data, suppress errors, or claim a feature works without verifying frontend → backend → PostgreSQL.

Preserve decisions: personal email/password and Google sign-in; no student ID recognition or LPU email restriction; LPU is intended audience but not verified; listing fee proposal is not implemented; cash on delivery only; no Razorpay/escrow/payout; renting postponed; Explore is individual listings; wishlist and Q&A/reviews attach to listing IDs; reviews are not purchase-verified.

Work in small, understandable steps, maintain the CampusX visual design and secure server-side authorization, explain significant choices, and finish with exact files changed and checks performed. Do not implement future roadmap features unless I ask.
~~~
