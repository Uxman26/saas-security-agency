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
import { ModulePage } from '@/components/module-layout';
import { DashboardHeader, Pill, StatCards } from '@/components/module-dashboard';
import { INVOICE_CURRENCIES } from '@/lib/invoice-currency';
import { api } from '@/lib/api';
import type { Client, RecurringInvoice, Site } from '@/lib/types';
import { List, Pause, Plus, Repeat, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { localDateKey } from '@/lib/date-format';

const empty = () => ({
  client_id: '',
  site_id: '',
  frequency: 'monthly',
  day_of_month: '1',
  start_date: localDateKey(),
  tax_rate: '20',
  notes: '',
  description: 'Recurring service',
  hours: '0',
  rate: '0',
  amount: '',
  currency: 'GBP',
});

export default function RecurringInvoicesPage() {
  const { user } = useAuth();
  const canWrite = canModule(user, 'recurring_invoices', 'create');
  const canEdit = canModule(user, 'recurring_invoices', 'edit');
  const canDelete = canModule(user, 'recurring_invoices', 'delete');
  const [rows, setRows] = useState<RecurringInvoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'paused' | 'cancelled'>('all');

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
        currency: form.currency,
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
  const visible = statusFilter === 'all' ? rows : rows.filter((r) => r.status === statusFilter);
  const activeCount = rows.filter((r) => r.status === 'active').length;

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <DashboardHeader
            title="Recurring Invoices"
            description="Schedule automatic invoice generation for clients and sites. Creating a schedule does not change an invoice that was already raised."
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
                        <Label>Currency</Label>
                        <Select value={form.currency} onValueChange={(v) => setForm((f) => ({ ...f, currency: v }))}>
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {INVOICE_CURRENCIES.map((c) => (
                              <SelectItem key={c.code} value={c.code}>
                                {c.code} — {c.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <p className="mt-1 text-xs text-muted-foreground">Stored with each invoice this schedule raises. Amounts are not converted.</p>
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
          <StatCards
            cards={[
              { key: 'active', label: 'Active schedules', value: activeCount, icon: Repeat, tone: 'positive' },
              { key: 'paused', label: 'Paused', value: rows.filter((r) => r.status === 'paused').length, icon: Pause, tone: 'warning' },
              { key: 'all', label: 'All schedules', value: rows.length, icon: List, tone: 'neutral' },
            ]}
          />
          <div className="flex flex-wrap gap-2">
            {(['all', 'active', 'paused', 'cancelled'] as const).map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setStatusFilter(id)}
                className={`rounded-full px-4 py-1.5 text-sm font-medium ${statusFilter === id ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
              >
                {id === 'all' ? 'All' : id.charAt(0).toUpperCase() + id.slice(1)}
              </button>
            ))}
          </div>
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Client</TableHead>
                  <TableHead>Frequency</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Tax</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {visible.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>No recurring invoices yet.</TableCell>
                  </TableRow>
                ) : (
                  visible.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{clientName(r.client_id)}</TableCell>
                      <TableCell>{r.frequency}</TableCell>
                      <TableCell>{r.next_run || '—'}</TableCell>
                      <TableCell>{r.tax_rate}%</TableCell>
                      <TableCell>{r.currency || 'GBP'}</TableCell>
                      <TableCell>
                        <Pill tone={r.status === 'active' ? 'positive' : r.status === 'paused' ? 'warning' : 'muted'}>
                          {r.status}
                        </Pill>
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {canEdit && r.status !== 'cancelled' ? (
                            <>
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
                            </>
                          ) : null}
                          {canDelete ? (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={async () => {
                                await api.recurringInvoices.delete(r.id);
                                await load();
                                toast.success('Recurring invoice deleted');
                              }}
                            >
                              <Trash2 className="size-3.5" />
                            </Button>
                          ) : null}
                        </div>
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
