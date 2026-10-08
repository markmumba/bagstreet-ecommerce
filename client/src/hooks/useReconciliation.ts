import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { reconciliationService } from '@/services/reconciliation.service';
import { orderKeys } from '@/hooks/useOrders';

export const reconciliationKeys = {
  all: ['reconciliation'] as const,
  report: (from: string, to: string) => [...reconciliationKeys.all, 'report', from, to] as const,
};

export function useReconciliationReport(from: string, to: string) {
  return useQuery({
    queryKey: reconciliationKeys.report(from, to),
    queryFn: () => reconciliationService.getReport(from, to),
    enabled: Boolean(from && to),
  });
}

export function useImportStatement() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ file, recordFees }: { file: File; recordFees: boolean }) =>
      reconciliationService.importStatement(file, recordFees),
    onSuccess: (_res, { recordFees }) => {
      if (!recordFees) return;
      queryClient.invalidateQueries({ queryKey: reconciliationKeys.all });
      queryClient.invalidateQueries({ queryKey: orderKeys.all });
    },
  });
}
