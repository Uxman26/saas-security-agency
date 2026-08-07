'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useGuards, useCreateGuard, useUpdateGuard, useDeleteGuard } from '@/hooks/use-guards';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { useMainContractors } from '@/hooks/use-main-contractors';
import { useSubContractors } from '@/hooks/use-sub-contractors';
import { guardSchema, guardSubmitSchema, type GuardFormData } from '@/lib/validation';
import { guardFormDefaults, guardToForm, formToGuardPayload } from '@/lib/guard-form-map';
import type { Guard } from '@/lib/types';
import { GuardFormWizard } from '@/app/guards/guard-form-wizard';
import { EmailDialog } from '@/components/email-dialog';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { formatDateUK } from '@/lib/date-format';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Pencil, Trash2, Users, Eye } from 'lucide-react';
import { toast } from '@/lib/toast';
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

  useEffect(() => {
    if (guardsError) toast.error((guardsError as Error).message || 'Failed to load staff');
  }, [guardsError]);

  const addForm = useForm<GuardFormData>({
    resolver: zodResolver(guardSubmitSchema) as Resolver<GuardFormData>,
    defaultValues: guardFormDefaults,
  });

  const editForm = useForm<GuardFormData>({ resolver: zodResolver(guardSubmitSchema) as Resolver<GuardFormData> });

  const handleCreate = async (data: GuardFormData) => {
    try {
      await createGuard.mutateAsync(formToGuardPayload(data));
      setAddOpen(false);
      addForm.reset(guardFormDefaults);
    } catch {
      /* toast via mutation hook */
    }
  };

  const openEdit = (guard: Guard) => {
    setEditingGuard(guard);
    editForm.reset(guardToForm(guard));
    setEditOpen(true);
  };

  const handleUpdate = async (data: GuardFormData) => {
    if (!editingGuard) return;
    try {
      await updateGuard.mutateAsync({ id: editingGuard.id, data: formToGuardPayload(data) });
      setEditOpen(false);
      setEditingGuard(null);
    } catch {
      /* toast via mutation hook */
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this staff member?', async () => { await deleteGuard.mutateAsync(id); }, {
      label: 'Delete',
      description: 'This cannot be undone.',
    });
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
        g.sia_number,
        g.sia_expiry_date,
        g.visa_expiry_date,
        g.date_of_birth,
        g.share_code,
        g.share_code_expiry_date,
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
    []
  );

  const getSortValue = useCallback(
    (g: Guard, key: string) => {
      switch (key) {
        case 'name':
          return g.full_name;
        case 'visa_type':
          return g.visa_status || '';
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
        case 'dob':
          return g.date_of_birth || '';
        case 'visa_expiry':
          return g.visa_expiry_date || '';
        case 'postcode':
          return g.postcode || '';
        case 'car':
          return g.has_car ? 1 : 0;
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
    []
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
                <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
                  <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
                    <DialogTitle>Add staff member</DialogTitle>
                    <DialogDescription className="sr-only">
                      Enter employee and employment details to add a new staff member.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
                    <GuardFormWizard form={addForm} mains={mains} subs={subs} onSubmit={handleCreate} isPending={createGuard.isPending} submitLabel="Create staff" />
                  </div>
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
                <InlineTableSkeleton />
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
                        <SortableHead label="DOB" colKey="dob" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Visa Type" colKey="visa_type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Visa Expiry" colKey="visa_expiry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Postcode" colKey="postcode" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Car" colKey="car" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} className="w-14 whitespace-nowrap" />
                        <SortableHead label="Email" colKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Phone" colKey="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="SIA Badge Number" colKey="sia_number" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="SIA Expiry" colKey="sia_expiry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="RTW" colKey="rtw" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="whitespace-nowrap min-w-[140px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((guard) => {
                        const siaStatus = getSiaStatus(guard.sia_expiry_date);
                        const visaStatus = getSiaStatus(guard.visa_expiry_date);
                        return (
                          <TableRow key={guard.id}>
                            <TableCell className="font-medium whitespace-nowrap">{guard.full_name}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{guard.date_of_birth ? formatDateUK(guard.date_of_birth) : '-'}</TableCell>
                            <TableCell className="text-sm max-w-[140px] truncate" title={guard.visa_status || undefined}>
                              {guard.visa_status || '-'}
                            </TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {guard.visa_expiry_date ? (
                                <span className={
                                  visaStatus === 'expired' ? 'text-destructive font-semibold' :
                                  visaStatus === 'critical' ? 'text-orange-600 font-semibold' :
                                  visaStatus === 'warning' ? 'text-amber-600 font-medium' : ''
                                }>
                                  {formatDateUK(guard.visa_expiry_date)}
                                </span>
                              ) : '-'}
                            </TableCell>
                            <TableCell className="text-sm whitespace-nowrap">{guard.postcode || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap text-center w-14">{guard.has_car ? 'Yes' : 'No'}</TableCell>
                            <TableCell className="text-sm max-w-[160px] truncate" title={guard.email || undefined}>{guard.email || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">{guard.phone || '-'}</TableCell>
                            <TableCell className="text-sm whitespace-nowrap font-mono">{guard.sia_number || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {guard.sia_expiry_date ? (
                                <span className={
                                  siaStatus === 'expired' ? 'text-destructive font-semibold' :
                                  siaStatus === 'critical' ? 'text-orange-600 font-semibold' :
                                  siaStatus === 'warning' ? 'text-amber-600 font-medium' : ''
                                }>
                                  {formatDateUK(guard.sia_expiry_date)}
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
                            <TableCell className="whitespace-nowrap">
                              <div className="flex items-center gap-0.5 flex-nowrap">
                                <Button variant="ghost" size="sm" className="size-8 p-0" asChild title="View staff">
                                  <Link href={`/guards/${guard.id}`}>
                                    <Eye className="size-4" />
                                  </Link>
                                </Button>
                                <Button variant="ghost" size="sm" className="size-8 p-0" onClick={() => openEdit(guard)} title="Edit staff" disabled={!can(user, 'guards.write')}>
                                  <Pencil className="size-4" />
                                </Button>
                                {guard.email && (
                                  <EmailDialog defaultEmail={guard.email} defaultName={guard.full_name} compact />
                                )}
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
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
          <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
              <DialogTitle className="break-words">Edit staff — {editingGuard?.full_name}</DialogTitle>
              <DialogDescription className="sr-only">Update this staff member&apos;s profile.</DialogDescription>
            </DialogHeader>
            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
              <GuardFormWizard form={editForm} mains={mains} subs={subs} onSubmit={handleUpdate} isPending={updateGuard.isPending} submitLabel="Save changes" />
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
