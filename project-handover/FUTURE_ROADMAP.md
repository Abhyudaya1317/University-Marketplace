# Future Roadmap

Priority order is an informed recommendation based on current gaps, not a promise of implementation. User instruction was to stop feature development for this handover.

## Essential MVP verification

1. Restore and confirm reliable local PostgreSQL connectivity; verify migrations on the intended database with no reset.
2. Complete regression verification of account sessions and Google/email flows.
3. Validate create/edit/list/photo, Explore individual listings, detail page and categories with real DB data.
4. Fix/reconfirm wishlist persistence and correct account identity.
5. Verify archive/restore/delete safety and order-history protection.
6. Verify COD request and stock transitions from buyer and seller accounts.
7. Verify questions/reviews and messaging authorization.
8. Add backend integration tests and Angular tests for these critical workflows.

## Current development work

Private buyer/seller messages are in the current uncommitted tree. Message schema migration is present. The feature needs migration-state confirmation and two-account end-to-end tests. It currently uses manual refresh; decide whether to release as polling/manual refresh or add a real-time transport later.

## Next release

- Improve search as a deterministic marketplace search: pagination, bounded results, relevance ranking and indexed DB query.
- Add listing/image durability suitable for deployment; enforce quotas and cleanup policy.
- Add robust moderation/reporting and seller-reputation policy.
- Improve seller profile and inventory usability using actual user/listing data.
- Complete responsive/accessibility checks.
- Add explicit API CORS and deployment environment configuration.
- Decide if listing-fee idea is still desired before implementing billing.

## Long-term ideas

- Leaderboard and Seller of the Week based on legitimate, abuse-resistant marketplace activity.
- Community activity and prelaunch listing/community growth.
- Optional AI background removal for photos, only if useful and cost/privacy constraints are acceptable.
- Additional category-specific attributes and marketplace discovery.
- Online payment integration only after confirming provider marketplace capabilities, seller onboarding, settlements, fees, refunds/disputes and regulatory requirements. Razorpay has not been integrated.
- Delivery confirmation and dispute process beyond current offline COD confirmation.
- Rental marketplace only after safeguards for loss, damage and non-return are designed.
- Production infrastructure: durable PostgreSQL, image object storage, backups, CI/CD, monitoring/logging, rate limits, Docker or other deployment standard if justified. Redis is not needed by current local MVP.

## Explicitly not current

Online card/UPI payment, escrow, seller payout, rentals, verified student access, AI-powered search and AI photo manipulation are not implemented or approved as immediate tasks.
