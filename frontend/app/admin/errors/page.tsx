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
import type { ErrorLogItem } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

const SEVERITIES = ['low', 'medium', 'high', 'critical'];
const STATUSES = ['open', 'resolved', 'ignored'];

export default function AdminErrorsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<ErrorLogItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [severity, setSeverity] = useState('all');
  const [status, setStatus] = useState('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .errors({
        ...(severity !== 'all' ? { severity } : {}),
        ...(status !== 'all' ? { status } : {}),
      })
      .then(setRows)
      .catch(() => toast.error('Failed to load errors'))
      .finally(() => setLoading(false));
  }, [severity, status]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const resolve = async (id: number) => {
    try {
      await api.admin.resolveError(id);
      toast.success('Error resolved');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Resolve failed');
    }
  };

  const getSearchText = useCallback(
    (e: ErrorLogItem) =>
      [e.message, e.source, e.module, e.severity, e.status, e.error_code, e.path, String(e.company_id ?? '')]
        .filter(Boolean)
        .join(' '),
    []
  );
  const getSortValue = useCallback((e: ErrorLogItem, key: string) => {
    switch (key) {
      case 'severity':
        return e.severity || '';
      case 'status':
        return e.status || '';
      case 'count':
        return e.occurrence_count ?? 0;
      case 'seen':
        return e.last_seen_at || '';
      default:
        return e.message || '';
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
            <h1 className="text-3xl font-bold">Error logs</h1>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            <Input placeholder="Search errors..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
            <Select value={severity} onValueChange={setSeverity}>
              <SelectTrigger className="w-36 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All severity</SelectItem>
                {SEVERITIES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-36 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader><CardTitle>Errors</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No errors.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Severity" colKey="severity" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Message" colKey="message" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Count" colKey="count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Last seen" colKey="seen" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((e) => (
                        <TableRow key={e.id}>
                          <TableCell className="capitalize font-medium">{e.severity ?? '—'}</TableCell>
                          <TableCell>
                            <p className="font-medium line-clamp-2 max-w-md">{e.message}</p>
                            <p className="text-xs text-muted-foreground">
                              {[e.source, e.module, e.path].filter(Boolean).join(' · ') || '—'}
                              {e.company_id != null ? ` · co #${e.company_id}` : ''}
                            </p>
                          </TableCell>
                          <TableCell className="capitalize">{e.status ?? '—'}</TableCell>
                          <TableCell>{e.occurrence_count ?? 1}</TableCell>
                          <TableCell>{e.last_seen_at ? new Date(e.last_seen_at).toLocaleString() : '—'}</TableCell>
                          <TableCell>
                            {e.status === 'open' && (
                              <Button size="sm" variant="outline" onClick={() => resolve(e.id)}>Resolve</Button>
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
