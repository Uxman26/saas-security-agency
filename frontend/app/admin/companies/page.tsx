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
  const [saving, setSaving] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      setLoading(false);
      router.replace('/dashboard');
      return;
    }
    api.admin.companies().then(setCompanies).catch(() => {}).finally(() => setLoading(false));
  }, [user, router]);

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
      case 'admin':
        return c.admin_id;
      case 'tier':
        return c.subscription_tier || '';
      case 'status':
        return c.subscription_status || '';
      case 'end':
        return c.subscription_end || '';
      case 'created':
        return c.created_at || '';
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

  useEffect(() => {
    setPage(1);
  }, [search]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const openEdit = (c: Company) => {
    setSelected(c);
    setEditName(c.name);
    setEditTier(c.subscription_tier ?? 'basic');
    setEditStatus(c.subscription_status ?? 'active');
    setEditEnd(c.subscription_end?.slice(0, 10) ?? '');
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
      <div>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Platform – All Companies</h1>
            <button
              type="button"
              onClick={() => api.admin.companies().then(setCompanies)}
              className="text-sm text-primary hover:underline"
            >
              Refresh
            </button>
          </div>
          <div className="mb-4">
            <Input placeholder="Search companies..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Companies (tenants)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">{companies.length === 0 ? 'No companies.' : 'No matches.'}</div>
              ) : (
                <>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableHead label="ID" colKey="id" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Admin ID" colKey="admin" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Plan" colKey="tier" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Ends" colKey="end" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <SortableHead label="Created" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                      <TableCell />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageRows.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.id}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.admin_id}</TableCell>
                        <TableCell className="capitalize">{c.subscription_tier ?? '-'}</TableCell>
                        <TableCell className="capitalize">{c.subscription_status ?? '-'}</TableCell>
                        <TableCell>
                          {c.subscription_end ? new Date(c.subscription_end).toLocaleDateString() : '-'}
                        </TableCell>
                        <TableCell>{c.created_at}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openEdit(c)}>
                            Edit
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
      </div>

      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit company</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div>
                <Label htmlFor="cname">Name</Label>
                <Input id="cname" value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Plan tier</Label>
                <Select value={editTier} onValueChange={setEditTier}>
                  <SelectTrigger className="mt-1 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {TIERS.map((t) => (
                      <SelectItem key={t} value={t} className="capitalize">
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Status</Label>
                <Select value={editStatus} onValueChange={setEditStatus}>
                  <SelectTrigger className="mt-1 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="cend">Subscription end</Label>
                <Input id="cend" type="date" value={editEnd} onChange={(e) => setEditEnd(e.target.value)} className="mt-1" />
              </div>
              <Button onClick={saveCompany} disabled={saving}>
                {saving ? 'Saving...' : 'Save'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </AppShell>
    </ProtectedRoute>
  );
}