import { pushToMany } from './sse';
import { wakeEmailOutbox } from '../services/email-outbox';

/**
 * What may only happen once a transaction has committed: live pushes to staff screens, and waking
 * the email outbox so queued emails go out now rather than on the next poll. Code running inside a
 * transaction records these here; whoever owns the transaction calls `run()` after it commits.
 */
export class AfterCommit {
    private readonly pushes: { userIds: number[]; event: string; data: object }[] = [];
    private outbox = false;

    push(userIds: number[], event: string, data: object) {
        if (userIds.length > 0) this.pushes.push({ userIds, event, data });
    }

    /** An email was queued in this transaction. */
    wakeOutbox() {
        this.outbox = true;
    }

    run() {
        if (this.outbox) wakeEmailOutbox();
        for (const push of this.pushes) pushToMany(push.userIds, push.event, push.data);
    }
}
