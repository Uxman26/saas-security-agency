'use client';
import { InlineKpiTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Invoice, Client, Site, Guard } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, NEW_ROW_HIGHLIGHT_CLASS, useScrollToNewRow, useTableList, useTableSort } from '@/lib/use-table-list';
import { Building2, CalendarDays, Clock, Coffee, Filter, PoundSterling, Users, FileText, Zap, Trash2, Eye, Pencil, Download, Copy, CreditCard, AlertTriangle, BadgePoundSterling, CheckCircle2, FilePlus2, ReceiptText, Wallet, FileMinus2, Send, Undo2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { can, canModule } from '@/lib/permissions';
import { canSendInvoiceReminder, formatDueCountdown, isInvoiceOpen, isInvoiceOverdue, isInvoicePastDue, nextInvoiceAction } from '@/lib/invoice-utils';
import { downloadBlob } from '@/lib/download-blob';
import { SendDocumentDialog, type SendDocumentRequest } from '@/components/finance/send-document-dialog';
import { formatDateUK, localDateKey, localDateOffset } from '@/lib/date-format';
import { formatMoney } from '@/lib/rota-shifts-utils';
import { formatInvoiceMoney, invoiceCurrencyCode } from '@/lib/invoice-currency';
import { ModulePage, ModuleTabs } from '@/components/module-layout';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  ResultsCard,
  RowActionsMenu,
  ShowingCount,
  StatCards,
  type ResultsView,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { StatusPieChart } from '@/components/charts/status-chart';
import { METHOD_LABELS, PAYMENT_METHODS } from '@/lib/payment-methods';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { DueDateField } from '@/components/invoices/due-date-field';
import {
  BillToTabs,
  CurrencySelect,
  INVOICE_DIALOG_BODY_CLASS,
  INVOICE_DIALOG_CONTENT_CLASS,
  InvoiceDialogHeader,
  InvoiceFieldLabel,
  InvoiceFormCard,
  InvoiceFormDialog,
  LineItemsEditor,
  addLinePayload,
  isBlankLine,
  linePayload,
  lineSiteOptions,
  type FormLine,
} from '@/components/invoices/invoice-form-dialog';
import {
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';
import { cn } from '@/lib/utils';
import { BulkActionBar, BulkDeleteButton, RowCheckbox, SelectAllCheckbox, useBulkSelection } from '@/components/bulk-select';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];

/** A created invoice opens straight away; this carries its id back to the list. */
const NEW_INVOICE_FOCUS_KEY = 'invoices:new-invoice-focus';

function rememberNewInvoice(id: number) {
  try {
    sessionStorage.setItem(NEW_INVOICE_FOCUS_KEY, String(id));
  } catch {
    /* storage blocked: the list simply opens at the top */
  }
}

function takeNewInvoiceFocus(): number | null {
  try {
    const raw = sessionStorage.getItem(NEW_INVOICE_FOCUS_KEY);
    sessionStorage.removeItem(NEW_INVOICE_FOCUS_KEY);
    const id = raw ? parseInt(raw, 10) : NaN;
    return Number.isFinite(id) ? id : null;
  } catch {
    return null;
  }
}

function statusLabel(status: string): string {
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function invoiceStatusTone(status: string): 'positive' | 'danger' | 'muted' | 'warning' | 'neutral' {
  if (status === 'paid') return 'positive';
  if (status === 'overdue') return 'danger';
  if (status === 'draft') return 'muted';
  if (status === 'partial') return 'warning';
  return 'neutral';
}

function formatGbp(n: unknown, currency = 'GBP'): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || Math.abs(v) > 1e12) return '—';
  return formatInvoiceMoney(v, currency);
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [invoiceStats, setInvoiceStats] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [genMode, setGenMode] = useState<'client' | 'site'>('client');
  const [genClientId, setGenClientId] = useState('');
  const [genSiteId, setGenSiteId] = useState('');
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genDueDate, setGenDueDate] = useState(() => localDateOffset(30));
  const [genLoading, setGenLoading] = useState(false);
  const [genBreakMode, setGenBreakMode] = useState<'shift' | 'without_break' | 'deduct'>('shift');
  const [genCurrency, setGenCurrency] = useState('GBP');
  // Manual lines added to a rota invoice for work that isn't on the rota.
  const [genLines, setGenLines] = useState<FormLine[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [customOpen, setCustomOpen] = useState(false);
  // Invoice open in the shared form dialog for editing; null when closed.
  const [editInvoiceId, setEditInvoiceId] = useState<number | null>(null);

  useEffect(() => {
    if (searchParams.get('custom') === '1') setCustomOpen(true);
    const editParam = parseInt(searchParams.get('edit') ?? '', 10);
    if (Number.isFinite(editParam)) setEditInvoiceId(editParam);
  }, [searchParams]);
  // Optional narrowing on top of the client/site the invoice is raised for.
  const [genNarrow, setGenNarrow] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const [sites, setSites] = useState<Site[]>([]);
  const [pageTab, setPageTab] = useState<'overview' | 'invoices'>('invoices');
  const [listTab, setListTab] = useState<'unpaid' | 'draft' | 'all'>('all');
  // Client / Site / Contractor / Sub-contractor / Staff / Job title, in any combination.
  // The Client control is the old "All customers" dropdown: it now covers every site
  // assigned to that client rather than only invoices raised against the client record.
  const [workFilters, setWorkFilters] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const filterOptions = useWorkFilterOptions();
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [statusFilter, setStatusFilter] = useState(() => searchParams.get('status') ?? '');
  const [search, setSearch] = useState('');
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payDate, setPayDate] = useState('');
  const [payMethod, setPayMethod] = useState('');
  const [payAccountId, setPayAccountId] = useState('');
  const [payMemo, setPayMemo] = useState('');
  const [payAccounts, setPayAccounts] = useState<{ id: number; code: string; name: string }[]>([]);
  const [statusSavingId, setStatusSavingId] = useState<number | null>(null);
  const [payLoading, setPayLoading] = useState(false);
  const [reminderInvoice, setReminderInvoice] = useState<Invoice | null>(null);
  const [reminderSending, setReminderSending] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort('client');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [resultsView, setResultsView] = useState<ResultsView>('list');

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  /** Sites that carry a client, so the invoice gets a real customer record. */
  const invoiceableSites = useMemo(
    () => sites.filter((s) => s.client_id != null && s.client_id > 0),
    [sites]
  );

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: c.name })),
    [clients]
  );
  // Every site can be invoiced, linked to a client or not. A site with no client is
  // still labelled as such, because the invoice it raises carries no customer record —
  // the site name stands in for one on the document and in the Customer column.
  const siteOptions = useMemo(
    () =>
      sites.map((s) => {
        const client = s.client_id ? clientMap.get(s.client_id) : undefined;
        return {
          value: String(s.id),
          label: `${s.name} · ${client ?? 'No client'}`,
        };
      }),
    [sites, clientMap]
  );
  const selectedSiteUnlinked = useMemo(
    () =>
      genMode === 'site' &&
      !!genSiteId &&
      !invoiceableSites.some((s) => String(s.id) === genSiteId),
    [genMode, genSiteId, invoiceableSites]
  );

  useEffect(() => {
    if (genOpen && guards.length === 0) api.guards.list().then(setGuards).catch(() => {});
  }, [genOpen, guards.length]);
  const genGuardOptions = useMemo(() => guards.map((g) => ({ value: String(g.id), label: g.full_name })), [guards]);
  const genLineSiteOptions = useMemo(() => lineSiteOptions(sites, clients, genClientId), [sites, clients, genClientId]);

  const loadInvoices = useCallback(() => {
    setLoading(true);
    const shared = {
      ...toWorkFilterParams(workFilters),
      due_from: dueFrom || undefined,
      due_to: dueTo || undefined,
    };
    Promise.all([
      api.invoices.list({
        ...shared,
        status_group: listTab,
        status: statusFilter || undefined,
      }),
      api.invoices.list(shared),
    ])
      .then(([rows, statsRows]) => {
        setInvoices(rows);
        setInvoiceStats(statsRows);
      })
      .catch(() => toast.error('Could not load invoices'))
      .finally(() => setLoading(false));
  }, [workFilters, listTab, statusFilter, dueFrom, dueTo]);

  useEffect(() => {
    loadInvoices();
    api.clients.list().then(setClients).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
  }, [loadInvoices]);

  const createFromManualLines = async (manual: FormLine[], forcedSite?: string) => {
    setGenLoading(true);
    try {
      const inv = await api.invoices.create({
        ...(genMode === 'site' ? { site_id: parseInt(genSiteId, 10) } : { client_id: parseInt(genClientId, 10) }),
        period_start: genStart,
        period_end: genEnd,
        due_date: genDueDate || undefined,
        currency: genCurrency,
        lines: manual.map((l) => linePayload(l, forcedSite)),
      });
      setGenOpen(false);
      setGenLines([]);
      loadInvoices();
      toast.success(`Invoice #${inv.id} created from manual lines`);
      rememberNewInvoice(inv.id);
      router.push(`/invoices/${inv.id}/view`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setGenLoading(false);
    }
  };

  const handleGenerate = async (force = false) => {
    if (!genStart || !genEnd) return;
    if (genMode === 'client' && !genClientId) return;
    if (genMode === 'site' && !genSiteId) return;
    if (genStart > genEnd) {
      toast.error('Period start cannot be after period end');
      return;
    }
    const manual = genLines.filter((l) => !isBlankLine(l));
    const forcedSite = genMode === 'site' ? genSiteId : undefined;
    setGenLoading(true);
    try {
      let inv = await api.invoices.generate({
        period_start: genStart,
        period_end: genEnd,
        ...(force ? { force: true } : {}),
        break_mode: genBreakMode,
        currency: genCurrency,
        ...(genDueDate ? { due_date: genDueDate } : {}),
        ...toWorkFilterParams(genNarrow),
        ...(genMode === 'client' ? { client_id: parseInt(genClientId, 10) } : {}),
        ...(genMode === 'site' ? { site_id: parseInt(genSiteId, 10) } : {}),
      });
      for (const l of manual) await api.invoices.addLine(inv.id, addLinePayload(l, forcedSite));
      if (manual.length) inv = await api.invoices.get(inv.id);
      setGenOpen(false);
      setGenLines([]);
      setGenClientId('');
      setGenSiteId('');
      setGenNarrow(EMPTY_WORK_FILTERS);
      setGenBreakMode('shift');
      setGenStart('');
      setGenEnd('');
      setGenDueDate(localDateOffset(30));
      loadInvoices();
      const shifts = (inv.lines ?? []).filter((l) => l.shift_date).length;
      toast.success(
        `Invoice #${inv.id} — ${formatMoney(inv.total ?? 0)} from ${shifts} shift${shifts === 1 ? '' : 's'}`
      );
      // "Where did it go?" is the commonest question about this button, so it lands on
      // the invoice itself rather than a list the user then has to search.
      rememberNewInvoice(inv.id);
      router.push(`/invoices/${inv.id}/view`);
    } catch (err) {
      // 409 means an invoice already covers this period. That is nearly always a repeat
      // run, so it is offered as a choice rather than pushed through or lost as an error.
      const status = (err as { status?: number } | null)?.status;
      if (status === 409 && !force) {
        toast.confirm(
          err instanceof Error ? err.message : 'An invoice already covers this period.',
          () => handleGenerate(true),
          { label: 'Generate anyway', description: 'A second invoice will be raised for the same period.' }
        );
        return;
      }
      // No rota shifts, but the user typed lines of their own: offer to raise the
      // invoice from those alone rather than lose them.
      if (status === 400 && manual.length && /No published rota shifts/i.test(err instanceof Error ? err.message : '')) {
        toast.confirm(
          err instanceof Error ? err.message : 'No rota shifts found.',
          () => createFromManualLines(manual, forcedSite),
          { label: 'Use manual lines only', description: `Raise the invoice from your ${manual.length} manual line${manual.length === 1 ? '' : 's'}.` }
        );
        return;
      }
      toast.error(err instanceof Error ? err.message : 'Invoice generation failed');
    } finally {
      setGenLoading(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this invoice?', async () => {
      try {
        await api.invoices.delete(id);
        loadInvoices();
        toast.success('Invoice deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const downloadPdf = async (id: number) => {
    try {
      const blob = await api.invoices.pdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  /** What the Customer column shows. The API already substitutes the site name for a
   *  client-less invoice; the map is only a fallback for older cached rows. */
  const customerLabel = useCallback(
    (inv: Invoice) =>
      inv.client_name ?? (inv.client_id != null ? clientMap.get(inv.client_id) : undefined),
    [clientMap]
  );

  const getSearchText = useCallback(
    (inv: Invoice) =>
      [
        String(inv.id),
        customerLabel(inv),
        inv.status,
        inv.period_start,
        inv.period_end,
        inv.due_date,
        String(inv.total),
      ]
        .filter(Boolean)
        .join(' '),
    [customerLabel]
  );

  const getSortValue = useCallback(
    (inv: Invoice, key: string) => {
      switch (key) {
        case 'id':
          return inv.id;
        case 'client':
          return customerLabel(inv) ?? '';
        case 'period':
          return inv.period_start;
        case 'due':
          return inv.due_date ?? '';
        case 'total':
          return inv.total;
        case 'status':
          return inv.status;
        default:
          return '';
      }
    },
    [customerLabel]
  );

  const { pageRows, filteredRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    invoices,
    search,
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  const canBulkDelete = can(user, 'invoices.delete');
  const filteredIds = useMemo(() => filteredRows.map((i) => i.id), [filteredRows]);
  const pageIds = useMemo(() => pageRows.map((i) => i.id), [pageRows]);
  const selection = useBulkSelection(filteredIds);

  useEffect(() => {
    setPage(1);
  }, [search, statusFilter, workFilters]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const getInvoiceId = useCallback((inv: Invoice) => inv.id, []);
  const { focusRows, isHighlighted } = useScrollToNewRow(filteredRows, getInvoiceId, pageSize, setPage);

  // Creating an invoice opens it; coming back to this list then lands on it.
  useEffect(() => {
    const id = takeNewInvoiceFocus();
    if (id != null) focusRows(id);
  }, [focusRows]);

  const totalAmount = invoiceStats.reduce((sum, inv) => sum + inv.total, 0);
  const paidAmount = invoiceStats.reduce((sum, i) => sum + (i.amount_paid ?? 0), 0);
  const outstanding = invoiceStats
    .filter((i) => !['draft', 'paid', 'cancelled'].includes(i.status))
    .reduce(
      (sum, i) =>
        sum +
        (i.balance_due ??
          Math.max(0, i.total - (i.amount_paid ?? 0) - (i.credit_applied ?? 0))),
      0
    );
  const draftInvoices = invoiceStats.filter((i) => i.status === 'draft');
  const draftTotal = draftInvoices.reduce((sum, i) => sum + i.total, 0);

  const handleDuplicate = async (id: number) => {
    try {
      const dup = await api.invoices.duplicate(id);
      loadInvoices();
      focusRows(dup.id);
      toast.success(`Invoice #${dup.id} created`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Duplicate failed');
    }
  };

  const [sendRequest, setSendRequest] = useState<SendDocumentRequest | null>(null);

  const openRecordPayment = (inv: Invoice) => {
    setPayInvoice(inv);
    setPayDate(localDateKey());
    setPayAmount(String(inv.balance_due ?? inv.total));
    setPayMethod('');
    setPayAccountId('');
    setPayMemo('');
    api.payments
      .depositAccounts()
      .then(setPayAccounts)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not load payment accounts'));
  };

  const handleRecordPayment = async () => {
    if (!payInvoice || !payAmount || !payDate || !payMethod || !payAccountId) return;
    setPayLoading(true);
    try {
      await api.payments.create({
        invoice_id: payInvoice.id,
        amount: parseFloat(payAmount),
        method: payMethod,
        account_id: Number(payAccountId),
        memo: payMemo.trim() || undefined,
        paid_at: `${payDate}T00:00:00`,
      });
      setPayInvoice(null);
      setPayAmount('');
      loadInvoices();
      toast.success('Payment recorded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Payment failed');
    } finally {
      setPayLoading(false);
    }
  };

  const applyStatusChange = async (inv: Invoice, next: string) => {
    setStatusSavingId(inv.id);
    try {
      await api.invoices.updateStatus(inv.id, next);
      loadInvoices();
      toast.success(`Invoice marked as ${next}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not change the status');
    } finally {
      setStatusSavingId(null);
    }
  };

  const handleMarkUnsent = (inv: Invoice) => {
    toast.confirm(`Mark invoice #${inv.id} as unsent?`, () => applyStatusChange(inv, 'draft'), {
      label: 'Mark as unsent',
      description: 'It goes back to Draft and comes out of the accounts until it is sent again. The client is not notified.',
    });
  };

  const handleRevertPayments = (inv: Invoice) => {
    const paid = inv.amount_paid ?? 0;
    toast.confirm(
      `Revert ${paid > 0 ? `£${paid.toFixed(2)} of ` : ''}payments on invoice #${inv.id}?`,
      async () => {
        try {
          await api.invoices.revertPayments(inv.id);
          loadInvoices();
          toast.success('Payments reverted — the invoice is open again');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Could not revert the payments');
        }
      },
      {
        label: 'Revert payments',
        description:
          'Every payment recorded on this invoice is removed (they can be restored from the recycle bin) and taken out of the accounts.',
      }
    );
  };

  const handleStatusChange = (inv: Invoice, next: string) => {
    if (next === inv.status) return;
    if (next === 'draft' && inv.status !== 'draft') {
      handleMarkUnsent(inv);
      return;
    }
    if (next === 'sent') {
      toast.confirm('Mark this invoice as sent?', () => applyStatusChange(inv, next), {
        label: 'Mark as sent',
        description: 'The client is told by email or SMS when those notifications are switched on.',
      });
      return;
    }
    void applyStatusChange(inv, next);
  };

  const renderStatus = (inv: Invoice) => {
    const pill = (
      <Pill dot tone={invoiceStatusTone(inv.status)}>
        {statusLabel(inv.status)}
      </Pill>
    );
    if (!canModule(user, 'invoices', 'status_change')) return pill;
    return (
      <Select value={inv.status} onValueChange={(v) => handleStatusChange(inv, v)} disabled={statusSavingId === inv.id}>
        <SelectTrigger
          aria-label={`Change status of invoice ${inv.id}`}
          className="h-auto gap-1 border-0 bg-transparent p-0 shadow-none hover:opacity-80 data-[size=default]:h-auto dark:bg-transparent dark:hover:bg-transparent"
        >
          {pill}
        </SelectTrigger>
        <SelectContent>
          {STATUS_OPTIONS.map((s) => (
            <SelectItem key={s} value={s} disabled={s === 'sent' && !canModule(user, 'invoices', 'send')}>
              {statusLabel(s)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    );
  };

  const unpaidCount = invoiceStats.filter((i) => ['sent', 'unpaid', 'overdue', 'partial'].includes(i.status)).length;
  const draftCount = invoiceStats.filter((i) => i.status === 'draft').length;
  const currencyCodes = new Set(invoiceStats.map((i) => invoiceCurrencyCode(i.currency)));
  const statMoney = (n: number) => (currencyCodes.size > 1 ? 'Mixed' : formatGbp(n, [...currencyCodes][0] || 'GBP'));
  const openInvoices = invoiceStats.filter((i) => ['sent', 'unpaid', 'overdue', 'partial'].includes(i.status));
  const overdueAmount = openInvoices
    .filter((i) => i.status === 'overdue')
    .reduce((sum, i) => sum + (i.balance_due ?? Math.max(0, i.total - (i.amount_paid ?? 0) - (i.credit_applied ?? 0))), 0);
  const dueSoonAmount = openInvoices
    .filter((i) => {
      if (!i.due_date || i.status === 'overdue' || isInvoicePastDue(i)) return false;
      const due = new Date(`${i.due_date}T12:00:00`).getTime();
      const today = new Date();
      today.setHours(12, 0, 0, 0);
      const diff = Math.round((due - today.getTime()) / 86400000);
      return diff >= 0 && diff <= 30;
    })
    .reduce((sum, i) => sum + (i.balance_due ?? Math.max(0, i.total - (i.amount_paid ?? 0) - (i.credit_applied ?? 0))), 0);
  const paidForAverage = invoiceStats.filter((i) => i.status === 'paid' && i.created_at && i.updated_at);
  const averageDays =
    paidForAverage.length === 0
      ? null
      : Math.round(
          paidForAverage.reduce((sum, i) => {
            const start = new Date(i.created_at).getTime();
            const end = new Date(i.updated_at || i.created_at).getTime();
            return sum + Math.max(0, (end - start) / 86400000);
          }, 0) / paidForAverage.length
        );
  const unpaidShare = new Map<number, string>();
  const byCustomer = new Map<string, Invoice[]>();
  for (const inv of openInvoices) {
    const key = String(inv.client_id ?? inv.client_name ?? 'none');
    const list = byCustomer.get(key) ?? [];
    list.push(inv);
    byCustomer.set(key, list);
  }
  for (const list of byCustomer.values()) {
    if (list.length < 2) continue;
    list.forEach((inv, index) => unpaidShare.set(inv.id, `${index + 1} of ${list.length}`));
  }

  const formatInvoiceDate = (inv: Invoice) => {
    const raw = inv.created_at ?? inv.period_end;
    if (!raw) return '—';
    return formatDateUK(raw) || '—';
  };

  const canSendReminder = canModule(user, 'invoices', 'send');

  const handleSendReminder = async () => {
    if (!reminderInvoice || reminderSending) return;
    setReminderSending(true);
    try {
      const { message } = await api.invoices.sendReminder(reminderInvoice.id);
      toast.success(message);
      setReminderInvoice(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not send the reminder');
    } finally {
      setReminderSending(false);
    }
  };

  const canSendInvoice = canModule(user, 'invoices', 'status_change') && canSendReminder;
  const canRecordPayment = canModule(user, 'payments', 'create');

  const openSendReceipt = (inv: Invoice) =>
    setSendRequest({
      title: `Receipt for invoice #${inv.id}`,
      description: 'Check the receipt, then email it to the customer as a PDF, download it or print it.',
      email: inv.client_email,
      send: (to) => api.invoices.sendReceipt(inv.id, to),
      pdf: { load: () => api.invoices.receiptPdf(inv.id), filename: `receipt-invoice-${inv.id}.pdf` },
    });

  const downloadReceipt = async (inv: Invoice) => {
    try {
      downloadBlob(await api.invoices.receiptPdf(inv.id), `receipt-invoice-${inv.id}.pdf`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not download the receipt');
    }
  };

  /** Moves an invoice on from where it is now, without leaving the list. */
  const nextActionButtons = (inv: Invoice) => {
    const button = 'whitespace-nowrap';
    const next = nextInvoiceAction(inv);
    if (next === 'send' && canSendInvoice) {
      return (
        <Button variant="outline" size="sm" className={button} onClick={() => handleStatusChange(inv, 'sent')}>
          <Send className="size-3.5" />
          Send
        </Button>
      );
    }
    if (next === 'record_payment' && canRecordPayment) {
      return (
        <Button variant="outline" size="sm" className={button} onClick={() => openRecordPayment(inv)}>
          <CreditCard className="size-3.5" />
          Record payment
        </Button>
      );
    }
    if (next === 'send_reminder' && canSendReminder) {
      return (
        <Button variant="outline" size="sm" className={button} onClick={() => setReminderInvoice(inv)}>
          <Send className="size-3.5" />
          Send reminder
        </Button>
      );
    }
    if (next === 'paid' && canSendReminder) {
      const hasPayment = (inv.amount_paid ?? 0) > 0;
      return (
        <Button
          variant="outline"
          size="sm"
          className={button}
          disabled={!hasPayment}
          title={hasPayment ? undefined : 'Record the payment on this invoice to issue a receipt'}
          onClick={() => openSendReceipt(inv)}
        >
          <Send className="size-3.5" />
          Send receipt
        </Button>
      );
    }
    return null;
  };

  /**
   * What one invoice can have done to it. Defined once so the table rows and the card
   * grid offer exactly the same menu, and so a permission is checked in one place.
   */
  const rowActions = (inv: Invoice) => [
    { label: 'View invoice', icon: Eye, onSelect: () => router.push(`/invoices/${inv.id}/view`) },
    {
      label: 'Edit invoice',
      icon: Pencil,
      onSelect: () => setEditInvoiceId(inv.id),
      disabled: !can(user, 'invoices.write'),
    },
    { label: 'Download PDF', icon: Download, onSelect: () => void downloadPdf(inv.id) },
    {
      label: 'Record payment',
      icon: CreditCard,
      onSelect: () => openRecordPayment(inv),
      disabled:
        !canRecordPayment ||
        inv.status === 'draft' ||
        inv.status === 'cancelled' ||
        (inv.status === 'paid' && (inv.balance_due ?? 0) <= 0),
    },
    {
      label: 'Revert payment',
      icon: Undo2,
      onSelect: () => handleRevertPayments(inv),
      disabled: !((inv.amount_paid ?? 0) > 0) || !canModule(user, 'payments', 'delete'),
    },
    {
      label: 'Mark as unsent',
      icon: Undo2,
      onSelect: () => handleMarkUnsent(inv),
      disabled:
        !canModule(user, 'invoices', 'status_change') ||
        inv.status === 'draft' ||
        inv.status === 'cancelled' ||
        (inv.amount_paid ?? 0) > 0 ||
        (inv.credit_applied ?? 0) > 0,
    },
    {
      label: 'Download receipt',
      icon: ReceiptText,
      onSelect: () => void downloadReceipt(inv),
      disabled: !((inv.amount_paid ?? 0) > 0) || !canModule(user, 'invoices', 'pdf_download'),
    },
    {
      label: 'Send receipt',
      icon: Send,
      onSelect: () => openSendReceipt(inv),
      disabled: !((inv.amount_paid ?? 0) > 0) || !canSendReminder,
    },
    {
      label: 'Credit note',
      icon: FileMinus2,
      onSelect: () => router.push(`/invoices/${inv.id}/view`),
      disabled:
        !canModule(user, 'invoices', 'credit_note_create') ||
        inv.status === 'draft' ||
        inv.status === 'cancelled' ||
        inv.status === 'paid',
    },
    {
      label: 'Duplicate',
      icon: Copy,
      onSelect: () => void handleDuplicate(inv.id),
      disabled: !can(user, 'invoices.write'),
    },
    {
      label: 'Delete',
      icon: Trash2,
      onSelect: () => handleDelete(inv.id),
      destructive: true,
      disabled: !can(user, 'invoices.delete'),
    },
  ];

  /** The five cards along the top. Same shape on every module dashboard. */
  const statCards: StatCardSpec[] = [
    {
      key: 'total',
      label: 'Total invoiced',
      value: statMoney(totalAmount),
      icon: ReceiptText,
      tone: 'neutral',
      caption: `${invoiceStats.length} invoice${invoiceStats.length === 1 ? '' : 's'}`,
    },
    {
      key: 'paid',
      label: 'Paid',
      value: statMoney(paidAmount),
      icon: CheckCircle2,
      tone: 'positive',
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      value: statMoney(outstanding),
      icon: Wallet,
      tone: 'warning',
      caption: `${unpaidCount} unpaid`,
      action: unpaidCount ? { label: 'View', onClick: () => setListTab('unpaid') } : undefined,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: invoiceStats.filter((i) => i.status === 'overdue').length,
      icon: AlertTriangle,
      tone: 'danger',
      action: invoiceStats.some((i) => i.status === 'overdue')
        ? { label: 'View', onClick: () => setStatusFilter('overdue') }
        : undefined,
    },
    {
      key: 'draft',
      label: 'Draft',
      value: statMoney(draftTotal),
      icon: FilePlus2,
      tone: 'muted',
      caption: `${draftCount} draft${draftCount === 1 ? '' : 's'}`,
      action: draftCount ? { label: 'View', onClick: () => setListTab('draft') } : undefined,
    },
  ];

  const statusChart = STATUS_OPTIONS.map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: invoiceStats.filter((i) => i.status === s).length,
  }));

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <DashboardHeader
            title="Invoices"
            hint="Invoices are generated from published rota shifts. Generating by client covers every site assigned to that client."
            description="Raise, track and chase invoices for your clients. Generate from the rota, record payments and export."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" onClick={loadInvoices} disabled={loading}>
                  {loading ? 'Loading...' : 'Refresh'}
                </Button>
                <Button variant="outline" asChild>
                  <Link href="/invoices/statement">
                    <ReceiptText className="size-4 mr-2" />
                    Statement
                  </Link>
                </Button>
                <Button variant="outline" onClick={() => setCustomOpen(true)}>
                  <FilePlus2 className="size-4 mr-2" />
                  Custom Invoice
                </Button>
                <InvoiceFormDialog
                  open={customOpen || editInvoiceId != null}
                  invoiceId={editInvoiceId}
                  onOpenChange={(o) => {
                    if (o) return;
                    setCustomOpen(false);
                    setEditInvoiceId(null);
                    if (searchParams.get('edit') || searchParams.get('custom')) router.replace('/invoices');
                  }}
                  onSaved={(inv) => {
                    const created = editInvoiceId == null;
                    setCustomOpen(false);
                    setEditInvoiceId(null);
                    loadInvoices();
                    if (created) rememberNewInvoice(inv.id);
                    // Land on the rendered invoice so the user can check it looks right.
                    router.push(`/invoices/${inv.id}/view`);
                  }}
                />
                <Button onClick={() => setGenOpen(true)}>
                  <Zap className="size-4 mr-2" />
                  Generate Invoice
                </Button>
                <Dialog open={genOpen} onOpenChange={setGenOpen}>
                <DialogContent className={INVOICE_DIALOG_CONTENT_CLASS}>
                  <InvoiceDialogHeader
                    icon={Zap}
                    title="Generate Invoice from Rota"
                    description="Bills published rota shift hours in the period. Add manual lines for anything not on the rota."
                  />
                  <div className={INVOICE_DIALOG_BODY_CLASS}>
                    {/* Who it's for */}
                    <InvoiceFormCard className="space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <InvoiceFieldLabel icon={genMode === 'client' ? Users : Building2} required>
                          Invoice for
                        </InvoiceFieldLabel>
                        <BillToTabs
                          value={genMode}
                          onChange={(v) => {
                            setGenMode(v);
                            setGenClientId('');
                            setGenSiteId('');
                          }}
                        />
                      </div>
                      {genMode === 'client' ? (
                        <SearchableSelect
                          value={genClientId}
                          options={clientOptions}
                          placeholder="Select client"
                          searchPlaceholder="Search clients…"
                          onChange={setGenClientId}
                        />
                      ) : (
                        <>
                          <SearchableSelect
                            value={genSiteId}
                            options={siteOptions}
                            placeholder={sites.length ? 'Select site' : 'No sites yet'}
                            searchPlaceholder="Search sites…"
                            emptyText="No matching sites"
                            onChange={setGenSiteId}
                            disabled={sites.length === 0}
                          />
                          {selectedSiteUnlinked ? (
                            <p className="text-xs text-muted-foreground">
                              This site has no client, so the invoice will carry the site name as the customer.{' '}
                              <Link href="/sites" className="text-primary underline underline-offset-2">
                                Edit sites
                              </Link>{' '}
                              to assign a client instead.
                            </p>
                          ) : null}
                        </>
                      )}
                    </InvoiceFormCard>

                    {/* Period & due date */}
                    <InvoiceFormCard className="grid gap-4 sm:grid-cols-[1fr_1fr_1.6fr]">
                      <div className="space-y-1.5">
                        <InvoiceFieldLabel icon={CalendarDays} required>Period start</InvoiceFieldLabel>
                        <Input type="date" value={genStart} max={genEnd || undefined} onChange={(e) => setGenStart(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <InvoiceFieldLabel icon={CalendarDays} required>Period end</InvoiceFieldLabel>
                        <Input type="date" value={genEnd} min={genStart || undefined} onChange={(e) => setGenEnd(e.target.value)} />
                      </div>
                      <div className="space-y-1.5">
                        <InvoiceFieldLabel icon={Clock}>Due date</InvoiceFieldLabel>
                        <DueDateField invoiceDate="" value={genDueDate} onChange={setGenDueDate} />
                      </div>
                      {genStart && genEnd && genStart > genEnd ? (
                        <p className="text-sm text-destructive sm:col-span-3">Period start cannot be after period end</p>
                      ) : null}
                    </InvoiceFormCard>

                    {/* Breaks & currency */}
                    <InvoiceFormCard className="grid gap-4 sm:grid-cols-[1.6fr_1fr]">
                      <div className="space-y-1.5">
                        <InvoiceFieldLabel icon={Coffee}>Breaks on this invoice</InvoiceFieldLabel>
                        <Select value={genBreakMode} onValueChange={(v) => setGenBreakMode(v as typeof genBreakMode)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="shift">As set on each rota shift</SelectItem>
                            <SelectItem value="without_break">Without break — charge every shift in full</SelectItem>
                            <SelectItem value="deduct">Deduct the staff break from every shift</SelectItem>
                          </SelectContent>
                        </Select>
                        <p className="text-xs text-muted-foreground">
                          Client hours are worked out separately from staff pay. Staff are always paid net of their unpaid
                          break; by default the client is charged the full shift.
                        </p>
                      </div>
                      <div className="space-y-1.5">
                        <InvoiceFieldLabel icon={PoundSterling}>Currency</InvoiceFieldLabel>
                        <CurrencySelect value={genCurrency} onChange={setGenCurrency} />
                        <p className="text-xs text-muted-foreground">Amounts stay in this currency. They are not converted.</p>
                      </div>
                    </InvoiceFormCard>

                    {/* Narrow by */}
                    <InvoiceFormCard title="Narrow by (optional)" icon={Filter} bodyClassName="p-3 space-y-2">
                      <p className="text-xs text-muted-foreground">
                        Leave blank to bill every shift in the period. Generating by client already covers all of that
                        client&rsquo;s sites.
                      </p>
                      <WorkFilterBar
                        value={genNarrow}
                        onChange={setGenNarrow}
                        options={filterOptions}
                        keys={['contractor', 'subContractor', 'guard', 'jobTitle']}
                        className="flex flex-wrap items-center gap-2"
                      />
                    </InvoiceFormCard>

                    {/* Manual lines, added on top of the rota shifts */}
                    <LineItemsEditor
                      title="Manual lines (optional)"
                      lines={genLines}
                      onChange={setGenLines}
                      allowEmpty
                      showSite={genMode === 'client'}
                      siteOptions={genLineSiteOptions}
                      guardOptions={genGuardOptions}
                      money={(n) => formatGbp(n, genCurrency)}
                      emptyText="No manual lines. Use “Add line” for work that isn’t on the rota."
                    />

                    <Button
                      className="w-full h-11 text-base shadow-sm"
                      onClick={() => void handleGenerate()}
                      disabled={
                        genLoading ||
                        !genStart ||
                        !genEnd ||
                        genStart > genEnd ||
                        (genMode === 'client' && !genClientId) ||
                        (genMode === 'site' && !genSiteId)
                      }
                    >
                      <Zap className="size-4 mr-2" />
                      {genLoading ? 'Generating…' : 'Generate Invoice'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            }
          />

          <StatCards cards={statCards} />

          <div className="grid gap-4 sm:grid-cols-3">
            <div className="dash-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{statMoney(overdueAmount)}</p>
            </div>
            <div className="dash-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Due within 30 days</p>
              <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{statMoney(dueSoonAmount)}</p>
            </div>
            <div className="dash-card px-5 py-4">
              <p className="text-xs text-muted-foreground">Average days to get paid</p>
              <p className="mt-1 text-lg font-semibold tracking-tight tabular-nums">{averageDays == null ? '—' : averageDays}</p>
            </div>
          </div>

          <ModuleTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'invoices', label: 'All invoices' },
            ]}
            value={pageTab}
            onChange={setPageTab}
          />

          {pageTab === 'overview' && invoiceStats.length > 0 ? (
            <StatusPieChart data={statusChart} title="Invoices by status" />
          ) : null}

          {pageTab === 'invoices' && (
          <>
          <div className="flex flex-wrap gap-2 border-b pb-3">
            {([
              ['unpaid', `Unpaid (${unpaidCount})`],
              ['draft', `Draft (${draftCount})`],
              ['all', 'All invoices'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setListTab(id)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  listTab === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          <FilterBar
            onClear={() => {
              setSearch('');
              setStatusFilter('');
              setDueFrom('');
              setDueTo('');
              setWorkFilters(EMPTY_WORK_FILTERS);
            }}
          >
            <FilterField label="Search" className="min-w-[220px] flex-1">
              <Input
                placeholder="Invoice number, customer or status…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FilterField>
            <FilterField label="Status">
              <Select value={statusFilter || '__all'} onValueChange={(v) => setStatusFilter(v === '__all' ? '' : v)}>
                <SelectTrigger><SelectValue placeholder="All statuses" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__all">All statuses</SelectItem>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Due from">
              <Input type="date" value={dueFrom} onChange={(e) => setDueFrom(e.target.value)} />
            </FilterField>
            <FilterField label="Due to">
              <Input type="date" value={dueTo} onChange={(e) => setDueTo(e.target.value)} />
            </FilterField>
            <div className="w-full">
              <WorkFilterBar value={workFilters} onChange={setWorkFilters} options={filterOptions} />
            </div>
          </FilterBar>

          <ResultsCard
            title="Invoices"
            count={total}
            view={resultsView}
            onViewChange={setResultsView}
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
                <div className="py-12 text-center text-muted-foreground">
                  {search ? 'No invoices match your search.' : 'No invoices yet. Use "Generate Invoice" to create one.'}
                </div>
              ) : null}
              {!loading && total > 0 && canBulkDelete ? (
                <BulkActionBar selection={selection} noun="invoice" allIds={filteredIds}>
                  <BulkDeleteButton
                    selection={selection}
                    noun="invoice"
                    deleteOne={(id) => api.invoices.delete(id)}
                    onDone={() => loadInvoices()}
                    description="Selected invoices are deleted one by one. Any the server won't allow (for example invoices with payments recorded) are skipped and listed afterwards. This cannot be undone."
                  />
                </BulkActionBar>
              ) : null}
              {loading || total === 0 ? null : resultsView === 'cards' ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageRows.map((inv) => (
                    <div
                      key={inv.id}
                      data-row-id={inv.id}
                      className={cn('rounded-lg border p-4', selection.isSelected(inv.id) && 'bg-primary/5 border-primary/40', isHighlighted(inv.id) && NEW_ROW_HIGHLIGHT_CLASS)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        {canBulkDelete ? (
                          <RowCheckbox selection={selection} id={inv.id} label={`Select invoice ${inv.id}`} />
                        ) : null}
                        <div className="min-w-0">
                          <Link href={`/invoices/${inv.id}/view`} className="font-medium hover:underline">
                            #{inv.id}
                          </Link>
                          <p className="truncate text-sm text-muted-foreground">
                            {customerLabel(inv) ?? '—'}
                          </p>
                        </div>
                        {renderStatus(inv)}
                      </div>
                      <p className="mt-3 text-xl font-bold tabular-nums">{formatGbp(inv.total, inv.currency)}</p>
                      <p className="text-xs text-muted-foreground">
                        {isInvoiceOpen(inv) ? formatDueCountdown(inv) : `Due ${formatDueCountdown(inv)}`}
                      </p>
                      <div className="mt-3 flex items-center justify-end gap-1">
                        {nextActionButtons(inv)}
                        <RowActionsMenu actions={rowActions(inv)} label={`Invoice ${inv.id} actions`} />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {canBulkDelete ? (
                          <TableHead className="w-8">
                            <SelectAllCheckbox selection={selection} ids={pageIds} />
                          </TableHead>
                        ) : null}
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Due" colKey="due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Date" colKey="period" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Number" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Customer" colKey="client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Unpaid by customer</TableHead>
                        <SortableHead label="Amount due" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((inv) => {
                        const overdue = isInvoiceOverdue(inv);
                        const rawBalance =
                          inv.balance_due ??
                          Math.max(0, inv.total - (inv.amount_paid ?? 0) - (inv.credit_applied ?? 0));
                        const balance = Number(rawBalance);
                        const safeBalance = Number.isFinite(balance) && Math.abs(balance) <= 1e12 ? balance : 0;
                        const customer =
                          (inv.client_name && String(inv.client_name).trim()) ||
                          (inv.client_id != null ? clientMap.get(inv.client_id) : undefined) ||
                          (inv.client_id != null ? `Client #${inv.client_id}` : '—');
                        return (
                        <TableRow
                          key={inv.id}
                          href={`/invoices/${inv.id}/view`}
                          data-row-id={inv.id}
                          className={cn(overdue && 'bg-red-50/60 dark:bg-red-950/20', selection.isSelected(inv.id) && 'bg-primary/5', isHighlighted(inv.id) && NEW_ROW_HIGHLIGHT_CLASS)}
                        >
                          {canBulkDelete ? (
                            <TableCell className="w-8">
                              <RowCheckbox selection={selection} id={inv.id} label={`Select invoice ${inv.id}`} />
                            </TableCell>
                          ) : null}
                          <TableCell>
                            {renderStatus(inv)}
                          </TableCell>
                          <TableCell className={cn('text-sm whitespace-nowrap', overdue && 'text-red-600 dark:text-red-400 font-medium')}>
                            {formatDueCountdown(inv)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatInvoiceDate(inv)}</TableCell>
                          <TableCell className="font-medium tabular-nums">#{inv.id}</TableCell>
                          <TableCell className="font-medium max-w-[220px]">
                            <div className="group relative truncate" title={customer}>
                              {customer}
                              <div className="pointer-events-none absolute left-0 top-full z-20 mt-1 hidden w-64 rounded-md border bg-popover p-3 text-xs text-popover-foreground shadow-md group-hover:block">
                                <p className="font-medium">{customer}</p>
                                <p className="mt-1 text-muted-foreground">{inv.account_name || 'No bank account on this invoice'}</p>
                                {inv.bank_name ? <p>{inv.bank_name}</p> : null}
                                {inv.sort_code ? <p>Sort code {inv.sort_code}</p> : null}
                                {inv.account_number ? <p>Account {inv.account_number}</p> : null}
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">{unpaidShare.get(inv.id) || '—'}</TableCell>
                          <TableCell className="font-semibold whitespace-nowrap tabular-nums">{formatGbp(safeBalance, inv.currency)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {nextActionButtons(inv)}
                              <RowActionsMenu actions={rowActions(inv)} label={`Invoice ${inv.id} actions`} />
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
                  <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="invoices" />
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

          <QuickLinks
            links={[
              {
                key: 'statement',
                title: 'Statement',
                description: 'Generate a statement of account by client and site for a date range.',
                icon: ReceiptText,
                tone: 'info',
                action: { label: 'Open statement', href: '/invoices/statement' },
              },
              {
                key: 'payments',
                title: 'Payments',
                description: 'Record and reconcile payments received against invoices.',
                icon: CreditCard,
                tone: 'positive',
                action: { label: 'View payments', href: '/payments' },
              },
              {
                key: 'clients',
                title: 'Clients',
                description: 'Client records, contracts and the sites they are billed for.',
                icon: BadgePoundSterling,
                tone: 'info',
                action: { label: 'Manage clients', href: '/clients' },
              },
              {
                key: 'reports',
                title: 'Reports',
                description: 'Revenue, ageing and outstanding balance reports.',
                icon: FileText,
                tone: 'neutral',
                action: { label: 'View reports', href: '/reports' },
              },
            ]}
          />

          <Dialog open={!!payInvoice} onOpenChange={(open) => !open && setPayInvoice(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader><DialogTitle>Record a payment for this invoice</DialogTitle></DialogHeader>
              {payInvoice && (() => {
                const balance = Number(payInvoice.balance_due ?? payInvoice.total);
                const amount = Number(payAmount);
                const overBalance = amount > balance + 0.005;
                const fullyPaid = !overBalance && Math.abs(amount - balance) < 0.005;
                return (
                  <div className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      Invoice #{payInvoice.id} — balance {formatGbp(balance, payInvoice.currency)}
                    </p>
                    <div className="space-y-1">
                      <Label htmlFor="pay-date">Date</Label>
                      <Input id="pay-date" type="date" value={payDate} onChange={(e) => setPayDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pay-amount">Amount</Label>
                      <Input
                        id="pay-amount"
                        type="number"
                        step="0.01"
                        min="0"
                        value={payAmount}
                        onChange={(e) => setPayAmount(e.target.value)}
                      />
                      {fullyPaid ? <p className="text-xs text-emerald-700 dark:text-emerald-400">Invoice will be fully paid</p> : null}
                      {overBalance ? <p className="text-xs text-destructive">Amount is more than the balance due</p> : null}
                    </div>
                    <div className="space-y-1">
                      <Label>Method</Label>
                      <Select value={payMethod} onValueChange={setPayMethod}>
                        <SelectTrigger className="w-full" aria-label="Payment method">
                          <SelectValue placeholder="Select a payment method…" />
                        </SelectTrigger>
                        <SelectContent>
                          {PAYMENT_METHODS.map((m) => (
                            <SelectItem key={m} value={m}>{METHOD_LABELS[m]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Account</Label>
                      <Select value={payAccountId} onValueChange={setPayAccountId}>
                        <SelectTrigger className="w-full" aria-label="Payment account">
                          <SelectValue placeholder="Select a payment account…" />
                        </SelectTrigger>
                        <SelectContent>
                          {payAccounts.map((a) => (
                            <SelectItem key={a.id} value={String(a.id)}>{a.code} · {a.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-xs text-muted-foreground">The account head this payment is deposited into.</p>
                    </div>
                    <div className="space-y-1">
                      <Label htmlFor="pay-memo">Memo (optional)</Label>
                      <textarea
                        id="pay-memo"
                        maxLength={1000}
                        className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={payMemo}
                        onChange={(e) => setPayMemo(e.target.value)}
                      />
                    </div>
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setPayInvoice(null)} disabled={payLoading}>
                        Cancel
                      </Button>
                      <Button
                        onClick={() => void handleRecordPayment()}
                        disabled={payLoading || !payDate || !payMethod || !payAccountId || !(amount > 0) || overBalance}
                      >
                        {payLoading ? 'Saving…' : 'Submit'}
                      </Button>
                    </DialogFooter>
                  </div>
                );
              })()}
            </DialogContent>
          </Dialog>

          <Dialog open={!!reminderInvoice} onOpenChange={(open) => !open && !reminderSending && setReminderInvoice(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Send reminder</DialogTitle>
                <DialogDescription>Are you sure you want to send a reminder email to this client?</DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button variant="outline" onClick={() => setReminderInvoice(null)} disabled={reminderSending}>
                  Cancel
                </Button>
                <Button onClick={() => void handleSendReminder()} disabled={reminderSending}>
                  {reminderSending ? 'Sending…' : 'Yes'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <SendDocumentDialog request={sendRequest} onClose={() => setSendRequest(null)} />
          </>
          )}
        </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}

