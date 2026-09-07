'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineTableSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  RecordAvatar,
  ResultsCard,
  RowActionsMenu,
  ShowingCount,
  StatCards,
  type ResultsView,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can, canModule, PERMS } from '@/lib/permissions';
import { toast, toastMutationError } from '@/lib/toast';
import type { DirectoryContractorList } from '@/lib/types';
import { ContractorForm } from './contractor-form';
import { AssignmentModal } from './assignment-modal';
import { CheckCircle2, Eye, Link2, MapPin, PauseCircle, Plus, Trash2, UserCog, Users } from 'lucide-react';

export default function ContractorsDirectoryPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [rows, setRows] = useState<DirectoryContractorList[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'main' | 'sub'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignmentCount, setAssignmentCount] = useState<number | null>(null);
  const [resultsView, setResultsView] = useState<ResultsView>('list');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const allowSub = true; // user?.plan?.features?.sub_contractors === true;

  /**
   * The whole directory, unfiltered. The type and status pickers narrow it in the
   * browser rather than at the API, so the cards along the top keep counting the whole
   * directory instead of shrinking to whatever the filters currently leave.
   */
  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.directoryContractors.getContractors());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    // A role may hold Contractors without the assignments right, so a refusal here just
    // leaves the card blank rather than breaking the page.
    api.directoryContractors
      .getAssignments()
      .then((a) => setAssignmentCount(a.length))
      .catch(() => setAssignmentCount(null));
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return rows
      .filter((r) => typeFilter === 'all' || r.type === typeFilter)
      .filter((r) => statusFilter === 'all' || r.is_active === (statusFilter === 'active'))
      .filter(
        (r) => !q || r.name.toLowerCase().includes(q) || (r.contact_email || '').toLowerCase().includes(q)
      );
  }, [rows, search, typeFilter, statusFilter]);

  const canManage = can(user, PERMS.contractorManage);
  const canAssign = can(user, PERMS.contractorAssign);

  // Sub-contractor rows carry their own module on top of the directory's: the API gates
  // this screen on `contractors`, so that right is the floor, and `sub_contractors` lets
  // a role be trusted with main contractors but not the subs beneath them.
  const canViewRow = useCallback(
    (row: DirectoryContractorList) =>
      canModule(user, 'contractors', 'view') &&
      (row.type !== 'sub' || canModule(user, 'sub_contractors', 'view')),
    [user]
  );
  const canDeleteRow = useCallback(
    (row: DirectoryContractorList) =>
      canModule(user, 'contractors', 'delete') &&
      (row.type !== 'sub' || canModule(user, 'sub_contractors', 'delete')),
    [user]
  );

  const handleDelete = useCallback(
    (row: DirectoryContractorList) => {
      toast.confirm(
        `Permanently delete “${row.name}”? This cannot be undone.`,
        async () => {
          try {
            await api.directoryContractors.deleteContractor(row.id);
            await load();
            toast.success('Contractor deleted');
          } catch (err) {
            // A contractor still linked to staff or sites comes back as a 409 naming
            // what blocks it — that message is the whole point of the confirmation.
            toastMutationError(err, 'Could not delete contractor');
          }
        },
        { label: 'Delete' }
      );
    },
    [load]
  );

  const getSortValue = useCallback((r: DirectoryContractorList, key: string) => {
    if (key === 'type') return r.type;
    if (key === 'status') return r.is_active ? 'active' : 'inactive';
    if (key === 'email') return r.contact_email || '';
    return r.name;
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    filtered,
    '',
    sortKey,
    sortDir,
    page,
    pageSize,
    () => '',
    getSortValue
  );

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  const activeCount = rows.filter((r) => r.is_active).length;
  const subCount = rows.filter((r) => r.type === 'sub').length;

  /** The cards along the top, in the shape every module dashboard uses. */
  const statCards: StatCardSpec[] = [
    {
      key: 'total',
      label: 'Total contractors',
      value: rows.length,
      icon: Users,
      tone: 'neutral',
      caption: `${rows.length - subCount} main · ${subCount} sub`,
    },
    {
      key: 'active',
      label: 'Active',
      value: activeCount,
      icon: CheckCircle2,
      tone: 'positive',
      action: activeCount ? { label: 'View', onClick: () => setStatusFilter('active') } : undefined,
    },
    {
      key: 'inactive',
      label: 'Inactive',
      value: rows.length - activeCount,
      icon: PauseCircle,
      tone: 'muted',
      action: rows.length - activeCount ? { label: 'View', onClick: () => setStatusFilter('inactive') } : undefined,
    },
    {
      key: 'sub',
      label: 'Sub-contractors',
      value: subCount,
      icon: UserCog,
      tone: 'info',
      action: subCount ? { label: 'View', onClick: () => setTypeFilter('sub') } : undefined,
    },
    {
      key: 'assignments',
      label: 'Assignments',
      value: assignmentCount ?? '—',
      icon: Link2,
      tone: 'warning',
      caption: 'contractor to site',
      action: canAssign ? { label: 'Manage', onClick: () => setAssignOpen(true) } : undefined,
    },
  ];

  /** What one contractor can have done to it, defined once for both views. */
  const contractorActions = (r: DirectoryContractorList) => [
    {
      label: 'View details',
      icon: Eye,
      onSelect: () => router.push(`/contractors/${r.id}`),
      disabled: !canViewRow(r),
    },
    {
      label: 'Manage assignments',
      icon: Link2,
      onSelect: () => setAssignOpen(true),
      disabled: !canAssign,
    },
    {
      label: 'Delete contractor',
      icon: Trash2,
      onSelect: () => handleDelete(r),
      destructive: true,
      disabled: !canDeleteRow(r),
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <DashboardHeader
            title="Contractors"
            hint="The directory covers main and sub-contractors together. A contractor can own the site, the staff working it, or both — which is how the contractor filters elsewhere in the app match."
            description="Manage all main and sub-contractors for your company. Add, edit and track contractor information and assignments."
            actions={
              <>

              {canManage && (
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 mr-2" />
                      Add contractor
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0">
                      <DialogTitle>New contractor</DialogTitle>
                    </DialogHeader>
                    <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                      <ContractorForm
                      allowSubContractors={allowSub}
                      loading={saving}
                      submitLabel="Create"
                      onSubmit={async (v) => {
                        setSaving(true);
                        try {
                          await api.directoryContractors.createContractor({
                            name: v.name,
                            type: v.type,
                            ...(v.contact_email ? { contact_email: v.contact_email } : {}),
                            ...(v.contact_phone ? { contact_phone: v.contact_phone } : {}),
                            ...(v.address ? { address: v.address } : {}),
                            ...(v.postcode ? { postcode: v.postcode } : {}),
                          });
                          setAddOpen(false);
                          await load();
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canAssign && (
                <Button variant="secondary" onClick={() => setAssignOpen(true)}>
                  <Link2 className="size-4 mr-2" />
                  Assignment
                </Button>
              )}
              </>
            }
          />

          <StatCards cards={statCards} />

          <FilterBar
            onClear={() => {
              setSearch('');
              setTypeFilter('all');
              setStatusFilter('all');
            }}
          >
            <FilterField label="Search" className="min-w-[240px] flex-1">
              <Input
                placeholder="Name or email…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </FilterField>
            <FilterField label="Contractor type">
              <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All types</SelectItem>
                  <SelectItem value="main">Main contractor</SelectItem>
                  <SelectItem value="sub">Sub-contractor</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
            <FilterField label="Status">
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All status</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="inactive">Inactive</SelectItem>
                </SelectContent>
              </Select>
            </FilterField>
          </FilterBar>

          <ResultsCard
            title="Directory"
            count={total}
            view={resultsView}
            onViewChange={setResultsView}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          >
            <div className="min-w-0 p-4">
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <p className="py-8 text-center text-muted-foreground">
                  {rows.length ? 'No contractors match your filters.' : 'No contractors yet.'}
                </p>
              ) : resultsView === 'cards' ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageRows.map((r) => (
                    <div key={r.id} className="rounded-lg border p-4">
                      <div className="flex items-start gap-3">
                        <RecordAvatar name={r.name} />
                        <div className="min-w-0 flex-1">
                          {canViewRow(r) ? (
                            <Link href={`/contractors/${r.id}`} className="block truncate font-medium hover:underline">
                              {r.name}
                            </Link>
                          ) : (
                            <span className="block truncate font-medium">{r.name}</span>
                          )}
                          <p className="truncate text-xs text-muted-foreground">{r.contact_email || 'No email'}</p>
                        </div>
                        <RowActionsMenu actions={contractorActions(r)} label={`${r.name} actions`} />
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <Pill tone={r.type === 'sub' ? 'info' : 'neutral'}>
                          {r.type === 'sub' ? 'Sub-contractor' : 'Main contractor'}
                        </Pill>
                        <Pill dot tone={r.is_active ? 'positive' : 'muted'}>
                          {r.is_active ? 'Active' : 'Inactive'}
                        </Pill>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Email" colKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="max-w-[240px] font-medium">
                            <div className="flex items-center gap-2">
                              <RecordAvatar name={r.name} className="size-8" />
                              {canViewRow(r) ? (
                                <Link href={`/contractors/${r.id}`} className="block truncate hover:underline" title={r.name}>
                                  {r.name}
                                </Link>
                              ) : (
                                <span className="block truncate" title={r.name}>
                                  {r.name}
                                </span>
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Pill tone={r.type === 'sub' ? 'info' : 'neutral'}>
                              {r.type === 'sub' ? 'Sub-contractor' : 'Main contractor'}
                            </Pill>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">
                            <Pill dot tone={r.is_active ? 'positive' : 'muted'}>
                              {r.is_active ? 'Active' : 'Inactive'}
                            </Pill>
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate" title={r.contact_email || undefined}>
                            {r.contact_email || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex items-center justify-end gap-1">
                              {canViewRow(r) ? (
                                <Button variant="ghost" size="icon" className="size-8" asChild title="View contractor">
                                  <Link href={`/contractors/${r.id}`}>
                                    <Eye className="size-4" />
                                  </Link>
                                </Button>
                              ) : null}
                              <RowActionsMenu actions={contractorActions(r)} label={`${r.name} actions`} />
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
              {total > 0 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="contractors" />
                  <TablePaginationBar
                    safePage={safePage}
                    pageCount={pageCount}
                    total={total}
                    pageSize={pageSize}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onPageChange={setPage}
                  />
                </div>
              ) : null}
            </div>
          </ResultsCard>

          <QuickLinks
            links={[
              {
                key: 'assignments',
                title: 'Assignments',
                description: 'Link main and sub-contractors to the sites they cover.',
                icon: Link2,
                tone: 'warning',
                action: { label: 'Manage assignments', onClick: () => setAssignOpen(true) },
              },
              {
                key: 'sites',
                title: 'Sites',
                description: 'Every site carries the contractor responsible for it.',
                icon: MapPin,
                tone: 'neutral',
                action: { label: 'View sites', href: '/sites' },
              },
              {
                key: 'staff',
                title: 'Staff',
                description: 'Employees linked to a contractor, and their compliance dates.',
                icon: Users,
                tone: 'info',
                action: { label: 'Open employee hub', href: '/guards' },
              },
            ]}
          />

          <AssignmentModal
            open={assignOpen}
            onOpenChange={setAssignOpen}
            contractors={rows}
            onSaved={() => void load()}
          />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
