export const RECOVERY_TTL_MS = 7 * 24 * 60 * 60_000;
export const FIRST_REMINDER_MS = 2 * 60 * 60_000;
export const FOLLOWUP_REMINDER_MS = 24 * 60 * 60_000;

export function recoverySelectionKey(items: { variant_id: number; quantity: number }[]) {
    return JSON.stringify(items.map(item => [Number(item.variant_id), Number(item.quantity)]).sort((a, b) => a[0]! - b[0]!));
}

export function dueRecoveryStage(input: {
    lastActivity: number; expiresAt: number; stage: number; optedIn: boolean;
    blocked: boolean; followup: boolean;
}, now = Date.now()): 1 | 2 | null {
    if (!input.optedIn || input.blocked || input.expiresAt <= now) return null;
    const inactive = now - input.lastActivity;
    if (input.stage === 0 && inactive >= FIRST_REMINDER_MS) return 1;
    if (input.stage === 1 && input.followup && inactive >= FOLLOWUP_REMINDER_MS) return 2;
    return null;
}

export function withinRecoveryBudget(input: {
    windowStart: number | null; count: number; lastSent: number | null;
}, now = Date.now()) {
    const count = input.windowStart !== null && now - input.windowStart < RECOVERY_TTL_MS ? input.count : 0;
    return count < 2 && (input.lastSent === null || now - input.lastSent >= FIRST_REMINDER_MS);
}
