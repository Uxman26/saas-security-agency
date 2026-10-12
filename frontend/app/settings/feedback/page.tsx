'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleGuard } from '@/components/module-guard';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api, ApiError } from '@/lib/api';
import type { FeedbackSubmission } from '@/lib/types';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { Paperclip, Plus, Trash2, Download } from 'lucide-react';
import { storageGet } from '@/lib/safe-storage';

const CATEGORIES = [
  { value: 'suggestion', label: 'Suggestion' },
  { value: 'complaint', label: 'Complaint' },
  { value: 'technical_issue', label: 'Technical Issue' },
  { value: 'application_crash', label: 'Application Crash' },
  { value: 'other', label: 'Other' },
];

const ALLOWED = new Set(['pdf', 'jpg', 'jpeg', 'png', 'webp']);
const MAX_TOTAL = 5 * 1024 * 1024;

function fmtBytes(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(2)} MB`;
}

function statusLabel(s: string) {
  if (s === 'in_progress') return 'In Progress';
  if (s === 'closed') return 'Closed';
  return 'Open';
}

export default function FeedbackPage() {
  const { user } = useAuth();
  const canCreate = canModule(user, 'feedback', 'create');
  const [rows, setRows] = useState<FeedbackSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<FeedbackSubmission | null>(null);
  const [category, setCategory] = useState('suggestion');
  const [subject, setSubject] = useState('');
  const [description, setDescription] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [reply, setReply] = useState('');
  const [replying, setReplying] = useState(false);

  const totalBytes = useMemo(() => files.reduce((s, f) => s + f.size, 0), [files]);

  const load = useCallback(() => {
    setLoading(true);
    api.feedback
      .list()
      .then(setRows)
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const onPickFiles = (list: FileList | null) => {
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
    const sum = next.reduce((s, f) => s + f.size, 0);
    if (sum > MAX_TOTAL) {
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
      toast.error('Please provide a more detailed description');
      return;
    }
    if (totalBytes > MAX_TOTAL) {
      toast.error('Combined attachments must be 5 MB or less');
      return;
    }
    setSaving(true);
    try {
      const created = await api.feedback.create({ category, subject: subject.trim(), description: description.trim(), files });
      toast.success('Submitted successfully');
      setOpen(false);
      setSubject('');
      setDescription('');
      setFiles([]);
      setCategory('suggestion');
      load();
      setDetail(created);
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Submit failed');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      setDetail(await api.feedback.get(id));
      setReply('');
    } catch {
      toast.error('Failed to open submission');
    }
  };

  const sendReply = async () => {
    if (!detail || !reply.trim()) return;
    setReplying(true);
    try {
      const updated = await api.feedback.reply(detail.id, reply.trim());
      setDetail(updated);
      setReply('');
      load();
      toast.success('Reply sent');
    } catch (e) {
      toast.error(e instanceof ApiError ? e.message : 'Reply failed');
    } finally {
      setReplying(false);
    }
  };

  const downloadAtt = async (id: number, name: string) => {
    try {
      const token = storageGet('token')?.trim();
      const res = await fetch(api.feedback.attachmentUrl(id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
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
      <ModuleGuard moduleKey="feedback">
        <AppShell>
          <ModulePage>
            <ModuleHeader
              title="Suggestions & Complaints"
              description="Send suggestions, complaints, and technical issues to ControlOps support."
              actions={
                canCreate ? (
                  <Button onClick={() => setOpen(true)}>
                    <Plus className="size-4 me-1" /> New submission
                  </Button>
                ) : null
              }
            />

            <Card>
              <CardHeader>
                <CardTitle className="text-base">Your submissions</CardTitle>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <p className="text-sm text-muted-foreground">Loading…</p>
                ) : rows.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No submissions yet. Use New submission to contact ControlOps.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>ID</TableHead>
                        <TableHead>Category</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Submitted</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                          <TableCell className="capitalize">{r.category.replace(/_/g, ' ')}</TableCell>
                          <TableCell>{r.subject}</TableCell>
                          <TableCell>{statusLabel(r.status)}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => openDetail(r.id)}>
                              View
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </ModulePage>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New suggestion / complaint</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Category</Label>
                  <Select value={category} onValueChange={setCategory}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {CATEGORIES.map((c) => (
                        <SelectItem key={c.value} value={c.value}>
                          {c.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Subject</Label>
                  <Input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={200} />
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={5} maxLength={20000} />
                </div>
                <div className="space-y-1">
                  <Label>Attachments (PDF, JPG, PNG, WEBP — max 5 MB total)</Label>
                  <Input
                    type="file"
                    multiple
                    accept=".pdf,.jpg,.jpeg,.png,.webp,application/pdf,image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      onPickFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                  <p className="text-xs text-muted-foreground">Selected: {fmtBytes(totalBytes)} / 5 MB</p>
                  {files.length > 0 && (
                    <ul className="space-y-1">
                      {files.map((f, i) => (
                        <li key={`${f.name}-${i}`} className="flex items-center justify-between gap-2 text-sm rounded border px-2 py-1">
                          <span className="truncate flex items-center gap-1">
                            <Paperclip className="size-3.5 shrink-0" />
                            {f.name} · {fmtBytes(f.size)}
                          </span>
                          <button type="button" className="text-muted-foreground hover:text-destructive" onClick={() => setFiles((prev) => prev.filter((_, j) => j !== i))}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={submit} disabled={saving}>
                  {saving ? 'Submitting…' : 'Submit'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!detail} onOpenChange={(v) => !v && setDetail(null)}>
            <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
              {detail && (
                <>
                  <DialogHeader>
                    <DialogTitle>
                      {detail.reference} · {detail.subject}
                    </DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 text-sm">
                    <div className="flex flex-wrap gap-3 text-muted-foreground">
                      <span className="capitalize">{detail.category.replace(/_/g, ' ')}</span>
                      <span>{statusLabel(detail.status)}</span>
                      <span>{detail.created_at ? new Date(detail.created_at).toLocaleString() : ''}</span>
                    </div>
                    <p className="whitespace-pre-wrap">{detail.description}</p>
                    {detail.attachments && detail.attachments.length > 0 && (
                      <div className="space-y-1">
                        <p className="font-medium">Attachments</p>
                        {detail.attachments.map((a) => (
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
                    <div className="space-y-2 border-t pt-3">
                      <p className="font-medium">Conversation</p>
                      {(detail.messages || []).length === 0 ? (
                        <p className="text-muted-foreground">No replies yet.</p>
                      ) : (
                        (detail.messages || []).map((m) => (
                          <div key={m.id} className={`rounded-md border p-2 ${m.is_staff ? 'bg-muted/40' : ''}`}>
                            <p className="text-xs text-muted-foreground mb-1">
                              {m.is_staff ? 'ControlOps' : m.author_name || 'You'} · {m.created_at ? new Date(m.created_at).toLocaleString() : ''}
                            </p>
                            <p className="whitespace-pre-wrap">{m.body}</p>
                          </div>
                        ))
                      )}
                      {detail.status !== 'closed' && canCreate && (
                        <div className="space-y-2 pt-2">
                          <Textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={3} placeholder="Write a reply…" />
                          <Button size="sm" onClick={sendReply} disabled={replying || !reply.trim()}>
                            {replying ? 'Sending…' : 'Send reply'}
                          </Button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground">
                      Prefer help docs? <Link href="/help" className="underline">Visit Help</Link>
                    </p>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </AppShell>
      </ModuleGuard>
    </ProtectedRoute>
  );
}
