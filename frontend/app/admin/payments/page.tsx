'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { AdminPayment } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

export default function AdminPaymentsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<AdminPayment[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    api.admin.payments().then(setRows).catch(() => toast.error('Failed to load payments'));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
    setLoading(false);
  }, [user, router, load]);

  const getSearchText = useCallback(
    (p: AdminPayment) =>
      [String(p.id), p.company_name, String(p.invoice_id), p.method, String(p.amount)].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((p: AdminPayment, key: string) => {
    switch (key) {
      case 'company':
        return p.company_name || '';
      case 'invoice':
        return p.invoice_id ?? 0;
      case 'amount':
        return p.amount;
      case 'method':
        return p.method;
      case 'paid':
        return p.paid_at;
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    rows,
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
            <h1 className="text-3xl font-bold">All payments</h1>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
          <Input
            placeholder="Search payments..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md mb-4"
          />
          <Card>
            <CardHeader>
              <CardTitle>Platform payments</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No payments.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Invoice" colKey="invoice" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Amount" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Method" colKey="method" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Paid at" colKey="paid" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell>{p.company_name ?? '-'}</TableCell>
                          <TableCell>{p.invoice_id ?? '-'}</TableCell>
                          <TableCell>£{p.amount.toFixed(2)}</TableCell>
                          <TableCell className="capitalize">{p.method}</TableCell>
                          <TableCell>{new Date(p.paid_at).toLocaleString()}</TableCell>
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
