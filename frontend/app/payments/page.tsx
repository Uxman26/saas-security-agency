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
import { BarChart3, Building2, CheckCircle2, Circle, CircleCheck, CreditCard, FileText, MapPin, Plus, Send, Trash2, Pencil } from 'lucide-react';
import { downloadBlob } from '@/lib/download-blob';
import { SendDocumentDialog, type SendDocumentRequest } from '@/components/finance/send-document-dialog';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { formatDateUK, localDateKey } from '@/lib/date-format';
import { METHOD_LABELS, PAYMENT_METHODS } from '@/lib/payment-methods';


export default function PaymentsPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'payments', 'create');
  const canEditMod = canModule(permUser, 'payments', 'edit');
  const canDeleteMod = canModule(permUser, 'payments', 'delete');
  const canDownloadReceipt = canModule(permUser, 'invoices', 'pdf_download');
  const canSendReceipt = canModule(permUser, 'invoices', 'send');
  const [sendRequest, setSendRequest] = useState<SendDocumentRequest | null>(null);
  const downloadReceipt = async (invoiceId: number) => {
    try {
      downloadBlob(await api.invoices.receiptPdf(invoiceId), `receipt-invoice-${invoiceId}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download the receipt');
    }
  };
  const [payments, setPayments] = useState<Payment[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [reviewFilter, setReviewFilter] = useState<'all' | 'unreviewed' | 'reviewed'>('all');
  const [siteFilter, setSiteFilter] = useState<string>('all');
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reviewBusy, setReviewBusy] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  // Form state
  const [formInvoiceId, setFormInvoiceId] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMethod, setFormMethod] = useState('bank_transfer');
  const [formPaidAt, setFormPaidAt] = useState(localDateKey());
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
      setFormPaidAt(localDateKey());
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
    setFormPaidAt(p.paid_at ? p.paid_at.slice(0, 10) : localDateKey());
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
      setFormPaidAt(localDateKey());
      loadPayments();
      toast.success('Payment updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setSubmitting(false);
    }
  };

  /** Mark one or more transactions reviewed / unreviewed, updating rows in place. */
  const setReviewed = async (ids: number[], reviewed: boolean) => {
    if (ids.length === 0) return;
    setReviewBusy(true);
    let failed = 0;
    const updated = new Map<number, Payment>();
    for (const id of ids) {
      try {
        updated.set(id, await api.payments.setReviewed(id, reviewed));
      } catch {
        failed += 1;
      }
    }
    setPayments((prev) => prev.map((p) => updated.get(p.id) ?? p));
    setSelected(new Set());
    setReviewBusy(false);
    const done = updated.size;
    if (done > 0) {
      toast.success(
        `${done} transaction${done === 1 ? '' : 's'} marked as ${reviewed ? 'reviewed' : 'not reviewed'}`
      );
    }
    if (failed > 0) toast.error(`${failed} could not be updated`);
  };

  const siteOptions = useMemo(
    () => Array.from(new Set(payments.flatMap((p) => p.site_names ?? []))).sort((a, b) => a.localeCompare(b)),
    [payments]
  );

  const forTable = useMemo(
    () =>
      payments.filter(
        (p) =>
          (methodFilter === 'all' || p.method === methodFilter) &&
          (reviewFilter === 'all' || (reviewFilter === 'reviewed') === !!p.reviewed_at) &&
          (siteFilter === 'all' || (p.site_names ?? []).includes(siteFilter))
      ),
    [payments, methodFilter, reviewFilter, siteFilter]
  );

  const getSearchText = useCallback(
    (p: Payment) =>
      [
        String(p.id),
        p.method,
        p.paid_at,
        String(p.invoice_id),
        String(p.amount),
        p.client_name,
        ...(p.site_names ?? []),
        p.reviewed_at ? 'reviewed' : 'not reviewed',
      ]
        .filter(Boolean)
        .join(' '),
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
      case 'site':
        return (p.site_names ?? []).join(', ') || p.client_name || '';
      case 'reviewed':
        return p.reviewed_at ? 1 : 0;
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
    setSelected(new Set());
  }, [search, methodFilter, reviewFilter, siteFilter]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const totalPaid = payments.reduce((sum, p) => sum + p.amount, 0);
  const unreviewedCount = payments.filter((p) => !p.reviewed_at).length;
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
    {
      key: 'to-review',
      label: 'To review',
      value: unreviewedCount,
      icon: CircleCheck,
      tone: unreviewedCount > 0 ? 'warning' : 'positive',
      caption: unreviewedCount > 0 ? 'Not yet checked' : 'All checked',
      action: unreviewedCount > 0 ? { label: 'View', onClick: () => setReviewFilter('unreviewed') } : undefined,
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
            title="Transactions"
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
                setReviewFilter('all');
                setSiteFilter('all');
              }}
            >
              <FilterField label="Search" className="min-w-[240px] flex-1">
                <Input
                  placeholder="Site, client, method, date or invoice ID…"
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
              <FilterField label="Site">
                <Select value={siteFilter} onValueChange={setSiteFilter}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All sites</SelectItem>
                    {siteOptions.map((name) => (
                      <SelectItem key={name} value={name}>
                        {name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </FilterField>
              <FilterField label="Review status">
                <Select value={reviewFilter} onValueChange={(v) => setReviewFilter(v as typeof reviewFilter)}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All</SelectItem>
                    <SelectItem value="unreviewed">Not reviewed</SelectItem>
                    <SelectItem value="reviewed">Reviewed</SelectItem>
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
                  {search || methodFilter !== 'all' || reviewFilter !== 'all' || siteFilter !== 'all'
                    ? 'No payments match your filters.'
                    : 'No payments recorded yet. Click "Record Payment" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  {canEditMod && selected.size > 0 ? (
                    <div className="mb-3 flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2 text-sm">
                      <span className="font-medium">{selected.size} selected</span>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewBusy}
                        onClick={() => void setReviewed(Array.from(selected), true)}
                      >
                        <CheckCircle2 className="size-4 mr-1.5 text-green-600" />
                        Mark as reviewed
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={reviewBusy}
                        onClick={() => void setReviewed(Array.from(selected), false)}
                      >
                        <Circle className="size-4 mr-1.5" />
                        Mark as not reviewed
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>
                        Clear
                      </Button>
                    </div>
                  ) : null}
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {canEditMod ? (
                          <TableHead className="w-8">
                            <input
                              type="checkbox"
                              aria-label="Select all on this page"
                              className="size-4 cursor-pointer accent-primary"
                              checked={pageRows.length > 0 && pageRows.every((p) => selected.has(p.id))}
                              onChange={(e) => {
                                const next = new Set(selected);
                                pageRows.forEach((p) => (e.target.checked ? next.add(p.id) : next.delete(p.id)));
                                setSelected(next);
                              }}
                            />
                          </TableHead>
                        ) : null}
                        <SortableHead label="Payment ID" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Invoice" colKey="invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Site" colKey="site" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Amount" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Method" colKey="method" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Date Paid" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Reviewed" colKey="reviewed" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((p) => {
                        const inv = p.invoice_id ? invoiceMap.get(p.invoice_id) : null;
                        return (
                          <TableRow key={p.id} className={selected.has(p.id) ? 'bg-primary/5' : undefined}>
                            {canEditMod ? (
                              <TableCell className="w-8">
                                <input
                                  type="checkbox"
                                  aria-label={`Select payment #${p.id}`}
                                  className="size-4 cursor-pointer accent-primary"
                                  checked={selected.has(p.id)}
                                  onChange={(e) => {
                                    const next = new Set(selected);
                                    if (e.target.checked) next.add(p.id);
                                    else next.delete(p.id);
                                    setSelected(next);
                                  }}
                                />
                              </TableCell>
                            ) : null}
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
                            <TableCell className="max-w-[240px]">
                              {(p.site_names ?? []).length > 0 ? (
                                <div className="flex items-start gap-1.5 text-sm">
                                  <MapPin className="size-3.5 mt-0.5 shrink-0 text-muted-foreground" />
                                  <span className="truncate" title={(p.site_names ?? []).join(', ')}>
                                    {(p.site_names ?? [])[0]}
                                    {(p.site_names ?? []).length > 1 ? (
                                      <span className="text-muted-foreground"> +{(p.site_names ?? []).length - 1} more</span>
                                    ) : null}
                                  </span>
                                </div>
                              ) : (
                                <span className="text-sm text-muted-foreground">—</span>
                              )}
                              {p.client_name ? (
                                <div className="text-xs text-muted-foreground truncate" title={p.client_name}>
                                  {p.client_name}
                                </div>
                              ) : null}
                            </TableCell>
                            <TableCell className="font-bold text-green-600 whitespace-nowrap">
                              £{p.amount.toFixed(2)}
                            </TableCell>
                            <TableCell>
                              <Pill tone="info">{METHOD_LABELS[p.method] ?? p.method}</Pill>
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {p.paid_at ? formatDateUK(p.paid_at) : '—'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap">
                              {canEditMod ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  disabled={reviewBusy}
                                  onClick={() => void setReviewed([p.id], !p.reviewed_at)}
                                  title={
                                    p.reviewed_at
                                      ? `Reviewed ${formatDateUK(p.reviewed_at)}${p.reviewed_by_name ? ` by ${p.reviewed_by_name}` : ''} — click to undo`
                                      : 'Mark as reviewed'
                                  }
                                  className={p.reviewed_at ? 'text-green-600 hover:text-green-700' : 'text-muted-foreground'}
                                >
                                  {p.reviewed_at ? <CheckCircle2 className="size-4 mr-1" /> : <Circle className="size-4 mr-1" />}
                                  {p.reviewed_at ? 'Reviewed' : 'Mark reviewed'}
                                </Button>
                              ) : p.reviewed_at ? (
                                <Pill tone="positive">Reviewed</Pill>
                              ) : (
                                <span className="text-sm text-muted-foreground">Not reviewed</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {p.invoice_id && canDownloadReceipt ? (
                                  <Button variant="ghost" size="sm" onClick={() => void downloadReceipt(p.invoice_id!)} title="Download receipt">
                                    <FileText className="size-4" />
                                  </Button>
                                ) : null}
                                {p.invoice_id && canSendReceipt ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    title="Send receipt"
                                    onClick={() =>
                                      setSendRequest({
                                        title: `Send receipt for invoice #${p.invoice_id}`,
                                        description: 'The payment receipt is emailed as a PDF attachment.',
                                        email: inv?.client_email,
                                        send: (to) => api.invoices.sendReceipt(p.invoice_id!, to),
                                      })
                                    }
                                  >
                                    <Send className="size-4" />
                                  </Button>
                                ) : null}
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
            setFormPaidAt(localDateKey());
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
