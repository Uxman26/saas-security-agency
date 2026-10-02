'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { api } from '@/lib/api';
import type { Client, RecurringInvoice, Site } from '@/lib/types';
import { Plus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const empty = () => ({
  client_id: '',
  site_id: '',
  frequency: 'monthly',
  day_of_month: '1',
  start_date: new Date().toISOString().slice(0, 10),
  tax_rate: '20',
  notes: '',
  description: 'Recurring service',
  hours: '0',
  rate: '0',
  amount: '',
});

export default function RecurringInvoicesPage() {
  const { user } = useAuth();
  const canWrite = canModule(user, 'recurring_invoices', 'create');
  const canEdit = canModule(user, 'recurring_invoices', 'edit');
  const [rows, setRows] = useState<RecurringInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());

  const load = useCallback(async () => {
    try {
      const [ri, c, s] = await Promise.all([
        api.recurringInvoices.list(),
        api.clients.list().catch(() => []),
        api.sites.list().catch(() => []),
      ]);
      setRows(ri);
      setClients(c);
      setSites(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const clientSites = form.client_id
    ? sites.filter((s) => String(s.client_id) === form.client_id)
    : sites;

  const submit = async () => {
    if (!form.client_id || !form.site_id) {
      toast.error('Client and site are required');
      return;
    }
    const hours = Number(form.hours) || 0;
    const rate = Number(form.rate) || 0;
    const amount = form.amount ? Number(form.amount) : hours * rate;
    const template = [
      {
        site_id: Number(form.site_id),
        description: form.description || 'Service',
        hours,
        rate,
        amount,
        quantity: 1,
      },
    ];
    try {
      await api.recurringInvoices.create({
        client_id: Number(form.client_id),
        site_id: Number(form.site_id),
        frequency: form.frequency,
        day_of_month: Number(form.day_of_month) || 1,
        start_date: form.start_date,
        tax_rate: Number(form.tax_rate) || 20,
        notes: form.notes || undefined,
        template_json: JSON.stringify(template),
        status: 'active',
      });
      setOpen(false);
      setForm(empty());
      await load();
      toast.success('Recurring invoice created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const clientName = (id?: number | null) => clients.find((c) => c.id === id)?.name || '—';

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Recurring Invoices"
            description="Schedule automatic invoice generation for clients and sites."
            actions={
              canWrite ? (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 me-1" /> New schedule
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Recurring invoice</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Client</Label>
                        <Select value={form.client_id} onValueChange={(v) => setForm((f) => ({ ...f, client_id: v, site_id: '' }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map((c) => (
                              <SelectItem key={c.id} value={String(c.id)}>
                                {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Site</Label>
                        <Select value={form.site_id} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select site" />
                          </SelectTrigger>
                          <SelectContent>
                            {clientSites.map((s) => (
                              <SelectItem key={s.id} value={String(s.id)}>
                                {s.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Frequency</Label>
                          <Select value={form.frequency} onValueChange={(v) => setForm((f) => ({ ...f, frequency: v }))}>
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="weekly">Weekly</SelectItem>
                              <SelectItem value="monthly">Monthly</SelectItem>
                              <SelectItem value="quarterly">Quarterly</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div>
                          <Label>Day of month</Label>
                          <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Start date</Label>
                          <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Tax %</Label>
                          <Input type="number" value={form.tax_rate} onChange={(e) => setForm((f) => ({ ...f, tax_rate: e.target.value }))} />
                        </div>
                      </div>
                      <div>
                        <Label>Line description</Label>
                        <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <div>
                          <Label>Hours</Label>
                          <Input type="number" value={form.hours} onChange={(e) => setForm((f) => ({ ...f, hours: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Rate</Label>
                          <Input type="number" value={form.rate} onChange={(e) => setForm((f) => ({ ...f, rate: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Amount</Label>
                          <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} placeholder="auto" />
                        </div>
                      </div>
                      <Button onClick={submit} className="w-full">
                        Save
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null
            }
          />
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6}>No recurring invoices yet.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{clientName(r.client_id)}</TableCell>
                      <TableCell>{r.frequency}</TableCell>
                      <TableCell>{r.next_run || '—'}</TableCell>
                      <TableCell>{r.tax_rate}%</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <div className="flex gap-1">
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={async () => {
                                const next = r.status === 'active' ? 'paused' : 'active';
                                await api.recurringInvoices.setStatus(r.id, next);
                                await load();
                              }}
                            >
                              {r.status === 'active' ? 'Pause' : 'Resume'}
                            </Button>
                            {r.status !== 'cancelled' ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={async () => {
                                  await api.recurringInvoices.setStatus(r.id, 'cancelled');
                                  await load();
                                }}
                              >
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
