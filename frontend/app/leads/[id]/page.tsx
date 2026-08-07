'use client';

import { use, useRef, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineDetailSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { useLeadStatuses } from '@/hooks/use-leads';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import { ArrowLeft, FileUp, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const CONVERT_TYPES = [
  { id: 'customer', label: 'Customer (Client)' },
  { id: 'opportunity', label: 'Opportunity' },
  { id: 'project', label: 'Project' },
  { id: 'contract', label: 'Contract' },
  { id: 'invoice', label: 'Invoice (draft)' },
];

import { designationLabel, leadLabel, priorityLabel } from '@/lib/leads';

const statusLabel = leadLabel;

type Detail = {
  lead: Record<string, unknown>;
  notes: { id: number; body: string; created_at: string }[];
  communications: { id: number; channel: string; subject?: string; body?: string; created_at: string }[];
  follow_ups: { id: number; activity_type: string; title?: string; due_at: string; completed_at?: string; notes?: string }[];
  documents: { id: number; file_name: string; created_at: string }[];
  quotations: { id: number; title: string; amount: number; status: string; notes?: string; created_at: string }[];
  status_history: { id: number; from_status?: string; to_status: string; note?: string; created_at: string }[];
  conversions: { id: number; target_type: string; target_id: number; note?: string; created_at: string }[];
};

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = parseInt(idStr, 10);
  const { user } = useAuth();
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState('');
  const [comm, setComm] = useState({ channel: 'call', subject: '', body: '' });
  const [followUp, setFollowUp] = useState({ activity_type: 'call', title: '', due_at: '', notes: '' });
  const [quote, setQuote] = useState({ title: '', amount: '', status: 'draft', notes: '' });
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertType, setConvertType] = useState('customer');
  const [convertNote, setConvertNote] = useState('');

  const { data: statuses = [] } = useLeadStatuses();
  const { data, isLoading } = useQuery({
    queryKey: ['lead-detail', id],
    queryFn: () => api.leads.detail(id) as Promise<Detail>,
    enabled: !!id,
  });

  const { data: audit = [] } = useQuery({
    queryKey: ['lead-audit', id],
    queryFn: () => api.leads.audit(id),
    enabled: !!id && tab === 'audit',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['lead-detail', id] });
    qc.invalidateQueries({ queryKey: ['lead-audit', id] });
    qc.invalidateQueries({ queryKey: ['leads', id] });
  };

  const lead = data?.lead;

  const changeStatus = async (status: string) => {
    await api.leads.changeStatus(id, status);
    toast.success('Status updated');
    refresh();
  };

  const saveNote = async () => {
    if (!note.trim()) return;
    await api.leads.addNote(id, note.trim());
    setNote('');
    toast.success('Note added');
    refresh();
  };

  const saveComm = async () => {
    await api.leads.addCommunication(id, comm);
    setComm({ channel: 'call', subject: '', body: '' });
    toast.success('Communication logged');
    refresh();
  };

  const saveFollowUp = async () => {
    if (!followUp.due_at) {
      toast.warning('Due date required');
      return;
    }
    await api.leads.addFollowUp(id, { ...followUp, due_at: new Date(followUp.due_at).toISOString() });
    setFollowUp({ activity_type: 'call', title: '', due_at: '', notes: '' });
    toast.success('Follow-up scheduled');
    refresh();
  };

  const saveQuote = async () => {
    if (!quote.title.trim()) {
      toast.warning('Title required');
      return;
    }
    await api.leads.addQuotation(id, {
      title: quote.title,
      amount: parseFloat(quote.amount) || 0,
      status: quote.status,
      notes: quote.notes || undefined,
    });
    setQuote({ title: '', amount: '', status: 'draft', notes: '' });
    toast.success('Quotation added');
    refresh();
  };

  const runConvert = async () => {
    const res = await api.leads.convert(id, convertType, convertNote || undefined);
    toast.success(`Converted to ${convertType} #${(res as { target_id: number }).target_id}`);
    setConvertOpen(false);
    refresh();
  };

  const uploadDoc = async (file: File) => {
    await api.leads.uploadDocument(id, file);
    toast.success('Document uploaded');
    refresh();
  };

  if (isLoading || !lead || !data) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="container mx-auto px-4 py-8">
            <InlineDetailSkeleton />
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'timeline', label: 'Timeline' },
    { id: 'notes', label: 'Notes' },
    { id: 'communications', label: 'Communications' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'documents', label: 'Documents' },
    { id: 'quotations', label: 'Quotations' },
    { id: 'conversions', label: 'Conversions' },
    { id: 'audit', label: 'Audit' },
  ];

  const timeline = [
    ...data.status_history.map((h) => ({ at: h.created_at, text: `Status: ${h.from_status || '—'} → ${h.to_status}`, kind: 'status' })),
    ...data.communications.map((c) => ({ at: c.created_at, text: `${statusLabel(c.channel)}: ${c.subject || c.body || '—'}`, kind: 'comm' })),
    ...data.notes.map((n) => ({ at: n.created_at, text: `Note: ${n.body}`, kind: 'note' })),
    ...data.follow_ups.map((f) => ({ at: f.due_at, text: `Follow-up (${statusLabel(f.activity_type)}): ${f.title || '—'}`, kind: 'follow' })),
  ].sort((a, b) => String(b.at).localeCompare(String(a.at)));

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <Button variant="ghost" size="sm" asChild className="mb-2 -ml-2">
                <Link href="/leads">
                  <ArrowLeft className="size-4 mr-1" />
                  Back
                </Link>
              </Button>
              <h1 className="text-2xl font-bold">{String(lead.organization || lead.title)}</h1>
              <p className="text-sm text-muted-foreground">
                {leadLabel(String(lead.status))} · {priorityLabel(String(lead.priority || 'moderate'))} priority
              </p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={String(lead.status)} onValueChange={(v) => void changeStatus(v)}>
                <SelectTrigger className="w-[180px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {statuses.map((s) => (
                    <SelectItem key={s.name} value={s.name}>
                      {statusLabel(s.name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {can(user, 'leads.write') ? (
                <Button variant="outline" onClick={() => setConvertOpen(true)}>
                  <RefreshCw className="size-4 mr-1" />
                  Convert
                </Button>
              ) : null}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 border-b pb-2">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`px-3 py-1.5 text-sm rounded-md ${tab === t.id ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}
              >
                {t.label}
              </button>
            ))}
          </div>

          {tab === 'overview' ? (
            <div className="grid md:grid-cols-2 gap-4">
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Organization</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>
                    <span className="text-muted-foreground">Organization:</span> {String(lead.organization || lead.title || '—')}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Source:</span> {lead.source ? statusLabel(String(lead.source)) : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Value:</span> £{Number(lead.estimated_value || 0).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-muted-foreground">City:</span> {String(lead.city || '—')}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Postcode:</span> {String(lead.postcode || '—')}
                  </p>
                  {lead.next_follow_up_at ? (
                    <p>
                      <span className="text-muted-foreground">Follow-up:</span> {new Date(String(lead.next_follow_up_at)).toLocaleString()}
                    </p>
                  ) : null}
                  {lead.meeting_at ? (
                    <p>
                      <span className="text-muted-foreground">Meeting:</span> {new Date(String(lead.meeting_at)).toLocaleString()}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">Created:</span> {new Date(String(lead.created_at)).toLocaleString()}
                  </p>
                  {lead.converted ? (
                    <p className="text-emerald-600">
                      Converted to {String(lead.converted_to_type)} #{String(lead.converted_to_id)}
                    </p>
                  ) : null}
                </CardContent>
              </Card>
              <Card>
                <CardHeader>
                  <CardTitle className="text-base">Contact details</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>
                    <span className="text-muted-foreground">Contact:</span> {String(lead.contact_name || '—')}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Designation:</span>{' '}
                    {lead.designation ? designationLabel(String(lead.designation)) : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email:</span> {String(lead.email || '—')}
                  </p>
                  {lead.email_secondary ? (
                    <p>
                      <span className="text-muted-foreground">Additional email:</span> {String(lead.email_secondary)}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">Phone:</span> {String(lead.phone || '—')}
                  </p>
                  {lead.phone_secondary ? (
                    <p>
                      <span className="text-muted-foreground">Additional phone:</span> {String(lead.phone_secondary)}
                    </p>
                  ) : null}
                  <p>
                    <span className="text-muted-foreground">Address:</span> {String(lead.address || '—')}
                  </p>
                </CardContent>
              </Card>
              {lead.comments ? (
                <Card className="md:col-span-2">
                  <CardHeader>
                    <CardTitle className="text-base">Comments / Notes</CardTitle>
                  </CardHeader>
                  <CardContent className="text-sm whitespace-pre-wrap">{String(lead.comments)}</CardContent>
                </Card>
              ) : null}
            </div>
          ) : null}

          {tab === 'timeline' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Activity timeline</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-3 text-sm">
                  {timeline.length === 0 ? (
                    <li className="text-muted-foreground">No activity yet</li>
                  ) : (
                    timeline.map((item, i) => (
                      <li key={i} className="border-l-2 border-primary/30 pl-3">
                        <p>{item.text}</p>
                        <p className="text-xs text-muted-foreground">{new Date(item.at).toLocaleString()}</p>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'notes' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Notes</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex gap-2">
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder="Add a note…"
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button onClick={() => void saveNote()}>Add</Button>
                </div>
                <ul className="space-y-2 text-sm">
                  {data.notes.map((n) => (
                    <li key={n.id} className="rounded-md border p-3">
                      <p>{n.body}</p>
                      <p className="text-xs text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'communications' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Communications</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 max-w-xl">
                  <Select value={comm.channel} onValueChange={(v) => setComm({ ...comm, channel: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['call', 'email', 'sms', 'whatsapp', 'meeting'].map((c) => (
                        <SelectItem key={c} value={c}>
                          {statusLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Subject" value={comm.subject} onChange={(e) => setComm({ ...comm, subject: e.target.value })} />
                  <textarea
                    placeholder="Notes"
                    value={comm.body}
                    onChange={(e) => setComm({ ...comm, body: e.target.value })}
                    className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button onClick={() => void saveComm()}>Log communication</Button>
                </div>
                <ul className="space-y-2 text-sm">
                  {data.communications.map((c) => (
                    <li key={c.id} className="rounded-md border p-3">
                      <span className="font-medium">{statusLabel(c.channel)}</span>
                      {c.subject ? <span> — {c.subject}</span> : null}
                      {c.body ? <p className="mt-1 text-muted-foreground">{c.body}</p> : null}
                      <p className="text-xs text-muted-foreground mt-1">{new Date(c.created_at).toLocaleString()}</p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'followups' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Follow-ups</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 max-w-xl">
                  <Select value={followUp.activity_type} onValueChange={(v) => setFollowUp({ ...followUp, activity_type: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['call', 'meeting', 'email', 'site_visit', 'reminder'].map((c) => (
                        <SelectItem key={c} value={c}>
                          {statusLabel(c)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input placeholder="Title" value={followUp.title} onChange={(e) => setFollowUp({ ...followUp, title: e.target.value })} />
                  <div className="space-y-1">
                    <Label>Due</Label>
                    <Input type="datetime-local" value={followUp.due_at} onChange={(e) => setFollowUp({ ...followUp, due_at: e.target.value })} />
                  </div>
                  <textarea
                    placeholder="Notes"
                    value={followUp.notes}
                    onChange={(e) => setFollowUp({ ...followUp, notes: e.target.value })}
                    className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  />
                  <Button onClick={() => void saveFollowUp()}>Schedule</Button>
                </div>
                <ul className="space-y-2 text-sm">
                  {data.follow_ups.map((f) => (
                    <li key={f.id} className="rounded-md border p-3 flex justify-between gap-2">
                      <div>
                        <span className="font-medium">{statusLabel(f.activity_type)}</span>
                        {f.title ? <span> — {f.title}</span> : null}
                        <p className="text-xs text-muted-foreground">{new Date(f.due_at).toLocaleString()}</p>
                      </div>
                      {!f.completed_at ? (
                        <Button size="sm" variant="outline" onClick={() => void api.leads.completeFollowUp(f.id).then(refresh)}>
                          Complete
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-600">Done</span>
                      )}
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'documents' ? (
            <Card>
              <CardHeader className="flex flex-row items-center justify-between">
                <CardTitle className="text-base">Documents</CardTitle>
                <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()}>
                  <FileUp className="size-4 mr-1" />
                  Upload
                </Button>
                <input
                  ref={fileRef}
                  type="file"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) void uploadDoc(f);
                    e.target.value = '';
                  }}
                />
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {data.documents.length === 0 ? (
                    <li className="text-muted-foreground">No documents</li>
                  ) : (
                    data.documents.map((d) => (
                      <li key={d.id} className="flex justify-between items-center rounded-md border p-3">
                        <span>{d.file_name}</span>
                        <Button
                          size="sm"
                          variant="link"
                          className="text-sm h-auto p-0"
                          onClick={async () => {
                            const token = localStorage.getItem('token');
                            const res = await fetch(api.leads.documentUrl(id, d.id), {
                              headers: token ? { Authorization: `Bearer ${token}` } : {},
                            });
                            const blob = await res.blob();
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url;
                            a.download = d.file_name;
                            a.click();
                            URL.revokeObjectURL(url);
                          }}
                        >
                          Download
                        </Button>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'quotations' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Quotations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 max-w-xl sm:grid-cols-2">
                  <Input placeholder="Title" value={quote.title} onChange={(e) => setQuote({ ...quote, title: e.target.value })} />
                  <Input type="number" placeholder="Amount (£)" value={quote.amount} onChange={(e) => setQuote({ ...quote, amount: e.target.value })} />
                  <Select value={quote.status} onValueChange={(v) => setQuote({ ...quote, status: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {['draft', 'sent', 'accepted', 'rejected'].map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button onClick={() => void saveQuote()}>Add quotation</Button>
                </div>
                <ul className="space-y-2 text-sm">
                  {data.quotations.map((q) => (
                    <li key={q.id} className="rounded-md border p-3">
                      <div className="flex justify-between">
                        <span className="font-medium">{q.title}</span>
                        <span className="tabular-nums">£{q.amount.toLocaleString()}</span>
                      </div>
                      <p className="text-xs text-muted-foreground capitalize">
                        {q.status} · {new Date(q.created_at).toLocaleString()}
                      </p>
                    </li>
                  ))}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'conversions' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Conversion history</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  {data.conversions.length === 0 ? (
                    <li className="text-muted-foreground">No conversions yet</li>
                  ) : (
                    data.conversions.map((c) => (
                      <li key={c.id} className="rounded-md border p-3">
                        <span className="font-medium capitalize">{statusLabel(c.target_type)}</span>
                        <span className="text-muted-foreground"> #{c.target_id}</span>
                        <p className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleString()}</p>
                        {c.note ? <p className="mt-1">{c.note}</p> : null}
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'audit' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Audit log</CardTitle>
              </CardHeader>
              <CardContent>
                <ul className="text-sm space-y-2">
                  {audit.length === 0 ? (
                    <li className="text-muted-foreground">No audit entries</li>
                  ) : (
                    audit.map((a) => (
                      <li key={String(a.id)} className="border-b border-border/50 pb-2">
                        <span className="font-medium">{String(a.action)}</span>
                        <span className="text-muted-foreground ml-2">{a.created_at ? new Date(String(a.created_at)).toLocaleString() : ''}</span>
                      </li>
                    ))
                  )}
                </ul>
              </CardContent>
            </Card>
          ) : null}
        </div>

        <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Convert lead</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <Select value={convertType} onValueChange={setConvertType}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CONVERT_TYPES.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <textarea
                placeholder="Note (optional)"
                value={convertNote}
                onChange={(e) => setConvertNote(e.target.value)}
                className="w-full min-h-[64px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              />
            </div>
            <DialogFooter>
              <Button onClick={() => void runConvert()}>Convert</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
