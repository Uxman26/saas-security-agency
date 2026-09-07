'use client';
import { InlineKpiTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Payment, Invoice } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  ResultsCard,
  ShowingCount,
  StatCards,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { BarChart3, Building2, CreditCard, FileText, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const PAYMENT_METHODS = ['bank_transfer', 'cash', 'cheque', 'card', 'direct_debit', 'other'];
const METHOD_LABELS: Record<string, string> = {
  bank_transfer: 'Bank Transfer',
  cash: 'Cash',
  cheque: 'Cheque',
  card: 'Card',
  direct_debit: 'Direct Debit',
  other: 'Other',
};

export default function PaymentsPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'payments', 'create');
  const canEditMod = canModule(permUser, 'payments', 'edit');
  const canDeleteMod = canModule(permUser, 'payments', 'delete');
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  // Form state
  const [formInvoiceId, setFormInvoiceId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('bank_transfer');
  const [formPaidAt, setFormPaidAt] = useState(new Date().toISOString().split('T')[0]);
  const [submitting, setSubmitting] = useState(false);
  const [editRec, setEditRec] = useState<Payment | null>(null);

  const invoiceMap = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const loadPayments = () => {
    setLoading(true);
    api.payments.list().then(setPayments).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayments();
    api.invoices.list().then(setInvoices).catch(() => {});
  }, []);

  const MAX_PAYMENT_AMOUNT = 99_999_999.99;

  const validatePaymentAmount = (raw: string): number | null => {
    const amount = parseFloat(raw);
    if (!raw.trim() || Number.isNaN(amount)) {
      toast.error('Enter a valid payment amount');
      return null;
    }
    if (amount <= 0) {
      toast.error('Amount must be greater than zero');
      return null;
    }
    if (amount > MAX_PAYMENT_AMOUNT) {
      toast.error('Amount is too large (max £99,999,999.99)');
      return null;
    }
    return Math.round(amount * 100) / 100;
  };

  const handleAdd = async () => {
    if (!formMethod || !formPaidAt) {
      toast.error('Method and date are required');
      return;
    }
    const amount = validatePaymentAmount(formAmount);
    if (amount == null) return;
    setSubmitting(true);
    try {
      await api.payments.create({
        invoice_id: formInvoiceId ? parseInt(formInvoiceId) : undefined,
        amount,
        method: formMethod,
        paid_at: formPaidAt ? `${formPaidAt}T00:00:00` : new Date().toISOString(),
      });
      setAddOpen(false);
      setFormInvoiceId('');
      setFormAmount('');
      setFormMethod('bank_transfer');
      setFormPaidAt(new Date().toISOString().split('T')[0]);
      loadPayments();
      toast.success('Payment recorded');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this payment record?', async () => {
      try {
        await api.payments.delete(id);
        loadPayments();
        toast.success('Payment deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const openEdit = (p: Payment) => {
    setAddOpen(false);
    setEditRec(p);
    setFormInvoiceId(p.invoice_id ? String(p.invoice_id) : '');
    setFormAmount(String(p.amount));
    setFormMethod(p.method || 'bank_transfer');
    setFormPaidAt(p.paid_at ? p.paid_at.slice(0, 10) : new Date().toISOString().split('T')[0]);
  };

  const handleEditSave = async () => {
    if (!editRec) return;
    const amount = validatePaymentAmount(formAmount);
    if (amount == null) return;
    if (!formMethod || !formPaidAt) {
      toast.error('Method and date are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.payments.update(editRec.id, {
        invoice_id: formInvoiceId ? parseInt(formInvoiceId, 10) : null,
        amount,
        method: formMethod,
        paid_at: `${formPaidAt}T00:00:00`,
      });
      setEditRec(null);
      setFormInvoiceId('');
      setFormAmount('');
      setFormMethod('bank_transfer');
      setFormPaidAt(new Date().toISOString().split('T')[0]);
      loadPayments();
      toast.success('Payment updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  const forTable = useMemo(
    () => (methodFilter === 'all' ? payments : payments.filter((p) => p.method === methodFilter)),
    [payments, methodFilter]
  );

  const getSearchText = useCallback(
    (p: Payment) =>
      [String(p.id), p.method, p.paid_at, String(p.invoice_id), String(p.amount)].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((p: Payment, key: string) => {
    switch (key) {
      case 'id':
        return p.id;
      case 'invoice':
        return p.invoice_id ?? 0;
      case 'amount':
        return p.amount;
      case 'method':
        return p.method || '';
      case 'date':
        return p.paid_at || '';
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    forTable,
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
  }, [search, methodFilter]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const byMethod = useMemo(() => {
    const map: Record<string, number> = {};
    payments.forEach((p) => {
      map[p.method] = (map[p.method] ?? 0) + p.amount;
    });
    return map;
  }, [payments]);

  /** The cards along the top, in the shape every module dashboard uses. */
  const topMethods = Object.entries(byMethod)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3);
  const statCards: StatCardSpec[] = [
    {
      key: 'total',
      label: 'Total received',
      value: `£${totalPaid.toFixed(2)}`,
      icon: CreditCard,
      tone: 'positive',
      caption: `${payments.length} payment${payments.length === 1 ? '' : 's'}`,
    },
    {
      key: 'count',
      label: 'Payments recorded',
      value: payments.length,
      icon: FileText,
      tone: 'neutral',
    },
    ...topMethods.map(([method, amount]) => ({
      key: `m-${method}`,
      label: METHOD_LABELS[method] ?? method,
      value: `£${amount.toFixed(2)}`,
      icon: Building2,
      tone: 'info' as const,
      action: { label: 'View', onClick: () => setMethodFilter(method) },
    })),
  ];

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <DashboardHeader
            title="Payments"
            hint="A payment is recorded against an invoice, so an invoice moves to Partial or Paid as payments land."
            description="Record and reconcile the money received against your invoices."
            actions={
              <>

              <Button variant="outline" onClick={loadPayments} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                {canCreateMod ? (
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 mr-2" />
                      Record Payment
                    </Button>
                  </DialogTrigger>
                ) : null}
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Record Payment</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1">
                      <Label>Invoice (optional)</Label>
                      <Select value={formInvoiceId || 'none'} onValueChange={(v) => setFormInvoiceId(v === 'none' ? '' : v)}>
                        <SelectTrigger>
                          <SelectValue placeholder="Link to invoice (optional)" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No invoice</SelectItem>
                          {invoices.map((inv) => (
                            <SelectItem key={inv.id} value={inv.id.toString()}>
                              Invoice #{inv.id} — £{inv.total.toFixed(2)} ({inv.status})
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>Amount (£) <span className="text-destructive">*</span></Label>
                        <Input
                          type="number"
                          step="0.01"
                          min="0.01"
                          max="99999999.99"
                          value={formAmount}
                          onChange={(e) => {
                            const v = e.target.value;
                            if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setFormAmount(v);
                          }}
                          placeholder="0.00"
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Payment Date <span className="text-destructive">*</span></Label>
                        <Input type="date" value={formPaidAt} onChange={(e) => setFormPaidAt(e.target.value)} />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Payment Method <span className="text-destructive">*</span></Label>
                      <Select value={formMethod} onValueChange={setFormMethod}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>{METHOD_LABELS[m] ?? m}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleAdd}
                      disabled={submitting || !formAmount || !formPaidAt}
                    >
                      {submitting ? 'Recording...' : 'Record Payment'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </>
            }
          />

          <div className="mb-6 mt-6">
            <StatCards cards={statCards} />
          </div>

          <div className="mb-4">
            <FilterBar
              onClear={() => {
                setSearch('');
                setMethodFilter('all');
              }}
            >
              <FilterField label="Search" className="min-w-[240px] flex-1">
                <Input
                  placeholder="Method, date or invoice ID…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FilterField>
              <FilterField label="Payment method">
                <Select value={methodFilter} onValueChange={setMethodFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All methods</SelectItem>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {METHOD_LABELS[m] ?? m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
            </FilterBar>
          </div>

          <ResultsCard
            title="Payment records"
            count={total}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          >
            <div className="p-4">
              {loading ? (
                <InlineKpiTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || methodFilter !== 'all'
                    ? 'No payments match your filters.'
                    : 'No payments recorded yet. Click "Record Payment" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Payment ID" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Invoice" colKey="invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Amount" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Method" colKey="method" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Date Paid" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((p) => {
                        const inv = p.invoice_id ? invoiceMap.get(p.invoice_id) : null;
                        return (
                          <TableRow key={p.id}>
                            <TableCell className="font-medium text-muted-foreground">#{p.id}</TableCell>
                            <TableCell>
                              {inv ? (
                                <span className="text-sm">
                                  Invoice #{inv.id} <span className="text-muted-foreground">(£{inv.total.toFixed(2)})</span>
                                </span>
                              ) : p.invoice_id ? (
                                <span className="text-sm text-muted-foreground">Invoice #{p.invoice_id}</span>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                            </TableCell>
                            <TableCell className="font-bold text-green-600 whitespace-nowrap">
                              £{p.amount.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Pill tone="info">{METHOD_LABELS[p.method] ?? p.method}</Pill>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {canEditMod ? (
                                  <Button variant="ghost" size="sm" onClick={() => openEdit(p)} title="Edit payment">
                                    <Pencil className="size-4" />
                                  </Button>
                                ) : null}
                                {canDeleteMod ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(p.id)}
                                    title="Delete payment"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {total > 0 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="payments" />
                  <TablePaginationBar
                    safePage={safePage}
                    pageCount={pageCount}
                    total={total}
                    pageSize={pageSize}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onPageChange={setPage}
                  />
                </div>
              ) : null}
            </div>
          </ResultsCard>

          <div className="mt-6">
            <QuickLinks
              links={[
                {
                  key: 'invoices',
                  title: 'Invoices',
                  description: 'What is owed, what is overdue and what is still draft.',
                  icon: FileText,
                  tone: 'neutral',
                  action: { label: 'View invoices', href: '/invoices' },
                },
                {
                  key: 'clients',
                  title: 'Clients',
                  description: 'Contract dates and the sites each client is billed for.',
                  icon: Building2,
                  tone: 'info',
                  action: { label: 'Manage clients', href: '/clients' },
                },
                {
                  key: 'reports',
                  title: 'Reports',
                  description: 'Revenue and outstanding balance over any period.',
                  icon: BarChart3,
                  tone: 'positive',
                  action: { label: 'View reports', href: '/reports' },
                },
              ]}
            />
          </div>
        </div>
      </div>

      <Dialog
        open={!!editRec}
        onOpenChange={(open) => {
          if (!open) {
            setEditRec(null);
            setFormInvoiceId('');
            setFormAmount('');
            setFormMethod('bank_transfer');
            setFormPaidAt(new Date().toISOString().split('T')[0]);
          }
        }}
      >
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit payment</DialogTitle>
          </DialogHeader>
          {editRec && (
            <div className="space-y-4 py-2">
              <div className="space-y-1">
                <Label>Invoice (optional)</Label>
                <Select value={formInvoiceId || 'none'} onValueChange={(v) => setFormInvoiceId(v === 'none' ? '' : v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Link to invoice (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">No invoice</SelectItem>
                    {invoices.map((inv) => (
                      <SelectItem key={inv.id} value={inv.id.toString()}>
                        Invoice #{inv.id} — £{inv.total.toFixed(2)} ({inv.status})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1">
                  <Label>Amount (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    min="0.01"
                    max="99999999.99"
                    value={formAmount}
                    onChange={(e) => {
                      const v = e.target.value;
                      if (v === '' || /^\d*\.?\d{0,2}$/.test(v)) setFormAmount(v);
                    }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Payment Date</Label>
                  <Input type="date" value={formPaidAt} onChange={(e) => setFormPaidAt(e.target.value)} />
                </div>
              </div>
              <div className="space-y-1">
                <Label>Method</Label>
                <Select value={formMethod} onValueChange={setFormMethod}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {PAYMENT_METHODS.map((m) => (
                      <SelectItem key={m} value={m}>
                        {METHOD_LABELS[m] ?? m}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditRec(null)}>
                  Cancel
                </Button>
                <Button type="button" onClick={() => void handleEditSave()} disabled={submitting}>
                  {submitting ? 'Saving…' : 'Save changes'}
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
    </ProtectedRoute>
  );
}
