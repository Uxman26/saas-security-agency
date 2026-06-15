'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Expense, ExpenseDashboard, ExpenseMeta, ExpenseReport, VatReport } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { StatusBarChart } from '@/components/charts/status-chart';
import { Download, Pencil, Plus, Receipt, Trash2, TrendingDown, TrendingUp } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const VAT_RATE = 0.2;
const MAX_DOC_BYTES = 300 * 1024;

const CAT_LABELS: Record<string, string> = {
  fuel: 'Fuel',
  electricity: 'Electricity',
  rent: 'Rent',
  internet: 'Internet',
  office_supplies: 'Office Supplies',
  maintenance: 'Maintenance',
  travel: 'Travel',
  other: 'Other',
};

const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  card: 'Card',
  cash: 'Cash',
  direct_debit: 'Direct Debit',
  cheque: 'Cheque',
  other: 'Other',
};

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  paid: 'Paid',
  overdue: 'Overdue',
  cancelled: 'Cancelled',
};

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

function fmt(n: number) {
  return `£${n.toFixed(2)}`;
}

function calcVat(ex: number) {
  const amount = Math.max(0, ex);
  const vat = Math.round(amount * VAT_RATE * 100) / 100;
  return { ex: Math.round(amount * 100) / 100, vat, total: Math.round((amount + vat) * 100) / 100 };
}

function quarterRange(year: number, q: number) {
  const m0 = (q - 1) * 3 + 1;
  const m1 = m0 + 2;
  const start = `${year}-${String(m0).padStart(2, '0')}-01`;
  const endDay = new Date(year, m1, 0).getDate();
  const end = `${year}-${String(m1).padStart(2, '0')}-${String(endDay).padStart(2, '0')}`;
  return { start, end };
}

function currentQuarter() {
  const now = new Date();
  const q = Math.floor(now.getMonth() / 3) + 1;
  return quarterRange(now.getFullYear(), q);
}

type Tab = 'expenses' | 'reports' | 'vat';

const emptyForm = () => ({
  expense_date: new Date().toISOString().split('T')[0],
  category: 'other',
  vendor_name: '',
  reference_number: '',
  description: '',
  amount_ex_vat: '',
  payment_method: 'bank_transfer',
  payment_status: 'pending',
});

export default function ExpensesPage() {
  const { user } = useAuth();
  const canWrite = can(user, 'exp.write');
  const canDelete = can(user, 'exp.delete');
  const [tab, setTab] = useState<Tab>('expenses');
  const [meta, setMeta] = useState<ExpenseMeta | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [dashboard, setDashboard] = useState<ExpenseDashboard | null>(null);
  const [report, setReport] = useState<ExpenseReport | null>(null);
  const [vatReport, setVatReport] = useState<VatReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState(currentQuarter().start);
  const [endDate, setEndDate] = useState(currentQuarter().end);
  const [groupBy, setGroupBy] = useState('category');
  const [search, setSearch] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [addOpen, setAddOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());
  const [docFile, setDocFile] = useState<File | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const vatPreview = useMemo(() => {
    const n = parseFloat(form.amount_ex_vat);
    if (!Number.isFinite(n)) return { ex: 0, vat: 0, total: 0 };
    return calcVat(n);
  }, [form.amount_ex_vat]);

  const loadAll = useCallback(async () => {
    setLoading(true);
    try {
      const [list, dash, rep, vat] = await Promise.all([
        api.expenses.list({ start_date: startDate, end_date: endDate }),
        api.expenses.dashboard(startDate, endDate),
        api.expenses.expenseReport(startDate, endDate, groupBy),
        api.expenses.vatReport(startDate, endDate),
      ]);
      setExpenses(list);
      setDashboard(dash);
      setReport(rep);
      setVatReport(vat);
    } catch {
      toast.error('Failed to load expenses');
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, groupBy]);

  useEffect(() => {
    api.expenses.meta().then(setMeta).catch(() => {});
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  useEffect(() => {
    if (tab === 'reports') {
      api.expenses.expenseReport(startDate, endDate, groupBy).then(setReport).catch(() => {});
    }
  }, [groupBy, startDate, endDate, tab]);

  const resetForm = () => {
    setForm(emptyForm());
    setDocFile(null);
    setEditId(null);
  };

  const openEdit = (e: Expense) => {
    setEditId(e.id);
    setForm({
      expense_date: e.expense_date,
      category: e.category,
      vendor_name: e.vendor_name || '',
      reference_number: e.reference_number || '',
      description: e.description || '',
      amount_ex_vat: String(e.amount_ex_vat),
      payment_method: e.payment_method || 'bank_transfer',
      payment_status: e.payment_status,
    });
    setDocFile(null);
    setAddOpen(true);
  };

  const validateDoc = (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (!ext || !['png', 'jpg', 'jpeg'].includes(ext)) {
      toast.error('Only PNG and JPEG files are allowed');
      return false;
    }
    if (file.size > MAX_DOC_BYTES) {
      toast.error('File must be 300 KB or smaller');
      return false;
    }
    return true;
  };

  const handleSubmit = async () => {
    const amount = parseFloat(form.amount_ex_vat);
    if (!form.expense_date || !form.category || !Number.isFinite(amount) || amount < 0) {
      toast.error('Fill in date, category, and amount');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        expense_date: form.expense_date,
        category: form.category,
        vendor_name: form.vendor_name || undefined,
        reference_number: form.reference_number || undefined,
        description: form.description || undefined,
        amount_ex_vat: amount,
        payment_method: form.payment_method || undefined,
        payment_status: form.payment_status,
      };
      let saved: Expense;
      if (editId) {
        saved = await api.expenses.update(editId, payload);
      } else {
        saved = await api.expenses.create(payload);
      }
      if (docFile) {
        await api.expenses.uploadDocument(saved.id, docFile);
      }
      setAddOpen(false);
      resetForm();
      loadAll();
      toast.success(editId ? 'Expense updated' : 'Expense added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this expense?', async () => {
      try {
        await api.expenses.delete(id);
        loadAll();
        toast.success('Expense deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const downloadDoc = async (id: number) => {
    try {
      const token = localStorage.getItem('token')?.trim();
      const res = await fetch(api.expenses.documentUrl(id), {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (!res.ok) throw new Error('Download failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `expense-${id}-document`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  const filtered = useMemo(() => {
    let rows = expenses;
    if (categoryFilter !== 'all') rows = rows.filter((e) => e.category === categoryFilter);
    if (statusFilter !== 'all') rows = rows.filter((e) => e.payment_status === statusFilter);
    return rows;
  }, [expenses, categoryFilter, statusFilter]);

  const getSearchText = useCallback(
    (e: Expense) =>
      [e.expense_date, e.category, CAT_LABELS[e.category], e.vendor_name, e.reference_number, e.description, e.payment_status]
        .filter(Boolean)
        .join(' '),
    []
  );

  const getSortValue = useCallback((e: Expense, key: string) => {
    switch (key) {
      case 'date':
        return e.expense_date;
      case 'category':
        return CAT_LABELS[e.category] || e.category;
      case 'vendor':
        return e.vendor_name || '';
      case 'ex_vat':
        return e.amount_ex_vat;
      case 'vat':
        return e.vat_amount;
      case 'total':
        return e.total_amount;
      case 'status':
        return e.payment_status;
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    filtered,
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
  }, [search, categoryFilter, statusFilter]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const categories = meta?.categories || Object.keys(CAT_LABELS);

  const FormFields = (
    <div className="grid gap-4 sm:grid-cols-2">
      <div>
        <Label>Expense date</Label>
        <Input type="date" value={form.expense_date} onChange={(ev) => setForm((f) => ({ ...f, expense_date: ev.target.value }))} />
      </div>
      <div>
        <Label>Category</Label>
        <Select value={form.category} onValueChange={(v) => setForm((f) => ({ ...f, category: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {categories.map((c) => (
              <SelectItem key={c} value={c}>{CAT_LABELS[c] || c}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Vendor / supplier</Label>
        <Input value={form.vendor_name} onChange={(ev) => setForm((f) => ({ ...f, vendor_name: ev.target.value }))} />
      </div>
      <div>
        <Label>Reference / invoice no.</Label>
        <Input value={form.reference_number} onChange={(ev) => setForm((f) => ({ ...f, reference_number: ev.target.value }))} />
      </div>
      <div className="sm:col-span-2">
        <Label>Description / notes</Label>
        <textarea
          className="w-full min-h-[60px] rounded-md border border-input bg-background px-3 py-2 text-sm"
          value={form.description}
          onChange={(ev) => setForm((f) => ({ ...f, description: ev.target.value }))}
          rows={2}
        />
      </div>
      <div>
        <Label>Amount (ex VAT)</Label>
        <Input type="number" min="0" step="0.01" value={form.amount_ex_vat} onChange={(ev) => setForm((f) => ({ ...f, amount_ex_vat: ev.target.value }))} />
      </div>
      <div>
        <Label>VAT (20%)</Label>
        <Input readOnly value={fmt(vatPreview.vat)} className="bg-muted" />
      </div>
      <div>
        <Label>Total (inc VAT)</Label>
        <Input readOnly value={fmt(vatPreview.total)} className="bg-muted" />
      </div>
      <div>
        <Label>Payment method</Label>
        <Select value={form.payment_method} onValueChange={(v) => setForm((f) => ({ ...f, payment_method: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(meta?.payment_methods || Object.keys(METHOD_LABELS)).map((m) => (
              <SelectItem key={m} value={m}>{METHOD_LABELS[m] || m}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <div>
        <Label>Payment status</Label>
        <Select value={form.payment_status} onValueChange={(v) => setForm((f) => ({ ...f, payment_status: v }))}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(meta?.payment_statuses || Object.keys(STATUS_LABELS)).map((s) => (
              <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      {canWrite && (
        <div className="sm:col-span-2">
          <Label>Supporting document (PNG/JPEG, max 300 KB)</Label>
          <Input
            type="file"
            accept="image/png,image/jpeg,.png,.jpg,.jpeg"
            onChange={(ev) => {
              const f = ev.target.files?.[0];
              if (f && validateDoc(f)) setDocFile(f);
              else if (f) ev.target.value = '';
            }}
          />
          {docFile && <p className="text-xs text-muted-foreground mt-1">{docFile.name} ({Math.round(docFile.size / 1024)} KB)</p>}
        </div>
      )}
    </div>
  );

  return (
    <ProtectedRoute>
      <AppShell>
        {user?.enabled_modules?.expenses === false ? (
          <div className="p-8 text-center text-muted-foreground">Expenses module is not enabled for your account.</div>
        ) : (
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><Receipt className="size-7 text-primary" /> Expenses</span>}
            description="Record business expenses, VAT, and supporting documents"
            actions={
              canWrite ? (
                <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
                  <DialogTrigger asChild>
                    <Button onClick={() => { resetForm(); setAddOpen(true); }}>
                      <Plus className="size-4 mr-1" />
                      Add expense
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>{editId ? 'Edit expense' : 'Add expense'}</DialogTitle>
                    </DialogHeader>
                    {FormFields}
                    <div className="flex justify-end gap-2 pt-2">
                      <Button variant="outline" onClick={() => { setAddOpen(false); resetForm(); }}>Cancel</Button>
                      <Button onClick={handleSubmit} disabled={submitting}>{submitting ? 'Saving…' : editId ? 'Update' : 'Save'}</Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : undefined
            }
          />

          <Card>
            <CardContent className="pt-6">
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <Label className="text-xs">From</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="w-40" />
                </div>
                <div>
                  <Label className="text-xs">To</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} className="w-40" />
                </div>
                <div className="flex flex-wrap gap-1">
                  {[1, 2, 3, 4].map((q) => {
                    const yr = new Date().getFullYear();
                    const { start, end } = quarterRange(yr, q);
                    return (
                      <Button
                        key={q}
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => { setStartDate(start); setEndDate(end); }}
                      >
                        Q{q} {yr}
                      </Button>
                    );
                  })}
                </div>
              </div>
            </CardContent>
          </Card>

          {dashboard && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total expenses</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold">{fmt(dashboard.total_expenses_inc_vat)}</p><p className="text-xs text-muted-foreground">Ex VAT: {fmt(dashboard.total_expenses_ex_vat)}</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Expense VAT</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-amber-600">{fmt(dashboard.total_expense_vat)}</p><p className="text-xs text-muted-foreground">VAT paid on expenses</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Invoice VAT</CardTitle></CardHeader>
                <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(dashboard.total_invoice_vat)}</p><p className="text-xs text-muted-foreground">VAT collected on invoices</p></CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Net VAT</CardTitle></CardHeader>
                <CardContent>
                  <p className={cn('text-2xl font-bold flex items-center gap-1', dashboard.net_vat_payable >= 0 ? 'text-red-600' : 'text-green-600')}>
                    {dashboard.net_vat_payable >= 0 ? <TrendingUp className="size-5" /> : <TrendingDown className="size-5" />}
                    {fmt(Math.abs(dashboard.net_vat_payable))}
                  </p>
                  <p className="text-xs text-muted-foreground">{dashboard.net_vat_payable >= 0 ? 'Payable to HMRC' : 'Refundable'}</p>
                </CardContent>
              </Card>
            </div>
          )}

          <ModuleTabs
            tabs={[
              { id: 'expenses', label: 'Expenses' },
              { id: 'reports', label: 'Reports' },
              { id: 'vat', label: 'VAT' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'expenses' && (
            <>
              {dashboard && dashboard.category_summary.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Category summary</CardTitle></CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-2">
                      {dashboard.category_summary.map((c) => (
                        <div key={c.category} className="rounded-lg border px-3 py-2 text-sm">
                          <span className="font-medium">{CAT_LABELS[c.category] || c.category}</span>
                          <span className="text-muted-foreground ml-2">{fmt(c.total_inc_vat)} ({c.count})</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <CardTitle>Expense records</CardTitle>
                  <div className="flex flex-wrap gap-2">
                    <Input placeholder="Search…" value={search} onChange={(e) => setSearch(e.target.value)} className="w-44" />
                    <Select value={categoryFilter} onValueChange={setCategoryFilter}>
                      <SelectTrigger className="w-36"><SelectValue placeholder="Category" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All categories</SelectItem>
                        {categories.map((c) => <SelectItem key={c} value={c}>{CAT_LABELS[c] || c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                    <Select value={statusFilter} onValueChange={setStatusFilter}>
                      <SelectTrigger className="w-32"><SelectValue placeholder="Status" /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All statuses</SelectItem>
                        {(meta?.payment_statuses || Object.keys(STATUS_LABELS)).map((s) => (
                          <SelectItem key={s} value={s}>{STATUS_LABELS[s] || s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </CardHeader>
                <CardContent>
                  {loading ? (
                    <div className="text-center py-8 text-muted-foreground">Loading…</div>
                  ) : pageRows.length === 0 ? (
                    <div className="text-center py-8 text-muted-foreground">
                      {search ? 'No expenses match your search.' : 'No expenses in this period.'}
                    </div>
                  ) : (
                    <>
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHead label="Date" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Category" colKey="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Vendor" colKey="vendor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <TableHead>Reference</TableHead>
                            <SortableHead label="Ex VAT" colKey="ex_vat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="VAT" colKey="vat" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Total" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <TableHead className="w-28">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageRows.map((e: Expense) => (
                            <TableRow key={e.id}>
                              <TableCell>{e.expense_date}</TableCell>
                              <TableCell>{CAT_LABELS[e.category] || e.category}</TableCell>
                              <TableCell>{e.vendor_name || '—'}</TableCell>
                              <TableCell className="max-w-[120px] truncate">{e.reference_number || '—'}</TableCell>
                              <TableCell>{fmt(e.amount_ex_vat)}</TableCell>
                              <TableCell>{fmt(e.vat_amount)}</TableCell>
                              <TableCell className="font-medium">{fmt(e.total_amount)}</TableCell>
                              <TableCell>
                                <span className={cn('px-2 py-0.5 rounded text-xs font-medium', STATUS_STYLES[e.payment_status])}>
                                  {STATUS_LABELS[e.payment_status] || e.payment_status}
                                </span>
                              </TableCell>
                              <TableCell>
                                <div className="flex gap-1">
                                  {e.has_document && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => downloadDoc(e.id)} title="Download document">
                                      <Download className="size-4" />
                                    </Button>
                                  )}
                                  {canWrite && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => openEdit(e)} title="Edit">
                                      <Pencil className="size-4" />
                                    </Button>
                                  )}
                                  {canDelete && (
                                    <Button type="button" variant="ghost" size="icon" onClick={() => handleDelete(e.id)} title="Delete">
                                      <Trash2 className="size-4 text-destructive" />
                                    </Button>
                                  )}
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
                        onPageSizeChange={setPageSize}
                      />
                    </>
                  )}
                </CardContent>
              </Card>

              {dashboard && dashboard.recent_expenses.length > 0 && (
                <Card>
                  <CardHeader><CardTitle className="text-base">Recent expenses</CardTitle></CardHeader>
                  <CardContent>
                    <div className="space-y-2">
                      {dashboard.recent_expenses.map((e) => (
                        <div key={e.id} className="flex items-center justify-between text-sm border-b pb-2 last:border-0">
                          <div>
                            <span className="font-medium">{CAT_LABELS[e.category] || e.category}</span>
                            {e.vendor_name && <span className="text-muted-foreground ml-2">{e.vendor_name}</span>}
                            <span className="text-muted-foreground ml-2">{e.expense_date}</span>
                          </div>
                          <span className="font-medium">{fmt(e.total_amount)}</span>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}
            </>
          )}

          {tab === 'reports' && report && (
            <Card>
              <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                <CardTitle>Expense report</CardTitle>
                <Select value={groupBy} onValueChange={setGroupBy}>
                  <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="category">By category</SelectItem>
                    <SelectItem value="vendor">By vendor</SelectItem>
                    <SelectItem value="month">By month</SelectItem>
                  </SelectContent>
                </Select>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total ex VAT</p><p className="text-lg font-bold">{fmt(report.totals.total_ex_vat)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total VAT</p><p className="text-lg font-bold">{fmt(report.totals.total_vat)}</p></div>
                  <div className="rounded-lg border p-3"><p className="text-xs text-muted-foreground">Total inc VAT</p><p className="text-lg font-bold">{fmt(report.totals.total_inc_vat)}</p></div>
                </div>
                <StatusBarChart
                  data={report.breakdown.map((row) => ({
                    name: groupBy === 'category' ? (CAT_LABELS[row.key] || row.key) : row.key,
                    value: row.total_inc_vat,
                  }))}
                  title="Expense breakdown"
                />
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{groupBy === 'vendor' ? 'Vendor' : groupBy === 'month' ? 'Month' : 'Category'}</TableHead>
                      <TableHead>Count</TableHead>
                      <TableHead>Ex VAT</TableHead>
                      <TableHead>VAT</TableHead>
                      <TableHead>Inc VAT</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {report.breakdown.map((row) => (
                      <TableRow key={row.key}>
                        <TableCell>{groupBy === 'category' ? (CAT_LABELS[row.key] || row.key) : row.key}</TableCell>
                        <TableCell>{row.count}</TableCell>
                        <TableCell>{fmt(row.total_ex_vat)}</TableCell>
                        <TableCell>{fmt(row.total_vat)}</TableCell>
                        <TableCell className="font-medium">{fmt(row.total_inc_vat)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}

          {tab === 'vat' && vatReport && (
            <div className="space-y-4">
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expense VAT total</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-amber-600">{fmt(vatReport.expense_vat_total)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Invoice VAT total</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold text-blue-600">{fmt(vatReport.invoice_vat_total)}</p></CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Net VAT summary</CardTitle></CardHeader>
                  <CardContent>
                    <p className={cn('text-2xl font-bold', vatReport.net_vat_summary >= 0 ? 'text-red-600' : 'text-green-600')}>
                      {fmt(vatReport.net_vat_summary)}
                    </p>
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Expenses inc VAT</CardTitle></CardHeader>
                  <CardContent><p className="text-2xl font-bold">{fmt(vatReport.expense_totals.total_inc_vat)}</p></CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Total VAT report</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableBody>
                      <TableRow>
                        <TableCell>VAT collected on invoices</TableCell>
                        <TableCell className="text-right font-medium">{fmt(vatReport.total_vat_report.collected_on_invoices)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell>VAT paid on expenses</TableCell>
                        <TableCell className="text-right font-medium">{fmt(vatReport.total_vat_report.paid_on_expenses)}</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="font-semibold">Net payable / refundable</TableCell>
                        <TableCell className={cn('text-right font-bold', vatReport.net_vat_summary >= 0 ? 'text-red-600' : 'text-green-600')}>
                          {fmt(vatReport.total_vat_report.net_payable_or_refundable)}
                        </TableCell>
                      </TableRow>
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              {dashboard && (
                <Card>
                  <CardHeader><CardTitle>Quarterly VAT summary ({new Date().getFullYear()})</CardTitle></CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Quarter</TableHead>
                          <TableHead>Expense VAT</TableHead>
                          <TableHead>Invoice VAT</TableHead>
                          <TableHead>Net VAT</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {dashboard.quarterly_vat.map((q) => (
                          <TableRow key={q.quarter}>
                            <TableCell>{q.quarter}</TableCell>
                            <TableCell>{fmt(q.expense_vat)}</TableCell>
                            <TableCell>{fmt(q.invoice_vat)}</TableCell>
                            <TableCell className={cn('font-medium', q.net_vat >= 0 ? 'text-red-600' : 'text-green-600')}>{fmt(q.net_vat)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              )}
            </div>
          )}
        </ModulePage>
        )}
      </AppShell>
    </ProtectedRoute>
  );
}
