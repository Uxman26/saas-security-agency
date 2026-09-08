'use client';
import { InlineKpiTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import type { Invoice, Client, Site } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { FileText, Zap, Trash2, Eye, Pencil, Download, Copy, CreditCard, AlertTriangle, BadgePoundSterling, CheckCircle2, FilePlus2, ReceiptText, Wallet } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { formatDueDate, isInvoicePastDue } from '@/lib/invoice-utils';
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
import { SearchableSelect } from '@/components/ui/searchable-select';
import {
  EMPTY_WORK_FILTERS,
  WorkFilterBar,
  toWorkFilterParams,
  useWorkFilterOptions,
  type WorkFilterValues,
} from '@/components/work-filter-bar';
import { cn } from '@/lib/utils';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];

function formatGbp(n: unknown): string {
  const v = typeof n === 'number' ? n : Number(n);
  if (!Number.isFinite(v) || Math.abs(v) > 1e12) return '£—';
  return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function InvoicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [genMode, setGenMode] = useState<'client' | 'site'>('client');
  const [genClientId, setGenClientId] = useState('');
  const [genSiteId, setGenSiteId] = useState('');
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  // Optional narrowing on top of the client/site the invoice is raised for.
  const [genNarrow, setGenNarrow] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const [sites, setSites] = useState<Site[]>([]);
  const [pageTab, setPageTab] = useState<'overview' | 'invoices'>('invoices');
  const [listTab, setListTab] = useState<'unpaid' | 'draft' | 'all'>('unpaid');
  // Client / Site / Contractor / Sub-contractor / Staff / Job title, in any combination.
  // The Client control is the old "All customers" dropdown: it now covers every site
  // assigned to that client rather than only invoices raised against the client record.
  const [workFilters, setWorkFilters] = useState<WorkFilterValues>(EMPTY_WORK_FILTERS);
  const filterOptions = useWorkFilterOptions();
  const [dueFrom, setDueFrom] = useState('');
  const [dueTo, setDueTo] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const [payInvoice, setPayInvoice] = useState<Invoice | null>(null);
  const [payAmount, setPayAmount] = useState('');
  const [payLoading, setPayLoading] = useState(false);
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
    api.invoices
      .list({
        ...toWorkFilterParams(workFilters),
        status_group: listTab,
        status: statusFilter || undefined,
        due_from: dueFrom || undefined,
        due_to: dueTo || undefined,
      })
      .then(setInvoices)
      .catch(() => toast.error('Could not load invoices'))
      .finally(() => setLoading(false));
  }, [workFilters, listTab, statusFilter, dueFrom, dueTo]);

  useEffect(() => {
    loadInvoices();
    api.clients.list().then(setClients).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
  }, [loadInvoices]);

  const handleGenerate = async () => {
    if (!genStart || !genEnd) return;
    if (genMode === 'client' && !genClientId) return;
    if (genMode === 'site' && !genSiteId) return;
    if (genStart > genEnd) {
      toast.error('Period start cannot be after period end');
      return;
    }
    setGenLoading(true);
    try {
      await api.invoices.generate({
        period_start: genStart,
        period_end: genEnd,
        ...toWorkFilterParams(genNarrow),
        ...(genMode === 'client' ? { client_id: parseInt(genClientId, 10) } : {}),
        ...(genMode === 'site' ? { site_id: parseInt(genSiteId, 10) } : {}),
      });
      setGenOpen(false);
      setGenClientId('');
      setGenSiteId('');
      setGenNarrow(EMPTY_WORK_FILTERS);
      setGenStart('');
      setGenEnd('');
      loadInvoices();
      toast.success('Invoice generated');
    } catch (err) {
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

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const paidAmount = invoices.reduce((sum, i) => sum + (i.amount_paid ?? (i.status === 'paid' ? i.total : 0)), 0);
  const outstanding = invoices
    .filter((i) => !['draft', 'paid', 'cancelled'].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due ?? (i.status === 'paid' ? 0 : i.total)), 0);
  const draftInvoices = invoices.filter((i) => i.status === 'draft');
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

  const handleRecordPayment = async () => {
    if (!payInvoice || !payAmount) return;
    setPayLoading(true);
    try {
      await api.payments.create({
        invoice_id: payInvoice.id,
        amount: parseFloat(payAmount),
        method: 'bank_transfer',
        paid_at: new Date().toISOString().slice(0, 10),
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

  const unpaidCount = invoices.filter((i) => ['sent', 'unpaid', 'overdue', 'partial'].includes(i.status)).length;
  const draftCount = invoices.filter((i) => i.status === 'draft').length;

  const formatInvoiceDate = (inv: Invoice) => {
    const raw = inv.created_at ?? inv.period_end;
    if (!raw) return '—';
    return String(raw).slice(0, 10);
  };

  const formatDueLabel = (inv: Invoice) => {
    if (!inv.due_date) return '—';
    const due = new Date(`${inv.due_date}T12:00:00`);
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const diff = Math.round((due.getTime() - today.getTime()) / 86400000);
    if (diff < 0) return `${Math.abs(diff)} days ago`;
    if (diff === 0) return 'Today';
    if (diff === 1) return 'Tomorrow';
    if (diff <= 7) return `In ${diff} days`;
    return formatDueDate(inv.due_date);
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
      onSelect: () => setPayInvoice(inv),
      disabled: !can(user, 'invoices.write') || inv.status === 'paid',
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
      value: formatGbp(totalAmount),
      icon: ReceiptText,
      tone: 'neutral',
      caption: `${invoices.length} invoice${invoices.length === 1 ? '' : 's'}`,
    },
    {
      key: 'paid',
      label: 'Paid',
      value: formatGbp(paidAmount),
      icon: CheckCircle2,
      tone: 'positive',
    },
    {
      key: 'outstanding',
      label: 'Outstanding',
      value: formatGbp(outstanding),
      icon: Wallet,
      tone: 'warning',
      caption: `${unpaidCount} unpaid`,
      action: unpaidCount ? { label: 'View', onClick: () => setListTab('unpaid') } : undefined,
    },
    {
      key: 'overdue',
      label: 'Overdue',
      value: invoices.filter((i) => i.status === 'overdue').length,
      icon: AlertTriangle,
      tone: 'danger',
      action: invoices.some((i) => i.status === 'overdue')
        ? { label: 'View', onClick: () => setStatusFilter('overdue') }
        : undefined,
    },
    {
      key: 'draft',
      label: 'Draft',
      value: formatGbp(draftTotal),
      icon: FilePlus2,
      tone: 'muted',
      caption: `${draftCount} draft${draftCount === 1 ? '' : 's'}`,
      action: draftCount ? { label: 'View', onClick: () => setListTab('draft') } : undefined,
    },
  ];

  const statusChart = STATUS_OPTIONS.map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: invoices.filter((i) => i.status === s).length,
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
                      onClick={handleGenerate}
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

          <ModuleTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'invoices', label: 'All invoices' },
            ]}
            value={pageTab}
            onChange={setPageTab}
          />

          {pageTab === 'overview' && invoices.length > 0 ? (
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
                        <Pill
                          tone={
                            inv.status === 'paid'
                              ? 'positive'
                              : inv.status === 'overdue'
                                ? 'danger'
                                : inv.status === 'draft'
                                  ? 'muted'
                                  : 'neutral'
                          }
                          dot
                        >
                          {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                        </Pill>
                      </div>
                      <p className="mt-3 text-xl font-bold tabular-nums">{formatGbp(inv.total)}</p>
                      <p className="text-xs text-muted-foreground">Due {formatDueLabel(inv)}</p>
                      <div className="mt-3 flex justify-end">
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
                        <SortableHead label="Amount due" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="text-right w-[120px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((inv) => {
                        const pastDue = isInvoicePastDue(inv);
                        const rawBalance = inv.balance_due ?? (inv.status === 'paid' ? 0 : inv.total);
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
                            <Pill
                              dot
                              tone={
                                inv.status === 'paid'
                                  ? 'positive'
                                  : inv.status === 'overdue'
                                    ? 'danger'
                                    : inv.status === 'draft'
                                      ? 'muted'
                                      : inv.status === 'partial'
                                        ? 'warning'
                                        : 'neutral'
                              }
                            >
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </Pill>
                          </TableCell>
                          <TableCell className={cn('text-sm whitespace-nowrap', pastDue && 'text-red-600 dark:text-red-400 font-medium')}>
                            {formatDueLabel(inv)}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">{formatInvoiceDate(inv)}</TableCell>
                          <TableCell className="font-medium tabular-nums">#{inv.id}</TableCell>
                          <TableCell className="font-medium max-w-[200px] truncate" title={customer}>
                            {customer}
                          </TableCell>
                          <TableCell className="font-semibold whitespace-nowrap tabular-nums">{formatGbp(safeBalance)}</TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Button variant="ghost" size="icon" className="size-8" asChild title="View invoice">
                                <Link href={`/invoices/${inv.id}/view`}>
                                  <Eye className="size-4" />
                                </Link>
                              </Button>
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
              <DialogHeader><DialogTitle>Record payment</DialogTitle></DialogHeader>
              {payInvoice && (
                <div className="space-y-4">
                  <p className="text-sm text-muted-foreground">Invoice #{payInvoice.id} — balance £{(payInvoice.balance_due ?? payInvoice.total).toFixed(2)}</p>
                  <div className="space-y-1">
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" min="0" value={payAmount} onChange={(e) => setPayAmount(e.target.value)} />
                  </div>
                  <Button className="w-full" onClick={() => void handleRecordPayment()} disabled={payLoading || !payAmount}>
                    {payLoading ? 'Saving…' : 'Record payment'}
                  </Button>
                </div>
              )}
            </DialogContent>
          </Dialog>
          </>
          )}
        </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}
