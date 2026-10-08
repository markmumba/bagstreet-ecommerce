import { useRecoveryPreferences, useSetRecoveryPreferences } from '@/hooks/useCartRecovery';

export function BagReminderPreference() {
  const preference = useRecoveryPreferences();
  const update = useSetRecoveryPreferences();
  if (preference.data?.data?.enabled === false) return null;
  return (
    <div className="space-y-2">
      <label className="flex items-start gap-3 text-sm leading-6">
        <input type="checkbox" className="mt-1 h-4 w-4 shrink-0 accent-primary" checked={preference.data?.data?.recovery_opt_in ?? false}
          disabled={preference.isLoading || preference.isError || update.isPending}
          onChange={event => update.mutate(event.target.checked)} />
        <span>Email me about my unfinished shopping. I can unsubscribe at any time.</span>
      </label>
      <p className="text-xs text-muted-foreground" role="status">
        {update.isPending ? 'Saving preference...' : update.isSuccess ? 'Email preference saved.' : ''}
      </p>
      {(preference.isError || update.isError) && <p role="alert" className="text-sm text-destructive">Your email preference couldn't be saved. Please try again.</p>}
    </div>
  );
}
