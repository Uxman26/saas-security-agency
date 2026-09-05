'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { AdminSession } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

export default function AdminSessionsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<AdminSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .sessions()
      .then(setRows)
      .catch(() => toast.error('Failed to load sessions'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const revoke = async (id: number) => {
    try {
      await api.admin.revokeSession(id);
      toast.success('Session revoked');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Revoke failed');
    }
  };

  const getSearchText = useCallback(
    (s: AdminSession) =>
      [s.email, s.full_name, s.ip_address, s.user_agent, String(s.user_id), String(s.company_id ?? '')]
        .filter(Boolean)
        .join(' '),
    []
  );
  const getSortValue = useCallback((s: AdminSession, key: string) => {
    switch (key) {
      case 'user':
        return s.full_name || s.email || '';
      case 'seen':
        return s.last_seen_at || '';
      case 'ip':
        return s.ip_address || '';
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
            <h1 className="text-3xl font-bold">Active sessions</h1>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>
          <Input placeholder="Search sessions..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md mb-4" />
          <Card>
            <CardHeader><CardTitle>Sessions</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No active sessions.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="User" colKey="user" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Last seen" colKey="seen" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="IP" colKey="ip" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Device</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((s) => (
                        <TableRow key={s.id}>
                          <TableCell>
                            <p className="font-medium">{s.full_name || '—'}</p>
                            <p className="text-xs text-muted-foreground">{s.email}</p>
                            {s.is_impersonation && (
                              <p className="text-xs text-amber-600">Impersonation</p>
                            )}
                          </TableCell>
                          <TableCell>{s.last_seen_at ? new Date(s.last_seen_at).toLocaleString() : '—'}</TableCell>
                          <TableCell className="font-mono text-xs">{s.ip_address || '—'}</TableCell>
                          <TableCell className="text-xs max-w-[200px] truncate" title={s.user_agent || ''}>
                            {s.user_agent || '—'}
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="destructive" onClick={() => revoke(s.id)}>
                              Force logout
                            </Button>
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
