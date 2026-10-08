import type { OrderPaymentState, OrderPaymentSummary } from 'shared/dist';
import { roundMoney } from '@server/lib/pricing';

/** Ledger entry types that move money for an order. */
export const LEDGER_ENTRY = {
    PAYMENT_CAPTURED: 'PAYMENT_CAPTURED',
    REFUND_ISSUED: 'REFUND_ISSUED',
    /** Charged by Pesapal; recorded from statement imports. */
    PROVIDER_FEE: 'PROVIDER_FEE',
} as const;

/** Differences smaller than this (KES) are rounding noise, not under/overpayment. */
const TOLERANCE = 0.5;

export interface BalanceEntry {
    entry_type: string;
    direction: 'CREDIT' | 'DEBIT';
    amount: number | string;
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
    const sum = (type: string, direction: 'CREDIT' | 'DEBIT') => roundMoney(
        entries
            .filter((e) => e.entry_type === type && e.direction === direction)
            .reduce((total, e) => total + Number(e.amount), 0),
    );

    let captured = sum(LEDGER_ENTRY.PAYMENT_CAPTURED, 'CREDIT');
    const refunded = sum(LEDGER_ENTRY.REFUND_ISSUED, 'DEBIT');
    const fees = sum(LEDGER_ENTRY.PROVIDER_FEE, 'DEBIT');

    // Orders paid before the ledger existed have no capture entry; trust their PAID flag.
    const legacyUnrecordedCapture = captured === 0 && order.payment_status === 'PAID';
    if (legacyUnrecordedCapture) captured = orderTotal;

    const net = roundMoney(captured - refunded);
    return {
        order_total: orderTotal,
        captured,
        refunded,
        net,
        fees,
        net_after_fees: roundMoney(net - fees),
        refundable: Math.max(0, net),
        state: paymentState(order.status, orderTotal, captured, refunded, net),
        legacy_unrecorded_capture: legacyUnrecordedCapture,
    };
}

function paymentState(status: string, total: number, captured: number, refunded: number, net: number): OrderPaymentState {
    if (captured === 0) return 'unpaid';
    if (refunded > 0 && net <= TOLERANCE) return 'refunded';
    if (status === 'CANCELLED' && net > TOLERANCE) return 'refund_owed';
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
export function assessCapturedAmount(orderTotal: number, captured: number, currency: string | null | undefined, expectedCurrency = 'KES'): CaptureVerdict {
    if (currency && currency.toUpperCase() !== expectedCurrency.toUpperCase()) return 'currency_mismatch';
    if (captured < orderTotal - TOLERANCE) return 'underpaid';
    if (captured > orderTotal + TOLERANCE) return 'overpaid';
    return 'match';
}
