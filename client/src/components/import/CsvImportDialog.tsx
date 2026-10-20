import { useEffect, useId, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { ErrorNotice, errorMessage } from '@/components/ui/notice';

export interface ImportReport {
  total_rows: number;
  created: number;
  skipped: number;
  failed: number;
  errors: { row: number; message: string }[];
}

interface CsvImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  templateFilename: string;
  templateCsv: string;
  onImport: (file: File) => Promise<ImportReport>;
}

export function CsvImportDialog({
  open,
  onOpenChange,
  title,
  description,
  templateFilename,
  templateCsv,
  onImport,
}: CsvImportDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const [report, setReport] = useState<ImportReport | null>(null);
  const [error, setError] = useState('');
  const [isImporting, setIsImporting] = useState(false);

  const fileInputId = useId();
  const [templateUrl, setTemplateUrl] = useState('');

  useEffect(() => {
    const url = URL.createObjectURL(new Blob([templateCsv], { type: 'text/csv;charset=utf-8' }));
    setTemplateUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [templateCsv]);

  const handleImport = async () => {
    if (!file) {
      setError('Choose a CSV file first.');
      return;
    }
    setError('');
    setReport(null);
    setIsImporting(true);
    try {
      const result = await onImport(file);
      setReport(result);
      setFile(null);
    } catch (err) {
      setError(errorMessage(err, 'The import failed. Check the file matches the template and try again.'));
    } finally {
      setIsImporting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <a
            href={templateUrl}
            download={templateFilename}
            className="inline-flex h-9 items-center gap-2 rounded-lg border border-border bg-background px-3 text-sm font-medium hover:bg-accent"
          >
            <Download className="h-4 w-4" strokeWidth={1.7} />
            Download template
          </a>

          <div className="rounded-lg border border-dashed border-border p-4">
            <label htmlFor={fileInputId} className="block text-sm font-medium">CSV file</label>
            <input
              id={fileInputId}
              type="file"
              accept=".csv,text/csv"
              onChange={(event) => {
                setFile(event.target.files?.[0] ?? null);
                setReport(null);
                setError('');
              }}
              className="mt-2 block w-full text-sm file:mr-3 file:rounded-lg file:border-0 file:bg-primary file:px-3 file:py-2 file:text-sm file:font-medium file:text-primary-foreground hover:file:opacity-90"
            />
            {file && <p className="mt-2 text-xs text-muted-foreground">{file.name}</p>}
          </div>

          <ErrorNotice>{error}</ErrorNotice>

          {report && (
            <div role="status" className="rounded-lg border border-border bg-muted/30 p-3">
              <p className="sr-only">
                Import finished: {report.created} created, {report.skipped} skipped, {report.failed} failed.
              </p>
              <div aria-hidden="true" className="grid grid-cols-4 gap-2 text-center text-sm">
                <div>
                  <p className="font-semibold tabular-nums">{report.total_rows}</p>
                  <p className="text-xs text-muted-foreground">Rows</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-success-text)] tabular-nums">{report.created}</p>
                  <p className="text-xs text-muted-foreground">Created</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-warning-text)] tabular-nums">{report.skipped}</p>
                  <p className="text-xs text-muted-foreground">Skipped</p>
                </div>
                <div>
                  <p className="font-semibold text-[var(--color-danger-text)] tabular-nums">{report.failed}</p>
                  <p className="text-xs text-muted-foreground">Failed</p>
                </div>
              </div>
              {report.errors.length > 0 && (
                <div className="mt-3 max-h-40 overflow-auto rounded-md bg-background p-2 text-xs text-muted-foreground">
                  {report.errors.slice(0, 20).map((item, index) => (
                    <p key={`${item.row}-${index}`}>Row {item.row}: {item.message}</p>
                  ))}
                  {report.errors.length > 20 && <p>…and {report.errors.length - 20} more</p>}
                </div>
              )}
            </div>
          )}

          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isImporting}>
              Close
            </Button>
            <Button onClick={handleImport} disabled={isImporting}>
              <Upload className="h-4 w-4" strokeWidth={1.7} />
              {isImporting ? 'Importing…' : 'Import CSV'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
