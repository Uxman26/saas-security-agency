'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useGuards, useCreateGuard, useUpdateGuard, useDeleteGuard } from '@/hooks/use-guards';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { useMainContractors } from '@/hooks/use-main-contractors';
import { useSubContractors } from '@/hooks/use-sub-contractors';
import { guardSchema, type GuardFormData } from '@/lib/validation';
import { guardFormDefaults, guardToForm, formToGuardPayload } from '@/lib/guard-form-map';
import type { Guard } from '@/lib/types';
import { GuardFormWizard } from '@/app/guards/guard-form-wizard';
import { EmailDialog } from '@/components/email-dialog';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { formatDateUK } from '@/lib/date-format';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Pencil, Trash2, Users } from 'lucide-react';
function getSiaStatus(date?: string): 'expired' | 'critical' | 'warning' | 'ok' | null {
  if (!date) return null;
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  return 'ok';
}

export default function GuardsPage() {
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingGuard, setEditingGuard] = useState<Guard | null>(null);
  const [search, setSearch] = useState('');
  const [filterArea, setFilterArea] = useState('');
  const [filterPostcode, setFilterPostcode] = useState('');
  const [filterNearby, setFilterNearby] = useState('');
  const [formError, setFormError] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const areaQ = filterArea.trim() || undefined;
  const postcodeQ = filterPostcode.trim() || undefined;
  const nearbyQ = filterNearby.trim() || undefined;
  const { data: guards = [], isLoading, refetch, isRefetching, error: guardsError } = useGuards({
    area: areaQ,
    postcode: postcodeQ,
    nearby: nearbyQ,
  });
  const { data: dirRows = [] } = useDirectoryContractorsList({ is_active: true });
  const { data: legMains = [] } = useMainContractors();
  const { data: legSubs = [] } = useSubContractors();
  const mains = useMemo(
    () => dirRows.filter((c) => c.type === 'main').map((c) => ({ id: c.id, name: c.name })),
    [dirRows],
  );
  const subs = useMemo(
    () => dirRows.filter((c) => c.type === 'sub').map((c) => ({ id: c.id, name: c.name })),
    [dirRows],
  );
  const createGuard = useCreateGuard();
  const updateGuard = useUpdateGuard();
  const deleteGuard = useDeleteGuard();

  const addForm = useForm<GuardFormData>({
    resolver: zodResolver(guardSchema) as Resolver<GuardFormData>,
    defaultValues: guardFormDefaults,
  });

  const editForm = useForm<GuardFormData>({ resolver: zodResolver(guardSchema) as Resolver<GuardFormData> });

  const contractorLabel = useMemo(() => {
    const dirNames = new Map(dirRows.map((c) => [c.id, c.name]));
    const mm = new Map(legMains.map((m) => [m.id, m.name]));
    const sm = new Map(legSubs.map((s) => [s.id, s.name]));
    return (g: Guard) => {
      if (g.contractor_id) return dirNames.get(g.contractor_id) ?? 'Contractor';
      if (g.sub_contractor_id) return sm.get(g.sub_contractor_id) ?? `Sub #${g.sub_contractor_id}`;
      if (g.main_contractor_id) return mm.get(g.main_contractor_id) ?? `Main #${g.main_contractor_id}`;
      return '—';
    };
  }, [dirRows, legMains, legSubs]);

  const handleCreate = async (data: GuardFormData) => {
    setFormError('');
    try {
      await createGuard.mutateAsync(formToGuardPayload(data));
      setAddOpen(false);
      addForm.reset(guardFormDefaults);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to create staff member');
    }
  };

  const openEdit = (guard: Guard) => {
    setEditingGuard(guard);
    editForm.reset(guardToForm(guard));
    setEditOpen(true);
  };

  const handleUpdate = async (data: GuardFormData) => {
    if (!editingGuard) return;
    setFormError('');
    try {
      await updateGuard.mutateAsync({ id: editingGuard.id, data: formToGuardPayload(data) });
      setEditOpen(false);
      setEditingGuard(null);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to update staff member');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this staff member? This cannot be undone.')) return;
    try {
      await deleteGuard.mutateAsync(id);
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to delete');
    }
  };

  const getSearchText = useCallback(
    (g: Guard) =>
      [
        g.full_name,
        g.email,
        g.phone,
        g.badge_number,
        g.sia_number,
        g.license_number,
        g.rtw_status,
        g.visa_status,
        g.dbs_status,
        contractorLabel(g),
        g.sia_expiry_date,
        g.service_area,
        g.postcode,
        g.nearby_areas,
        g.available_days,
        g.availability_timing,
        g.pay_frequency,
        g.has_car ? 'car' : '',
      ]
        .filter(Boolean)
        .join(' '),
    [contractorLabel]
  );

  const getSortValue = useCallback(
    (g: Guard, key: string) => {
      switch (key) {
        case 'name':
          return g.full_name;
        case 'contractor':
          return contractorLabel(g);
        case 'email':
          return g.email || '';
        case 'phone':
          return g.phone || '';
        case 'badge':
          return g.badge_number || '';
        case 'sia_number':
          return g.sia_number || '';
        case 'sia_expiry':
          return g.sia_expiry_date || '';
        case 'rtw':
          return g.rtw_status || '';
        case 'visa':
          return g.visa_status || '';
        case 'dbs':
          return g.dbs_status || '';
        default:
          return '';
      }
    },
    [contractorLabel]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    guards,
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
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="size-7" /> Staff</h1>
              <p className="text-muted-foreground mt-1">{guards.length} staff member{guards.length !== 1 ? 's' : ''} registered</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!can(user, 'guards.write')}>Add staff</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add staff member</DialogTitle>
                  </DialogHeader>
                  {formError && <p className="text-sm text-destructive">{formError}</p>}
                  <GuardFormWizard form={addForm} mains={mains} subs={subs} onSubmit={handleCreate} isPending={createGuard.isPending} submitLabel="Create staff" />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Input
              placeholder="Search staff (name, phone, area, postcode…)"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Input placeholder="Filter by area" value={filterArea} onChange={(e) => setFilterArea(e.target.value)} />
            <Input placeholder="Filter by postcode" value={filterPostcode} onChange={(e) => setFilterPostcode(e.target.value)} />
            <Input placeholder="Filter nearby areas" value={filterNearby} onChange={(e) => setFilterNearby(e.target.value)} />
          </div>
          {guardsError && (
            <p className="mb-4 text-sm text-destructive">{(guardsError as Error).message || 'Failed to load staff'}</p>
          )}
          {formError && !addOpen && !editOpen && (
            <p className="mb-4 text-sm text-destructive">{formError}</p>
          )}

          {(mains.length === 0 && subs.length === 0) && (
            <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Add at least one main or sub contractor on the{' '}
              <Link href="/contractors" className="font-medium underline">Contractors</Link> page before you can link staff.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All staff</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading staff...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || areaQ || postcodeQ || nearbyQ ? 'No staff match your filters.' : 'No staff yet. Click "Add staff" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Contractor" colKey="contractor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Email" colKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Phone" colKey="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Badge" colKey="badge" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="SIA Number" colKey="sia_number" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="SIA Expiry" colKey="sia_expiry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="RTW" colKey="rtw" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Visa" colKey="visa" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="DBS" colKey="dbs" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((guard) => {
                        const siaStatus = getSiaStatus(guard.sia_expiry_date);
                        return (
                          <TableRow key={guard.id}>
                            <TableCell className="font-medium whitespace-nowrap">{guard.full_name}</TableCell>
                            <TableCell className="text-sm max-w-[160px] truncate" title={contractorLabel(guard)}>{contractorLabel(guard)}</TableCell>
                            <TableCell className="text-sm">{guard.email || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap">{guard.phone || '-'}</TableCell>
                            <TableCell>{guard.badge_number || '-'}</TableCell>
                            <TableCell>{guard.sia_number || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {guard.sia_expiry_date ? (
                                <span className={
                                  siaStatus === 'expired' ? 'text-destructive font-semibold' :
                                  siaStatus === 'critical' ? 'text-orange-600 font-semibold' :
                                  siaStatus === 'warning' ? 'text-amber-600 font-medium' : ''
                                }>
                                  {formatDateUK(guard.sia_expiry_date)}
                                  {siaStatus === 'expired' && ' ⚠ Expired'}
                                  {siaStatus === 'critical' && ' ⚠ <30d'}
                                  {siaStatus === 'warning' && ' ⚠ <90d'}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>
                              {guard.rtw_status ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  guard.rtw_status.toLowerCase().includes('valid') || guard.rtw_status.toLowerCase().includes('yes')
                                    ? 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                    : 'bg-secondary text-secondary-foreground'
                                }`}>
                                  {guard.rtw_status}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell>{guard.visa_status || '-'}</TableCell>
                            <TableCell className="text-sm max-w-[120px] truncate" title={guard.dbs_status || ''}>{guard.dbs_status || '-'}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEdit(guard)} title="Edit guard" disabled={!can(user, 'guards.write')}>
                                  <Pencil className="size-4" />
                                </Button>
                                {guard.email && (
                                  <EmailDialog defaultEmail={guard.email} defaultName={guard.full_name} />
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => handleDelete(guard.id)}
                                  disabled={deleteGuard.isPending || !can(user, 'guards.delete')}
                                  title="Delete guard"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit staff — {editingGuard?.full_name}</DialogTitle>
            </DialogHeader>
            {formError && <p className="text-sm text-destructive">{formError}</p>}
            <GuardFormWizard form={editForm} mains={mains} subs={subs} onSubmit={handleUpdate} isPending={updateGuard.isPending} submitLabel="Save changes" />
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
