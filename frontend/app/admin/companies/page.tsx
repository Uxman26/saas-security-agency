'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';

export default function AdminCompaniesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      setLoading(false);
      router.replace('/dashboard');
      return;
    }
    api.admin.companies().then(setCompanies).catch(() => {}).finally(() => setLoading(false));
  }, [user, router]);

  const getSearchText = useCallback(
    (c: Company) => [String(c.id), c.name, String(c.admin_id), c.subscription_tier ?? '', c.created_at].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((c: Company, key: string) => {
    switch (key) {
      case 'id':
        return c.id;
      case 'name':
        return c.name;
      case 'admin':
        return c.admin_id;
      case 'tier':
        return c.subscription_tier || '';
      case 'created':
        return c.created_at || '';
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    companies,
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
  }, [search]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Platform – All Companies</h1>
            <button
              type="button"
              onClick={() => api.admin.companies().then(setCompanies)}
              className="text-sm text-primary hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="mb-4">
            <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Companies (tenants)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{companies.length === 0 ? 'No companies.' : 'No matches.'}</div>
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="ID" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Admin ID" colKey="admin" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Subscription" colKey="tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Created" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.id}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.admin_id}</TableCell>
                        <TableCell>{c.subscription_tier ?? '-'}</TableCell>
                        <TableCell>{c.created_at}</TableCell>
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
      </div>
    </ProtectedRoute>
  );
}