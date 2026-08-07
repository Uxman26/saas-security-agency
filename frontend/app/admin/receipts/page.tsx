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
import type { SubscriptionReceipt } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

export default function AdminReceiptsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<SubscriptionReceipt[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.receipts().then(setRows).catch(() => toast.error('Failed to load receipts')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

  const markPaid = async (id: number) => {
    try {
      await api.admin.markReceiptPaid(id);
      toast.success('Marked as paid — subscription activated');
      load();
    } catch {
      toast.error('Failed to mark paid');
    }
  };

  const getSearchText = useCallback(
    (r: SubscriptionReceipt) =>
      [r.ref_id, r.company_name, r.user_email, r.subscription_tier, r.status, String(r.amount)].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((r: SubscriptionReceipt, key: string) => {
    switch (key) {
      case 'ref':
        return r.ref_id;
      case 'company':
        return r.company_name || '';
      case 'tier':
        return r.subscription_tier;
      case 'amount':
        return r.amount;
      case 'status':
        return r.status;
      case 'created':
        return r.created_at;
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
            <h1 className="text-3xl font-bold">Subscription receipts</h1>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
          <Input
            placeholder="Search receipts..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md mb-4"
          />
          <Card>
            <CardHeader>
              <CardTitle>All receipts</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No receipts.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Reference" colKey="ref" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Plan" colKey="tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Amount" colKey="amount" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Created" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Action</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.ref_id}</TableCell>
                          <TableCell>{r.company_name ?? '-'}</TableCell>
                          <TableCell className="capitalize">{r.subscription_tier}</TableCell>
                          <TableCell>£{r.amount.toFixed(2)}</TableCell>
                          <TableCell className="capitalize">{r.status}</TableCell>
                          <TableCell>{new Date(r.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {r.status === 'pending' ? (
                              <Button size="sm" onClick={() => markPaid(r.id)}>
                                Mark paid
                              </Button>
                            ) : (
                              <span className="text-muted-foreground text-sm">
                                {r.period_end ? `Until ${new Date(r.period_end).toLocaleDateString()}` : 'Paid'}
                              </span>
                            )}
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
