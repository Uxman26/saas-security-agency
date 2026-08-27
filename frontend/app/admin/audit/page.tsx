'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PlatformAuditLog } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

/** Colour by how consequential the action is, so destructive rows stand out. */
const ACTION_STYLES: Record<string, string> = {
  'company.deleted': 'bg-destructive/15 text-destructive',
  'company.archived': 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  'company.suspended': 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  'user.password_reset': 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  'user.deactivated': 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-200',
  'impersonation.start': 'bg-primary/15 text-primary',
  'impersonation.end': 'bg-muted text-muted-foreground',
};

function actionClass(action: string) {
  return ACTION_STYLES[action] ?? 'bg-muted text-foreground';
}

function pretty(json?: string | null): string | null {
  if (!json) return null;
  try {
    return JSON.stringify(JSON.parse(json), null, 2);
  } catch {
    return json;
  }
}

export default function AdminAuditPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PlatformAuditLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [targetType, setTargetType] = useState('all');
  const [selected, setSelected] = useState<PlatformAuditLog | null>(null);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .auditLogs({ limit: 500 })
      .then(setRows)
      .catch((e) => toast.error(e instanceof Error ? e.message : 'Failed to load the audit trail'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const targetTypes = useMemo(
    () => Array.from(new Set(rows.map((r) => r.target_type))).sort(),
    [rows]
  );

  const filtered = useMemo(
    () => (targetType === 'all' ? rows : rows.filter((r) => r.target_type === targetType)),
    [rows, targetType]
  );

  const getSearchText = useCallback(
    (r: PlatformAuditLog) =>
      [r.actor_email, r.action, r.target_type, r.target_label, r.company_name, r.ip_address]
        .filter(Boolean)
        .join(' '),
    []
  );

  const getSortValue = useCallback((r: PlatformAuditLog, key: string) => {
    switch (key) {
      case 'when':
        return r.created_at;
      case 'actor':
        return r.actor_email || '';
      case 'action':
        return r.action;
      case 'target':
        return r.target_label || r.target_type;
      case 'company':
        return r.company_name || '';
      default:
        return '';
    }
  }, []);

  const list = useTableList(filtered, search, sortKey, sortDir, page, pageSize, getSearchText, getSortValue);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex items-start justify-between gap-4 mb-2">
            <div>
              <h1 className="text-3xl font-bold">Audit trail</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Every action taken from the super admin portal. Kept independently of tenant data, so
                it survives the records it describes.
              </p>
            </div>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 flex-wrap mb-4">
            <Input
              placeholder="Search actor, action, target, company…"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                // Reset here rather than in an effect: a narrowed result set should show
                // its first page, and doing it on the event avoids a second render pass.
                setPage(1);
              }}
              className="max-w-md"
            />
            <Select
              value={targetType}
              onValueChange={(v) => {
                setTargetType(v);
                setPage(1);
              }}
            >
              <SelectTrigger className="w-full sm:w-52">
                <SelectValue placeholder="All targets" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All targets</SelectItem>
                {targetTypes.map((t) => (
                  <SelectItem key={t} value={t}>
                    {t}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Platform activity</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : list.total === 0 ? (
                <div className="py-10 text-center text-sm text-muted-foreground">
                  {rows.length === 0
                    ? 'No admin actions recorded yet.'
                    : 'No entries match this search.'}
                </div>
              ) : (
                <>
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <SortableHead label="When" colKey="when" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Actor" colKey="actor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Action" colKey="action" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Target" colKey="target" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                          <TableHead>IP</TableHead>
                          <TableHead className="text-right">Detail</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {list.pageRows.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="text-sm tabular-nums whitespace-nowrap">
                              {new Date(r.created_at).toLocaleString()}
                            </TableCell>
                            <TableCell className="text-sm">{r.actor_email || '—'}</TableCell>
                            <TableCell>
                              <span className={cn('rounded px-2 py-0.5 text-xs font-medium', actionClass(r.action))}>
                                {r.action}
                              </span>
                            </TableCell>
                            <TableCell className="text-sm">
                              {r.target_label || '—'}
                              <span className="text-muted-foreground"> · {r.target_type}</span>
                            </TableCell>
                            <TableCell className="text-sm">{r.company_name || '—'}</TableCell>
                            <TableCell className="text-xs font-mono text-muted-foreground">
                              {r.ip_address || '—'}
                            </TableCell>
                            <TableCell className="text-right">
                              {r.before_json || r.after_json || r.note ? (
                                <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                                  View
                                </Button>
                              ) : null}
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                  <TablePaginationBar
                    safePage={list.safePage}
                    pageCount={list.pageCount}
                    total={list.total}
                    pageSize={pageSize}
                    rangeStart={list.rangeStart}
                    rangeEnd={list.rangeEnd}
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

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="break-words">{selected?.action}</DialogTitle>
              <DialogDescription>
                {selected
                  ? `${selected.actor_email || 'Unknown actor'} · ${new Date(selected.created_at).toLocaleString()}`
                  : ''}
              </DialogDescription>
            </DialogHeader>
            {selected ? (
              <div className="space-y-4 text-sm">
                <dl className="grid grid-cols-2 gap-x-4 gap-y-2">
                  <dt className="text-muted-foreground">Target</dt>
                  <dd className="break-words">
                    {selected.target_label || '—'} ({selected.target_type}
                    {selected.target_id != null ? ` #${selected.target_id}` : ''})
                  </dd>
                  <dt className="text-muted-foreground">Company</dt>
                  <dd className="break-words">{selected.company_name || '—'}</dd>
                  <dt className="text-muted-foreground">IP</dt>
                  <dd className="font-mono text-xs">{selected.ip_address || '—'}</dd>
                  <dt className="text-muted-foreground">User agent</dt>
                  <dd className="text-xs break-all">{selected.user_agent || '—'}</dd>
                </dl>
                {selected.note ? (
                  <div>
                    <p className="font-medium mb-1">Note</p>
                    <p className="text-muted-foreground break-words">{selected.note}</p>
                  </div>
                ) : null}
                {selected.before_json ? (
                  <div>
                    <p className="font-medium mb-1">Before</p>
                    <pre className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto">
                      {pretty(selected.before_json)}
                    </pre>
                  </div>
                ) : null}
                {selected.after_json ? (
                  <div>
                    <p className="font-medium mb-1">After</p>
                    <pre className="rounded-md border bg-muted/40 p-3 text-xs overflow-x-auto">
                      {pretty(selected.after_json)}
                    </pre>
                  </div>
                ) : null}
              </div>
            ) : null}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
