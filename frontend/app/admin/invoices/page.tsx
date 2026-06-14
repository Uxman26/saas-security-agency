'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Eye, Download } from 'lucide-react';
import { toast } from '@/lib/toast';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const STATUS_OPTIONS = ['', 'draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function AdminInvoicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback((status?: string) => {
    setLoading(true);
    api.admin
      .invoices(status ? { status } : {})
      .then(setInvoices)
      .catch(() => toast.error('Failed to load invoices'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.admin.patchInvoiceStatus(id, newStatus);
      load(statusFilter || undefined);
      toast.success('Status updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const downloadPdf = async (id: number) => {
    try {
      const blob = await api.admin.invoicePdf(id);
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
        inv.company_name,
        inv.client_name,
        inv.status,
        inv.period_start,
        inv.period_end,
        String(inv.total),
      ]
        .filter(Boolean)
        .join(' '),
    []
  );
  const getSortValue = useCallback((inv: Invoice, key: string) => {
    switch (key) {
      case 'id':
        return inv.id;
      case 'company':
        return inv.company_name || '';
      case 'client':
        return inv.client_name || '';
      case 'period':
        return inv.period_start;
      case 'total':
        return inv.total;
      case 'status':
        return inv.status;
      default:
        return '';
    }
  }, []);

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

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">All invoices</h1>
            <Button variant="outline" size="sm" onClick={() => load(statusFilter || undefined)}>
              Refresh
            </Button>
          </div>
          <div className="flex gap-4 mb-4 flex-wrap">
            <Input
              placeholder="Search invoices..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
            <Select
              value={statusFilter || 'all'}
              onValueChange={(v) => {
                const s = v === 'all' ? '' : v;
                setStatusFilter(s);
                load(s || undefined);
              }}
            >
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s || 'all'} value={s || 'all'}>
                    {s ? s.charAt(0).toUpperCase() + s.slice(1) : 'All statuses'}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Platform invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No invoices.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="ID" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Client" colKey="client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Period" colKey="period" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Total" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Actions</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell>{inv.id}</TableCell>
                          <TableCell>{inv.company_name ?? '-'}</TableCell>
                          <TableCell>{inv.client_name ?? inv.client_id}</TableCell>
                          <TableCell className="text-sm">
                            {inv.period_start} – {inv.period_end}
                          </TableCell>
                          <TableCell>£{inv.total.toFixed(2)}</TableCell>
                          <TableCell>
                            <Select value={inv.status} onValueChange={(v) => handleStatusChange(inv.id, v)}>
                              <SelectTrigger className={`h-8 w-28 text-xs capitalize ${STATUS_STYLES[inv.status] ?? ''}`}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.filter(Boolean).map((s) => (
                                  <SelectItem key={s} value={s} className="capitalize">
                                    {s}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button size="sm" variant="ghost" asChild>
                                <Link href={`/admin/invoices/${inv.id}`}>
                                  <Eye className="size-4" />
                                </Link>
                              </Button>
                              <Button size="sm" variant="ghost" onClick={() => downloadPdf(inv.id)}>
                                <Download className="size-4" />
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
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
