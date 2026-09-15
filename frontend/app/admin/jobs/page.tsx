'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { BackgroundJobItem } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

const STATUSES = ['pending', 'running', 'failed', 'completed', 'cancelled'];

export default function AdminJobsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<BackgroundJobItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [syncing, setSyncing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .jobs(status !== 'all' ? status : undefined)
      .then(setRows)
      .catch(() => toast.error('Failed to load jobs'))
      .finally(() => setLoading(false));
  }, [status]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const retry = async (id: number) => {
    try {
      await api.admin.retryJob(id);
      toast.success('Job queued for retry');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Retry failed');
    }
  };

  const cancel = async (id: number) => {
    try {
      await api.admin.cancelJob(id);
      toast.success('Job cancelled');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Cancel failed');
    }
  };

  const syncWorkers = async () => {
    setSyncing(true);
    try {
      const res = await api.admin.syncWorkers();
      toast.success(`Synced workers (${res.created} created)`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Sync failed');
    } finally {
      setSyncing(false);
    }
  };

  const getSearchText = useCallback(
    (j: BackgroundJobItem) =>
      [j.job_name, j.queue, j.status, j.error_message, String(j.company_id ?? '')].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((j: BackgroundJobItem, key: string) => {
    switch (key) {
      case 'name':
        return j.job_name || '';
      case 'status':
        return j.status || '';
      case 'attempts':
        return j.attempts ?? 0;
      case 'created':
        return j.created_at || '';
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
            <h1 className="text-3xl font-bold">Background jobs</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
              <Button size="sm" disabled={syncing} onClick={() => void syncWorkers()}>
                {syncing ? 'Syncing...' : 'Sync workers'}
              </Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            <Input placeholder="Search jobs..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader><CardTitle>Jobs</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No jobs.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Job" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Attempts" colKey="attempts" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Created" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Error</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((j) => (
                        <TableRow key={j.id}>
                          <TableCell>
                            <p className="font-medium">{j.job_name}</p>
                            <p className="text-xs text-muted-foreground">{j.queue || 'default'}{j.company_id != null ? ` · co #${j.company_id}` : ''}</p>
                          </TableCell>
                          <TableCell className="capitalize">{j.status ?? '—'}</TableCell>
                          <TableCell>{j.attempts ?? 0}</TableCell>
                          <TableCell>{j.created_at ? new Date(j.created_at).toLocaleString() : '—'}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate" title={j.error_message || ''}>
                            {j.error_message || '—'}
                          </TableCell>
                          <TableCell className="space-x-2">
                            {(j.status === 'failed' || j.status === 'cancelled') && (
                              <Button size="sm" variant="outline" onClick={() => retry(j.id)}>Retry</Button>
                            )}
                            {(j.status === 'pending' || j.status === 'running' || j.status === 'failed') && (
                              <Button size="sm" variant="destructive" onClick={() => cancel(j.id)}>Cancel</Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar safePage={safePage} pageCount={pageCount} total={total} pageSize={pageSize} rangeStart={rangeStart} rangeEnd={rangeEnd} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
