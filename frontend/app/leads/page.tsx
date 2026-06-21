'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { useCreateLead, useDeleteLead, useLeadStatuses, useLeads } from '@/hooks/use-leads';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import { BarChart3, Bookmark, Calendar, Download, Plus, Target } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';

const PRIORITIES = ['low', 'medium', 'high'];
const SOURCES = ['website', 'referral', 'cold_call', 'email', 'social', 'event', 'other'];

function statusLabel(s: string) {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function statusClass(s: string) {
  if (s === 'won') return 'bg-emerald-500/15 text-emerald-800 dark:text-emerald-300';
  if (s === 'lost') return 'bg-red-500/15 text-red-800 dark:text-red-300';
  if (s === 'on_hold') return 'bg-slate-500/15';
  if (['qualified', 'proposal_sent', 'negotiation'].includes(s)) return 'bg-blue-500/15 text-blue-800 dark:text-blue-300';
  return 'bg-amber-500/15 text-amber-900 dark:text-amber-200';
}

export default function LeadsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const enabled = user?.enabled_modules?.leads !== false;
  const [status, setStatus] = useState('__all');
  const [source, setSource] = useState('__all');
  const [priority, setPriority] = useState('__all');
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const [converted, setConverted] = useState('__all');
  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState({
    title: '',
    contact_name: '',
    email: '',
    phone: '',
    city: '',
    source: 'website',
    status: 'new',
    priority: 'medium',
    estimated_value: '',
  });
  const [dupes, setDupes] = useState<{ field: string; lead_id: number; title: string }[]>([]);
  const [presetName, setPresetName] = useState('');
  const qc = useQueryClient();

  const { data: presets = [] } = useQuery({
    queryKey: ['lead-presets'],
    queryFn: () => api.leads.listPresets(),
  });

  const filters = useMemo(
    () => ({
      status: status === '__all' ? undefined : status,
      source: source === '__all' ? undefined : source,
      priority: priority === '__all' ? undefined : priority,
      city: city || undefined,
      search: search || undefined,
      converted: converted === '__all' ? undefined : converted === 'true',
    }),
    [status, source, priority, city, search, converted]
  );

  const { data: leads = [], isLoading } = useLeads(filters);
  const { data: statuses = [] } = useLeadStatuses();
  const createLead = useCreateLead();
  const deleteLead = useDeleteLead();

  if (user && !enabled) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="container mx-auto px-4 py-16 text-center">
            <Target className="size-12 mx-auto text-muted-foreground mb-4" />
            <h1 className="text-xl font-semibold">Lead management is not enabled</h1>
            <p className="text-muted-foreground mt-2">Contact your platform administrator to enable this module.</p>
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  const checkDupes = async () => {
    if (!form.email && !form.phone) {
      setDupes([]);
      return;
    }
    const d = await api.leads.checkDuplicate({ email: form.email || undefined, phone: form.phone || undefined });
    setDupes(d);
  };

  const submitCreate = async (force = false) => {
    if (!form.title.trim()) {
      toast.warning('Title is required');
      return;
    }
    try {
      await createLead.mutateAsync({
        ...form,
        estimated_value: parseFloat(form.estimated_value) || 0,
        force_duplicate: force,
      } as never);
      setCreateOpen(false);
      setForm({ title: '', contact_name: '', email: '', phone: '', city: '', source: 'website', status: 'new', priority: 'medium', estimated_value: '' });
      setDupes([]);
    } catch (e) {
      if (e instanceof Error && e.message.includes('Duplicate')) setDupes([]);
    }
  };

  const exportCsv = async () => {
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => {
      if (v !== undefined) q.append(k, String(v));
    });
    const token = localStorage.getItem('token');
    const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL || ''}/leads/export?${q}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'leads.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">Leads</h1>
              <p className="text-sm text-muted-foreground">Track prospects, follow-ups, and conversions</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" asChild>
                <Link href="/leads/calendar">
                  <Calendar className="size-4 mr-1" />
                  Calendar
                </Link>
              </Button>
              <Button variant="outline" asChild>
                <Link href="/leads/dashboard">
                  <BarChart3 className="size-4 mr-1" />
                  Dashboard
                </Link>
              </Button>
              {can(user, 'leads.export') ? (
                <Button variant="outline" onClick={() => void exportCsv()}>
                  <Download className="size-4 mr-1" />
                  Export
                </Button>
              ) : null}
              {can(user, 'leads.write') ? (
                <Button onClick={() => setCreateOpen(true)}>
                  <Plus className="size-4 mr-1" />
                  New lead
                </Button>
              ) : null}
            </div>
          </div>

          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Filters</CardTitle>
            </CardHeader>
            <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
              <div className="space-y-1 col-span-2">
                <Label>Search</Label>
                <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name, email, phone…" />
              </div>
              <div className="space-y-1">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All</SelectItem>
                    {statuses.map((s) => (
                      <SelectItem key={s.name} value={s.name}>
                        {statusLabel(s.name)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Source</Label>
                <Select value={source} onValueChange={setSource}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All</SelectItem>
                    {SOURCES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {statusLabel(s)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All</SelectItem>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p}>
                        {statusLabel(p)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>City</Label>
                <Input value={city} onChange={(e) => setCity(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Converted</Label>
                <Select value={converted} onValueChange={setConverted}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__all">All</SelectItem>
                    <SelectItem value="false">Open</SelectItem>
                    <SelectItem value="true">Converted</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1 col-span-2 md:col-span-4 flex flex-wrap items-end gap-2">
                <div className="flex-1 min-w-[140px] space-y-1">
                  <Label>Saved presets</Label>
                  <Select
                    value="__none"
                    onValueChange={(v) => {
                      if (v === '__none') return;
                      const p = presets.find((x) => String(x.id) === v);
                      if (!p) return;
                      const f = p.filters as Record<string, unknown>;
                      setStatus(String(f.status || '__all'));
                      setSource(String(f.source || '__all'));
                      setPriority(String(f.priority || '__all'));
                      setCity(String(f.city || ''));
                      setSearch(String(f.search || ''));
                      const cv = f.converted;
                      setConverted(cv === true || cv === 'true' ? 'true' : cv === false || cv === 'false' ? 'false' : '__all');
                      toast.success(`Loaded preset "${p.name}"`);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Load preset" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none">Load preset…</SelectItem>
                      {presets.map((p) => (
                        <SelectItem key={p.id} value={String(p.id)}>
                          {p.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex-1 min-w-[140px] space-y-1">
                  <Label>Preset name</Label>
                  <Input value={presetName} onChange={(e) => setPresetName(e.target.value)} placeholder="My filters" />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="mb-0.5"
                  onClick={async () => {
                    if (!presetName.trim()) {
                      toast.warning('Enter a preset name');
                      return;
                    }
                    await api.leads.savePreset(presetName.trim(), filters as Record<string, unknown>);
                    setPresetName('');
                    qc.invalidateQueries({ queryKey: ['lead-presets'] });
                    toast.success('Preset saved');
                  }}
                >
                  <Bookmark className="size-4 mr-1" />
                  Save
                </Button>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Lead</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Source</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Value</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {isLoading ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        Loading…
                      </TableCell>
                    </TableRow>
                  ) : leads.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                        No leads match your filters
                      </TableCell>
                    </TableRow>
                  ) : (
                    leads.map((l) => (
                      <TableRow key={l.id} className="cursor-pointer hover:bg-muted/50" onClick={() => router.push(`/leads/${l.id}`)}>
                        <TableCell>
                          <div className="font-medium">{l.title}</div>
                          <div className="text-xs text-muted-foreground">{l.city || '—'}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{l.contact_name || '—'}</div>
                          <div className="text-xs text-muted-foreground">{l.email || l.phone || '—'}</div>
                        </TableCell>
                        <TableCell>
                          <span className={cn('text-xs rounded-full px-2 py-0.5', statusClass(l.status))}>{statusLabel(l.status)}</span>
                        </TableCell>
                        <TableCell className="text-sm">{l.source ? statusLabel(l.source) : '—'}</TableCell>
                        <TableCell className="text-sm capitalize">{l.priority || '—'}</TableCell>
                        <TableCell className="tabular-nums">£{(l.estimated_value || 0).toLocaleString()}</TableCell>
                        <TableCell onClick={(e) => e.stopPropagation()}>
                          {can(user, 'leads.delete') ? (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => {
                                if (confirm('Delete this lead?')) deleteLead.mutate(l.id);
                              }}
                            >
                              Delete
                            </Button>
                          ) : null}
                        </TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="sm:max-w-lg">
            <DialogHeader>
              <DialogTitle>New lead</DialogTitle>
            </DialogHeader>
            <div className="grid gap-3">
              <div className="space-y-1">
                <Label>Title *</Label>
                <Input value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Contact</Label>
                  <Input value={form.contact_name} onChange={(e) => setForm({ ...form, contact_name: e.target.value })} />
                </div>
                <div className="space-y-1">
                  <Label>City</Label>
                  <Input value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label>Email</Label>
                  <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} onBlur={() => void checkDupes()} />
                </div>
                <div className="space-y-1">
                  <Label>Phone</Label>
                  <Input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} onBlur={() => void checkDupes()} />
                </div>
              </div>
              {dupes.length > 0 ? (
                <div className="rounded-md border border-amber-500/50 bg-amber-500/10 p-3 text-sm">
                  <p className="font-medium text-amber-900 dark:text-amber-200">Possible duplicate</p>
                  {dupes.map((d) => (
                    <p key={`${d.field}-${d.lead_id}`} className="text-muted-foreground">
                      {d.field}: {d.title} (#{d.lead_id})
                    </p>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label>Source</Label>
                  <Select value={form.source} onValueChange={(v) => setForm({ ...form, source: v })}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {statusLabel(s)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1">
                  <Label>Status</Label>
                  <Select value={form.status} onValueChange={(v) => setForm({ ...form, status: v })}>
                    <SelectTrigger>
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
                </div>
                <div className="space-y-1">
                  <Label>Value (£)</Label>
                  <Input type="number" value={form.estimated_value} onChange={(e) => setForm({ ...form, estimated_value: e.target.value })} />
                </div>
              </div>
            </div>
            <DialogFooter className="gap-2">
              {dupes.length > 0 && user?.role === 'super_admin' ? (
                <Button variant="outline" onClick={() => void submitCreate(true)}>
                  Create anyway
                </Button>
              ) : null}
              <Button onClick={() => void submitCreate()} disabled={createLead.isPending}>
                Create
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
