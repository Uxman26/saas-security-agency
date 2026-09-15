'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { FeatureFlag } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

export default function AdminFlagsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<FeatureFlag[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [createOpen, setCreateOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .featureFlags()
      .then(setRows)
      .catch(() => toast.error('Failed to load flags'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const toggle = async (flag: FeatureFlag) => {
    try {
      const updated = await api.admin.putFeatureFlag(flag.key, { enabled: !flag.enabled });
      setRows((prev) => prev.map((f) => (f.key === updated.key ? updated : f)));
      toast.success(`${updated.key} ${updated.enabled ? 'enabled' : 'disabled'}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const create = async () => {
    if (!newKey.trim()) {
      toast.error('Key required');
      return;
    }
    setSaving(true);
    try {
      const created = await api.admin.putFeatureFlag(newKey.trim(), {
        name: newName.trim() || newKey.trim(),
        enabled: false,
      });
      setRows((prev) => {
        const exists = prev.some((f) => f.key === created.key);
        return exists ? prev.map((f) => (f.key === created.key ? created : f)) : [created, ...prev];
      });
      toast.success('Flag saved');
      setCreateOpen(false);
      setNewKey('');
      setNewName('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const getSearchText = useCallback(
    (f: FeatureFlag) => [f.key, f.name, f.description].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((f: FeatureFlag, key: string) => {
    switch (key) {
      case 'key':
        return f.key;
      case 'name':
        return f.name || '';
      case 'enabled':
        return f.enabled ? '1' : '0';
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
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold">Feature flags</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>Add flag</Button>
            </div>
          </div>
          <Input placeholder="Search flags..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md mb-4" />
          <Card>
            <CardHeader><CardTitle>Flags</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No feature flags.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Key" colKey="key" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Enabled" colKey="enabled" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((f) => (
                        <TableRow key={f.key}>
                          <TableCell className="font-mono text-xs">{f.key}</TableCell>
                          <TableCell>
                            <p className="font-medium">{f.name || f.key}</p>
                            {f.description && <p className="text-xs text-muted-foreground">{f.description}</p>}
                          </TableCell>
                          <TableCell>
                            <span className={f.enabled ? 'text-green-600' : 'text-muted-foreground'}>
                              {f.enabled ? 'On' : 'Off'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant={f.enabled ? 'destructive' : 'default'} onClick={() => toggle(f)}>
                              {f.enabled ? 'Disable' : 'Enable'}
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

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add feature flag</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Key</Label>
                <Input value={newKey} onChange={(e) => setNewKey(e.target.value)} className="mt-1 font-mono" placeholder="new_feature" />
              </div>
              <div>
                <Label>Name</Label>
                <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={create} disabled={saving}>{saving ? 'Saving...' : 'Save'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
