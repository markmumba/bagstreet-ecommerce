# Daily Paystack reconciliation

Every day after 03:00 Nairobi time, the API compares Paystack's list of the previous day's
transactions with our payment attempts and ledger. Paystack's list is what actually happened; our
tables are what we think happened.

The webhook, the checkout status poll and the unpaid-order expiry job each ask Paystack about one
payment attempt at a time, and they can miss one. The usual case: a customer pays after the order
has expired, and the webhook is lost. Before this job, nothing looked at that attempt again unless
someone uploaded a statement on the Reconciliation page.

## What it does

For the day (midnight to midnight, Nairobi time), it lists every Paystack transaction, with an hour
of slack either side so prompts sent near midnight still match, and every Paystack attempt of ours.

| Paystack says | We have | The job |
|---|---|---|
| success | no capture for that attempt (pending, failed, or completed without a ledger entry) | **Verifies that one transaction**, then records the payment through the normal payment path. The order lifecycle then confirms the order, or for an expired order reinstates it or raises REFUND_REQUIRED, exactly as for a late webhook. |
| success | a capture of a different amount or currency | Flags `amount_mismatch` |
| success | no attempt with that reference | Flags `unknown_reference` |
| failed / abandoned / reversed | a capture | Flags `not_successful_at_paystack` |
| failed / abandoned / reversed | a pending attempt | Verifies it and settles the attempt (no alert) |
| nothing | a capture made that day | Flags `missing_at_paystack` |
| list says success, verify doesn't | — | Flags `verify_disagrees` and records nothing |

It never refunds, reverses or cancels anything. Problems go to admins as one **Payments** alert
per day (in-app and email), with the orders listed and a link to the Reconciliation page.

## Safe to rerun

- Recording a payment is idempotent: the ledger capture is named after the attempt
  (`paystack:<reference>`), so a payment already recorded is skipped.
- Issues are stored in `paystack_reconciliation_issues`, once per (day, kind, reference). A rerun
  alerts only about issues it hasn't reported before.
- Each day has one row in `paystack_reconciliation_runs` (RUNNING, COMPLETED or FAILED, with a
  summary). A completed day isn't run again unless forced.

## When Paystack is down

If the list can't be read, or any single verify fails, the day is left FAILED and retried every
15 minutes. After 8 failed attempts the job stops retrying that day and sends admins a
"could not finish" alert. A run that died mid-way (restart) is taken over after an hour.

## Rerun a day by hand

On the droplet, from `~/bagstreet`:

```bash
docker compose -f deploy/docker-compose.prod.yml --env-file .env.production exec api bun run --cwd server reconcile:paystack --date 2026-11-17
```

Locally, from `server/`: `bun run reconcile:paystack --date 2026-11-17`.

Without `--date` it does yesterday. It always forces the run and prints the summary as JSON.

## Settings

- Runs only when `PAYSTACK_SECRET_KEY` is set.
- `PAYSTACK_RECONCILIATION_ENABLED=false` turns it off. It's on by default.

## Tests

- `bun test` covers the matching rules (`features/payments/paystack-reconciliation.test.ts`).
- `bun run test:paystack-reconciliation` runs the whole job against the local database, with a
  fake Paystack and fake alerts. No network call is made and no email is sent. Its fixtures use a
  date in 2001 and are removed at the end.

## Code

- `server/src/services/paystack.ts`: `listTransactions` (Paystack List Transactions API, paged;
  refuses a partial list)
- `server/src/features/payments/paystack-reconciliation.ts`: pure matching and Nairobi day helpers
- `server/src/services/paystack-daily-reconciliation.ts`: the job, `reconcilePaystackDay`,
  `startPaystackReconciliation`
- `server/src/db/migrations/020_paystack_reconciliation.ts`: the two tables
- `server/src/scripts/reconcile-paystack.ts`: manual rerun
