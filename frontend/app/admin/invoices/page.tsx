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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { SubscriptionInvoice } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Eye, Mail, Zap } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800',
  unpaid: 'bg-blue-100 text-blue-800',
  overdue: 'bg-red-100 text-red-800',
  partial: 'bg-amber-100 text-amber-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

const STATUS_OPTIONS = ['', 'unpaid', 'paid', 'overdue', 'partial', 'cancelled'];

const fmt = (n: number) => `£${n.toFixed(2)}`;

export default function AdminInvoicesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
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

  const generateInvoices = async () => {
    try {
      const res = await api.admin.generateInvoices();
      toast.success(`Generated ${res.created} invoice(s)`);
      load(statusFilter || undefined);
    } catch {
      toast.error('Generation failed');
    }
  };

  const getSearchText = useCallback(
    (inv: SubscriptionInvoice) =>
      [inv.invoice_number, inv.company_name, inv.tenant_email, inv.subscription_tier, inv.billing_cycle, inv.status]
        .filter(Boolean)
        .join(' '),
    []
  );

  const getSortValue = useCallback((inv: SubscriptionInvoice, key: string) => {
    switch (key) {
      case 'number':
        return inv.invoice_number;
      case 'tenant':
        return inv.company_name || '';
      case 'plan':
        return inv.subscription_tier;
      case 'due':
        return inv.due_date;
      case 'total':
        return inv.total_amount;
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

  const outstanding = invoices
    .filter((i) => !['paid', 'cancelled'].includes(i.status))
    .reduce((s, i) => s + Math.max(0, i.total_amount - i.amount_paid), 0);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold">Subscription invoices</h1>
              <p className="text-muted-foreground mt-1">Platform billing — auto-generated per tenant subscription cycle</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => load(statusFilter || undefined)} disabled={loading}>Refresh</Button>
              <Button onClick={generateInvoices}><Zap className="size-4 mr-1" />Generate due</Button>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3 mb-6">
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Total invoices</p><p className="text-2xl font-bold">{invoices.length}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Outstanding</p><p className="text-2xl font-bold text-red-600">{fmt(outstanding)}</p></CardContent></Card>
            <Card><CardContent className="pt-6"><p className="text-sm text-muted-foreground">Collected</p><p className="text-2xl font-bold text-green-600">{fmt(invoices.reduce((s, i) => s + i.amount_paid, 0))}</p></CardContent></Card>
          </div>

          <div className="flex flex-wrap gap-2 mb-4">
            <Input placeholder="Search invoices..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={statusFilter || 'all'} onValueChange={(v) => { setStatusFilter(v === 'all' ? '' : v); load(v === 'all' ? undefined : v); }}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUS_OPTIONS.filter(Boolean).map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader><CardTitle>Subscription billing</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No subscription invoices yet.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Invoice" colKey="number" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Tenant" colKey="tenant" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Plan" colKey="plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Cycle</TableHead>
                        <SortableHead label="Due" colKey="due" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Total" colKey="total" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Email</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono text-xs">{inv.invoice_number}</TableCell>
                          <TableCell>{inv.company_name}</TableCell>
                          <TableCell className="capitalize">{inv.subscription_tier}</TableCell>
                          <TableCell className="capitalize">{inv.billing_cycle}</TableCell>
                          <TableCell>{inv.due_date}</TableCell>
                          <TableCell className="font-medium">{fmt(inv.total_amount)}</TableCell>
                          <TableCell>
                            <Select value={inv.status} onValueChange={(v) => handleStatusChange(inv.id, v)}>
                              <SelectTrigger className={cn('w-28 h-8 text-xs capitalize', STATUS_STYLES[inv.status])}>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.filter(Boolean).map((s) => (
                                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>{inv.email_sent ? <Mail className="size-4 text-green-600" /> : '—'}</TableCell>
                          <TableCell>
                            <Link href={`/admin/invoices/${inv.id}`}>
                              <Button size="sm" variant="outline"><Eye className="size-4" /></Button>
                            </Link>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar safePage={safePage} pageCount={pageCount} total={total} pageSize={pageSize} rangeStart={rangeStart} rangeEnd={rangeEnd} onPageChange={setPage} onPageSizeChange={setPageSize} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
