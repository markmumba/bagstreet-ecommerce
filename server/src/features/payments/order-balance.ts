import { LEDGER_DIRECTION, ORDER_STATUS, PAYMENT_STATUS, REFUND_METHOD, type LedgerDirection, type OrderPaymentState, type OrderPaymentSummary } from 'shared/dist';
import { roundMoney } from '@server/lib/pricing';
import { readJsonColumn } from '@server/lib/json-column';

/** Ledger entry types that move money for an order. */
export const LEDGER_ENTRY = {
    PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
    REFUND_ISSUED: 'REFUND_ISSUED',
    /** Charged by Paystack; recorded from statement imports. */
    PROVIDER_FEE: 'PROVIDER_FEE',
    /** Captured money taken back by the provider (chargeback / reversal). Money out. */
    PAYMENT_REVERSED: 'PAYMENT_REVERSED',
    /** Paid from a gift voucher's balance. Money in for the order; given back as REFUND_ISSUED. */
    VOUCHER_REDEEMED: 'VOUCHER_REDEEMED',
} as const;

export type LedgerEntryType = typeof LEDGER_ENTRY[keyof typeof LEDGER_ENTRY];

/** Differences smaller than this (in the shop currency) are rounding noise, not under/overpayment. */
const TOLERANCE = 0.5;

export interface BalanceEntry {
    entry_type: string;
    direction: LedgerDirection;
    amount: number | string;
    /** A refund's `method` says whether it went back onto a gift voucher. */
    metadata?: unknown;
}

export interface BalanceOrder {
    total_amount: number | string;
    status: string;
    payment_status: string;
}

/**
 * Works out what an order has been paid and refunded from its ledger.
 * Pure (no DB) so it's unit-tested and used both for display and for the refund limit check.
 */
export function summariseOrderPayments(order: BalanceOrder, entries: BalanceEntry[]): OrderPaymentSummary {
    const orderTotal = roundMoney(Number(order.total_amount));
    const sum = (type: LedgerEntryType, direction: LedgerDirection) => roundMoney(
        entries
            .filter((e) => e.entry_type === type && e.direction === direction)
            .reduce((total, e) => total + Number(e.amount), 0),
    );

    const paidByVoucher = sum(LEDGER_ENTRY.VOUCHER_REDEEMED, LEDGER_DIRECTION.CREDIT);
    let captured = roundMoney(sum(LEDGER_ENTRY.PAYMENT_CAPTURED, LEDGER_DIRECTION.CREDIT) + paidByVoucher);
    const refunded = sum(LEDGER_ENTRY.REFUND_ISSUED, LEDGER_DIRECTION.DEBIT);
    const returnedToVoucher = roundMoney(entries
        .filter((e) => e.entry_type === LEDGER_ENTRY.REFUND_ISSUED && e.direction === LEDGER_DIRECTION.DEBIT
            && (readJsonColumn<{ method?: string }>(e.metadata) ?? {}).method === REFUND_METHOD.GIFT_VOUCHER)
        .reduce((total, e) => total + Number(e.amount), 0));
    const reversed = sum(LEDGER_ENTRY.PAYMENT_REVERSED, LEDGER_DIRECTION.DEBIT);
    const fees = sum(LEDGER_ENTRY.PROVIDER_FEE, LEDGER_DIRECTION.DEBIT);

    // Orders paid before the ledger existed have no capture entry; trust their PAID flag.
    const legacyUnrecordedCapture = captured === 0 && order.payment_status === PAYMENT_STATUS.PAID;
    if (legacyUnrecordedCapture) captured = orderTotal;

    const net = roundMoney(captured - refunded - reversed);
    return {
        order_total: orderTotal,
        captured,
        refunded,
        reversed,
        net,
        fees,
        net_after_fees: roundMoney(net - fees),
        refundable: Math.max(0, net),
        paid_by_voucher: paidByVoucher,
        returned_to_voucher: returnedToVoucher,
        voucher_refundable: roundMoney(Math.max(0, paidByVoucher - returnedToVoucher)),
        cash_refundable: roundMoney(Math.max(0, net - Math.max(0, paidByVoucher - returnedToVoucher))),
        state: paymentState(order.status, orderTotal, captured, refunded, reversed, net),
        legacy_unrecorded_capture: legacyUnrecordedCapture,
    };
}

function paymentState(status: string, total: number, captured: number, refunded: number, reversed: number, net: number): OrderPaymentState {
    if (captured === 0) return 'unpaid';
    if (reversed > 0 && net <= TOLERANCE) return 'reversed';
    if (refunded > 0 && net <= TOLERANCE) return 'refunded';
    if (status === ORDER_STATUS.CANCELLED && net > TOLERANCE) return 'refund_owed';
    if (refunded > 0) return 'partially_refunded';
    if (captured < total - TOLERANCE) return 'underpaid';
    if (captured > total + TOLERANCE) return 'overpaid';
    return 'paid';
}

export type CaptureVerdict = 'match' | 'underpaid' | 'overpaid' | 'currency_mismatch';

/**
 * Compares money a provider says it received with what the order costs.
 * Underpaid / wrong-currency payments must not auto-confirm the order; overpaid ones confirm
 * but leave the difference owed back to the customer.
 */
export function assessCapturedAmount(orderTotal: number, captured: number, currency: string | null | undefined, expectedCurrency: string): CaptureVerdict {
    if (currency && currency.toUpperCase() !== expectedCurrency.toUpperCase()) return 'currency_mismatch';
    if (captured < orderTotal - TOLERANCE) return 'underpaid';
    if (captured > orderTotal + TOLERANCE) return 'overpaid';
    return 'match';
}

/**
 * What the customer still pays by card, M-Pesa or cash: the total less what a gift voucher pays.
 * This is what the payment provider is asked to collect.
 */
export function orderAmountDue(order: { total_amount: number | string; voucher_amount?: number | string | null }): number {
    return roundMoney(Math.max(0, Number(order.total_amount) - Number(order.voucher_amount ?? 0)));
}
