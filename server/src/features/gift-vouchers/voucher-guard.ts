import type { AppContext } from '@server/lib/hono';
import { TooManyRequestsError } from '../../lib/errors';
import { voucherCodeFailures } from '../../middleware/rate-limit.middleware';
import { VOUCHER_NOT_FOUND } from './voucher-rules';

/** Before looking up a typed gift voucher code: refuse once this caller has tried too many wrong ones. */
export async function assertCanTryVoucherCode(c: AppContext, code: string | undefined): Promise<void> {
    if (!code?.trim()) return;
    if (await voucherCodeFailures.blocked(c)) {
        throw new TooManyRequestsError('Too many wrong gift voucher codes. Please try again in an hour.');
    }
}

/** After: count a code that matched no voucher (expired or used-up vouchers are real codes, not guesses). */
export async function recordVoucherCodeResult(c: AppContext, problem: string | null | undefined): Promise<void> {
    if (problem === VOUCHER_NOT_FOUND) await voucherCodeFailures.record(c);
}
