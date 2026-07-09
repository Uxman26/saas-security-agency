'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { passwordFieldSchema, PASSWORD_REQUIREMENTS_MSG } from '@/lib/validation';
import type { AdminUserDetail } from '@/lib/types';
import { ALL_SIDEBAR_PATHS, SIDEBAR_LABELS } from '@/lib/sidebar-modules';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const MODULE_LABELS: Record<string, string> = {
  expenses: 'Expenses',
  whatsapp: 'WhatsApp',
  email: 'Email',
  mobile_apps: 'Mobile Apps',
  leads: 'Lead Management',
};

const STATUS_STYLES: Record<string, string> = {
  active: 'bg-green-100 text-green-800',
  pending: 'bg-amber-100 text-amber-800',
  expired: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

export default function AdminAdminsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [tenantModules, setTenantModules] = useState<Record<string, boolean>>({});
  const [newPassword, setNewPassword] = useState('');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [activeFilter, setActiveFilter] = useState('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .admins()
      .then(setAdmins)
      .catch(() => toast.error('Failed to load admins'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

  const filtered = useMemo(() => {
    let rows = admins;
    if (statusFilter !== 'all') rows = rows.filter((a) => (a.subscription_status || '') === statusFilter);
    if (activeFilter === 'active') rows = rows.filter((a) => a.is_active);
    if (activeFilter === 'inactive') rows = rows.filter((a) => !a.is_active);
    return rows;
  }, [admins, statusFilter, activeFilter]);

  const getSearchText = useCallback(
    (a: AdminUserDetail) =>
      [a.full_name, a.email, a.company_name, a.subscription_tier, a.subscription_status, a.role]
        .filter(Boolean)
        .join(' '),
    []
  );

  const getSortValue = useCallback((a: AdminUserDetail, key: string) => {
    switch (key) {
      case 'name':
        return a.full_name;
      case 'email':
        return a.email;
      case 'company':
        return a.company_name || '';
      case 'plan':
        return a.subscription_tier || '';
      case 'status':
        return a.subscription_status || '';
      case 'days':
        return a.subscription_days_left ?? 0;
      case 'users':
        return a.user_count ?? 0;
      case 'active':
        return a.is_active ? 1 : 0;
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    filtered,
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
  }, [search, statusFilter, activeFilter]);

  const openDetail = (a: AdminUserDetail) => {
    setSelected(a);
    setModules([...a.sidebar_modules]);
    setTenantModules({ ...(a.enabled_modules || {}) });
    setNewPassword('');
  };

  const toggleModule = (path: string) => {
    setModules((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  };

  const toggleTenantModule = (key: string) => {
    setTenantModules((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const saveModules = async () => {
    if (!selected) return;
    try {
      const updated = await api.admin.patchSidebar(selected.id, modules);
      setSelected(updated);
      load();
      toast.success('Sidebar modules updated');
    } catch {
      toast.error('Failed to update modules');
    }
  };

  const saveTenantModules = async () => {
    if (!selected?.company_id) return;
    try {
      await api.admin.patchCompanyModules(selected.company_id, tenantModules);
      const refreshed = await api.admin.admin(selected.id);
      setSelected(refreshed);
      setTenantModules({ ...(refreshed.enabled_modules || {}) });
      load();
      toast.success('Tenant modules updated');
    } catch {
      toast.error('Failed to update tenant modules');
    }
  };

  const savePassword = async () => {
    if (!selected) return;
    const parsed = passwordFieldSchema.safeParse(newPassword);
    if (!parsed.success) {
      toast.error(parsed.error.errors[0]?.message ?? PASSWORD_REQUIREMENTS_MSG);
      return;
    }
    try {
      await api.admin.resetPassword(selected.id, newPassword);
      setNewPassword('');
      toast.success('Password reset');
    } catch {
      toast.error('Failed to reset password');
    }
  };

  const toggleActive = async () => {
    if (!selected) return;
    try {
      await api.admin.patchUserActive(selected.id, !selected.is_active);
      const refreshed = await api.admin.admin(selected.id);
      setSelected(refreshed);
      load();
      toast.success(refreshed.is_active ? 'Admin activated' : 'Admin deactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Company admins</h1>
            <Button variant="outline" size="sm" onClick={load} disabled={loading}>
              Refresh
            </Button>
          </div>
          <div className="flex flex-wrap gap-2 mb-4">
            <Input placeholder="Search admins..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-xs" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Subscription" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="expired">Expired</SelectItem>
                <SelectItem value="cancelled">Cancelled</SelectItem>
              </SelectContent>
            </Select>
            <Select value={activeFilter} onValueChange={setActiveFilter}>
              <SelectTrigger className="w-32"><SelectValue placeholder="Account" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All accounts</SelectItem>
                <SelectItem value="active">Active only</SelectItem>
                <SelectItem value="inactive">Inactive only</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All tenant admins ({admins.length})</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No admins found.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Email" colKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Plan" colKey="plan" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Users" colKey="users" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Days left" colKey="days" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Active" colKey="active" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell className="font-medium">{a.full_name}</TableCell>
                          <TableCell>{a.email}</TableCell>
                          <TableCell>{a.company_name ?? '—'}</TableCell>
                          <TableCell className="capitalize">{a.subscription_tier ?? '—'}</TableCell>
                          <TableCell>
                            <span className={cn('px-2 py-0.5 rounded text-xs capitalize', STATUS_STYLES[a.subscription_status || ''] || 'bg-secondary')}>
                              {a.subscription_status ?? '—'}
                            </span>
                          </TableCell>
                          <TableCell>
                            {a.user_count ?? 0}
                            {a.max_users != null ? ` / ${a.max_users}` : ''}
                          </TableCell>
                          <TableCell>{a.subscription_days_left ?? '—'}</TableCell>
                          <TableCell>
                            <span className={a.is_active ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                              {a.is_active ? 'Yes' : 'No'}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" onClick={() => openDetail(a)}>
                              Manage
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

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected?.full_name}</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-6 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Email</span>
                  <span>{selected.email}</span>
                  <span className="text-muted-foreground">Company</span>
                  <span>{selected.company_name}</span>
                  <span className="text-muted-foreground">Subscription</span>
                  <span className="capitalize">{selected.subscription_tier} ({selected.subscription_status})</span>
                  <span className="text-muted-foreground">Billing cycle</span>
                  <span className="capitalize">{selected.billing_cycle || 'monthly'}</span>
                  <span className="text-muted-foreground">Users</span>
                  <span>{selected.user_count ?? 0}{selected.max_users != null ? ` / ${selected.max_users}` : ''}</span>
                  <span className="text-muted-foreground">Period end</span>
                  <span>{selected.subscription_end ? new Date(selected.subscription_end).toLocaleString() : '—'}</span>
                  <span className="text-muted-foreground">Account active</span>
                  <span className={selected.is_active ? 'text-green-600' : 'text-red-600'}>{selected.is_active ? 'Yes' : 'No'}</span>
                </div>

                <Button size="sm" variant={selected.is_active ? 'destructive' : 'default'} onClick={toggleActive}>
                  {selected.is_active ? 'Deactivate account' : 'Activate account'}
                </Button>

                {selected.usage && (
                  <div>
                    <p className="font-medium mb-2">Resource usage</p>
                    <div className="grid grid-cols-2 gap-1 text-xs border rounded-md p-2">
                      <span>Active users</span><span>{selected.usage.active_users}</span>
                      <span>Storage</span><span>{selected.usage.storage_mb} MB</span>
                      <span>Guards</span><span>{selected.usage.guards_count}</span>
                      <span>DB records</span><span>{selected.usage.database_records}</span>
                    </div>
                  </div>
                )}

                <div>
                  <p className="font-medium mb-2">Tenant modules</p>
                  <div className="grid grid-cols-1 gap-2 border rounded-md p-3">
                    {Object.keys(MODULE_LABELS).map((key) => (
                      <label key={key} className="flex items-center gap-2">
                        <input type="checkbox" checked={!!tenantModules[key]} onChange={() => toggleTenantModule(key)} className="rounded border" />
                        <span>{MODULE_LABELS[key]}</span>
                      </label>
                    ))}
                  </div>
                  <Button className="mt-2" size="sm" onClick={saveTenantModules}>Save tenant modules</Button>
                </div>

                <div>
                  <p className="font-medium mb-2">Sidebar modules</p>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                    {ALL_SIDEBAR_PATHS.map((path) => (
                      <label key={path} className="flex items-center gap-2">
                        <input type="checkbox" checked={modules.includes(path)} disabled={path === '/dashboard'} onChange={() => toggleModule(path)} className="rounded border" />
                        <span>{SIDEBAR_LABELS[path] ?? path}</span>
                      </label>
                    ))}
                  </div>
                  <Button className="mt-2" size="sm" onClick={saveModules}>Save sidebar</Button>
                </div>

                <div>
                  <p className="font-medium mb-2">Reset password</p>
                  <Label htmlFor="new_pw">New password</Label>
                  <Input id="new_pw" type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} className="mt-1" />
                  <Button className="mt-2" size="sm" variant="destructive" onClick={savePassword}>Reset password</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
