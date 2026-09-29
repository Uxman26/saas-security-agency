'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleGuard } from '@/components/module-guard';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { InlineTableSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE } from '@/lib/use-table-list';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { RecycleBinItem, RecycleBinResource } from '@/lib/types';
import { cn } from '@/lib/utils';
import { RotateCcw, Search, Trash2 } from 'lucide-react';

const ALL = '__all__';

function whenDeleted(iso: string | null) {
  if (!iso) return '—';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleString(undefined, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export default function RecycleBinPage() {
  const [items, setItems] = useState<RecycleBinItem[]>([]);
  const [resources, setResources] = useState<RecycleBinResource[]>([]);
  const [counts, setCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>(ALL);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.recycleBin
      .list()
      .then((res) => {
        setItems(res.items);
        setResources(res.resources);
        setCounts(res.counts);
      })
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Could not load the bin'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(load, [load]);

  const byKey = useMemo(
    () => Object.fromEntries(resources.map((r) => [r.key, r])) as Record<string, RecycleBinResource>,
    [resources]
  );

  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return items.filter((i) => {
      if (filter !== ALL && i.resource !== filter) return false;
      if (!needle) return true;
      return `${i.title} ${i.subtitle ?? ''} ${i.resource_label}`.toLowerCase().includes(needle);
    });
  }, [items, filter, search]);

  const pageCount = Math.max(1, Math.ceil(visible.length / pageSize));
  const safePage = Math.min(page, pageCount);
  const pageRows = visible.slice((safePage - 1) * pageSize, safePage * pageSize);

  useEffect(() => setPage(1), [filter, search]);

  const rowKey = (i: RecycleBinItem) => `${i.resource}:${i.id}`;

  const restore = async (i: RecycleBinItem) => {
    setBusy(rowKey(i));
    try {
      await api.recycleBin.restore(i.resource, i.id);
      toast.success(`${i.resource_label} restored`);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Restore failed');
    } finally {
      setBusy(null);
    }
  };

  const purge = (i: RecycleBinItem) => {
    toast.confirm(
      `Permanently delete “${i.title}”?`,
      async () => {
        setBusy(rowKey(i));
        try {
          await api.recycleBin.purge(i.resource, i.id);
          toast.success('Deleted permanently');
          load();
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        } finally {
          setBusy(null);
        }
      },
      {
        label: 'Delete permanently',
        description:
          'This destroys the record and everything attached to it. It cannot be undone and it cannot be restored.',
      }
    );
  };

  const chips: { key: string; label: string; count: number }[] = [
    { key: ALL, label: 'Everything', count: items.length },
    ...resources
      .map((r) => ({ key: r.key, label: r.plural, count: counts[r.key] ?? 0 }))
      .filter((c) => c.count > 0)
      .sort((a, b) => b.count - a.count),
  ];

  return (
    <ProtectedRoute>
      <ModuleGuard moduleKey="recycle_bin">
        <AppShell>
          <ModulePage>
            <ModuleHeader
              title="Recycle Bin"
              description="Nothing in ControlOps is deleted outright. Deleted records wait here until you restore them or delete them for good."
            />

            <div className="flex flex-wrap items-center gap-2">
              {chips.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setFilter(c.key)}
                  className={cn(
                    'rounded-full border px-3 py-1 text-xs font-medium transition',
                    filter === c.key
                      ? 'border-primary bg-primary text-primary-foreground'
                      : 'border-border bg-background hover:bg-muted'
                  )}
                >
                  {c.label}
                  <span className="ml-1.5 tabular-nums opacity-70">{c.count}</span>
                </button>
              ))}
            </div>

            <div className="relative max-w-sm">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search deleted records"
                className="pl-9"
              />
            </div>

            <Card>
              <CardContent className="pt-6">
                {loading ? (
                  <InlineTableSkeleton />
                ) : visible.length === 0 ? (
                  <div className="py-14 text-center">
                    <Trash2 className="mx-auto size-8 text-muted-foreground/50" aria-hidden />
                    <p className="mt-3 text-sm font-medium">
                      {items.length === 0 ? 'The bin is empty' : 'Nothing matches that search'}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">
                      {items.length === 0
                        ? 'Anything you delete will appear here so it can be brought back.'
                        : 'Try a different word, or pick another category above.'}
                    </p>
                  </div>
                ) : (
                  <>
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Item</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Deleted</TableHead>
                            <TableHead>By</TableHead>
                            <TableHead className="text-right">Actions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {pageRows.map((i) => {
                            const res = byKey[i.resource];
                            const rk = rowKey(i);
                            const rowBusy = busy === rk;
                            return (
                              <TableRow key={rk}>
                                <TableCell>
                                  <div className="font-medium">{i.title}</div>
                                  {i.subtitle ? (
                                    <div className="text-xs text-muted-foreground">{i.subtitle}</div>
                                  ) : null}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {i.resource_label}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {whenDeleted(i.deleted_at)}
                                </TableCell>
                                <TableCell className="whitespace-nowrap text-muted-foreground">
                                  {i.deleted_by ?? '—'}
                                </TableCell>
                                <TableCell className="text-right">
                                  <div className="flex justify-end gap-2">
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={rowBusy || !res?.can_restore}
                                      onClick={() => void restore(i)}
                                      title={
                                        res?.can_restore
                                          ? undefined
                                          : 'You do not have permission to restore this'
                                      }
                                    >
                                      <RotateCcw className="size-4" />
                                      Restore
                                    </Button>
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      className="text-destructive hover:text-destructive"
                                      disabled={rowBusy || !res?.can_purge}
                                      onClick={() => purge(i)}
                                      title={
                                        res?.can_purge
                                          ? undefined
                                          : 'You do not have permission to delete this permanently'
                                      }
                                    >
                                      <Trash2 className="size-4" />
                                      Delete forever
                                    </Button>
                                  </div>
                                </TableCell>
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                    <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                      <span className="text-xs text-muted-foreground">
                        {visible.length} item{visible.length === 1 ? '' : 's'} in the bin
                      </span>
                      <TablePaginationBar
                        safePage={safePage}
                        pageCount={pageCount}
                        total={visible.length}
                        pageSize={pageSize}
                        rangeStart={visible.length === 0 ? 0 : (safePage - 1) * pageSize + 1}
                        rangeEnd={Math.min(safePage * pageSize, visible.length)}
                        onPageChange={setPage}
                        onPageSizeChange={(n) => {
                          setPageSize(n);
                          setPage(1);
                        }}
                      />
                    </div>
                  </>
                )}
              </CardContent>
            </Card>
          </ModulePage>
        </AppShell>
      </ModuleGuard>
    </ProtectedRoute>
  );
}
