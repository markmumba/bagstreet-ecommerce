/**
 * Runs the Paystack reconciliation for one Nairobi day by hand, e.g. after Paystack was down or to
 * re-check a day: `bun run reconcile:paystack --date 2026-11-17` (defaults to yesterday).
 * Reruns are safe: payments already recorded are skipped and staff hear only about new issues.
 */
import { closeDatabase } from '../lib/db';
import { previousNairobiDay } from '../features/payments/paystack-reconciliation';
import { reconcilePaystackDay } from '../services/paystack-daily-reconciliation';

const flag = process.argv.indexOf('--date');
const day = flag >= 0 ? process.argv[flag + 1] : previousNairobiDay();
if (!day) {
    console.error('Usage: bun run reconcile:paystack [--date YYYY-MM-DD]');
    process.exit(1);
}

try {
    const summary = await reconcilePaystackDay(day, { force: true });
    console.log(JSON.stringify(summary, null, 2));
} catch (err) {
    console.error(`Reconciliation for ${day} failed:`, err instanceof Error ? err.message : err);
    process.exitCode = 1;
} finally {
    await closeDatabase();
}
