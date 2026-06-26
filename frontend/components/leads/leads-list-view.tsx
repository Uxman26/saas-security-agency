'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { LeadFormFields } from '@/components/leads/lead-form-fields';
import { LeadsSubnav } from '@/components/leads/leads-subnav';
import { LeadsTable } from '@/components/leads/leads-table';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useAuth } from '@/contexts/auth-context';
import { useCreateLead, useDeleteLead, useLeadStatuses, useLeads, useUpdateLead } from '@/hooks/use-leads';
import { api } from '@/lib/api';
import { can } from '@/lib/permissions';
import {
  LEAD_PRIORITIES,
  LEAD_SOURCES,
  emptyLeadForm,
  formFromLead,
  leadLabel,
  payloadFromForm,
  priorityLabel,
  type LeadFormState,
} from '@/lib/leads';
import type { Lead } from '@/lib/types';
import { BarChart3, Bookmark, Calendar, Download, Plus, Target } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useQuery, useQueryClient } from '@tanstack/react-query';

type Props = {
  title: string;
  description: string;
  fixedFilters?: Record<string, string | boolean>;
  showDates?: boolean;
  showFullFilters?: boolean;
};

export function LeadsListView({ title, description, fixedFilters = {}, showDates, showFullFilters = true }: Props) {
  const { user } = useAuth();
  const enabled = user?.enabled_modules?.leads !== false;
  const [status, setStatus] = useState('__all');
  const [source, setSource] = useState('__all');
  const [priority, setPriority] = useState('__all');
  const [city, setCity] = useState('');
  const [search, setSearch] = useState('');
  const [converted, setConverted] = useState('__all');
  const [createOpen, setCreateOpen] = useState(false);
  const [editLead, setEditLead] = useState<Lead | null>(null);
  const [form, setForm] = useState<LeadFormState>(emptyLeadForm());
  const [dupes, setDupes] = useState<{ field: string; lead_id: number; title: string }[]>([]);
  const [presetName, setPresetName] = useState('');
  const qc = useQueryClient();

  const { data: presets = [] } = useQuery({
    queryKey: ['lead-presets'],
    queryFn: () => api.leads.listPresets(),
  });

  const filters = useMemo(
    () => ({
      ...fixedFilters,
      status: status === '__all' ? undefined : status,
      source: source === '__all' ? undefined : source,
      priority: priority === '__all' ? undefined : priority,
      city: city || undefined,
      search: search || undefined,
      converted: converted === '__all' ? undefined : converted === 'true',
    }),
    [status, source, priority, city, search, converted, fixedFilters]
  );

  const { data: leads = [], isLoading } = useLeads(filters);
  const { data: statuses = [] } = useLeadStatuses();
  const createLead = useCreateLead();
  const updateLead = useUpdateLead();
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

  const checkDupes = async (exclude_id?: number) => {
    if (!form.email && !form.phone && !form.email_secondary && !form.phone_secondary) {
      setDupes([]);
      return;
    }
    const d = await api.leads.checkDuplicate({
      email: form.email || undefined,
      phone: form.phone || undefined,
      exclude_id,
    });
    setDupes(d);
  };

  const validateForm = () => {
    if (!form.organization.trim()) {
      toast.warning('Organization is required');
      return false;
    }
    if (form.status === 'follow_up' && !form.follow_up_date) {
      toast.warning('Follow-up date is required');
      return false;
    }
    if (form.status === 'meeting' && !form.meeting_date) {
      toast.warning('Meeting date is required');
      return false;
    }
    return true;
  };

  const submitCreate = async (force = false) => {
    if (!validateForm()) return;
    try {
      await createLead.mutateAsync(payloadFromForm(form, force) as never);
      setCreateOpen(false);
      setForm(emptyLeadForm());
      setDupes([]);
    } catch {
      /* toast handled */
    }
  };

  const submitEdit = async (force = false) => {
    if (!editLead || !validateForm()) return;
    try {
      await updateLead.mutateAsync({ id: editLead.id, data: payloadFromForm(form, force) });
      setEditLead(null);
      setDupes([]);
    } catch {
      /* toast handled */
    }
  };

  const openEdit = (lead: Lead) => {
    setForm(formFromLead(lead));
    setDupes([]);
    setEditLead(lead);
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

  const dialogOpen = createOpen || !!editLead;
  const closeDialog = () => {
    setCreateOpen(false);
    setEditLead(null);
    setDupes([]);
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-2xl font-bold">{title}</h1>
              <p className="text-sm text-muted-foreground">{description}</p>
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
                <Button
                  onClick={() => {
                    setForm(emptyLeadForm());
                    setDupes([]);
                    setCreateOpen(true);
                  }}
                >
                  <Plus className="size-4 mr-1" />
                  New lead
                </Button>
              ) : null}
            </div>
          </div>

          <LeadsSubnav />

          {showFullFilters ? (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base">Filters</CardTitle>
              </CardHeader>
              <CardContent className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
                <div className="space-y-1 col-span-2">
                  <Label>Search</Label>
                  <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Organization, contact, email…" />
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
                          {leadLabel(s.name)}
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
                      {LEAD_SOURCES.map((s) => (
                        <SelectItem key={s} value={s}>
                          {leadLabel(s)}
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
                      {LEAD_PRIORITIES.map((p) => (
                        <SelectItem key={p} value={p}>
                          {priorityLabel(p)}
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
          ) : (
            <div className="max-w-md">
              <Label>Search</Label>
              <Input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search leads…" className="mt-1" />
            </div>
          )}

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <LeadsTable
                leads={leads}
                isLoading={isLoading}
                user={user}
                onEdit={openEdit}
                onDelete={(id) => deleteLead.mutate(id)}
                showDates={showDates}
              />
            </CardContent>
          </Card>
        </div>

        <Dialog open={dialogOpen} onOpenChange={(o) => !o && closeDialog()}>
          <DialogContent className="sm:max-w-2xl">
            <DialogHeader>
              <DialogTitle>{editLead ? 'Edit lead' : 'New lead'}</DialogTitle>
            </DialogHeader>
            <LeadFormFields
              form={form}
              onChange={setForm}
              statuses={statuses}
              dupes={dupes}
              onBlurContact={() => void checkDupes(editLead?.id)}
            />
            <DialogFooter className="gap-2">
              {dupes.length > 0 && user?.role === 'super_admin' ? (
                <Button variant="outline" onClick={() => void (editLead ? submitEdit(true) : submitCreate(true))}>
                  Save anyway
                </Button>
              ) : null}
              <Button onClick={() => void (editLead ? submitEdit() : submitCreate())} disabled={createLead.isPending || updateLead.isPending}>
                {editLead ? 'Save' : 'Create'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
