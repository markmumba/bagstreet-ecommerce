import { apiClient } from './api';
import type { ReconciliationReport, StatementReconciliationReport } from 'shared';

export const reconciliationService = {
  getReport: (from: string, to: string) =>
    apiClient.get<ReconciliationReport>('/api/payments/reconciliation', { from, to }),

  /** Preview by default; pass recordFees to write the statement's fees to the ledger. */
  importStatement: (file: File, recordFees: boolean) => {
    const data = new FormData();
    data.append('file', file);
    if (recordFees) data.append('record_fees', 'true');
    return apiClient.postFormWithMessage<StatementReconciliationReport>('/api/payments/reconciliation/statement', data);
  },
};
