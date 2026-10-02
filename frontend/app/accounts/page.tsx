'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { api } from '@/lib/api';
import type {
  Account,
  AgingReport,
  BalanceSheetReport,
  CashFlowReport,
  GeneralLedgerRow,
  ProfitLossReport,
  TrialBalanceRow,
} from '@/lib/types';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { Pencil, Plus } from 'lucide-react';

type Tab = 'coa' | 'trial' | 'pl' | 'bs' | 'cf' | 'gl' | 'ar' | 'ap';

const ACCOUNT_TYPES = ['asset', 'liability', 'equity', 'income', 'expense'] as const;
const emptyForm = () => ({
  code: '',
  name: '',
  account_type: 'expense',
  parent_id: '' as string | number,
  status: 'active',
});

export default function AccountsPage() {
  const { user } = useAuth();
  const canCreate = canModule(user, 'chart_of_accounts', 'create');
  const canEdit = canModule(user, 'chart_of_accounts', 'edit');
  const [tab, setTab] = useState<Tab>('coa');
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [trial, setTrial] = useState<TrialBalanceRow[]>([]);
  const [pl, setPl] = useState<ProfitLossReport | null>(null);
  const [bs, setBs] = useState<BalanceSheetReport | null>(null);
  const [cf, setCf] = useState<CashFlowReport | null>(null);
  const [gl, setGl] = useState<GeneralLedgerRow[]>([]);
  const [ar, setAr] = useState<AgingReport | null>(null);
  const [ap, setAp] = useState<AgingReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [asOf, setAsOf] = useState('');
  const [glAccountId, setGlAccountId] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm());

  const parents = useMemo(() => accounts.filter((a) => a.level < 3), [accounts]);

  const loadCoa = useCallback(async () => {
    setAccounts(await api.accounts.list());
  }, []);

  const loadReports = useCallback(async () => {
    const range = { date_from: dateFrom || undefined, date_to: dateTo || undefined };
    const asOfParam = { as_of: asOf || undefined };
    const [t, p, b, c, g, arR, apR] = await Promise.all([
      api.accounts.trialBalance(range),
      api.accounts.profitLoss(range),
      api.accounts.balanceSheet(asOfParam),
      api.accounts.cashFlow(range),
      api.accounts.generalLedger({
        ...range,
        account_id: glAccountId !== 'all' ? Number(glAccountId) : undefined,
      }),
      api.accounts.arAging(asOfParam),
      api.accounts.apAging(asOfParam),
    ]);
    setTrial(t);
    setPl(p);
    setBs(b);
    setCf(c);
    setGl(g);
    setAr(arR);
    setAp(apR);
  }, [asOf, dateFrom, dateTo, glAccountId]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await loadCoa();
      await loadReports();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load accounts');
    } finally {
      setLoading(false);
    }
  }, [loadCoa, loadReports]);

  useEffect(() => {
    load();
  }, [load]);

  const money = (n: number) => `£${Number(n || 0).toFixed(2)}`;

  const submit = async () => {
    if (!form.code.trim() || !form.name.trim()) {
      toast.error('Code and name are required');
      return;
    }
    try {
      const payload = {
        code: form.code.trim(),
        name: form.name.trim(),
        account_type: form.account_type,
        parent_id: form.parent_id === '' || form.parent_id === 'none' ? null : Number(form.parent_id),
        status: form.status,
      };
      if (editId) {
        await api.accounts.update(editId, {
          code: payload.code,
          name: payload.name,
          account_type: payload.account_type,
          status: payload.status,
        });
      } else {
        await api.accounts.create(payload);
      }
      setOpen(false);
      setEditId(null);
      setForm(emptyForm());
      await loadCoa();
      toast.success(editId ? 'Account updated' : 'Account created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  const agingTable = (report: AgingReport | null, partyKey: string, daysKey: string) => {
    if (!report) return null;
    return (
      <div className="mt-4 space-y-4">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {Object.entries(report.buckets || {}).map(([k, v]) => (
            <div key={k} className="rounded-lg border p-3">
              <p className="text-xs text-muted-foreground uppercase">{k.replace('_', '-')}</p>
              <p className="text-lg font-semibold">{money(v)}</p>
            </div>
          ))}
          <div className="rounded-lg border p-3">
            <p className="text-xs text-muted-foreground uppercase">Total</p>
            <p className="text-lg font-semibold">{money(report.total)}</p>
          </div>
        </div>
        <div className="rounded-lg border overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Party</TableHead>
                <TableHead>Bucket</TableHead>
                <TableHead>Days</TableHead>
                <TableHead className="text-end">Balance</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(report.rows || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4}>No outstanding balances.</TableCell>
                </TableRow>
              ) : (
                report.rows.map((r, i) => (
                  <TableRow key={i}>
                    <TableCell>{String(r[partyKey] ?? '—')}</TableCell>
                    <TableCell>{String(r.bucket ?? '')}</TableCell>
                    <TableCell>{Number(r[daysKey] ?? 0)}</TableCell>
                    <TableCell className="text-end">{money(Number(r.balance ?? 0))}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>
    );
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Chart of Accounts"
            description="Level-3 ledger, journals, cash flow and AR/AP ageing from posted finance activity."
            actions={
              canCreate ? (
                <Dialog
                  open={open}
                  onOpenChange={(v) => {
                    setOpen(v);
                    if (!v) {
                      setEditId(null);
                      setForm(emptyForm());
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 me-1" /> Add account
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editId ? 'Edit account' : 'New account'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Code</Label>
                        <Input
                          value={form.code}
                          disabled={!!editId}
                          onChange={(e) => setForm((f) => ({ ...f, code: e.target.value }))}
                        />
                      </div>
                      <div>
                        <Label>Name</Label>
                        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Type</Label>
                        <Select
                          value={form.account_type}
                          onValueChange={(v) => setForm((f) => ({ ...f, account_type: v }))}
                          disabled={!!editId}
                        >
                          <SelectTrigger>
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ACCOUNT_TYPES.map((t) => (
                              <SelectItem key={t} value={t}>
                                {t}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      {!editId ? (
                        <div>
                          <Label>Parent</Label>
                          <Select
                            value={form.parent_id === '' ? 'none' : String(form.parent_id)}
                            onValueChange={(v) => setForm((f) => ({ ...f, parent_id: v === 'none' ? '' : v }))}
                          >
                            <SelectTrigger>
                              <SelectValue placeholder="None" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">None (top level)</SelectItem>
                              {parents.map((p) => (
                                <SelectItem key={p.id} value={String(p.id)}>
                                  {p.code} — {p.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </div>
                      ) : (
                        <div>
                          <Label>Status</Label>
                          <Select
                            value={form.status}
                            onValueChange={(v) => setForm((f) => ({ ...f, status: v }))}
                          >
                            <SelectTrigger>
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="inactive">Inactive</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                      )}
                      <Button onClick={submit} className="w-full">
                        Save
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null
            }
          />

          <div className="flex flex-wrap gap-3 items-end mt-2 mb-2">
            <div>
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">As of</Label>
              <Input type="date" value={asOf} onChange={(e) => setAsOf(e.target.value)} className="w-40" />
            </div>
            <div>
              <Label className="text-xs">GL account</Label>
              <Select value={glAccountId} onValueChange={setGlAccountId}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All accounts</SelectItem>
                  {accounts
                    .filter((a) => a.level === 3)
                    .map((a) => (
                      <SelectItem key={a.id} value={String(a.id)}>
                        {a.code} — {a.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>
            <Button variant="outline" onClick={() => load()} disabled={loading}>
              Refresh
            </Button>
          </div>

          <ModuleTabs
            tabs={[
              { id: 'coa', label: 'Accounts' },
              { id: 'trial', label: 'Trial balance' },
              { id: 'pl', label: 'Profit & loss' },
              { id: 'bs', label: 'Balance sheet' },
              { id: 'cf', label: 'Cash flow' },
              { id: 'gl', label: 'General ledger' },
              { id: 'ar', label: 'AR ageing' },
              { id: 'ap', label: 'AP ageing' },
            ]}
            value={tab}
            onChange={(v) => setTab(v as Tab)}
          />

          {loading ? (
            <p className="text-sm text-muted-foreground mt-4">Loading…</p>
          ) : tab === 'coa' ? (
            <div className="rounded-lg border overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Level</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="w-16" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {accounts.map((a) => (
                    <TableRow key={a.id}>
                      <TableCell className="font-mono">{a.code}</TableCell>
                      <TableCell style={{ paddingInlineStart: `${(a.level - 1) * 12}px` }}>
                        {a.name}
                        {a.is_system ? <span className="ms-2 text-xs text-muted-foreground">system</span> : null}
                      </TableCell>
                      <TableCell className="capitalize">{a.account_type}</TableCell>
                      <TableCell>{a.level}</TableCell>
                      <TableCell>{a.status || 'active'}</TableCell>
                      <TableCell>
                        {canEdit ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditId(a.id);
                              setForm({
                                code: a.code,
                                name: a.name,
                                account_type: a.account_type,
                                parent_id: a.parent_id ?? '',
                                status: a.status || 'active',
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : tab === 'trial' ? (
            <div className="rounded-lg border overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead className="text-end">Debit</TableHead>
                    <TableHead className="text-end">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {trial.map((r) => (
                    <TableRow key={r.code}>
                      <TableCell className="font-mono">{r.code}</TableCell>
                      <TableCell>{r.name}</TableCell>
                      <TableCell className="text-end">{money(r.debit)}</TableCell>
                      <TableCell className="text-end">{money(r.credit)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : tab === 'pl' && pl ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Income</p>
                  <p className="text-xl font-semibold">{money(pl.income)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Expenses</p>
                  <p className="text-xl font-semibold">{money(pl.expenses)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Net</p>
                  <p className="text-xl font-semibold">{money(pl.net)}</p>
                </div>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-end">Debit</TableHead>
                      <TableHead className="text-end">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pl.rows.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.type}</TableCell>
                        <TableCell className="text-end">{money(r.debit)}</TableCell>
                        <TableCell className="text-end">{money(r.credit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : tab === 'bs' && bs ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Assets</p>
                  <p className="text-xl font-semibold">{money(bs.assets)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Liabilities</p>
                  <p className="text-xl font-semibold">{money(bs.liabilities)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Equity</p>
                  <p className="text-xl font-semibold">{money(bs.equity)}</p>
                </div>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Code</TableHead>
                      <TableHead>Account</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead className="text-end">Debit</TableHead>
                      <TableHead className="text-end">Credit</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {bs.rows.map((r) => (
                      <TableRow key={r.code}>
                        <TableCell className="font-mono">{r.code}</TableCell>
                        <TableCell>{r.name}</TableCell>
                        <TableCell>{r.type}</TableCell>
                        <TableCell className="text-end">{money(r.debit)}</TableCell>
                        <TableCell className="text-end">{money(r.credit)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : tab === 'cf' && cf ? (
            <div className="mt-4 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Inflows</p>
                  <p className="text-xl font-semibold">{money(cf.inflows)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Outflows</p>
                  <p className="text-xl font-semibold">{money(cf.outflows)}</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="text-xs text-muted-foreground">Net</p>
                  <p className="text-xl font-semibold">{money(cf.net)}</p>
                </div>
              </div>
              <div className="rounded-lg border overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Date</TableHead>
                      <TableHead>Reference</TableHead>
                      <TableHead>Memo</TableHead>
                      <TableHead>Direction</TableHead>
                      <TableHead className="text-end">Amount</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {(cf.rows || []).length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={5}>No cash movements in this period.</TableCell>
                      </TableRow>
                    ) : (
                      cf.rows.map((r, i) => (
                        <TableRow key={i}>
                          <TableCell>{r.date}</TableCell>
                          <TableCell>{r.reference || '—'}</TableCell>
                          <TableCell>{r.memo || '—'}</TableCell>
                          <TableCell className="capitalize">{r.direction}</TableCell>
                          <TableCell className="text-end">{money(r.amount)}</TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </div>
            </div>
          ) : tab === 'gl' ? (
            <div className="rounded-lg border overflow-x-auto mt-4">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Date</TableHead>
                    <TableHead>Account</TableHead>
                    <TableHead>Reference</TableHead>
                    <TableHead>Memo</TableHead>
                    <TableHead className="text-end">Debit</TableHead>
                    <TableHead className="text-end">Credit</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gl.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6}>No journal lines yet.</TableCell>
                    </TableRow>
                  ) : (
                    gl.map((r, i) => (
                      <TableRow key={`${r.entry_id}-${i}`}>
                        <TableCell>{r.date}</TableCell>
                        <TableCell>
                          <span className="font-mono me-1">{r.account_code}</span>
                          {r.account_name}
                        </TableCell>
                        <TableCell>{r.reference || '—'}</TableCell>
                        <TableCell>{r.memo || '—'}</TableCell>
                        <TableCell className="text-end">{money(r.debit)}</TableCell>
                        <TableCell className="text-end">{money(r.credit)}</TableCell>
                      </TableRow>
                    ))
                  )}
                </TableBody>
              </Table>
            </div>
          ) : tab === 'ar' ? (
            agingTable(ar, 'client', 'days_overdue')
          ) : tab === 'ap' ? (
            agingTable(ap, 'vendor', 'days_outstanding')
          ) : null}
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
