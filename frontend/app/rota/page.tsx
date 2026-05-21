'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, type SortDir } from '@/lib/use-table-list';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { RotaPlanListItem } from '@/lib/types';
import { Calendar, CalendarDays, Grid3x3, Loader2, Pencil, Plus, Trash2 } from 'lucide-react';

function fmtDate(iso: string) {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function statusBadge(status: string) {
  const published = status === 'published';
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
        published
          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
          : 'bg-amber-500/15 text-amber-800 dark:text-amber-400'
      }`}
    >
      {published ? 'Published' : 'Draft'}
    </span>
  );
}

export default function RotaHubPage() {
  const [rotas, setRotas] = useState<RotaPlanListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<number | null>(null);

  const load = useCallback(() => {
    setLoading(true);
    api.rotaPlans
      .list()
      .then(setRotas)
      .catch(() => setRotas([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const [sortKey, setSortKey] = useState<string | null>('created_at');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const toggleSort = useCallback((key: string) => {
    setSortKey((prev) => {
      if (prev !== key) {
        setSortDir('asc');
        return key;
      }
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
      return key;
    });
  }, []);

  const getSortValue = useCallback((r: RotaPlanListItem, key: string) => {
    if (key === 'name') return r.name;
    if (key === 'start_date') return r.start_date;
    if (key === 'day_count') return r.day_count;
    if (key === 'staff_count') return r.staff_count;
    if (key === 'shift_count') return r.shift_count;
    if (key === 'status') return r.status;
    return r.created_at;
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    rotas,
    '',
    sortKey,
    sortDir,
    page,
    pageSize,
    (r) => r.name,
    getSortValue
  );

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const rows = pageRows;

  const onDelete = (id: number, name: string) => {
    toast.confirm(
      `Delete rota "${name}"?`,
      async () => {
        setDeletingId(id);
        try {
          await api.rotaPlans.delete(id);
          toast.success('Rota deleted');
          load();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        } finally {
          setDeletingId(null);
        }
      },
      { label: 'Delete', description: 'Published shifts linked to it will also be removed.' }
    );
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
          <div className="container mx-auto px-4 py-8 max-w-6xl space-y-6">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <Calendar className="size-7 text-primary" />
                  Rotas & Shifts
                </h1>
                <p className="text-muted-foreground text-sm mt-1">Create and manage multiple rotas. Publish to save shifts as assignments.</p>
              </div>
              <Button className="bg-pink-600 hover:bg-pink-700" asChild>
                <Link href="/rota/create">
                  <Plus className="size-4 mr-1.5" />
                  Create rota
                </Link>
              </Button>
            </div>

            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">Your rotas</CardTitle>
                <CardDescription>All saved rotas for your company. Open a draft to edit or view a published rota.</CardDescription>
              </CardHeader>
              <CardContent>
                {loading ? (
                  <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
                    <Loader2 className="size-5 animate-spin" />
                    Loading rotas…
                  </div>
                ) : rotas.length === 0 ? (
                  <div className="py-12 text-center text-sm text-muted-foreground">
                    No rotas yet.{' '}
                    <Link href="/rota/create" className="text-primary underline hover:no-underline">
                      Create your first rota
                    </Link>
                  </div>
                ) : (
                  <>
                    <div className="rounded-md border overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Period" colKey="start_date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Days" colKey="day_count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Staff" colKey="staff_count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Shifts" colKey="shift_count" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <SortableHead label="Created" colKey="created_at" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                            <TableHead className="text-right w-[140px]">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {rows.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="font-medium">{r.name}</TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {fmtDate(r.start_date)} – {fmtDate(r.end_date)}
                              </TableCell>
                              <TableCell>{r.day_count}</TableCell>
                              <TableCell>{r.staff_count}</TableCell>
                              <TableCell>{r.shift_count}</TableCell>
                              <TableCell>{statusBadge(r.status)}</TableCell>
                              <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                                {fmtDate(r.created_at.slice(0, 10))}
                              </TableCell>
                              <TableCell className="text-right">
                                <div className="flex justify-end gap-1">
                                  <Button variant="ghost" size="icon" className="size-8" asChild title="Open planner">
                                    <Link href={`/rota/calendar?id=${r.id}`}>
                                      <Pencil className="size-4" />
                                    </Link>
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8 text-destructive hover:text-destructive"
                                    disabled={deletingId === r.id}
                                    onClick={() => onDelete(r.id, r.name)}
                                    title="Delete"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </div>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
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

            <div className="grid sm:grid-cols-2 gap-4">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Grid3x3 className="size-4" />
                    Assignment grid
                  </CardTitle>
                  <CardDescription className="text-xs">Live assignments from your database (filters, export).</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rota/legacy">Open legacy grid</Link>
                  </Button>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <CalendarDays className="size-4" />
                    Attendance report
                  </CardTitle>
                  <CardDescription className="text-xs">Summaries from the planner session.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Button variant="outline" size="sm" asChild>
                    <Link href="/rota/attendance-report">Open report</Link>
                  </Button>
                </CardContent>
              </Card>
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
