'use client';

/**
 * One document: Details, Settings, and Read receipts & acceptance.
 *
 * The Details tab previews the file where the browser can render it and says so plainly
 * where it cannot — a Word file gets the download prompt rather than an empty frame. The
 * server decides which is which (`previewable`) so both cases are consistent.
 */

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { AlertCircle, Check, Download, FileWarning, Loader2 } from 'lucide-react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { InlineDetailSkeleton } from '@/components/skeletons';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { canModule } from '@/lib/permissions';
import { formatDateUK } from '@/lib/date-format';
import { toast } from '@/lib/toast';
import type { DocumentDetail, DocumentReceipt } from '@/lib/types';
import { useAuthBlobUrl } from '@/lib/use-auth-blob-url';
import { cn } from '@/lib/utils';

const TABS = [
  { id: 'details', label: 'Details' },
  { id: 'settings', label: 'Settings' },
  { id: 'receipts', label: 'Read receipts & acceptance' },
] as const;
type DocTab = (typeof TABS)[number]['id'];

function fileSize(bytes?: number | null) {
  if (bytes == null) return '—';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

function stamp(iso?: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return `${d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: '2-digit' })}, ${d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' })}`;
}

function InfoRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b px-4 py-2.5 text-sm last:border-b-0">
      <span className="font-medium">{label}</span>
      <span className="min-w-0 truncate text-right text-muted-foreground">{children}</span>
    </div>
  );
}

export default function DocumentDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? parseInt(params.id, 10) : NaN;
  const { user } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<DocTab>('details');
  const [receipts, setReceipts] = useState<DocumentReceipt[]>([]);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [settings, setSettings] = useState({
    document_type: '',
    folder: '',
    expiry_date: '',
    follow_up_date: '',
    visible_to_employee: true,
    requires_acceptance: false,
  });

  const canEdit = canModule(user, 'documents', 'create');
  const canDownload = canModule(user, 'documents', 'download');
  // Only previewable types are fetched — asking for a Word file would download bytes the
  // page can do nothing with.
  const previewSrc = useAuthBlobUrl(doc?.previewable && canDownload ? `/documents/${id}/preview` : undefined);

  const load = useCallback(() => {
    if (!id || Number.isNaN(id)) return;
    setLoading(true);
    api.documents
      .detail(id)
      .then((d) => {
        setDoc(d);
        setSettings({
          document_type: d.document_type ?? '',
          folder: d.folder ?? '',
          expiry_date: d.expiry_date ?? '',
          follow_up_date: d.follow_up_date ?? '',
          visible_to_employee: d.visible_to_employee,
          requires_acceptance: d.requires_acceptance,
        });
      })
      .catch(() => setDoc(null))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Opening the document is what a read receipt records, so it is stamped on first view
  // rather than behind a button nobody would press.
  useEffect(() => {
    if (!doc) return;
    api.documents.recordReceipt(doc.id).catch(() => {});
  }, [doc]);

  useEffect(() => {
    if (tab !== 'receipts' || !doc) return;
    setReceiptsLoading(true);
    api.documents
      .receipts(doc.id)
      .then(setReceipts)
      .catch(() => setReceipts([]))
      .finally(() => setReceiptsLoading(false));
  }, [tab, doc]);

  const download = async () => {
    if (!doc) return;
    try {
      const blob = await api.documents.download(doc.id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = doc.file_name || `document-${doc.id}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const saveSettings = async () => {
    if (!doc) return;
    setSaving(true);
    try {
      const updated = await api.documents.updateSettings(doc.id, {
        document_type: settings.document_type.trim() || undefined,
        folder: settings.folder.trim() || null,
        expiry_date: settings.expiry_date || null,
        follow_up_date: settings.follow_up_date || null,
        visible_to_employee: settings.visible_to_employee,
        requires_acceptance: settings.requires_acceptance,
      });
      setDoc(updated);
      toast.success('Document settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto space-y-5 px-4 py-8">
          <h1 className="text-2xl font-bold">Documents</h1>
          <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
            <Link href="/documents" className="text-primary hover:underline">
              All folders
            </Link>
            {doc ? (
              <>
                <span>/</span>
                <Link href={`/guards/${doc.guard_id}?tab=documents`} className="text-primary hover:underline">
                  {doc.guard_name ?? `Employee #${doc.guard_id}`}
                </Link>
                {doc.folder ? (
                  <>
                    <span>/</span>
                    <span className="text-primary">{doc.folder}</span>
                  </>
                ) : null}
                <span>/</span>
                <span className="font-medium text-foreground">{doc.file_name || doc.document_type}</span>
              </>
            ) : null}
          </div>

          {loading ? (
            <InlineDetailSkeleton />
          ) : !doc ? (
            <div className="py-12 text-center text-muted-foreground">Document not found.</div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1 border-b">
                {TABS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setTab(t.id)}
                    className={cn(
                      '-mb-px border-b-2 px-4 py-2.5 text-sm font-medium transition-colors',
                      tab === t.id
                        ? 'border-primary text-primary'
                        : 'border-transparent text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t.label}
                  </button>
                ))}
              </div>

              {tab === 'details' ? (
                <div className="grid gap-4 lg:grid-cols-2">
                  <div className="space-y-2">
                    <Card>
                      <CardContent className="flex min-h-[280px] items-center justify-center p-4">
                        {!canDownload ? (
                          <p className="text-center text-sm text-muted-foreground">
                            You do not have permission to view this file.
                          </p>
                        ) : doc.previewable ? (
                          previewSrc ? (
                            doc.mime_type.startsWith('image/') ? (
                              <img src={previewSrc} alt="" className="max-h-[420px] w-full object-contain" />
                            ) : (
                              <iframe
                                src={previewSrc}
                                title={doc.file_name || 'Document preview'}
                                className="h-[420px] w-full rounded border"
                              />
                            )
                          ) : (
                            <p className="flex items-center gap-2 text-sm text-muted-foreground">
                              <Loader2 className="size-4 animate-spin" /> Loading preview…
                            </p>
                          )
                        ) : (
                          <div className="space-y-2 text-center">
                            <FileWarning className="mx-auto size-10 text-muted-foreground" />
                            <p className="text-sm font-medium">Preview unavailable for this file type.</p>
                            <p className="text-xs text-muted-foreground">
                              Please download it to view the contents.
                            </p>
                          </div>
                        )}
                      </CardContent>
                    </Card>
                    <Button className="w-full" onClick={() => void download()} disabled={!canDownload}>
                      <Download className="mr-1.5 size-4" />
                      Download document
                    </Button>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <p className="border-b px-4 py-2.5 text-sm font-semibold">Information</p>
                      <InfoRow label="Filename">
                        <button
                          type="button"
                          onClick={() => void download()}
                          className="text-primary hover:underline disabled:no-underline"
                          disabled={!canDownload}
                        >
                          {doc.file_name || '—'}
                        </button>
                      </InfoRow>
                      <InfoRow label="File Type">{doc.file_type}</InfoRow>
                      <InfoRow label="Size">{fileSize(doc.file_size)}</InfoRow>
                      <InfoRow label="Date created">{stamp(doc.created_at)}</InfoRow>
                      <InfoRow label="Uploaded by">{doc.uploaded_by ?? '—'}</InfoRow>
                      <InfoRow label="Follow up date">
                        {doc.follow_up_date ? (
                          formatDateUK(doc.follow_up_date)
                        ) : (
                          <button
                            type="button"
                            className="text-primary hover:underline"
                            onClick={() => setTab('settings')}
                          >
                            Not set
                          </button>
                        )}
                      </InfoRow>
                      <InfoRow label="Expiry date">
                        {doc.expiry_date ? formatDateUK(doc.expiry_date) : 'Not set'}
                      </InfoRow>
                      <InfoRow label="Document type">{doc.document_type}</InfoRow>
                    </CardContent>
                  </Card>
                </div>
              ) : tab === 'settings' ? (
                <Card>
                  <CardContent className="space-y-4 p-4">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="space-y-1">
                        <Label>Document type</Label>
                        <Input
                          value={settings.document_type}
                          onChange={(e) => setSettings((p) => ({ ...p, document_type: e.target.value }))}
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Folder</Label>
                        <Input
                          value={settings.folder}
                          onChange={(e) => setSettings((p) => ({ ...p, folder: e.target.value }))}
                          placeholder="Unfiled"
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Expiry date</Label>
                        <Input
                          type="date"
                          value={settings.expiry_date}
                          onChange={(e) => setSettings((p) => ({ ...p, expiry_date: e.target.value }))}
                          disabled={!canEdit}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Follow-up date</Label>
                        <Input
                          type="date"
                          value={settings.follow_up_date}
                          onChange={(e) => setSettings((p) => ({ ...p, follow_up_date: e.target.value }))}
                          disabled={!canEdit}
                        />
                        <p className="text-xs text-muted-foreground">
                          When to chase this again — a contract to re-sign, a certificate to renew.
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2 border-t pt-3">
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={settings.visible_to_employee}
                          onChange={(e) => setSettings((p) => ({ ...p, visible_to_employee: e.target.checked }))}
                          disabled={!canEdit}
                        />
                        Visible to the employee in their portal
                      </label>
                      <label className="flex cursor-pointer items-center gap-2 text-sm">
                        <input
                          type="checkbox"
                          className="size-4 rounded border-input"
                          checked={settings.requires_acceptance}
                          onChange={(e) => setSettings((p) => ({ ...p, requires_acceptance: e.target.checked }))}
                          disabled={!canEdit}
                        />
                        Require the employee to accept it
                      </label>
                      {settings.requires_acceptance && !settings.visible_to_employee ? (
                        <p className="flex items-start gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/30 dark:text-amber-200">
                          <AlertCircle className="mt-0.5 size-3.5 shrink-0" />
                          Nobody can accept a document they cannot see. Turn visibility on, or drop
                          the acceptance requirement.
                        </p>
                      ) : null}
                    </div>

                    {canEdit ? (
                      <div className="flex justify-end border-t pt-3">
                        <Button onClick={() => void saveSettings()} disabled={saving}>
                          {saving ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
                          Save settings
                        </Button>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="p-0">
                    <div className="flex items-center justify-between border-b px-4 py-2.5">
                      <p className="text-sm font-semibold">Read receipts &amp; acceptance</p>
                      <p className="text-xs text-muted-foreground">
                        {doc.requires_acceptance ? 'Acceptance required' : 'Acceptance not required'}
                      </p>
                    </div>
                    {receiptsLoading ? (
                      <p className="flex items-center gap-2 p-6 text-sm text-muted-foreground">
                        <Loader2 className="size-4 animate-spin" /> Loading receipts…
                      </p>
                    ) : receipts.length === 0 ? (
                      <p className="p-8 text-center text-sm text-muted-foreground">
                        Nobody has this document in their portal yet. Give the employee a login to
                        track who has read it.
                      </p>
                    ) : (
                      <div className="divide-y">
                        {receipts.map((r) => (
                          <div key={r.user_id} className="flex flex-wrap items-center gap-3 px-4 py-2.5 text-sm">
                            <span className="min-w-0 flex-1 truncate font-medium">{r.name ?? r.email}</span>
                            <span className="text-xs text-muted-foreground">
                              {r.read_at ? `Read ${stamp(r.read_at)}` : 'Not read yet'}
                            </span>
                            {doc.requires_acceptance ? (
                              r.accepted_at ? (
                                <span className="flex items-center gap-1 rounded-full bg-green-100 px-2 py-0.5 text-[11px] font-medium text-green-800 dark:bg-green-900/30 dark:text-green-300">
                                  <Check className="size-3" />
                                  Accepted {stamp(r.accepted_at)}
                                </span>
                              ) : (
                                <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-medium text-amber-900 dark:bg-amber-900/40 dark:text-amber-200">
                                  Not accepted
                                </span>
                              )
                            ) : null}
                          </div>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
