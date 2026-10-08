# Cart and Checkout Recovery

Recovery is enabled by default, but no existing customer is automatically opted in.

- `CART_RECOVERY_ENABLED=true`: first reminder after two hours of inactivity. The scheduler checks every five minutes.
- `CART_RECOVERY_FOLLOWUP_ENABLED=false`: optionally enable one final reminder at 24 hours.
- `UNPAID_ORDER_TTL_MINUTES=45`: unchanged inventory reservation. This is not the lifetime of the shopping bag.
- A recipient can receive at most two recovery emails in seven days, at least two hours apart, across all devices.

## Customer Experience

An unchecked checkout checkbox offers recovery emails. Signed-in customers can also change this in Account > Email preferences. An anonymous bag without an email and consent cannot receive reminders. An anonymous checkout cannot override an earlier unsubscribe; the customer must sign in to re-enable reminders.

Each email shows current product names, images, prices and availability, links to `/recover-bag?token=...`, and has an unsubscribe link. The recovery page shows missing/reduced stock and asks before replacing an existing bag. Restoration checks prices and stock again, does not sign the customer in, does not restore addresses or coupons, and does not create an order or charge payment.

An order replaces the cart snapshot in the same database transaction. Clearing the local bag after successful creation preserves unfinished checkout recovery. Active checkouts cannot be restarted through recovery. Expired unpaid orders recover as item selections for a fresh checkout; paid orders, money held for review, manual cancellations and purchases since abandonment suppress recovery. A signed HttpOnly provenance cookie rechecks the earlier order under a database lock when a fresh order is placed, blocking money recorded after restoration. As with any delayed provider callback, a payment not yet known to the server needs merchant investigation; the email explicitly tells customers who already paid not to pay again.

GET links are read-only, so mail scanners do not restore a bag or unsubscribe. Both actions require an explicit POST. Unsubscribe affects recovery emails only, not receipts or order/delivery messages.

## Operations

Run `bun run db:migrate` before starting a production API. Migrations `009_cart_recovery` and `010_cart_recovery_owner` add email preferences, minimal item snapshots, account ownership and the outbox `SKIPPED` state. The scheduler and outbox worker start after database preparation. No RabbitMQ or additional service is required.

The scheduler queues jobs transactionally with persistent deduplication keys. The sender rechecks snapshot version, inactivity, consent, purchase/payment status, per-email limits and live stock. Stale jobs become `SKIPPED`, not `SENT`. Delivery retries follow the existing outbox policy. As with the existing outbox, a crash between email acceptance and database commit can cause a duplicate.

Snapshots contain only variant IDs, quantities, recipient linkage and activity/payment linkage. Recovery session cookies are HttpOnly; database session and recovery tokens are hashed. Recovery links expire after seven days of inactivity. Recovery URLs are excluded from indexing/referrers and API token query strings are redacted from request logs. Snapshot cleanup runs every five minutes; opt-out preferences remain to prevent accidental resubscription. Sent/skipped outbox payloads are retained for 30 days and failed payloads for 90 days.

Validate sender authentication and domain setup before launch, and monitor recovery, unsubscribe and bounce rates. Recovery emails count toward the SMTP/Resend allowance. No automatic discount or separate promotional campaign is enabled.

`bun run emails:preview` includes a saved-bag reminder. `bun test` covers policy, tokens and email rendering. `bun run test:recovery` exercises real SQL with a mocked sender, rolls back reminder/order state and cleans up its own fixtures; it never sends email.
