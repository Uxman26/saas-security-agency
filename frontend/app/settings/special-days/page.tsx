'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineFormSkeleton } from '@/components/skeletons';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { SpecialDay } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { StatusBarChart } from '@/components/charts/status-chart';
import { toast } from '@/lib/toast';
import { can } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';

import { CalendarRange, Plus, Trash2, Sparkles } from 'lucide-react';

type Tab = 'holidays' | 'dates';

export default function SpecialDaysSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('dates');
  const [rows, setRows] = useState<SpecialDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [date, setDate] = useState('');
  const [label, setLabel] = useState('');
  const [yearSeed, setYearSeed] = useState(new Date().getFullYear());
  const [saving, setSaving] = useState(false);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    api.specialDays
      .list()
      .then(setRows)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!can(user, 'allow.read')) {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

  const addCustom = async () => {
    if (!date.trim()) return;
    setSaving(true);
    try {
      await api.specialDays.create({ date: date.trim(), label: label.trim() || 'Special day' });
      setOpen(false);
      setDate('');
      setLabel('');
      load();
    } finally {
      setSaving(false);
    }
  };

  const seedUk = async () => {
    setSaving(true);
    try {
      await api.specialDays.seedUk(yearSeed);
      load();
    } finally {
      setSaving(false);
    }
  };

  const remove = (id: number) => {
    toast.confirm('Remove this date?', async () => {
      setSaving(true);
      try {
        await api.specialDays.delete(id);
        load();
        toast.success('Date removed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Remove failed');
      } finally {
        setSaving(false);
      }
    }, { label: 'Remove' });
  };

  const canWrite = user && can(user, 'allow.write');

  const getSearchText = useCallback((r: SpecialDay) => `${r.date} ${r.label}`, []);
  const getSortValue = useCallback((r: SpecialDay, key: string) => (key === 'date' ? r.date : r.label), []);

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

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);
  const canDelete = user && can(user, 'allow.delete');

  const monthChart = useMemo(() => {
    const byMonth: Record<string, number> = {};
    rows.forEach((r) => {
      const m = r.date.slice(0, 7);
      byMonth[m] = (byMonth[m] || 0) + 1;
    });
    return Object.entries(byMonth).map(([name, value]) => ({ name, value }));
  }, [rows]);

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><CalendarRange className="size-7 text-amber-600" /> Special days & bank holidays</span>}
            description="Dates listed here are highlighted on the rota. Clients with double-rate on special days get 2× billing for shifts on these dates."
          />

          {monthChart.length > 0 && (
            <StatusBarChart data={monthChart} title="Special dates by month" />
          )}

          <ModuleTabs
            tabs={[
              { id: 'holidays', label: 'Bank holidays' },
              { id: 'dates', label: 'All dates' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'holidays' && (
            <Card className="border-border/60">
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-4">
                <div>
                  <CardTitle className="text-base">UK bank holidays (England & Wales)</CardTitle>
                  <CardDescription>Add preset dates for a year (skips duplicates).</CardDescription>
                </div>
                {canWrite && (
                  <div className="flex items-center gap-2">
                    <Input
                      type="number"
                      className="w-24"
                      value={yearSeed}
                      onChange={(e) => setYearSeed(parseInt(e.target.value, 10) || new Date().getFullYear())}
                    />
                    <Button size="sm" variant="secondary" onClick={seedUk} disabled={saving}>
                      <Sparkles className="size-4 mr-1" /> Seed year
                    </Button>
                  </div>
                )}
              </CardHeader>
            </Card>
          )}

          {tab === 'dates' && (
          <Card className="border-border/60">
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <div>
                <CardTitle className="text-base">All special dates</CardTitle>
                <CardDescription>Custom labels appear on the rota header for that date.</CardDescription>
              </div>
              {canWrite && (
                <Button size="sm" onClick={() => setOpen(true)}>
                  <Plus className="size-4 mr-1" /> Add date
                </Button>
              )}
            </CardHeader>
            <CardContent className="space-y-3">
              <Input placeholder="Search by date or label..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
              {loading ? (
                <InlineFormSkeleton />
              ) : rows.length === 0 ? (
                <p className="text-muted-foreground text-sm">No special days yet. Seed UK holidays or add a date.</p>
              ) : total === 0 ? (
                <p className="text-muted-foreground text-sm">No rows match your search.</p>
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="Date" colKey="date" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Label" colKey="label" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      {canDelete && <TableHead className="w-12" />}
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-mono text-sm">{r.date}</TableCell>
                        <TableCell>{r.label}</TableCell>
                        {canDelete && (
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive"
                              onClick={() => remove(r.id)}
                              disabled={saving}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        )}
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
          )}

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add special date</DialogTitle>
              </DialogHeader>
              <div className="space-y-3 py-2">
                <div className="space-y-1">
                  <Label>Date</Label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Label</Label>
                  <Input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Company closure" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={addCustom} disabled={saving || !date}>
                  Save
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
