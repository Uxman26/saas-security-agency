'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Payment, Invoice } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { CreditCard, Plus, Trash2 } from 'lucide-react';

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

  const invoiceMap = useMemo(() => new Map(invoices.map((i) => [i.id, i])), [invoices]);

  const loadPayments = () => {
    setLoading(true);
    api.payments.list().then(setPayments).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadPayments();
    api.invoices.list().then(setInvoices).catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!formAmount || !formMethod || !formPaidAt) return;
    setSubmitting(true);
    try {
      await api.payments.create({
        invoice_id: formInvoiceId ? parseInt(formInvoiceId) : undefined,
        amount: parseFloat(formAmount),
        method: formMethod,
        paid_at: formPaidAt ? `${formPaidAt}T00:00:00` : new Date().toISOString(),
      });
      setAddOpen(false);
      setFormInvoiceId('');
      setFormAmount('');
      setFormMethod('bank_transfer');
      setFormPaidAt(new Date().toISOString().split('T')[0]);
      loadPayments();
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this payment record? This cannot be undone.')) return;
    try {
      await api.payments.delete(id);
      loadPayments();
    } catch (err) { console.error(err); }
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

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><CreditCard className="size-7" /> Payments</h1>
              <p className="text-muted-foreground mt-1">{payments.length} payment{payments.length !== 1 ? 's' : ''} recorded</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={loadPayments} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="size-4 mr-2" />
                    Record Payment
                  </Button>
                </DialogTrigger>
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
                          min="0"
                          value={formAmount}
                          onChange={(e) => setFormAmount(e.target.value)}
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
            </div>
          </div>

          {/* Summary */}
          {payments.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Received</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-green-600">£{totalPaid.toFixed(2)}</span>
                </CardContent>
              </Card>
              {Object.entries(byMethod).map(([method, total]) => (
                <Card key={method}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-sm font-medium text-muted-foreground">{METHOD_LABELS[method] ?? method}</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <span className="text-2xl font-bold">£{total.toFixed(2)}</span>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}

          <div className="mb-4 flex flex-col sm:flex-row gap-3 flex-wrap">
            <Input
              placeholder="Search by method, date or invoice ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select value={methodFilter} onValueChange={setMethodFilter}>
              <SelectTrigger className="w-[180px]">
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
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payment Records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading payments...</div>
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
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                {METHOD_LABELS[p.method] ?? p.method}
                              </span>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {p.paid_at ? new Date(p.paid_at).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(p.id)}
                                title="Delete payment"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
      </div>
    </ProtectedRoute>
  );
}
