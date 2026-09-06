'use client';

/**
 * Employee Profile → Documents.
 *
 * The employee's own files, grouped by folder. Each row opens the document screen, where
 * the Details / Settings / Read receipts tabs live.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { FileText, FolderOpen, Loader2, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { formatDateUK } from '@/lib/date-format';
import { toast } from '@/lib/toast';
import type { GuardDocument } from '@/lib/types';

const UNFILED = 'Unfiled';

export function DocumentsTab({
  guardId,
  canUpload,
  canDelete,
}: {
  guardId: number;
  canUpload: boolean;
  canDelete: boolean;
}) {
  const [docs, setDocs] = useState<GuardDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [files, setFiles] = useState<FileList | null>(null);
  const [docType, setDocType] = useState('');
  const [folder, setFolder] = useState('');
  const [expiry, setExpiry] = useState('');
  const [followUp, setFollowUp] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.documents
      .list(guardId)
      .then(setDocs)
      .catch(() => setDocs([]))
      .finally(() => setLoading(false));
  }, [guardId]);

  useEffect(() => {
    load();
  }, [load]);

  const byFolder = useMemo(() => {
    const m = new Map<string, GuardDocument[]>();
    for (const d of docs) {
      const key = (d as GuardDocument & { folder?: string | null }).folder || UNFILED;
      m.set(key, [...(m.get(key) ?? []), d]);
    }
    return [...m.entries()].sort(([a], [b]) => (a === UNFILED ? 1 : b === UNFILED ? -1 : a.localeCompare(b)));
  }, [docs]);

  const upload = async () => {
    if (!files?.length || !docType.trim()) return;
    setBusy(true);
    try {
      await api.documents.upload(guardId, docType.trim(), Array.from(files), expiry || undefined, {
        folder: folder.trim() || undefined,
        follow_up_date: followUp || undefined,
      });
      setUploadOpen(false);
      setFiles(null);
      setDocType('');
      setFolder('');
      setExpiry('');
      setFollowUp('');
      load();
      toast.success('Document uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = (d: GuardDocument) => {
    toast.confirm(
      `Delete "${d.file_name || d.document_type}"?`,
      async () => {
        try {
          await api.documents.delete(d.id);
          load();
          toast.success('Document deleted');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        }
      },
      { label: 'Delete', description: 'The file is removed permanently.' }
    );
  };

  return (
    <div className="space-y-4">
      {canUpload ? (
        <Button onClick={() => setUploadOpen(true)}>
          <Upload className="mr-1.5 size-4" />
          Upload document
        </Button>
      ) : null}

      {loading ? (
        <p className="flex items-center gap-2 py-10 text-sm text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Loading documents…
        </p>
      ) : docs.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          No documents for this employee yet.
        </p>
      ) : (
        byFolder.map(([name, items]) => (
          <Card key={name}>
            <CardContent className="p-0">
              <div className="flex items-center gap-2 border-b bg-muted/40 px-4 py-2 text-sm font-medium">
                <FolderOpen className="size-4" />
                {name}
                <span className="font-normal text-muted-foreground">({items.length})</span>
              </div>
              <div className="divide-y">
                {items.map((d) => (
                  <div key={d.id} className="flex items-center gap-3 px-4 py-2.5">
                    <FileText className="size-4 shrink-0 text-muted-foreground" />
                    <Link href={`/documents/${d.id}`} className="min-w-0 flex-1 truncate text-sm hover:underline">
                      {d.file_name || d.document_type}
                    </Link>
                    <span className="hidden shrink-0 text-xs text-muted-foreground sm:block">
                      {d.document_type}
                    </span>
                    {d.expiry_date ? (
                      <span className="shrink-0 text-xs text-muted-foreground">
                        Expires {formatDateUK(d.expiry_date)}
                      </span>
                    ) : null}
                    {canDelete ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8 shrink-0 text-destructive hover:text-destructive"
                        onClick={() => remove(d)}
                        title="Delete document"
                      >
                        <Trash2 className="size-4" />
                      </Button>
                    ) : null}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ))
      )}

      <Dialog open={uploadOpen} onOpenChange={(v) => (!v && !busy ? setUploadOpen(false) : undefined)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Upload document</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label>
                Document type <span className="text-destructive">*</span>
              </Label>
              <Input value={docType} onChange={(e) => setDocType(e.target.value)} placeholder="Contract, SIA badge…" />
            </div>
            <div className="space-y-1">
              <Label>Folder</Label>
              <Input value={folder} onChange={(e) => setFolder(e.target.value)} placeholder="Optional" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label>Expiry date</Label>
                <Input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Follow-up date</Label>
                <Input type="date" value={followUp} onChange={(e) => setFollowUp(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>
                File <span className="text-destructive">*</span>
              </Label>
              <Input type="file" multiple onChange={(e) => setFiles(e.target.files)} />
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setUploadOpen(false)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void upload()} disabled={busy || !files?.length || !docType.trim()}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Upload
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
