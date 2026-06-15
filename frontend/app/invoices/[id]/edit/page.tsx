'use client';

import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Guard, Invoice, InvoiceLine, Site } from '@/lib/types';
import { ArrowLeft, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { can } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';

const STATUSES = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function InvoiceEditPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const rawId = params.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [due, setDue] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [status, setStatus] = useState('draft');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLine, setNewLine] = useState({
    site_id: '',
    guard_id: '',
    hours: '0',
    rate: '0',
  });
  const [lineSearch, setLineSearch] = useState('');
  const lineSort = useTableSort();
  const [linePage, setLinePage] = useState(1);
  const [linePageSize, setLinePageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(async () => {
    const data = await api.invoices.get(id);
    setInv(data);
    setDue(data.due_date ?? '');
    setNotes(data.notes ?? '');
    setTaxRate(String(data.tax_rate ?? 0));
    setStatus(data.status);
  }, [id]);

  useEffect(() => {
    if (!id || Number.isNaN(id)) return;
    if (user && !can(user, 'inv.write')) {
      router.replace(`/invoices/${id}/view`);
      return;
    }
    load().catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
    api.guards.list().then(setGuards).catch(() => {});
  }, [id, user, router, load]);

  const saveHeader = async () => {
    if (!inv) return;
    setSaving(true);
    try {
      const updated = await api.invoices.patch(id, {
        due_date: due || null,
        notes: notes || null,
        tax_rate: parseFloat(taxRate) || 0,
        status,
      });
      setInv(updated);
    } finally {
      setSaving(false);
    }
  };

  const saveLine = async (line: InvoiceLine) => {
    setSaving(true);
    try {
      await api.invoices.updateLine(id, line.id, {
        site_id: line.site_id,
        guard_id: line.guard_id != null ? line.guard_id : null,
        hours: line.hours,
        rate: line.rate,
        allowance_amount: line.allowance_amount,
      });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeLine = (lineId: number) => {
    toast.confirm('Remove this line?', async () => {
      setSaving(true);
      try {
        await api.invoices.deleteLine(id, lineId);
        await load();
        toast.success('Line removed');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Remove failed');
      } finally {
        setSaving(false);
      }
    }, { label: 'Remove' });
  };

  const addLineSubmit = async () => {
    if (!newLine.site_id) return;
    setSaving(true);
    try {
      await api.invoices.addLine(id, {
        site_id: parseInt(newLine.site_id, 10),
        guard_id: newLine.guard_id ? parseInt(newLine.guard_id, 10) : undefined,
        hours: parseFloat(newLine.hours) || 0,
        rate: parseFloat(newLine.rate) || 0,
        allowance_amount: 0,
      });
      setAddOpen(false);
      setNewLine({ site_id: '', guard_id: '', hours: '0', rate: '0' });
      await load();
    } finally {
      setSaving(false);
    }
  };

  const updateLocalLine = (lineId: number, patch: Partial<InvoiceLine>) => {
    setInv((prev) => {
      if (!prev?.lines) return prev;
      return {
        ...prev,
        lines: prev.lines.map((l) => (l.id === lineId ? { ...l, ...patch } : l)),
      };
    });
  };

  const lines = inv?.lines ?? [];
  const siteName = useCallback(
    (line: InvoiceLine) => sites.find((s) => s.id === line.site_id)?.name ?? line.site_name ?? '',
    [sites]
  );
  const guardName = useCallback(
    (line: InvoiceLine) => guards.find((g) => g.id === line.guard_id)?.full_name ?? line.guard_name ?? '',
    [guards]
  );
  const getLineSearchText = useCallback(
    (line: InvoiceLine) =>
      [
        siteName(line),
        guardName(line),
        String(line.hours),
        String(line.rate),
        String(line.amount),
        String(line.id),
      ].join(' '),
    [siteName, guardName]
  );
  const getLineSortValue = useCallback(
    (line: InvoiceLine, key: string) => {
      switch (key) {
        case 'site':
          return siteName(line);
        case 'guard':
          return guardName(line);
        case 'hours':
          return line.hours;
        case 'rate':
          return line.rate;
        case 'amount':
          return line.amount;
        default:
          return '';
      }
    },
    [siteName, guardName]
  );

  const lineList = useTableList(lines, lineSearch, lineSort.sortKey, lineSort.sortDir, linePage, linePageSize, getLineSearchText, getLineSortValue);

  useEffect(() => {
    setLinePage(1);
  }, [lineSearch, id]);
  useEffect(() => {
    setLinePage((x) => Math.min(x, lineList.pageCount));
  }, [lineList.pageCount]);

  return (
    <ProtectedRoute>
      <AppShell>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/invoices">
                <ArrowLeft className="size-4 mr-1" /> Invoices
              </Link>
            </Button>
            {inv && (
              <Button variant="outline" size="sm" asChild>
                <Link href={`/invoices/${inv.id}/view`}>
                  <Eye className="size-4 mr-1" /> View PDF
                </Link>
              </Button>
            )}
            <h1 className="text-2xl font-bold">Edit invoice #{id}</h1>
          </div>

          {inv && (
            <>
              <Card className="mb-6 border-border/60">
                <CardHeader>
                  <CardTitle className="text-base">Details</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1">
                      <Label>Due date</Label>
                      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Status</Label>
                      <Select value={status} onValueChange={setStatus}>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {STATUSES.map((s) => (
                            <SelectItem key={s} value={s}>
                              {s.charAt(0).toUpperCase() + s.slice(1)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Tax rate (%)</Label>
                      <Input
                        type="number"
                        step="0.01"
                        value={taxRate}
                        onChange={(e) => setTaxRate(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Notes</Label>
                      <textarea
                        className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>Subtotal £{(inv.subtotal ?? 0).toFixed(2)}</span>
                    <span>Tax £{(inv.tax_amount ?? 0).toFixed(2)}</span>
                    <span className="font-semibold text-foreground">
                      Total £{(inv.total ?? 0).toFixed(2)}
                    </span>
                  </div>
                  <Button onClick={saveHeader} disabled={saving}>
                    <Save className="size-4 mr-1" /> Save details
                  </Button>
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <CardTitle className="text-base">Line items</CardTitle>
                  <Button size="sm" variant="outline" onClick={() => setAddOpen(true)}>
                    <Plus className="size-4 mr-1" /> Add line
                  </Button>
                </CardHeader>
                <CardContent className="overflow-x-auto space-y-4">
                  <Input
                    placeholder="Search lines..."
                    value={lineSearch}
                    onChange={(e) => setLineSearch(e.target.value)}
                    className="max-w-md"
                  />
                  {lines.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No line items yet.</p>
                  ) : lineList.total === 0 ? (
                    <p className="text-sm text-muted-foreground">No matches.</p>
                  ) : (
                    <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Site" colKey="site" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} />
                        <SortableHead label="Guard" colKey="guard" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} />
                        <SortableHead label="Hours" colKey="hours" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <SortableHead label="Rate" colKey="rate" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <SortableHead label="Amount" colKey="amount" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineList.pageRows.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <Select
                              value={String(line.site_id)}
                              onValueChange={(v) =>
                                updateLocalLine(line.id, { site_id: parseInt(v, 10) })
                              }
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {sites.map((s) => (
                                  <SelectItem key={s.id} value={String(s.id)}>
                                    {s.name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={line.guard_id ? String(line.guard_id) : 'none'}
                              onValueChange={(v) =>
                                updateLocalLine(line.id, {
                                  guard_id: v === 'none' ? undefined : parseInt(v, 10),
                                })
                              }
                            >
                              <SelectTrigger className="w-[140px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="none">—</SelectItem>
                                {guards.map((g) => (
                                  <SelectItem key={g.id} value={String(g.id)}>
                                    {g.full_name}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-20"
                              type="number"
                              step="0.01"
                              value={line.hours}
                              onChange={(e) =>
                                updateLocalLine(line.id, {
                                  hours: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-24"
                              type="number"
                              step="0.01"
                              value={line.rate}
                              onChange={(e) =>
                                updateLocalLine(line.id, {
                                  rate: parseFloat(e.target.value) || 0,
                                })
                              }
                            />
                          </TableCell>
                          <TableCell className="whitespace-nowrap">£{line.amount.toFixed(2)}</TableCell>
                          <TableCell className="space-x-1">
                            <Button
                              size="sm"
                              variant="secondary"
                              onClick={() => {
                                const l = inv.lines?.find((x) => x.id === line.id);
                                if (l) saveLine(l);
                              }}
                              disabled={saving}
                            >
                              Save
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="text-destructive"
                              onClick={() => removeLine(line.id)}
                              disabled={saving}
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={lineList.safePage}
                    pageCount={lineList.pageCount}
                    total={lineList.total}
                    pageSize={linePageSize}
                    rangeStart={lineList.rangeStart}
                    rangeEnd={lineList.rangeEnd}
                    onPageChange={setLinePage}
                    onPageSizeChange={(n) => {
                      setLinePageSize(n);
                      setLinePage(1);
                    }}
                  />
                    </>
                  )}
                </CardContent>
              </Card>

              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add line</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label>Site</Label>
                      <Select value={newLine.site_id} onValueChange={(v) => setNewLine((p) => ({ ...p, site_id: v }))}>
                        <SelectTrigger>
                          <SelectValue placeholder="Site" />
                        </SelectTrigger>
                        <SelectContent>
                          {sites.map((s) => (
                            <SelectItem key={s.id} value={String(s.id)}>
                              {s.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Guard</Label>
                      <Select
                        value={newLine.guard_id || 'none'}
                        onValueChange={(v) =>
                          setNewLine((p) => ({ ...p, guard_id: v === 'none' ? '' : v }))
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">—</SelectItem>
                          {guards.map((g) => (
                            <SelectItem key={g.id} value={String(g.id)}>
                              {g.full_name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Hours</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newLine.hours}
                          onChange={(e) => setNewLine((p) => ({ ...p, hours: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>Rate</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newLine.rate}
                          onChange={(e) => setNewLine((p) => ({ ...p, rate: e.target.value }))}
                        />
                      </div>
                    </div>
                  </div>
                  <DialogFooter>
                    <Button variant="outline" onClick={() => setAddOpen(false)}>
                      Cancel
                    </Button>
                    <Button onClick={addLineSubmit} disabled={saving || !newLine.site_id}>
                      Add
                    </Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
        </div>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
