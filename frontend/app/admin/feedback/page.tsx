'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineTableSkeleton } from '@/components/skeletons';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { api } from '@/lib/api';
import type { FeedbackSubmission } from '@/lib/types';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';

const STATUSES = ['open', 'in_progress', 'closed'];
const CATEGORIES = ['suggestion', 'complaint', 'technical_issue', 'application_crash', 'other'];

export default function AdminFeedbackPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FeedbackSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const { sortKey, sortDir, toggleSort } = useTableSort('created');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .feedbackList({
        status: statusFilter !== 'all' ? statusFilter : undefined,
        category: categoryFilter !== 'all' ? categoryFilter : undefined,
      })
      .then(setRows)
      .catch(() => toast.error('Failed to load submissions'))
      .finally(() => setLoading(false));
  }, [statusFilter, categoryFilter]);

  useEffect(() => {
    if (user) load();
  }, [user, load]);

  const getSearchText = useCallback(
    (r: FeedbackSubmission) =>
      [r.reference, r.subject, r.company_name, r.submitted_by, r.category, r.status].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((r: FeedbackSubmission, key: string) => {
    switch (key) {
      case 'ref':
        return r.reference;
      case 'company':
        return r.company_name || '';
      case 'category':
        return r.category;
      case 'subject':
        return r.subject;
      case 'status':
        return r.status;
      case 'created':
        return r.created_at;
      case 'updated':
        return r.updated_at || '';
      default:
        return '';
    }
  }, []);

  const filtered = search.trim()
    ? rows.filter((r) => getSearchText(r).toLowerCase().includes(search.trim().toLowerCase()))
    : rows;

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    filtered,
    '',
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
        <div className="space-y-4 p-4 md:p-6">
          <div>
            <h1 className="text-xl font-semibold">Suggestions & Complaints</h1>
            <p className="text-sm text-muted-foreground">Review tenant feedback, technical issues, and crash reports.</p>
          </div>
          <Card>
            <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <CardTitle className="text-base">Submissions</CardTitle>
              <div className="flex flex-wrap gap-2">
                <Input
                  className="w-48"
                  placeholder="Search…"
                  value={search}
                  onChange={(e) => {
                    setSearch(e.target.value);
                    setPage(1);
                  }}
                />
                <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-36">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Select value={categoryFilter} onValueChange={(v) => { setCategoryFilter(v); setPage(1); }}>
                  <SelectTrigger className="w-44">
                    <SelectValue placeholder="Category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All categories</SelectItem>
                    {CATEGORIES.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : pageRows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No submissions found.</p>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="ID" colKey="ref" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Tenant" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Tenant ID</TableHead>
                        <TableHead>Submitted by</TableHead>
                        <SortableHead label="Category" colKey="category" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Subject" colKey="subject" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Submitted" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Updated" colKey="updated" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.reference}</TableCell>
                          <TableCell>{r.company_name || '—'}</TableCell>
                          <TableCell>{r.company_id}</TableCell>
                          <TableCell>{r.submitted_by || '—'}</TableCell>
                          <TableCell className="capitalize">{r.category.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="max-w-[220px] truncate">{r.subject}</TableCell>
                          <TableCell className="capitalize">{r.status.replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground whitespace-nowrap">
                            {r.updated_at ? new Date(r.updated_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Button asChild size="sm" variant="outline">
                              <Link href={`/admin/feedback/${r.id}`}>Open</Link>
                            </Button>
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
                    onPageSizeChange={setPageSize}
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
