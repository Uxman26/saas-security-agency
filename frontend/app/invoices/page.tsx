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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Invoice, Client, Site, ClientBankAccount } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { FileText, Zap, Trash2, Eye, Pencil, Download, Copy, CreditCard, AlertTriangle, BadgePoundSterling, CheckCircle2, FilePlus2, ReceiptText, Wallet, Plus, FileMinus2, Send, Undo2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { can, canModule } from '@/lib/permissions';
import { canSendInvoiceReminder, formatDueCountdown, isInvoiceOpen, isInvoicePastDue, nextInvoiceAction } from '@/lib/invoice-utils';
import { downloadBlob } from '@/lib/download-blob';
import { SendDocumentDialog, type SendDocumentRequest } from '@/components/finance/send-document-dialog';
import { formatDateUK, localDateKey, localDateOffset } from '@/lib/date-format';
import { formatMoney } from '@/lib/rota-shifts-utils';
import { INVOICE_CURRENCIES, formatInvoiceMoney, invoiceCurrencyCode } from '@/lib/invoice-currency';
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
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];

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

type CustomLineDraft = {
  site_id: string;
  shift_date: string;
  shift_start: string;
  shift_end: string;
  description: string;
  service_detail: string;
  quantity: string;
  hours: string;
  rate: string;
};

const emptyCustomLine = (): CustomLineDraft => ({
  site_id: '',
  shift_date: '',
  shift_start: '',
  shift_end: '',
  description: '',
  service_detail: '',
  quantity: '1',
  hours: '0',
  rate: '0',
});

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
  const [customCurrency, setCustomCurrency] = useState('GBP');
  const [customOpen, setCustomOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get('custom') === '1') setCustomOpen(true);
  }, [searchParams]);
  const [customLoading, setCustomLoading] = useState(false);
  const [customClientId, setCustomClientId] = useState('');
  const [customInvoiceDate, setCustomInvoiceDate] = useState(() => localDateKey());
  const [customPeriodStart, setCustomPeriodStart] = useState('');
  const [customPeriodEnd, setCustomPeriodEnd] = useState('');
  const [customDueDate, setCustomDueDate] = useState('');
  const [customPo, setCustomPo] = useState('');
  const [customNotes, setCustomNotes] = useState('');
  const [customRotaReview, setCustomRotaReview] = useState('');
  const [customTaxRate, setCustomTaxRate] = useState('20');
  const [customBankId, setCustomBankId] = useState('');
  const [customBanks, setCustomBanks] = useState<ClientBankAccount[]>([]);
  const [customLines, setCustomLines] = useState<CustomLineDraft[]>([emptyCustomLine()]);
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
  const { sortKey, sortDir, toggleSort } = useTableSort();
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

  useEffect(() => {
    if (!customClientId) {
      setCustomBanks([]);
      setCustomBankId('');
      return;
    }
    const id = parseInt(customClientId, 10);
    api.clients
      .bankAccounts(id)
      .then((rows) => {
        setCustomBanks(rows);
        const def = rows.find((r) => r.is_default) ?? rows[0];
        setCustomBankId(def ? String(def.id) : '');
      })
      .catch(() => {
        setCustomBanks([]);
        setCustomBankId('');
      });
  }, [customClientId]);

  const customClientSites = useMemo(
    () =>
      customClientId
        ? sites.filter((s) => s.client_id != null && String(s.client_id) === customClientId)
        : [],
    [sites, customClientId]
  );

  const resetCustomForm = () => {
    setCustomClientId('');
    setCustomInvoiceDate(localDateKey());
    setCustomPeriodStart('');
    setCustomPeriodEnd('');
    setCustomDueDate('');
    setCustomPo('');
    setCustomNotes('');
    setCustomRotaReview('');
    setCustomTaxRate('20');
    setCustomBankId('');
    setCustomBanks([]);
    setCustomLines([emptyCustomLine()]);
  };

  const handleCustomCreate = async () => {
    if (!customClientId || !customPeriodStart || !customPeriodEnd) return;
    if (customPeriodStart > customPeriodEnd) {
      toast.error('Period start cannot be after period end');
      return;
    }
    const lines = customLines.filter((l) => l.site_id);
    if (lines.length === 0) {
      toast.error('Add at least one line with a site');
      return;
    }
    setCustomLoading(true);
    try {
      const inv = await api.invoices.create({
        client_id: parseInt(customClientId, 10),
        period_start: customPeriodStart,
        period_end: customPeriodEnd,
        invoice_date: customInvoiceDate || undefined,
        due_date: customDueDate || undefined,
        po_number: customPo.trim() || undefined,
        notes: customNotes.trim() || undefined,
        rota_review: customRotaReview.trim() || undefined,
        client_bank_account_id: customBankId ? parseInt(customBankId, 10) : undefined,
        tax_rate: parseFloat(customTaxRate) || 0,
        currency: customCurrency,
        lines: lines.map((l) => {
          const hours = parseFloat(l.hours) || 0;
          const rate = parseFloat(l.rate) || 0;
          return {
            site_id: parseInt(l.site_id, 10),
            shift_date: l.shift_date || undefined,
            shift_start: l.shift_start || undefined,
            shift_end: l.shift_end || undefined,
            description: l.description.trim() || undefined,
            service_detail: l.service_detail.trim() || undefined,
            quantity: parseFloat(l.quantity) || 1,
            hours,
            rate,
            amount: hours * rate,
          };
        }),
      });
      setCustomOpen(false);
      resetCustomForm();
      loadInvoices();
      toast.success(`Invoice #${inv.id} created`);
      router.push(`/invoices/${inv.id}/edit`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setCustomLoading(false);
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
    setGenLoading(true);
    try {
      const inv = await api.invoices.generate({
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
      setGenOpen(false);
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

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    invoices,
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
  }, [search, statusFilter, workFilters]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

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
    .filter((i) => i.status === 'overdue' || isInvoicePastDue(i))
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
      title: `Send receipt for invoice #${inv.id}`,
      description: 'The payment receipt is emailed as a PDF attachment.',
      email: inv.client_email,
      send: (to) => api.invoices.sendReceipt(inv.id, to),
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
    const view = (
      <Button variant="ghost" size="sm" className={button} asChild>
        <Link href={`/invoices/${inv.id}/view`}>
          <Eye className="size-3.5" />
          View
        </Link>
      </Button>
    );
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
        <>
          {view}
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
        </>
      );
    }
    return view;
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
      onSelect: () => router.push(`/invoices/${inv.id}/edit`),
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
                <Dialog
                  open={customOpen}
                  onOpenChange={(o) => {
                    setCustomOpen(o);
                    if (!o) resetCustomForm();
                  }}
                >
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <FilePlus2 className="size-4 mr-2" />
                      Custom Invoice
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                    <DialogHeader>
                      <DialogTitle>Create Custom Invoice</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-4 py-2">
                      <div className="space-y-1">
                        <Label>Client <span className="text-destructive">*</span></Label>
                        <SearchableSelect
                          value={customClientId}
                          options={clientOptions}
                          placeholder="Select client"
                          searchPlaceholder="Search clients…"
                          onChange={setCustomClientId}
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1">
                          <Label>Invoice date</Label>
                          <Input type="date" value={customInvoiceDate} onChange={(e) => setCustomInvoiceDate(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Due date</Label>
                          <DueDateField invoiceDate={customInvoiceDate} value={customDueDate} onChange={setCustomDueDate} />
                        </div>
                        <div className="space-y-1">
                          <Label>Period start <span className="text-destructive">*</span></Label>
                          <Input
                            type="date"
                            value={customPeriodStart}
                            max={customPeriodEnd || undefined}
                            onChange={(e) => setCustomPeriodStart(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Period end <span className="text-destructive">*</span></Label>
                          <Input
                            type="date"
                            value={customPeriodEnd}
                            min={customPeriodStart || undefined}
                            onChange={(e) => setCustomPeriodEnd(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>PO number</Label>
                          <Input value={customPo} onChange={(e) => setCustomPo(e.target.value)} />
                        </div>
                        <div className="space-y-1">
                          <Label>Tax rate (%)</Label>
                          <Input
                            type="number"
                            step="0.01"
                            value={customTaxRate}
                            onChange={(e) => setCustomTaxRate(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1">
                          <Label>Currency</Label>
                          <Select value={customCurrency} onValueChange={setCustomCurrency}>
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
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Bank account</Label>
                          <Select
                            value={customBankId || 'none'}
                            onValueChange={(v) => setCustomBankId(v === 'none' ? '' : v)}
                            disabled={!customClientId}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder={customClientId ? 'Select account' : 'Select a client first'} />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Company default</SelectItem>
                              {customBanks.map((b) => (
                                <SelectItem key={b.id} value={String(b.id)}>
                                  {b.label}
                                  {b.is_default ? ' (Default)' : ''}
                                  {b.bank_name ? ` · ${b.bank_name}` : ''}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Notes / terms</Label>
                          <textarea
                            className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={customNotes}
                            onChange={(e) => setCustomNotes(e.target.value)}
                          />
                        </div>
                        <div className="space-y-1 sm:col-span-2">
                          <Label>Rota review</Label>
                          <textarea
                            className="flex min-h-[56px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            value={customRotaReview}
                            onChange={(e) => setCustomRotaReview(e.target.value)}
                          />
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-2">
                          <Label>Line items</Label>
                          <Button
                            type="button"
                            size="sm"
                            variant="outline"
                            onClick={() => setCustomLines((prev) => [...prev, emptyCustomLine()])}
                          >
                            <Plus className="size-3.5 mr-1" /> Add line
                          </Button>
                        </div>
                        {customLines.map((line, idx) => {
                          const hours = parseFloat(line.hours) || 0;
                          const rate = parseFloat(line.rate) || 0;
                          const amount = hours * rate;
                          return (
                            <div key={idx} className="rounded-md border p-3 space-y-3">
                              <div className="flex items-center justify-between">
                                <span className="text-xs font-medium text-muted-foreground">Line {idx + 1}</span>
                                {customLines.length > 1 ? (
                                  <Button
                                    type="button"
                                    size="sm"
                                    variant="ghost"
                                    className="text-destructive"
                                    onClick={() => setCustomLines((prev) => prev.filter((_, i) => i !== idx))}
                                  >
                                    <Trash2 className="size-3.5" />
                                  </Button>
                                ) : null}
                              </div>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                                <div className="space-y-1 sm:col-span-3">
                                  <Label>Site <span className="text-destructive">*</span></Label>
                                  <SearchableSelect
                                    value={line.site_id}
                                    onChange={(v) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, site_id: v } : l))
                                      )
                                    }
                                    options={customClientSites.map((s) => ({ value: String(s.id), label: s.name }))}
                                    noneOption={{ value: '', label: 'Select site' }}
                                    placeholder={customClientId ? 'Select site' : 'Select a client first'}
                                    searchPlaceholder="Search sites…"
                                    emptyText="No matching sites"
                                    disabled={!customClientId}
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Shift date</Label>
                                  <Input
                                    type="date"
                                    value={line.shift_date}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, shift_date: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Start</Label>
                                  <Input
                                    type="time"
                                    value={line.shift_start}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, shift_start: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>End</Label>
                                  <Input
                                    type="time"
                                    value={line.shift_end}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, shift_end: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1 sm:col-span-3">
                                  <Label>Description</Label>
                                  <Input
                                    value={line.description}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, description: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1 sm:col-span-3">
                                  <Label>Service detail</Label>
                                  <Input
                                    value={line.service_detail}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, service_detail: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Qty</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.quantity}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, quantity: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Hours</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.hours}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, hours: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                                <div className="space-y-1">
                                  <Label>Rate</Label>
                                  <Input
                                    type="number"
                                    step="0.01"
                                    value={line.rate}
                                    onChange={(e) =>
                                      setCustomLines((prev) =>
                                        prev.map((l, i) => (i === idx ? { ...l, rate: e.target.value } : l))
                                      )
                                    }
                                  />
                                </div>
                              </div>
                              <p className="text-sm text-muted-foreground">Amount: {formatGbp(amount)}</p>
                            </div>
                          );
                        })}
                      </div>

                      <Button
                        className="w-full"
                        onClick={() => void handleCustomCreate()}
                        disabled={
                          customLoading ||
                          !customClientId ||
                          !customPeriodStart ||
                          !customPeriodEnd ||
                          customPeriodStart > customPeriodEnd ||
                          !customLines.some((l) => l.site_id)
                        }
                      >
                        {customLoading ? 'Creating…' : 'Create Invoice'}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
                <Dialog open={genOpen} onOpenChange={setGenOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Zap className="size-4 mr-2" />
                      Generate Invoice
                    </Button>
                  </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Generate Invoice from Rota</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Generate an invoice from published rota shift hours in the selected period.
                    </p>
                    <div className="space-y-1">
                      <Label>Generate by</Label>
                      <Select
                        value={genMode}
                        onValueChange={(v) => {
                          setGenMode(v as 'client' | 'site');
                          setGenClientId('');
                          setGenSiteId('');
                        }}
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="client">By client</SelectItem>
                          <SelectItem value="site">By site</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                    {genMode === 'client' ? (
                      <div className="space-y-1">
                        <Label>Client <span className="text-destructive">*</span></Label>
                        <SearchableSelect
                          value={genClientId}
                          options={clientOptions}
                          placeholder="Select client"
                          searchPlaceholder="Search clients…"
                          onChange={setGenClientId}
                        />
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>Site <span className="text-destructive">*</span></Label>
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
                            This site has no client, so the invoice will carry the site name as the
                            customer.{' '}
                            <Link href="/sites" className="text-primary underline underline-offset-2">
                              Edit sites
                            </Link>{' '}
                            to assign a client instead.
                          </p>
                        ) : null}
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>Period Start <span className="text-destructive">*</span></Label>
                        <Input
                          type="date"
                          value={genStart}
                          max={genEnd || undefined}
                          onChange={(e) => setGenStart(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Period End <span className="text-destructive">*</span></Label>
                        <Input
                          type="date"
                          value={genEnd}
                          min={genStart || undefined}
                          onChange={(e) => setGenEnd(e.target.value)}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Due date</Label>
                      <DueDateField invoiceDate="" value={genDueDate} onChange={setGenDueDate} />
                    </div>
                    <div className="space-y-1">
                      <Label>Breaks on this invoice</Label>
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
                        Client hours are worked out separately from staff pay. Staff are always paid net of
                        their unpaid break; by default the client is charged the full shift.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>Currency</Label>
                      <Select value={genCurrency} onValueChange={setGenCurrency}>
                        <SelectTrigger className="w-full">
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
                      <p className="text-xs text-muted-foreground">
                        Amounts stay in this currency. They are not converted.
                      </p>
                    </div>
                    <div className="space-y-1">
                      <Label>Narrow by (optional)</Label>
                      <p className="text-xs text-muted-foreground">
                        Leave blank to bill every shift in the period. Generating by client already
                        covers all of that client&rsquo;s sites.
                      </p>
                      <WorkFilterBar
                        value={genNarrow}
                        onChange={setGenNarrow}
                        options={filterOptions}
                        keys={['contractor', 'subContractor', 'guard', 'jobTitle']}
                        className="flex flex-wrap items-center gap-2 pt-1"
                      />
                    </div>
                    {genStart && genEnd && genStart > genEnd ? (
                      <p className="text-sm text-destructive">Period start cannot be after period end</p>
                    ) : null}
                    <Button
                      className="w-full"
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
                      {genLoading ? 'Generating...' : 'Generate Invoice'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
              </div>
            }
          />

          <StatCards cards={statCards} />

          <div className="grid gap-3 sm:grid-cols-3">
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Overdue</p>
              <p className="text-lg font-semibold tabular-nums">{statMoney(overdueAmount)}</p>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Due within 30 days</p>
              <p className="text-lg font-semibold tabular-nums">{statMoney(dueSoonAmount)}</p>
            </div>
            <div className="rounded-lg border bg-card px-4 py-3">
              <p className="text-xs text-muted-foreground">Average days to get paid</p>
              <p className="text-lg font-semibold tabular-nums">{averageDays == null ? '—' : averageDays}</p>
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
              ) : resultsView === 'cards' ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageRows.map((inv) => (
                    <div key={inv.id} className="rounded-lg border p-4">
                      <div className="flex items-start justify-between gap-2">
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
                        const pastDue = isInvoicePastDue(inv);
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
                          className={cn(pastDue && 'bg-red-50/60 dark:bg-red-950/20')}
                        >
                          <TableCell>
                            {renderStatus(inv)}
                          </TableCell>
                          <TableCell className={cn('text-sm whitespace-nowrap', pastDue && 'text-red-600 dark:text-red-400 font-medium')}>
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
