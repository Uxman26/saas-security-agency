'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

const TIERS = ['basic', 'standard', 'premium', 'enterprise'];
const STATUSES = ['active', 'pending', 'expired', 'cancelled'];
const CYCLES = ['monthly', 'quarterly', 'yearly'];
const MODULE_LABELS: Record<string, string> = {
  expenses: 'Expenses',
  whatsapp: 'WhatsApp',
  email: 'Email',
  mobile_apps: 'Mobile Apps',
};

export default function AdminCompaniesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<Company | null>(null);
  const [editName, setEditName] = useState('');
  const [editTier, setEditTier] = useState('');
  const [editStatus, setEditStatus] = useState('');
  const [editEnd, setEditEnd] = useState('');
  const [editCycle, setEditCycle] = useState('monthly');
  const [editMaxUsers, setEditMaxUsers] = useState('');
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.companies().then(setCompanies).catch(() => {}).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

  const getSearchText = useCallback(
    (c: Company) =>
      [String(c.id), c.name, String(c.admin_id), c.subscription_tier ?? '', c.subscription_status ?? '', c.created_at]
        .filter(Boolean)
        .join(' '),
    []
  );
  const getSortValue = useCallback((c: Company, key: string) => {
    switch (key) {
      case 'id':
        return c.id;
      case 'name':
        return c.name;
      case 'tier':
        return c.subscription_tier || '';
      case 'status':
        return c.subscription_status || '';
      case 'users':
        return c.user_count ?? 0;
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

  const openEdit = (c: Company) => {
    setSelected(c);
    setEditName(c.name);
    setEditTier(c.subscription_tier ?? 'basic');
    setEditStatus(c.subscription_status ?? 'active');
    setEditEnd(c.subscription_end?.slice(0, 10) ?? '');
    setEditCycle(c.billing_cycle || 'monthly');
    setEditMaxUsers(c.max_users != null ? String(c.max_users) : '');
    setModules({ ...(c.enabled_modules || {}) });
  };

  const saveCompany = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api.admin.patchCompany(selected.id, {
        name: editName,
        subscription_tier: editTier,
        subscription_status: editStatus,
        subscription_end: editEnd ? `${editEnd}T23:59:59Z` : undefined,
        billing_cycle: editCycle,
        max_users: editMaxUsers ? parseInt(editMaxUsers) : null,
        enabled_modules: modules,
      });
      setCompanies((prev) => prev.map((c) => (c.id === updated.id ? updated : c)));
      setSelected(updated);
      toast.success('Company updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Platform – Companies</h1>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>
          <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md mb-4" />
          <Card>
            <CardHeader><CardTitle>Tenants</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No companies.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="ID" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Plan" colKey="tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Users" colKey="users" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Billing</TableCell>
                        <TableCell />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((c) => (
                        <TableRow key={c.id}>
                          <TableCell>{c.id}</TableCell>
                          <TableCell className="font-medium">{c.name}</TableCell>
                          <TableCell className="capitalize">{c.subscription_tier ?? '—'}</TableCell>
                          <TableCell className="capitalize">{c.subscription_status ?? '—'}</TableCell>
                          <TableCell>{c.user_count ?? 0}{c.max_users != null ? ` / ${c.max_users}` : ''}</TableCell>
                          <TableCell className="capitalize">{c.billing_cycle || 'monthly'}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => openEdit(c)}>Manage</Button>
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

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>{selected?.name}</DialogTitle></DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div>
                  <Label>Name</Label>
                  <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Plan</Label>
                    <Select value={editTier} onValueChange={setEditTier}>
                      <SelectTrigger className="mt-1 capitalize"><SelectValue /></SelectTrigger>
                      <SelectContent>{TIERS.map((t) => <SelectItem key={t} value={t} className="capitalize">{t}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Status</Label>
                    <Select value={editStatus} onValueChange={setEditStatus}>
                      <SelectTrigger className="mt-1 capitalize"><SelectValue /></SelectTrigger>
                      <SelectContent>{STATUSES.map((s) => <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <Label>Billing cycle</Label>
                    <Select value={editCycle} onValueChange={setEditCycle}>
                      <SelectTrigger className="mt-1 capitalize"><SelectValue /></SelectTrigger>
                      <SelectContent>{CYCLES.map((c) => <SelectItem key={c} value={c} className="capitalize">{c}</SelectItem>)}</SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>User limit (override)</Label>
                    <Input type="number" min="1" value={editMaxUsers} onChange={(e) => setEditMaxUsers(e.target.value)} placeholder="Plan default" className="mt-1" />
                  </div>
                </div>
                <div>
                  <Label>Subscription end</Label>
                  <Input type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="mt-1" />
                </div>
                {selected.usage && (
                  <div>
                    <Label>Resource usage</Label>
                    <div className="mt-1 grid grid-cols-2 gap-1 text-xs border rounded-md p-2">
                      <span>Active users</span><span>{selected.usage.active_users}</span>
                      <span>Storage</span><span>{selected.usage.storage_mb} MB</span>
                      <span>Guards</span><span>{selected.usage.guards_count}</span>
                      <span>API / Email / WhatsApp</span><span>{selected.usage.api_requests} / {selected.usage.email_sent} / {selected.usage.whatsapp_sent}</span>
                    </div>
                  </div>
                )}
                <div>
                  <Label>Module access</Label>
                  <div className="mt-2 grid gap-2 border rounded-md p-3">
                    {Object.keys(MODULE_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!modules[key]} onChange={() => setModules((m) => ({ ...m, [key]: !m[key] }))} className="rounded border" />
                        {MODULE_LABELS[key]}
                      </label>
                    ))}
                  </div>
                </div>
                <Button onClick={saveCompany} disabled={saving}>{saving ? 'Saving...' : 'Save changes'}</Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
