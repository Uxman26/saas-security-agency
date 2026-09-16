'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { LoginLog } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { downloadCsv } from '@/lib/csv';
import { cn } from '@/lib/utils';

export default function AdminLogsPage() {
  const { user } = useAuth();
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.loginLogs().then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const getSearchText = useCallback(
    (l: LoginLog) => [l.full_name, l.email, l.ip_address, l.user_agent, l.status].filter(Boolean).join(' '),
    []
  );

  const getSortValue = useCallback((l: LoginLog, key: string) => {
    switch (key) {
      case 'user':
        return l.full_name || l.email || '';
      case 'time':
        return l.login_at;
      case 'ip':
        return l.ip_address || '';
      case 'status':
        return l.status;
      default:
        return '';
    }
  }, []);

  const filtered = useMemo(
    () => (status === 'all' ? logs : logs.filter((l) => l.status === status)),
    [logs, status]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    filtered,
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
          <div className="flex flex-wrap items-start justify-between gap-3 mb-2">
            <div>
              <h1 className="text-3xl font-bold">Activity logs</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Sign-in attempts across the platform — who signed in, from where, and whether it succeeded.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              disabled={logs.length === 0}
              onClick={() =>
                downloadCsv(
                  'login-logs.csv',
                  ['When', 'Name', 'Email', 'IP', 'User agent', 'Status'],
                  logs.map((l) => [l.login_at, l.full_name, l.email, l.ip_address, l.user_agent, l.status])
                )
              }
            >
              Export CSV
            </Button>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <Input placeholder="Search user, email, IP, status…" value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="w-40">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="success">Success</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader><CardTitle>Login history</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="User" colKey="user" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Date & time" colKey="time" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="IP address" colKey="ip" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Device / browser</TableHead>
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell>
                            <p className="font-medium">{l.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{l.email}</p>
                          </TableCell>
                          <TableCell>{new Date(l.login_at).toLocaleString()}</TableCell>
                          <TableCell className="font-mono text-xs">{l.ip_address || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate" title={l.user_agent || ''}>{l.user_agent || '—'}</TableCell>
                          <TableCell>
                            <span className={cn('px-2 py-0.5 rounded text-xs capitalize', l.status === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800')}>
                              {l.status}
                            </span>
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
