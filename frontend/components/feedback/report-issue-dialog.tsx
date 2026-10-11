'use client';

import { useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, ApiError } from '@/lib/api';
import { toast } from '@/lib/toast';
import { Paperclip, Trash2 } from 'lucide-react';

const ALLOWED = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
const MAX_TOTAL = 5 * 1024 * 1024;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function collectDiagnostics(extra?: Record<string, unknown> | null) {
  const nav = typeof navigator !== 'undefined' ? navigator : null;
  return {
    error_category: String(extra?.error_category || 'application_issue'),
    error_message: String(extra?.error_message || '').slice(0, 500),
    error_code: extra?.error_code ? String(extra.error_code).slice(0, 80) : undefined,
    module_or_page: String(extra?.module_or_page || (typeof window !== 'undefined' ? window.location.pathname : '')).slice(0, 200),
    occurred_at: new Date().toISOString(),
    browser: nav?.userAgent?.slice(0, 300),
    platform: nav?.platform?.slice(0, 80),
    language: nav?.language,
    app_version: process.env.NEXT_PUBLIC_APP_VERSION || undefined,
    correlation_id: String(extra?.correlation_id || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
  };
}

type Props = {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultCategory?: string;
  defaultSubject?: string;
  defaultDescription?: string;
  diagnosticExtras?: Record<string, unknown> | null;
};

export function ReportIssueDialog({
  open,
  onOpenChange,
  defaultCategory = 'technical_issue',
  defaultSubject = '',
  defaultDescription = '',
  diagnosticExtras,
}: Props) {
  const [subject, setSubject] = useState(defaultSubject);
  const [description, setDescription] = useState(defaultDescription);
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [includeDiag, setIncludeDiag] = useState(true);
  const diagnostic = useMemo(() => collectDiagnostics(diagnosticExtras), [diagnosticExtras]);
  const totalBytes = files.reduce((s, f) => s + f.size, 0);

  const onPick = (list: FileList | null) => {
    if (!list?.length) return;
    const next = [...files];
    for (const f of Array.from(list)) {
      const ext = f.name.split('.').pop()?.toLowerCase() || '';
      if (!ALLOWED.has(ext)) {
        toast.error(`Unsupported file type: ${f.name}`);
        continue;
      }
      next.push(f);
    }
    if (next.reduce((s, f) => s + f.size, 0) > MAX_TOTAL) {
      toast.error('Combined attachments must be 5 MB or less');
      return;
    }
    setFiles(next);
  };

  const submit = async () => {
    if (subject.trim().length < 3) {
      toast.error('Subject is required');
      return;
    }
    if (description.trim().length < 10) {
      toast.error('Please describe the issue');
      return;
    }
    setSaving(true);
    try {
      await api.feedback.create({
        category: defaultCategory === 'application_crash' ? 'application_crash' : 'technical_issue',
        subject: subject.trim(),
        description: description.trim(),
        diagnostic: includeDiag ? diagnostic : null,
        files,
      });
      toast.success('Issue reported to ControlOps');
      onOpenChange(false);
      setFiles([]);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (v) {
          setSubject(defaultSubject || 'Application issue');
          setDescription(defaultDescription);
          setIncludeDiag(true);
        }
        onOpenChange(v);
      }}
    >
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Report an issue to ControlOps</DialogTitle>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1">
            <Label>Subject</Label>
            <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={4} maxLength={20000} />
          </div>
          <div className="space-y-1">
            <Label>Screenshots / files (max 5 MB total)</Label>
            <Input
              type="file"
              multiple
              accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
              onChange={(e) => {
                onPick(e.target.files);
                e.target.value = '';
              }}
            />
            <p className="text-xs text-muted-foreground">{fmtBytes(totalBytes)} / 5 MB</p>
            {files.map((f, i) => (
              <div key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm rounded border px-2 py-1">
                <span className="truncate flex items-center gap-1">
                  <Paperclip className="size-3.5" />
                  {f.name} · {fmtBytes(f.size)}
                </span>
                <button type="button" onClick={() => setFiles((p) => p.filter((_, j) => j !== i))}>
                  <Trash2 className="size-3.5 text-muted-foreground" />
                </button>
              </div>
            ))}
          </div>
          <label className="flex items-start gap-2 text-sm">
            <input type="checkbox" className="mt-1" checked={includeDiag} onChange={(e) => setIncludeDiag(e.target.checked)} />
            <span>
              Include safe diagnostic details (page, browser, time, correlation ID). Passwords and tokens are never collected.
            </span>
          </label>
          {includeDiag && (
            <pre className="text-[11px] rounded-md border bg-muted/40 p-2 overflow-x-auto whitespace-pre-wrap">
              {JSON.stringify(diagnostic, null, 2)}
            </pre>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving ? 'Sending…' : 'Submit report'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
