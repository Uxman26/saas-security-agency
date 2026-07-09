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
import Link from 'next/link';
import { api } from '@/lib/api';
import type { Invoice, Client, Site } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { FileText, Zap, Trash2, Eye, Pencil, Download } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { formatDueDate, isInvoicePastDue } from '@/lib/invoice-utils';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { StatusPieChart } from '@/components/charts/status-chart';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  unpaid: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];

export default function InvoicesPage() {
  const { user } = useAuth();
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
  const [sites, setSites] = useState<Site[]>([]);
  const [pageTab, setPageTab] = useState<'overview' | 'invoices'>('overview');
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const loadInvoices = (status?: string) => {
    setLoading(true);
    api.invoices.list(status ? { status } : {}).then(setInvoices).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
    api.clients.list().then(setClients).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!genStart || !genEnd) return;
    if (genMode === 'client' && !genClientId) return;
    if (genMode === 'site' && !genSiteId) return;
    setGenLoading(true);
    try {
      await api.invoices.generate({
        period_start: genStart,
        period_end: genEnd,
        ...(genMode === 'client' ? { client_id: parseInt(genClientId, 10) } : {}),
        ...(genMode === 'site' ? { site_id: parseInt(genSiteId, 10) } : {}),
      });
      setGenOpen(false);
      setGenClientId('');
      setGenSiteId('');
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

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.invoices.updateStatus(id, newStatus);
      loadInvoices(statusFilter || undefined);
    } catch (err) { console.error(err); }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this invoice?', async () => {
      try {
        await api.invoices.delete(id);
        loadInvoices(statusFilter || undefined);
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

  const getSearchText = useCallback(
    (inv: Invoice) =>
      [
        String(inv.id),
        inv.client_name ?? clientMap.get(inv.client_id),
        inv.status,
        inv.period_start,
        inv.period_end,
        inv.due_date,
        String(inv.total),
      ]
        .filter(Boolean)
        .join(' '),
    [clientMap]
  );

  const getSortValue = useCallback(
    (inv: Invoice, key: string) => {
      switch (key) {
        case 'id':
          return inv.id;
        case 'client':
          return inv.client_name ?? clientMap.get(inv.client_id) ?? '';
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
    [clientMap]
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
  }, [search, statusFilter]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const totalAmount = invoices.reduce((sum, inv) => sum + inv.total, 0);
  const paidAmount = invoices.reduce((sum, i) => sum + (i.amount_paid ?? (i.status === 'paid' ? i.total : 0)), 0);
  const outstanding = invoices
    .filter((i) => !['draft', 'paid', 'cancelled'].includes(i.status))
    .reduce((sum, i) => sum + (i.balance_due ?? (i.status === 'paid' ? 0 : i.total)), 0);
  const draftInvoices = invoices.filter((i) => i.status === 'draft');
  const sentInvoices = invoices.filter((i) => i.status === 'sent');
  const draftTotal = draftInvoices.reduce((sum, i) => sum + i.total, 0);
  const sentTotal = sentInvoices.reduce((sum, i) => sum + i.total, 0);

  const statusChart = STATUS_OPTIONS.map((s) => ({
    name: s.charAt(0).toUpperCase() + s.slice(1),
    value: invoices.filter((i) => i.status === s).length,
  }));

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><FileText className="size-7" /> Invoices</span>}
            description={`${invoices.length} invoice${invoices.length !== 1 ? 's' : ''}`}
            actions={
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => loadInvoices(statusFilter || undefined)} disabled={loading}>
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
                    <DialogTitle>Generate Invoice from Assignments</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Generate an invoice from published assignments and shift hours in the selected period.
                    </p>
                    <div className="space-y-1">
                      <Label>Generate by</Label>
                      <Select value={genMode} onValueChange={(v) => setGenMode(v as 'client' | 'site')}>
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
                        <Select value={genClientId} onValueChange={setGenClientId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select client" />
                          </SelectTrigger>
                          <SelectContent>
                            {clients.map((c) => (
                              <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <Label>Site <span className="text-destructive">*</span></Label>
                        <Select value={genSiteId} onValueChange={setGenSiteId}>
                          <SelectTrigger>
                            <SelectValue placeholder="Select site" />
                          </SelectTrigger>
                          <SelectContent>
                            {sites.map((s) => (
                              <SelectItem key={s.id} value={s.id.toString()}>{s.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    )}
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>Period Start <span className="text-destructive">*</span></Label>
                        <Input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Period End <span className="text-destructive">*</span></Label>
                        <Input type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleGenerate}
                      disabled={
                        genLoading ||
                        !genStart ||
                        !genEnd ||
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

          <ModuleTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'invoices', label: 'All invoices' },
            ]}
            value={pageTab}
            onChange={setPageTab}
          />

          {pageTab === 'overview' && invoices.length > 0 && (
            <>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{totalAmount.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Draft</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{draftTotal.toFixed(2)}</span>
                  <p className="text-xs text-muted-foreground mt-1">{draftInvoices.length} invoice{draftInvoices.length !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-blue-600">£{sentTotal.toFixed(2)}</span>
                  <p className="text-xs text-muted-foreground mt-1">{sentInvoices.length} invoice{sentInvoices.length !== 1 ? 's' : ''}</p>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-green-600">£{paidAmount.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-amber-600">£{outstanding.toFixed(2)}</span>
                </CardContent>
              </Card>
            </div>
            <StatusPieChart data={statusChart} title="Invoices by status" />
            </>
          )}

          {pageTab === 'invoices' && (
          <>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Search by client, status or period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={statusFilter || 'all'}
              onValueChange={(v) => {
                const val = v === 'all' ? '' : v;
                setStatusFilter(val);
                loadInvoices(val || undefined);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No invoices match your search.' : 'No invoices yet. Use "Generate Invoice" to create one.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Inv #" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Client" colKey="client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Period" colKey="period" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Due Date" colKey="due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Total" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Change Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((inv) => {
                        const pastDue = isInvoicePastDue(inv);
                        return (
                        <TableRow
                          key={inv.id}
                          className={cn(
                            pastDue && 'bg-red-50 dark:bg-red-950/25 border-l-2 border-l-red-500'
                          )}
                        >
                          <TableCell className="font-medium text-muted-foreground">#{inv.id}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {inv.client_name ?? clientMap.get(inv.client_id) ?? `Client #${inv.client_id}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {inv.period_start} – {inv.period_end}
                          </TableCell>
                          <TableCell className={cn('whitespace-nowrap text-sm', pastDue && 'text-red-600 dark:text-red-400 font-medium')}>
                            {formatDueDate(inv.due_date)}
                            {pastDue ? <span className="ml-1.5 text-xs uppercase tracking-wide">Overdue</span> : null}
                          </TableCell>
                          <TableCell className="font-bold whitespace-nowrap">£{inv.total.toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status] ?? 'bg-secondary text-secondary-foreground'}`}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={inv.status}
                              onValueChange={(v) => handleStatusChange(inv.id, v)}
                            >
                              <SelectTrigger className="h-7 text-xs w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="sm" asChild title="View">
                                <Link href={`/invoices/${inv.id}/view`}>
                                  <Eye className="size-4" />
                                </Link>
                              </Button>
                              <Button variant="ghost" size="sm" title="Download PDF" onClick={() => void downloadPdf(inv.id)}>
                                <Download className="size-4" />
                              </Button>
                              {can(user, 'inv.write') && (
                                <Button variant="ghost" size="sm" asChild title="Edit">
                                  <Link href={`/invoices/${inv.id}/edit`}>
                                    <Pencil className="size-4" />
                                  </Link>
                                </Button>
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(inv.id)}
                                title="Delete invoice"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
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
          </>
          )}
        </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}
