'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { SupportTicket } from '@/lib/types';
import { toast } from '@/lib/toast';

const STATUSES = ['open', 'in_progress', 'escalated', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function AdminTicketDetailPage() {
  const { user } = useAuth();
  const params = useParams();
  const id = Number(params.id);
  const [ticket, setTicket] = useState<SupportTicket | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('');
  const [priority, setPriority] = useState('');
  const [assignee, setAssignee] = useState('');
  const [message, setMessage] = useState('');
  const [internal, setInternal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    api.admin
      .ticket(id)
      .then((t) => {
        setTicket(t);
        setStatus(t.status || 'open');
        setPriority(t.priority || 'medium');
        setAssignee(t.assigned_to_user_id != null ? String(t.assigned_to_user_id) : '');
      })
      .catch(() => toast.error('Failed to load ticket'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const saveMeta = async () => {
    if (!ticket) return;
    setSaving(true);
    try {
      const updated = await api.admin.patchTicket(ticket.id, {
        status,
        priority,
        assigned_to_user_id: assignee ? parseInt(assignee, 10) : null,
      });
      setTicket(updated);
      toast.success('Ticket updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSaving(false);
    }
  };

  const sendMessage = async () => {
    if (!ticket || !message.trim()) return;
    setSaving(true);
    try {
      const updated = await api.admin.addTicketMessage(ticket.id, {
        body: message.trim(),
        is_internal: internal,
      });
      setTicket(updated);
      setMessage('');
      toast.success('Message added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to add message');
    } finally {
      setSaving(false);
    }
  };

  const uploadAttachment = async (file: File) => {
    if (!ticket) return;
    setUploading(true);
    try {
      await api.admin.uploadTicketAttachment(ticket.id, file);
      toast.success('Attachment uploaded');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-4xl">
          <div className="flex justify-between items-center mb-6">
            <div>
              <Link href="/admin/tickets" className="text-sm text-muted-foreground hover:underline">← Tickets</Link>
              <h1 className="text-3xl font-bold mt-1">
                {loading ? 'Loading...' : ticket?.ticket_number ?? 'Ticket'}
              </h1>
              {ticket && <p className="text-muted-foreground mt-1">{ticket.subject}</p>}
            </div>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>

          {!loading && ticket && (
            <div className="space-y-6">
              <Card>
                <CardHeader><CardTitle>Details</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-3 gap-3 text-sm">
                    <div>
                      <p className="text-muted-foreground">Company</p>
                      <p className="font-medium">
                        {ticket.company_id ? (
                          <Link href={`/admin/companies/${ticket.company_id}`} className="text-primary hover:underline">
                            {ticket.company_name ?? `#${ticket.company_id}`}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">Assignee</p>
                      <p className="font-medium">{ticket.assigned_to_name ?? 'Unassigned'}</p>
                    </div>
                    <div>
                      <p className="text-muted-foreground">SLA</p>
                      <p className={ticket.sla_breached ? 'text-destructive font-medium' : 'font-medium'}>
                        {ticket.sla_breached ? 'Breached' : ticket.sla_due_at ? new Date(ticket.sla_due_at).toLocaleString() : '—'}
                      </p>
                    </div>
                  </div>
                  <div className="grid sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger className="mt-1 capitalize"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Priority</Label>
                      <Select value={priority} onValueChange={setPriority}>
                        <SelectTrigger className="mt-1 capitalize"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => (
                            <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label>Assign to user ID</Label>
                      <Input value={assignee} onChange={(e) => setAssignee(e.target.value)} className="mt-1" placeholder="User ID" />
                    </div>
                  </div>
                  <Button onClick={saveMeta} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Messages</CardTitle></CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-3 max-h-[420px] overflow-y-auto">
                    {(ticket.messages || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No messages yet.</p>
                    ) : (
                      (ticket.messages || []).map((m) => (
                        <div
                          key={m.id}
                          className={`rounded-md border p-3 text-sm ${m.is_internal ? 'bg-amber-50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800' : ''}`}
                        >
                          <div className="flex justify-between gap-2 mb-1">
                            <span className="font-medium">{m.author_name || m.author_email || 'Unknown'}</span>
                            <span className="text-xs text-muted-foreground">{new Date(m.created_at).toLocaleString()}</span>
                          </div>
                          {m.is_internal && <p className="text-xs text-amber-700 dark:text-amber-400 mb-1">Internal note</p>}
                          <p className="whitespace-pre-wrap">{m.body}</p>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="space-y-2 border-t pt-4">
                    <Label>Add message</Label>
                    <Textarea value={message} onChange={(e) => setMessage(e.target.value)} rows={3} />
                    <label className="flex items-center gap-2 text-sm">
                      <input type="checkbox" checked={internal} onChange={(e) => setInternal(e.target.checked)} className="rounded border" />
                      Internal note
                    </label>
                    <Button onClick={sendMessage} disabled={saving || !message.trim()}>
                      {saving ? 'Sending...' : 'Send'}
                    </Button>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Attachments</CardTitle></CardHeader>
                <CardContent className="space-y-3">
                  {(ticket.attachments || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No attachments.</p>
                  ) : (
                    <ul className="text-sm space-y-1">
                      {(ticket.attachments || []).map((a) => (
                        <li key={a.id} className="flex justify-between gap-2 border-b pb-1 last:border-0">
                          <span className="truncate">{a.file_name}</span>
                          <span className="text-xs text-muted-foreground whitespace-nowrap">
                            {a.size_bytes != null ? `${Math.round(a.size_bytes / 1024)} KB` : ''}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                  <div>
                    <Label>Upload file</Label>
                    <Input
                      type="file"
                      className="mt-1"
                      disabled={uploading}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void uploadAttachment(f);
                        e.target.value = '';
                      }}
                    />
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
