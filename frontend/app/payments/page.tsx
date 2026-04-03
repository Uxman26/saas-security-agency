'use client';

import { useState, useEffect, useMemo } from 'react';
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

  const filtered = useMemo(() =>
    payments.filter(p =>
      (p.method ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (p.paid_at ?? '').includes(search) ||
      (p.invoice_id?.toString() ?? '').includes(search)
    ), [payments, search]);

  const totalPaid = filtered.reduce((sum, p) => sum + p.amount, 0);
  const byMethod = useMemo(() => {
    const map: Record<string, number> = {};
    filtered.forEach(p => {
      map[p.method] = (map[p.method] ?? 0) + p.amount;
    });
    return map;
  }, [filtered]);

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

          <div className="mb-4">
            <Input
              placeholder="Search by method, date or invoice ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Payment Records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading payments...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No payments match your search.' : 'No payments recorded yet. Click "Record Payment" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Payment ID</TableHead>
                        <TableHead>Invoice</TableHead>
                        <TableHead>Amount</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Date Paid</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((p) => {
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
