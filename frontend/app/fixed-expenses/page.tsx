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
import type { FixedExpense, Vendor } from '@/lib/types';
import { Plus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const empty = () => ({
  vendor_id: '',
  category: 'other',
  description: '',
  amount: '',
  vat_rate: '20',
  day_of_month: '1',
  start_date: new Date().toISOString().slice(0, 10),
  end_date: '',
  status: 'active',
});

export default function FixedExpensesPage() {
  const { user } = useAuth();
  const canWrite = canModule(user, 'fixed_expenses', 'create');
  const canEdit = canModule(user, 'fixed_expenses', 'edit');
  const [rows, setRows] = useState<FixedExpense[]>([]);
  const [vendors, setVendors] = useState<Vendor[]>([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty());

  const load = useCallback(async () => {
    try {
      const [fe, v] = await Promise.all([api.fixedExpenses.list(), api.vendors.list().catch(() => [])]);
      setRows(fe);
      setVendors(v);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load');
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!form.description.trim() || !form.amount) {
      toast.error('Description and amount are required');
      return;
    }
    try {
      await api.fixedExpenses.create({
        vendor_id: form.vendor_id ? Number(form.vendor_id) : undefined,
        category: form.category,
        description: form.description,
        amount: Number(form.amount),
        vat_rate: Number(form.vat_rate) || 20,
        day_of_month: Number(form.day_of_month) || 1,
        start_date: form.start_date,
        end_date: form.end_date || undefined,
        status: form.status,
      });
      setOpen(false);
      setForm(empty());
      await load();
      toast.success('Fixed expense created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const vendorName = (id?: number | null) => vendors.find((v) => v.id === id)?.name || '—';

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Fixed Monthly Expenses"
            description="Recurring costs that post automatically into Expenses and the ledger."
            actions={
              canWrite ? (
                <Dialog open={open} onOpenChange={setOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 me-1" /> Add fixed expense
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>New fixed expense</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Vendor</Label>
                        <Select value={form.vendor_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, vendor_id: v === 'none' ? '' : v }))}>
                          <SelectTrigger>
                            <SelectValue placeholder="Optional" />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">None</SelectItem>
                            {vendors.map((v) => (
                              <SelectItem key={v.id} value={String(v.id)}>
                                {v.name}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div>
                        <Label>Category</Label>
                        <Input value={form.category} onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Description</Label>
                        <Input value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Amount (ex VAT)</Label>
                          <Input type="number" value={form.amount} onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))} />
                        </div>
                        <div>
                          <Label>VAT %</Label>
                          <Input type="number" value={form.vat_rate} onChange={(e) => setForm((f) => ({ ...f, vat_rate: e.target.value }))} />
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <Label>Day of month</Label>
                          <Input type="number" min={1} max={28} value={form.day_of_month} onChange={(e) => setForm((f) => ({ ...f, day_of_month: e.target.value }))} />
                        </div>
                        <div>
                          <Label>Start date</Label>
                          <Input type="date" value={form.start_date} onChange={(e) => setForm((f) => ({ ...f, start_date: e.target.value }))} />
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
                  <TableHead>Description</TableHead>
                  <TableHead>Vendor</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Day</TableHead>
                  <TableHead>Next run</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7}>No fixed expenses yet.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((r) => (
                    <TableRow key={r.id}>
                      <TableCell className="font-medium">{r.description}</TableCell>
                      <TableCell>{vendorName(r.vendor_id)}</TableCell>
                      <TableCell>£{Number(r.amount).toFixed(2)}</TableCell>
                      <TableCell>{r.day_of_month}</TableCell>
                      <TableCell>{r.next_run || '—'}</TableCell>
                      <TableCell>{r.status}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={async () => {
                              const next = r.status === 'active' ? 'paused' : 'active';
                              await api.fixedExpenses.setStatus(r.id, next);
                              await load();
                            }}
                          >
                            {r.status === 'active' ? 'Pause' : 'Resume'}
                          </Button>
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
