'use client';

import { useMemo, useState } from 'react';
import { Download, Upload } from 'lucide-react';
import { toast } from 'sonner';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';

export type BulkModule = 'sites' | 'guards' | 'clients' | 'contractors' | 'sub_contractors';

type Preview = Awaited<ReturnType<typeof api.bulk.previewImport>>;
type Summary = Awaited<ReturnType<typeof api.bulk.commitImport>>;

function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function statusTone(status: string) {
  if (status === 'valid' || status === 'created' || status === 'update' || status === 'updated') return 'default' as const;
  if (status === 'duplicate' || status === 'skipped') return 'secondary' as const;
  return 'destructive' as const;
}

export function BulkExportButton({
  module,
  label,
  buttonLabel,
  filteredIds,
  selectedIds,
  canExport,
}: {
  module: BulkModule;
  label: string;
  buttonLabel?: string;
  filteredIds?: Array<string | number>;
  selectedIds?: Array<string | number>;
  canExport: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [format, setFormat] = useState<'xlsx' | 'csv'>('xlsx');
  const [scope, setScope] = useState<'all' | 'filtered' | 'selected'>('all');
  const [busy, setBusy] = useState(false);

  if (!canExport) return null;

  const run = async () => {
    setBusy(true);
    try {
      let ids: Array<string | number> | undefined;
      if (scope === 'selected') {
        if (!selectedIds?.length) {
          toast.warning('No rows selected');
          return;
        }
        ids = selectedIds;
      } else if (scope === 'filtered') {
        if (!filteredIds?.length) {
          toast.warning('No filtered rows to export');
          return;
        }
        ids = filteredIds;
      }
      const blob = await api.bulk.export(module, { format, ids });
      saveBlob(blob, `${module}-export.${format}`);
      toast.success(`${label} exported`);
      setOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" type="button">
          <Download className="size-4 mr-2" />
          {buttonLabel || 'Export'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Export {label}</DialogTitle>
          <DialogDescription>
            Download Excel or CSV. Choose all records, the current filter, or selected rows.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Scope</Label>
            <div className="flex flex-col gap-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name={`export-scope-${module}`} checked={scope === 'all'} onChange={() => setScope('all')} />
                All records
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`export-scope-${module}`}
                  checked={scope === 'filtered'}
                  onChange={() => setScope('filtered')}
                  disabled={!filteredIds?.length}
                />
                Current filter ({filteredIds?.length ?? 0})
              </label>
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name={`export-scope-${module}`}
                  checked={scope === 'selected'}
                  onChange={() => setScope('selected')}
                  disabled={!selectedIds?.length}
                />
                Selected ({selectedIds?.length ?? 0})
              </label>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Format</Label>
            <div className="flex gap-2">
              <Button type="button" size="sm" variant={format === 'xlsx' ? 'default' : 'outline'} onClick={() => setFormat('xlsx')}>
                Excel (.xlsx)
              </Button>
              <Button type="button" size="sm" variant={format === 'csv' ? 'default' : 'outline'} onClick={() => setFormat('csv')}>
                CSV
              </Button>
            </div>
          </div>
          <Button type="button" onClick={run} disabled={busy} className="w-full">
            {busy ? 'Exporting…' : 'Download'}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function BulkImportButton({
  module,
  label,
  buttonLabel,
  canImport,
  canUpdate,
  onDone,
}: {
  module: BulkModule;
  label: string;
  buttonLabel?: string;
  canImport: boolean;
  canUpdate: boolean;
  onDone?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [updateExisting, setUpdateExisting] = useState(false);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setFile(null);
    setPreview(null);
    setSummary(null);
    setUpdateExisting(false);
  };

  const downloadTemplate = async (format: 'xlsx' | 'csv') => {
    try {
      const blob = await api.bulk.template(module, format);
      saveBlob(blob, `${module}-import-template.${format}`);
    } catch (e: any) {
      toast.error(e?.message || 'Template download failed');
    }
  };

  const runPreview = async () => {
    if (!file) {
      toast.warning('Choose a file first');
      return;
    }
    setBusy(true);
    setSummary(null);
    try {
      const p = await api.bulk.previewImport(module, file, updateExisting && canUpdate);
      setPreview(p);
    } catch (e: any) {
      toast.error(e?.message || 'Preview failed');
    } finally {
      setBusy(false);
    }
  };

  const runImport = async () => {
    if (!file || !preview) return;
    if (preview.valid < 1) {
      toast.warning('No valid rows to import');
      return;
    }
    setBusy(true);
    try {
      const s = await api.bulk.commitImport(module, file, updateExisting && canUpdate);
      setSummary(s);
      toast.success(
        `Import complete: ${s.created} created, ${s.updated} updated, ${s.skipped} skipped, ${s.failed} failed`
      );
      onDone?.();
    } catch (e: any) {
      toast.error(e?.message || 'Import failed');
    } finally {
      setBusy(false);
    }
  };

  const previewRows = useMemo(() => preview?.rows?.slice(0, 100) || [], [preview]);

  if (!canImport) return null;

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        setOpen(v);
        if (!v) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" type="button">
          <Upload className="size-4 mr-2" />
          {buttonLabel || 'Import'}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-hidden flex flex-col">
        <DialogHeader className="shrink-0">
          <DialogTitle>Import {label}</DialogTitle>
          <DialogDescription>
            Upload CSV or Excel. Preview validates every row before anything is written.
            Existing records are never changed unless you enable updates.
          </DialogDescription>
        </DialogHeader>
        <div className="min-w-0 flex-1 overflow-y-auto space-y-4 pr-1">
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => downloadTemplate('xlsx')}>
              Download Excel template
            </Button>
            <Button type="button" variant="secondary" size="sm" onClick={() => downloadTemplate('csv')}>
              Download CSV template
            </Button>
          </div>

          <div className="space-y-2">
            <Label htmlFor={`bulk-file-${module}`}>File</Label>
            <input
              id={`bulk-file-${module}`}
              type="file"
              accept=".csv,.xlsx,.xlsm,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setPreview(null);
                setSummary(null);
              }}
              className="block w-full text-sm"
            />
          </div>

          {canUpdate ? (
            <label className="flex items-start gap-2 text-sm">
              <input
                type="checkbox"
                className="mt-1"
                checked={updateExisting}
                onChange={(e) => {
                  setUpdateExisting(e.target.checked);
                  setPreview(null);
                  setSummary(null);
                }}
              />
              <span>
                Update existing records when a match is found. Off by default — duplicates are skipped
                and existing data is left unchanged.
              </span>
            </label>
          ) : null}

          <div className="flex flex-wrap gap-2">
            <Button type="button" onClick={runPreview} disabled={busy || !file}>
              {busy && !summary ? 'Validating…' : 'Validate & preview'}
            </Button>
            <Button type="button" onClick={runImport} disabled={busy || !preview || preview.valid < 1 || !!summary}>
              {busy && preview ? 'Importing…' : `Import ${preview?.valid ?? 0} valid row(s)`}
            </Button>
          </div>

          {preview ? (
            <div className="space-y-3 rounded-md border p-3 text-sm">
              <p className="text-muted-foreground">{preview.policy}</p>
              <div className="flex flex-wrap gap-2">
                <Badge variant="outline">Total {preview.total}</Badge>
                <Badge>Valid {preview.valid}</Badge>
                <Badge variant="secondary">Duplicates {preview.duplicate}</Badge>
                <Badge variant="destructive">Invalid {preview.invalid}</Badge>
              </div>
              <div className="max-h-56 overflow-auto rounded border">
                <table className="w-full text-left text-xs">
                  <thead className="sticky top-0 bg-muted">
                    <tr>
                      <th className="p-2">Row</th>
                      <th className="p-2">Status</th>
                      <th className="p-2">Errors</th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.map((r) => (
                      <tr key={r.row} className="border-t align-top">
                        <td className="p-2">{r.row}</td>
                        <td className="p-2">
                          <Badge variant={statusTone(r.status)}>{r.status}</Badge>
                        </td>
                        <td className="p-2 text-muted-foreground">{r.errors?.join('; ') || '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {preview.rows.length > 100 ? (
                <p className="text-xs text-muted-foreground">Showing first 100 of {preview.rows.length} rows.</p>
              ) : null}
            </div>
          ) : null}

          {summary ? (
            <div className="space-y-2 rounded-md border border-primary/30 bg-muted/40 p-3 text-sm">
              <p className="font-medium">Import summary</p>
              <div className="flex flex-wrap gap-2">
                <Badge>Created {summary.created}</Badge>
                <Badge variant="secondary">Updated {summary.updated}</Badge>
                <Badge variant="outline">Skipped {summary.skipped}</Badge>
                <Badge variant="destructive">Failed {summary.failed}</Badge>
              </div>
            </div>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
