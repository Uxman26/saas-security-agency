'use client';

import { useCallback, useEffect, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Allowance } from '@/lib/types';
import { z } from 'zod';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Wallet, Pencil, Trash2 } from 'lucide-react';

const allowanceSchema = z.object({
  name: z.string().min(2).max(100),
  allowance_type: z.enum(['fixed', 'hourly']),
  amount: z.number().min(0),
  in_payroll: z.boolean(),
  in_invoice: z.boolean(),
});

type AllowanceFormData = z.infer<typeof allowanceSchema>;

function AllowanceForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<AllowanceFormData>>;
  onSubmit: (data: AllowanceFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, formState: { errors } } = form;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Allowance Name <span className="text-destructive">*</span></Label>
          <Input {...register('name')} placeholder="Meal Allowance" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Type</Label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            {...register('allowance_type')}
          >
            <option value="fixed">Fixed (flat amount per period)</option>
            <option value="hourly">Hourly (per hour worked)</option>
          </select>
        </div>
        <div className="space-y-1">
          <Label>Amount (£)</Label>
          <Input type="number" step="0.01" min="0" {...register('amount', { valueAsNumber: true })} placeholder="10.00" />
          {errors.amount && <p className="text-xs text-destructive">{errors.amount.message}</p>}
        </div>
      </div>
      <div className="rounded-md border p-3 space-y-3">
        <p className="text-sm font-medium text-muted-foreground">Apply to</p>
        <div className="flex gap-6">
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" {...register('in_payroll')} />
            <span className="text-sm">Include in Payroll</span>
          </label>
          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" className="rounded" {...register('in_invoice')} />
            <span className="text-sm">Include in Invoices</span>
          </label>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

export default function AllowancesPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingAllowance, setEditingAllowance] = useState<Allowance | null>(null);
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const addForm = useForm<AllowanceFormData>({
    resolver: zodResolver(allowanceSchema),
    defaultValues: { name: '', allowance_type: 'fixed', amount: 0, in_payroll: true, in_invoice: true },
  });

  const editForm = useForm<AllowanceFormData>({
    resolver: zodResolver(allowanceSchema),
    defaultValues: { in_payroll: true, in_invoice: true },
  });

  const load = () => {
    setLoading(true);
    api.allowances.list().then(setAllowances).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, []);

  const handleCreate = async (data: AllowanceFormData) => {
    try {
      await api.allowances.create({
        name: data.name,
        allowance_type: data.allowance_type,
        amount: data.amount,
        in_payroll: data.in_payroll ?? true,
        in_invoice: data.in_invoice ?? true,
      });
      setAddOpen(false);
      addForm.reset();
      load();
    } catch (err) { console.error(err); }
  };

  const openEdit = (a: Allowance) => {
    setEditingAllowance(a);
    editForm.reset({
      name: a.name,
      allowance_type: a.allowance_type as 'fixed' | 'hourly',
      amount: a.amount,
      in_payroll: a.in_payroll,
      in_invoice: a.in_invoice,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: AllowanceFormData) => {
    if (!editingAllowance) return;
    try {
      await api.allowances.update(editingAllowance.id, {
        name: data.name,
        allowance_type: data.allowance_type,
        amount: data.amount,
        in_payroll: data.in_payroll ?? true,
        in_invoice: data.in_invoice ?? true,
      });
      setEditOpen(false);
      setEditingAllowance(null);
      load();
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this allowance? This cannot be undone.')) return;
    try {
      await api.allowances.delete(id);
      load();
    } catch (err) { console.error(err); }
  };

  const getSearchText = useCallback(
    (a: Allowance) =>
      [a.name, a.allowance_type, String(a.amount), a.in_payroll ? 'payroll' : '', a.in_invoice ? 'invoice' : ''].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((a: Allowance, key: string) => {
    switch (key) {
      case 'name':
        return a.name;
      case 'type':
        return a.allowance_type;
      case 'amount':
        return a.amount;
      case 'payroll':
        return a.in_payroll ? 1 : 0;
      case 'invoice':
        return a.in_invoice ? 1 : 0;
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    allowances,
    search,
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><Wallet className="size-7" /> Allowances</h1>
              <p className="text-muted-foreground mt-1">Configure payroll and invoice allowances</p>
            </div>
            <Dialog open={addOpen} onOpenChange={setAddOpen}>
              <DialogTrigger asChild>
                <Button>Add Allowance</Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle>Add New Allowance</DialogTitle>
                </DialogHeader>
                <AllowanceForm form={addForm} onSubmit={handleCreate} isPending={false} submitLabel="Create Allowance" />
              </DialogContent>
            </Dialog>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Search allowances..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Allowances</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : allowances.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  No allowances configured yet. Click "Add Allowance" to get started.
                </div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">No allowances match your search.</div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Amount" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="In Payroll" colKey="payroll" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="In Invoice" colKey="invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.name}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.allowance_type === 'hourly'
                                ? 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400'
                                : 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                            }`}>
                              {a.allowance_type === 'hourly' ? 'Per Hour' : 'Fixed'}
                            </span>
                          </TableCell>
                          <TableCell className="font-medium">£{a.amount.toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.in_payroll ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-secondary text-secondary-foreground'
                            }`}>
                              {a.in_payroll ? 'Yes' : 'No'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              a.in_invoice ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' : 'bg-secondary text-secondary-foreground'
                            }`}>
                              {a.in_invoice ? 'Yes' : 'No'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(a)} title="Edit allowance">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(a.id)}
                                title="Delete allowance"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={safePage}
                    pageCount={pageCount}
                    total={total}
                    pageSize={pageSize}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Allowance — {editingAllowance?.name}</DialogTitle>
            </DialogHeader>
            <AllowanceForm form={editForm} onSubmit={handleUpdate} isPending={false} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
