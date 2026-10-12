'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineDetailSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api, ApiError } from '@/lib/api';
import type { FeedbackSubmission } from '@/lib/types';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { ArrowLeft, Download } from 'lucide-react';
import { storageGet } from '@/lib/safe-storage';

function fmtBytes(n?: number | null) {
  if (n == null) return '';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

export default function AdminFeedbackDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [row, setRow] = useState<FeedbackSubmission | null>(null);
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api.admin
      .feedbackGet(id)
      .then(setRow)
      .catch(() => toast.error('Failed to load submission'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const sendReply = async () => {
    if (!reply.trim()) return;
    setBusy(true);
    try {
      setRow(await api.admin.feedbackReply(id, reply.trim()));
      setReply('');
      toast.success('Reply sent');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Reply failed');
    } finally {
      setBusy(false);
    }
  };

  const setStatus = async (status: string) => {
    setBusy(true);
    try {
      setRow(await api.admin.feedbackStatus(id, status));
      toast.success('Status updated');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Update failed');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    toast.confirm('Delete this submission? It will be hidden from tenant and admin views.', async () => {
      setBusy(true);
      try {
        await api.admin.feedbackDelete(id);
        toast.success('Deleted');
        router.push('/admin/feedback');
      } catch (e) {
        toast.error(e instanceof ApiError ? e.message : 'Delete failed');
      } finally {
        setBusy(false);
      }
    });
  };

  const downloadAtt = async (attId: number, name: string) => {
    try {
      const token = storageGet('token')?.trim();
      const res = await fetch(api.admin.feedbackAttachmentUrl(attId), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('fail');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      toast.error('Download failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="space-y-4 p-4 md:p-6">
          <Button asChild variant="ghost" size="sm" className="-ms-2">
            <Link href="/admin/feedback">
              <ArrowLeft className="size-4 me-1" /> Back
            </Link>
          </Button>
          {loading || !row ? (
            <InlineDetailSkeleton />
          ) : (
            <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">
                      {row.reference} · {row.subject}
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3 text-sm">
                    <p className="whitespace-pre-wrap">{row.description}</p>
                    {row.diagnostic && (
                      <div className="rounded-md border bg-muted/30 p-3">
                        <p className="font-medium mb-1">Diagnostic details</p>
                        <pre className="text-xs overflow-x-auto whitespace-pre-wrap">{JSON.stringify(row.diagnostic, null, 2)}</pre>
                      </div>
                    )}
                    {row.attachments && row.attachments.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-medium">Attachments</p>
                        {row.attachments.map((a) => (
                          <button
                            key={a.id}
                            type="button"
                            className="flex items-center gap-2 text-sky-600 hover:underline"
                            onClick={() => downloadAtt(a.id, a.file_name)}
                          >
                            <Download className="size-3.5" />
                            {a.file_name}
                            {a.size_bytes != null ? ` · ${fmtBytes(a.size_bytes)}` : ''}
                          </button>
                        ))}
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Conversation</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {(row.messages || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No replies yet.</p>
                    ) : (
                      (row.messages || []).map((m) => (
                        <div key={m.id} className={`rounded-md border p-3 text-sm ${m.is_staff ? 'bg-muted/40' : ''}`}>
                          <p className="text-xs text-muted-foreground mb-1">
                            {m.is_staff ? 'Staff' : m.author_name || 'Tenant'} · {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                          </p>
                          <p className="whitespace-pre-wrap">{m.body}</p>
                        </div>
                      ))
                    )}
                    <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={4} placeholder="Reply to tenant…" />
                    <Button onClick={sendReply} disabled={busy || !reply.trim()}>
                      Send reply
                    </Button>
                  </CardContent>
                </Card>
              </div>

              <div className="space-y-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Tenant details</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    <p><span className="text-muted-foreground">Company:</span> {row.tenant?.company_name || row.company_name || '—'}</p>
                    <p><span className="text-muted-foreground">Tenant ID:</span> {row.tenant?.company_id || row.company_id}</p>
                    <p><span className="text-muted-foreground">Contact:</span> {row.tenant?.contact_person || '—'}</p>
                    <p><span className="text-muted-foreground">Email:</span> {row.tenant?.contact_email || row.submitted_by_email || '—'}</p>
                    <p><span className="text-muted-foreground">Phone:</span> {row.tenant?.contact_phone || '—'}</p>
                    <p><span className="text-muted-foreground">Submitted by:</span> {row.submitted_by || '—'}</p>
                    <p><span className="text-muted-foreground">Submitted:</span> {row.created_at ? new Date(row.created_at).toLocaleString() : '—'}</p>
                    <p><span className="text-muted-foreground">Category:</span> <span className="capitalize">{row.category.replace(/_/g, ' ')}</span></p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">Actions</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <Select value={row.status} onValueChange={setStatus} disabled={busy}>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="open">Open</SelectItem>
                        <SelectItem value="in_progress">In Progress</SelectItem>
                        <SelectItem value="closed">Closed</SelectItem>
                      </SelectContent>
                    </Select>
                    <Button variant="destructive" className="w-full" onClick={remove} disabled={busy}>
                      Delete
                    </Button>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
