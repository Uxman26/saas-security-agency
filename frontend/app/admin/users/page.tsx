'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { AdminUserListItem } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { MODULE_LABELS } from '@/lib/plan-company-defaults';
import { Check, X } from 'lucide-react';

export default function AdminUsersPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const [rows, setRows] = useState<AdminUserListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    api.admin.users().then(setRows).catch(() => toast.error('Failed to load users'));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
    setLoading(false);
  }, [user, load]);

  // Lead capture is a company-level switch, so flipping it from a user row updates
  // every row that shares that company rather than just the one clicked.
  const toggleLeadCapture = async (u: AdminUserListItem) => {
    if (!u.company_id) return;
    const next = { ...(u.enabled_modules || {}), lead_capture: !u.enabled_modules?.lead_capture };
    try {
      await api.admin.patchCompanyModules(u.company_id, next);
      setRows((prev) =>
        prev.map((r) => (r.company_id === u.company_id ? { ...r, enabled_modules: next } : r))
      );
      toast.success(next.lead_capture ? 'Lead capture enabled' : 'Lead capture disabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const toggleActive = async (u: AdminUserListItem) => {
    try {
      const updated = await api.admin.patchUserActive(u.id, !u.is_active);
      setRows((prev) => prev.map((r) => (r.id === u.id ? updated : r)));
      toast.success(updated.is_active ? 'User activated' : 'User deactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const getSearchText = useCallback(
    (u: AdminUserListItem) =>
      [u.email, u.full_name, u.role, u.company_name, String(u.id), u.email_verified ? 'verified' : 'unverified'].filter(Boolean).join(' '),
    []
  );
  const getSortValue = useCallback((u: AdminUserListItem, key: string) => {
    switch (key) {
      case 'name':
        return u.full_name;
      case 'email':
        return u.email;
      case 'role':
        return u.role || '';
      case 'company':
        return u.company_name || '';
      case 'status':
        return u.is_active ? '1' : '0';
      case 'created':
        return u.created_at;
      case 'lead_capture':
        return u.enabled_modules?.lead_capture ? 1 : 0;
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
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">All users</h1>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
          <Input
            placeholder="Search users..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="max-w-md mb-4"
          />
          <Card>
            <CardHeader>
              <CardTitle>Platform users</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No users.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Email" colKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Role" colKey="role" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Active" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Verified</TableCell>
                        <SortableHead label={MODULE_LABELS.lead_capture} colKey="lead_capture" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Created" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell>Action</TableCell>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell>{u.full_name}</TableCell>
                          <TableCell>{u.email}</TableCell>
                          <TableCell className="capitalize">{u.role ?? '-'}</TableCell>
                          <TableCell>{u.company_name ?? '-'}</TableCell>
                          <TableCell>
                            <span className={u.is_active ? 'text-green-600' : 'text-red-600'}>
                              {u.is_active ? 'Active' : 'Inactive'}
                            </span>
                          </TableCell>
                          <TableCell>{u.email_verified ? 'Verified' : 'Unverified'}</TableCell>
                          <TableCell>
                            {!u.company_id ? (
                              <span className="text-muted-foreground">—</span>
                            ) : can('tenants.write') ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-7 gap-1 px-2 text-xs"
                                onClick={() => void toggleLeadCapture(u)}
                                title={`Turn lead capture ${u.enabled_modules?.lead_capture ? 'off' : 'on'} for ${u.company_name ?? 'this company'}`}
                              >
                                {u.enabled_modules?.lead_capture ? (
                                  <>
                                    <Check className="size-3.5 text-green-600" /> On
                                  </>
                                ) : (
                                  <>
                                    <X className="size-3.5 text-muted-foreground" /> Off
                                  </>
                                )}
                              </Button>
                            ) : (
                              <span className={u.enabled_modules?.lead_capture ? 'text-green-600' : 'text-muted-foreground'}>
                                {u.enabled_modules?.lead_capture ? 'On' : 'Off'}
                              </span>
                            )}
                          </TableCell>
                          <TableCell>{new Date(u.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            {u.role !== 'super_admin' && can('tenants.write') && (
                              <div className="flex flex-wrap gap-1">
                                <Button
                                  size="sm"
                                  variant={u.is_active ? 'destructive' : 'default'}
                                  onClick={() => {
                                    if (u.is_active && !window.confirm(`Deactivate ${u.email}? They will not be able to sign in.`)) return;
                                    void toggleActive(u);
                                  }}
                                >
                                  {u.is_active ? 'Deactivate' : 'Activate'}
                                </Button>
                                {u.is_active && (
                                  <Button
                                    size="sm"
                                    variant="outline"
                                    onClick={async () => {
                                      if (!window.confirm(`Archive ${u.email}? This deactivates the account and keeps the record for audit.`)) return;
                                      try {
                                        const updated = await api.admin.archiveUser(u.id);
                                        setRows((prev) => prev.map((r) => (r.id === u.id ? updated : r)));
                                        toast.success('User archived');
                                      } catch (e) {
                                        toast.error(e instanceof Error ? e.message : 'Archive failed');
                                      }
                                    }}
                                  >
                                    Archive
                                  </Button>
                                )}
                              </div>
                            )}
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
      </AppShell>
    </ProtectedRoute>
  );
}
