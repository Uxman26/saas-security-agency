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
import { SearchableSelect } from '@/components/ui/searchable-select';
import { api } from '@/lib/api';
import type { ClientBankAccount, Guard, Invoice, InvoiceLine, Site } from '@/lib/types';
import { ArrowLeft, Eye, Plus, Save, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { can } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';

const STATUSES = ['draft', 'sent', 'paid', 'partial', 'unpaid', 'overdue', 'cancelled'];

const emptyNewLine = () => ({
  site_id: '',
  guard_id: '',
  shift_date: '',
  shift_start: '',
  shift_end: '',
  description: '',
  service_detail: '',
  quantity: '1',
  hours: '0',
  rate: '0',
});

export default function InvoiceEditPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const rawId = params.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [sites, setSites] = useState<Site[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [banks, setBanks] = useState<ClientBankAccount[]>([]);
  const [due, setDue] = useState('');
  const [invoiceDate, setInvoiceDate] = useState('');
  const [poNumber, setPoNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [rotaReview, setRotaReview] = useState('');
  const [taxRate, setTaxRate] = useState('0');
  const [status, setStatus] = useState('draft');
  const [bankAccountId, setBankAccountId] = useState('');
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newLine, setNewLine] = useState(emptyNewLine());
  const [lineSearch, setLineSearch] = useState('');
  const lineSort = useTableSort();
  const [linePage, setLinePage] = useState(1);
  const [linePageSize, setLinePageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(async () => {
    const data = await api.invoices.get(id);
    setInv(data);
    setDue(data.due_date ?? '');
    setInvoiceDate(data.invoice_date ?? '');
    setPoNumber(data.po_number ?? '');
    setNotes(data.notes ?? '');
    setRotaReview(data.rota_review ?? '');
    setTaxRate(String(data.tax_rate ?? 0));
    setStatus(data.status);
    setBankAccountId(data.client_bank_account_id != null ? String(data.client_bank_account_id) : '');
    if (data.client_id) {
      try {
        const rows = await api.clients.bankAccounts(data.client_id);
        setBanks(rows);
      } catch {
        setBanks([]);
      }
    } else {
      setBanks([]);
    }
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
        invoice_date: invoiceDate || null,
        po_number: poNumber.trim() || null,
        notes: notes || null,
        rota_review: rotaReview || null,
        tax_rate: parseFloat(taxRate) || 0,
        status,
        client_bank_account_id: bankAccountId ? parseInt(bankAccountId, 10) : null,
      });
      setInv(updated);
      toast.success('Details saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
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
        shift_date: line.shift_date || null,
        shift_start: line.shift_start || null,
        shift_end: line.shift_end || null,
        description: line.description || null,
        service_detail: line.service_detail || null,
        quantity: line.quantity ?? 1,
        hours: line.hours,
        rate: line.rate,
        allowance_amount: line.allowance_amount,
        amount: line.amount,
      });
      await load();
      toast.success('Line saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
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
    const hours = parseFloat(newLine.hours) || 0;
    const rate = parseFloat(newLine.rate) || 0;
    setSaving(true);
    try {
      await api.invoices.addLine(id, {
        site_id: parseInt(newLine.site_id, 10),
        guard_id: newLine.guard_id ? parseInt(newLine.guard_id, 10) : undefined,
        shift_date: newLine.shift_date || null,
        shift_start: newLine.shift_start || null,
        shift_end: newLine.shift_end || null,
        description: newLine.description.trim() || null,
        service_detail: newLine.service_detail.trim() || null,
        quantity: parseFloat(newLine.quantity) || 1,
        hours,
        rate,
        allowance_amount: 0,
        amount: hours * rate,
      });
      setAddOpen(false);
      setNewLine(emptyNewLine());
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Add failed');
    } finally {
      setSaving(false);
    }
  };

  const updateLocalLine = (lineId: number, patch: Partial<InvoiceLine>) => {
    setInv((prev) => {
      if (!prev?.lines) return prev;
      return {
        ...prev,
        lines: prev.lines.map((l) => {
          if (l.id !== lineId) return l;
          const next = { ...l, ...patch };
          if ('hours' in patch || 'rate' in patch) {
            next.amount = (next.hours || 0) * (next.rate || 0) + (next.allowance_amount || 0);
          }
          return next;
        }),
      };
    });
  };

  const lines = inv?.lines ?? [];
  const clientSites = inv?.client_id
    ? sites.filter((s) => s.client_id === inv.client_id)
    : sites;
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
        line.shift_date,
        line.description,
        line.service_detail,
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
        case 'shift_date':
          return line.shift_date || '';
        case 'hours':
          return line.hours;
        case 'rate':
          return line.rate;
        case 'amount':
          return line.amount;
        case 'quantity':
          return line.quantity ?? 0;
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
        <div className="container mx-auto px-4 py-8 max-w-6xl">
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
                      <Label>Invoice date</Label>
                      <Input type="date" value={invoiceDate} onChange={(e) => setInvoiceDate(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>Due date</Label>
                      <Input type="date" value={due} onChange={(e) => setDue(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>PO number</Label>
                      <Input value={poNumber} onChange={(e) => setPoNumber(e.target.value)} />
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
                    <div className="space-y-1">
                      <Label>Bank account</Label>
                      <Select
                        value={bankAccountId || 'none'}
                        onValueChange={(v) => setBankAccountId(v === 'none' ? '' : v)}
                        disabled={!inv.client_id}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Company default" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Company default</SelectItem>
                          {banks.map((b) => (
                            <SelectItem key={b.id} value={String(b.id)}>
                              {b.label}
                              {b.is_default ? ' (Default)' : ''}
                              {b.bank_name ? ` · ${b.bank_name}` : ''}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Notes / terms</Label>
                      <textarea
                        className="flex min-h-[88px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                      />
                    </div>
                    <div className="space-y-1 sm:col-span-2">
                      <Label>Rota review</Label>
                      <textarea
                        className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        value={rotaReview}
                        onChange={(e) => setRotaReview(e.target.value)}
                      />
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 text-sm text-muted-foreground">
                    <span>Subtotal £{(inv.subtotal ?? 0).toFixed(2)}</span>
                    <span>Tax £{(inv.tax_amount ?? 0).toFixed(2)}</span>
                    <span className="font-semibold text-foreground">
                      Total £{(inv.total ?? 0).toFixed(2)}
                    </span>
                    {(inv.amount_paid ?? 0) > 0 && (
                      <>
                        <span className="text-green-700">Paid £{(inv.amount_paid ?? 0).toFixed(2)}</span>
                        <span className="font-semibold text-red-700">Balance £{(inv.balance_due ?? 0).toFixed(2)}</span>
                      </>
                    )}
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
                        <SortableHead label="Date" colKey="shift_date" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} />
                        <TableHead>Description</TableHead>
                        <TableHead>Service</TableHead>
                        <TableHead>Start</TableHead>
                        <TableHead>End</TableHead>
                        <SortableHead label="Qty" colKey="quantity" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <SortableHead label="Hours" colKey="hours" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <SortableHead label="Rate" colKey="rate" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <SortableHead label="Amount" colKey="amount" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} className="text-right" />
                        <SortableHead label="Site" colKey="site" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} />
                        <SortableHead label="Guard" colKey="guard" sortKey={lineSort.sortKey} sortDir={lineSort.sortDir} onSort={lineSort.toggleSort} />
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {lineList.pageRows.map((line) => (
                        <TableRow key={line.id}>
                          <TableCell>
                            <Input
                              className="w-[130px]"
                              type="date"
                              value={line.shift_date ?? ''}
                              onChange={(e) => updateLocalLine(line.id, { shift_date: e.target.value || null })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[120px]"
                              value={line.description ?? ''}
                              onChange={(e) => updateLocalLine(line.id, { description: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="min-w-[100px]"
                              value={line.service_detail ?? ''}
                              onChange={(e) => updateLocalLine(line.id, { service_detail: e.target.value })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-[110px]"
                              type="time"
                              value={line.shift_start ?? ''}
                              onChange={(e) => updateLocalLine(line.id, { shift_start: e.target.value || null })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-[110px]"
                              type="time"
                              value={line.shift_end ?? ''}
                              onChange={(e) => updateLocalLine(line.id, { shift_end: e.target.value || null })}
                            />
                          </TableCell>
                          <TableCell>
                            <Input
                              className="w-16"
                              type="number"
                              step="0.01"
                              value={line.quantity ?? 1}
                              onChange={(e) =>
                                updateLocalLine(line.id, { quantity: parseFloat(e.target.value) || 0 })
                              }
                            />
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
                          <TableCell>
                            <SearchableSelect
                              className="w-[140px]"
                              value={String(line.site_id)}
                              onChange={(v) =>
                                updateLocalLine(line.id, { site_id: parseInt(v, 10) })
                              }
                              options={(clientSites.length ? clientSites : sites).map((s) => ({
                                value: String(s.id),
                                label: s.name,
                              }))}
                              placeholder="Site"
                              searchPlaceholder="Search sites…"
                              emptyText="No matching sites"
                            />
                          </TableCell>
                          <TableCell>
                            <SearchableSelect
                              className="w-[140px]"
                              value={line.guard_id ? String(line.guard_id) : ''}
                              onChange={(v) =>
                                updateLocalLine(line.id, {
                                  guard_id: v ? parseInt(v, 10) : undefined,
                                })
                              }
                              options={guards.map((g) => ({ value: String(g.id), label: g.full_name }))}
                              noneOption={{ value: '', label: '—' }}
                              placeholder="—"
                              searchPlaceholder="Search staff…"
                              emptyText="No matching staff"
                            />
                          </TableCell>
                          <TableCell className="space-x-1 whitespace-nowrap">
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
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add line</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3 py-2">
                    <div className="space-y-1">
                      <Label>Site</Label>
                      <SearchableSelect
                        value={newLine.site_id}
                        onChange={(v) => setNewLine((p) => ({ ...p, site_id: v }))}
                        options={(clientSites.length ? clientSites : sites).map((s) => ({
                          value: String(s.id),
                          label: s.name,
                        }))}
                        placeholder="Site"
                        searchPlaceholder="Search sites…"
                        emptyText="No matching sites"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Guard</Label>
                      <SearchableSelect
                        value={newLine.guard_id}
                        onChange={(v) => setNewLine((p) => ({ ...p, guard_id: v }))}
                        options={guards.map((g) => ({ value: String(g.id), label: g.full_name }))}
                        noneOption={{ value: '', label: '—' }}
                        placeholder="—"
                        searchPlaceholder="Search staff…"
                        emptyText="No matching staff"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Shift date</Label>
                      <Input
                        type="date"
                        value={newLine.shift_date}
                        onChange={(e) => setNewLine((p) => ({ ...p, shift_date: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="space-y-1">
                        <Label>Start</Label>
                        <Input
                          type="time"
                          value={newLine.shift_start}
                          onChange={(e) => setNewLine((p) => ({ ...p, shift_start: e.target.value }))}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label>End</Label>
                        <Input
                          type="time"
                          value={newLine.shift_end}
                          onChange={(e) => setNewLine((p) => ({ ...p, shift_end: e.target.value }))}
                        />
                      </div>
                    </div>
                    <div className="space-y-1">
                      <Label>Description</Label>
                      <Input
                        value={newLine.description}
                        onChange={(e) => setNewLine((p) => ({ ...p, description: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1">
                      <Label>Service detail</Label>
                      <Input
                        value={newLine.service_detail}
                        onChange={(e) => setNewLine((p) => ({ ...p, service_detail: e.target.value }))}
                      />
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="space-y-1">
                        <Label>Qty</Label>
                        <Input
                          type="number"
                          step="0.01"
                          value={newLine.quantity}
                          onChange={(e) => setNewLine((p) => ({ ...p, quantity: e.target.value }))}
                        />
                      </div>
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
                    <p className="text-sm text-muted-foreground">
                      Amount: £{((parseFloat(newLine.hours) || 0) * (parseFloat(newLine.rate) || 0)).toFixed(2)}
                    </p>
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
