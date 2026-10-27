import { useState, type ReactNode } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';

/**
 * Asks before an action that changes money, stock or what customers see. The dialog stays open
 * while the action runs and shows its error if it fails.
 */
export function ConfirmDialog({
  open, onOpenChange, title, description, confirmLabel, pendingLabel, destructive = false, onConfirm, children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  /** Shown while the action runs, e.g. "Marking as paid…". */
  pendingLabel: string;
  destructive?: boolean;
  onConfirm: () => Promise<unknown>;
  children?: ReactNode;
}) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState('');

  const confirm = async () => {
    setPending(true);
    setError('');
    try {
      await onConfirm();
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, 'That didn’t work. Check your connection and try again.'));
    } finally {
      setPending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!pending) { setError(''); onOpenChange(next); } }}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {children}
        <ErrorNotice>{error}</ErrorNotice>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>Cancel</Button>
          <Button variant={destructive ? 'destructive' : 'default'} onClick={confirm} disabled={pending}>
            {pending ? pendingLabel : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
