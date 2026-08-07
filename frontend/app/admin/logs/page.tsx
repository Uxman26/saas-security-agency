'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { LoginLog } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { cn } from '@/lib/utils';

export default function AdminLogsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [logs, setLogs] = useState<LoginLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.loginLogs().then(setLogs).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

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

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    logs,
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
          <h1 className="text-3xl font-bold mb-6">Activity logs</h1>
          <Input placeholder="Search logs..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md mb-4" />
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
