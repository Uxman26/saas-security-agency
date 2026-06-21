'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { useLead, useLeadStatuses } from '@/hooks/use-leads';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import { ArrowLeft, RefreshCw } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idStr } = use(params);
  const id = parseInt(idStr, 10);
  const { user } = useAuth();
  const qc = useQueryClient();
  const { data: lead, isLoading } = useLead(id);
  const { data: statuses = [] } = useLeadStatuses();
  const [tab, setTab] = useState('overview');
  const [note, setNote] = useState('');
  const [comm, setComm] = useState({ channel: 'call', subject: '', body: '' });
  const [followUp, setFollowUp] = useState({ activity_type: 'call', title: '', due_at: '', notes: '' });

  const { data: audit = [] } = useQuery({
    queryKey: ['lead-audit', id],
    queryFn: () => api.leads.audit(id),
    enabled: !!id && tab === 'audit',
  });

  const refresh = () => {
    qc.invalidateQueries({ queryKey: ['leads', id] });
    qc.invalidateQueries({ queryKey: ['lead-audit', id] });
  };

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

  const convert = async () => {
    if (!confirm('Convert this lead to a customer (client)?')) return;
    const res = await api.leads.convert(id, 'customer');
    toast.success(`Converted to client #${(res as { target_id: number }).target_id}`);
    refresh();
  };

  if (isLoading || !lead) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="container mx-auto px-4 py-16 text-center text-muted-foreground">Loading…</div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  const tabs = [
    { id: 'overview', label: 'Overview' },
    { id: 'notes', label: 'Notes' },
    { id: 'communications', label: 'Communications' },
    { id: 'followups', label: 'Follow-ups' },
    { id: 'audit', label: 'Audit' },
  ];

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
              <h1 className="text-2xl font-bold">{lead.title}</h1>
              <p className="text-sm text-muted-foreground capitalize">{statusLabel(lead.status)} · {lead.priority} priority</p>
            </div>
            <div className="flex flex-wrap gap-2 items-center">
              <Select value={lead.status} onValueChange={(v) => void changeStatus(v)}>
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
              {!lead.converted && can(user, 'leads.write') ? (
                <Button variant="outline" onClick={() => void convert()}>
                  <RefreshCw className="size-4 mr-1" />
                  Convert to customer
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
                  <CardTitle className="text-base">Basic information</CardTitle>
                </CardHeader>
                <CardContent className="text-sm space-y-2">
                  <p>
                    <span className="text-muted-foreground">Source:</span> {lead.source ? statusLabel(lead.source) : '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Value:</span> £{(lead.estimated_value || 0).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-muted-foreground">City:</span> {lead.city || '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Created:</span> {new Date(lead.created_at).toLocaleString()}
                  </p>
                  {lead.converted ? (
                    <p className="text-emerald-600">
                      Converted to {lead.converted_to_type} #{lead.converted_to_id}
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
                    <span className="text-muted-foreground">Contact:</span> {lead.contact_name || '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Email:</span> {lead.email || '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Phone:</span> {lead.phone || '—'}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Address:</span> {lead.address || '—'}
                  </p>
                </CardContent>
              </Card>
            </div>
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
              </CardContent>
            </Card>
          ) : null}

          {tab === 'communications' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Log communication</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 max-w-xl">
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
                <Button onClick={() => void saveComm()}>Save</Button>
              </CardContent>
            </Card>
          ) : null}

          {tab === 'followups' ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Schedule follow-up</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-3 max-w-xl">
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
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                />
                <Button onClick={() => void saveFollowUp()}>Schedule</Button>
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
      </AppShell>
    </ProtectedRoute>
  );
}
