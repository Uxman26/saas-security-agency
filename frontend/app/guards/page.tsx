'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { useGuards, useCreateGuard, useUpdateGuard, useDeleteGuard, useRestoreGuard } from '@/hooks/use-guards';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { useMainContractors } from '@/hooks/use-main-contractors';
import { useSubContractors } from '@/hooks/use-sub-contractors';
import { guardSchema, guardSubmitSchema, type GuardFormData } from '@/lib/validation';
import { guardFormDefaults, guardToForm, formToGuardPayload } from '@/lib/guard-form-map';
import type { EmployeeHub, EmployeeHubRow, Guard, RecordView, Team } from '@/lib/types';
import { DeleteRecordDialog, type DeleteRecordTarget } from '@/components/delete-record-dialog';
import { GuardFormWizard } from '@/app/guards/guard-form-wizard';
import { EmailDialog } from '@/components/email-dialog';
import { PortalLoginPanel } from '@/components/portal-login-panel';
import { useAuth } from '@/contexts/auth-context';
import { can, canModule } from '@/lib/permissions';
import { ModuleTabs } from '@/components/module-layout';
import { JobTitlesPanel } from '@/app/guards/job-titles-panel';
import { formatDateUK } from '@/lib/date-format';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ArchiveRestore, Pencil, Trash2, UserRound, Users, Eye, BadgeCheck, CalendarOff, FolderOpen, ShieldAlert, UserMinus, UserPlus } from 'lucide-react';
import { toast } from '@/lib/toast';
import { assertEmailAvailable, DUPLICATE_EMAIL_MESSAGE, isDuplicateEmailError } from '@/lib/email-availability';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import {
  EMPTY_HUB_QUERY,
  EmployeeHubControls,
  type HubQuery,
  type HubView,
} from '@/components/hr/employee-hub-controls';
import { EmployeeCard, EmployeeQuickView, initialsOf } from '@/components/hr/employee-quick-view';
import { ManageTeamsPanel } from '@/components/hr/manage-teams-panel';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  ResultsCard,
  QuickLinks,
  RowActionsMenu,
  ShowingCount,
  StatCards,
  type StatCardSpec,
} from '@/components/module-dashboard';
import type { JobTitle } from '@/lib/types';
function getSiaStatus(date?: string): 'expired' | 'critical' | 'warning' | 'ok' | null {
  if (!date) return null;
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  return 'ok';
}

const TABS = [
  { id: 'staff', label: 'Employees' },
  { id: 'teams', label: 'Manage teams' },
  { id: 'job-titles', label: 'Job titles' },
] as const;
type StaffTab = (typeof TABS)[number]['id'];

export default function GuardsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tab, setTab] = useState<StaffTab>('staff');
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingGuard, setEditingGuard] = useState<Guard | null>(null);
  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [search, setSearch] = useState('');
  const [filterContractor, setFilterContractor] = useState('all');
  const [filterSubContractor, setFilterSubContractor] = useState('all');
  const [filterArea, setFilterArea] = useState('');
  const [filterPostcode, setFilterPostcode] = useState('');
  const [filterNearby, setFilterNearby] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const areaQ = filterArea.trim() || undefined;
  const postcodeQ = filterPostcode.trim() || undefined;
  const nearbyQ = filterNearby.trim() || undefined;
  // Archived staff live behind their own tab: off the Staff list, out of every rota and
  // payroll picker, and with their portal login switched off — but still restorable.
  const [listView, setListView] = useState<RecordView>('active');
  const { data: guards = [], isLoading, refetch, isRefetching, error: guardsError } = useGuards({
    area: areaQ,
    postcode: postcodeQ,
    nearby: nearbyQ,
    view: listView,
  });
  const { data: archivedGuards = [] } = useGuards({ view: 'archived' });
  const [deleteTarget, setDeleteTarget] = useState<DeleteRecordTarget | null>(null);
  // The Employee Hub: one server call feeds both views, so Teams View and List View can
  // never disagree about who is in scope.
  const [hubView, setHubView] = useState<HubView>('list');
  const [hubQuery, setHubQuery] = useState<HubQuery>(EMPTY_HUB_QUERY);
  const [hub, setHub] = useState<EmployeeHub | null>(null);
  const [hubLoading, setHubLoading] = useState(true);
  const [teams, setTeams] = useState<Team[]>([]);
  const [quickView, setQuickView] = useState<EmployeeHubRow | null>(null);
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
  const restoreGuard = useRestoreGuard();

  // Job titles are a company record served by /job-titles. The Staff page owns the list so
  // the tab and both staff forms always show the same one.
  const canJobTitlesView = canModule(user, 'guards', 'job_titles_view');
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [jobTitlesLoading, setJobTitlesLoading] = useState(false);

  const loadJobTitles = useCallback(async () => {
    if (!canJobTitlesView) return;
    setJobTitlesLoading(true);
    try {
      setJobTitles(await api.jobTitles.list());
    } catch {
      /* the form falls back to the titles already on staff records */
    } finally {
      setJobTitlesLoading(false);
    }
  }, [canJobTitlesView]);

  useEffect(() => {
    void loadJobTitles();
  }, [loadJobTitles]);

  const jobTitleNames = useMemo(() => jobTitles.map((t) => t.name), [jobTitles]);

  /** A title typed straight into the staff form joins the company list. */
  const handleCreateJobTitle = useCallback(
    async (name: string) => {
      const t = name.trim();
      if (!t || !canModule(user, 'guards', 'job_titles_create')) return;
      if (jobTitles.some((x) => x.name.toLowerCase() === t.toLowerCase())) return;
      try {
        await api.jobTitles.create(t);
        await loadJobTitles();
      } catch {
        /* a duplicate or a missing permission simply leaves the list as it is */
      }
    },
    [user, jobTitles, loadJobTitles]
  );

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
      if (data.create_login) {
        const dup = await assertEmailAvailable(data.email || '');
        if (dup) {
          toast.error(dup);
          return;
        }
      }
      const created = await createGuard.mutateAsync(formToGuardPayload(data));
      if (photoFile && created?.id) {
        try {
          await api.guards.uploadPhoto(created.id, photoFile);
        } catch {
          toast.error('Staff created, but photo upload failed');
        }
      }
      setPhotoFile(null);
      setAddOpen(false);
      addForm.reset(guardFormDefaults);
    } catch (err) {
      if (isDuplicateEmailError(err)) toast.error(DUPLICATE_EMAIL_MESSAGE);
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

  const loadHub = useCallback(() => {
    setHubLoading(true);
    api.guards
      .hub({
        search: hubQuery.search || undefined,
        team_id: hubQuery.teamId === 'all' ? undefined : parseInt(hubQuery.teamId, 10),
        status: hubQuery.status,
        sort: hubQuery.sort,
        include_terminated: hubQuery.includeTerminated,
        view: listView,
      })
      .then(setHub)
      .catch(() => setHub(null))
      .finally(() => setHubLoading(false));
  }, [hubQuery, listView]);

  useEffect(() => {
    loadHub();
  }, [loadHub]);

  const loadTeams = useCallback(() => {
    api.teams.list().then(setTeams).catch(() => setTeams([]));
  }, []);

  useEffect(() => {
    loadTeams();
  }, [loadTeams]);

  /** guard id → the teams they are in, for the list view's Team(s) column. */
  const teamsByGuard = useMemo(() => {
    const m = new Map<number, string[]>();
    for (const e of hub?.employees ?? []) {
      m.set(e.id, e.teams.map((t) => t.name));
    }
    return m;
  }, [hub]);

  /**
   * The hub decides who is in scope; the table below still owns the compliance columns
   * and the contractor filters. Intersecting the two keeps one source of truth for
   * membership without losing the columns a security company actually works from.
   */
  const hubIds = useMemo(
    () => new Set((hub?.employees ?? []).map((e) => e.id)),
    [hub]
  );

  const handleDelete = (guard: Guard) => {
    setDeleteTarget({ id: guard.id, name: guard.full_name, archived: guard.deleted_at != null });
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
        case 'job_title':
          return g.job_title || '';
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

  /**
   * A staff member is linked to a contractor either by the directory's `contractor_id`
   * or, on older records, by the legacy main_/sub_contractor_id columns. Both are
   * checked so a filter does not quietly hide people whose link predates the directory.
   */
  const matchesContractor = useCallback(
    (g: Guard, selectedId: string, kind: 'main' | 'sub') => {
      if (selectedId === 'all') return true;
      if ((g.contractor_id || '') === selectedId) return true;
      const picked = dirRows.find((c) => c.id === selectedId);
      if (!picked) return false;
      const name = picked.name.trim().toLowerCase();
      const legacy = kind === 'main' ? legMains : legSubs;
      const legacyId = kind === 'main' ? g.main_contractor_id : g.sub_contractor_id;
      if (legacyId == null) return false;
      return legacy.some((c) => c.id === legacyId && (c.name || '').trim().toLowerCase() === name);
    },
    [dirRows, legMains, legSubs]
  );

  const contractorFiltered = useMemo(
    () =>
      guards
        // Find / Filter by / Sort by / Status are answered by the hub; the contractor
        // pickers stay here because they are this product's own, not the spec's.
        .filter((g) => hubIds.has(g.id))
        .filter((g) => matchesContractor(g, filterContractor, 'main'))
        .filter((g) => matchesContractor(g, filterSubContractor, 'sub')),
    [guards, hubIds, filterContractor, filterSubContractor, matchesContractor]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    contractorFiltered,
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
  }, [listView, search, filterContractor, filterSubContractor]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  /** What one employee can have done to them, defined once for every view. */
  const guardActions = (guard: Guard) => [
    { label: 'View full profile', icon: UserRound, onSelect: () => router.push(`/guards/${guard.id}`) },
    {
      label: 'Edit staff',
      icon: Pencil,
      onSelect: () => openEdit(guard),
      disabled: !can(user, 'guards.write') || guard.deleted_at != null,
    },
    {
      label: 'Absence',
      icon: CalendarOff,
      onSelect: () => router.push(`/guards/${guard.id}?tab=absence`),
    },
    {
      label: 'Documents',
      icon: FolderOpen,
      onSelect: () => router.push(`/guards/${guard.id}?tab=documents`),
    },
    {
      label: 'Restore staff member',
      icon: ArchiveRestore,
      onSelect: () => void restoreGuard.mutateAsync(guard.id),
      disabled: !can(user, 'guards.delete') || guard.deleted_at == null,
    },
    {
      label: guard.deleted_at != null ? 'Delete permanently' : 'Archive or delete',
      icon: Trash2,
      onSelect: () => handleDelete(guard),
      destructive: true,
      disabled: !can(user, 'guards.delete'),
    },
  ];

  /** Compliance is what a security firm watches, so it leads the cards here. */
  const expiringSia = guards.filter((g) => {
    const s = getSiaStatus(g.sia_expiry_date);
    return s === 'expired' || s === 'critical';
  }).length;

  const statCards: StatCardSpec[] = [
    {
      key: 'total',
      label: 'Employees',
      value: hub?.total ?? guards.length,
      icon: Users,
      tone: 'neutral',
      caption: listView === 'archived' ? 'archived' : 'in this view',
    },
    {
      key: 'registered',
      label: 'With a portal login',
      value: (hub?.total ?? 0) - (hub?.not_registered ?? 0),
      icon: BadgeCheck,
      tone: 'positive',
    },
    {
      key: 'not_registered',
      label: 'Not registered',
      value: hub?.not_registered ?? 0,
      icon: UserPlus,
      tone: 'info',
      action: hub?.not_registered
        ? { label: 'View', onClick: () => setHubQuery({ ...hubQuery, status: 'not_registered' }) }
        : undefined,
    },
    {
      key: 'sia',
      label: 'SIA expiring',
      value: expiringSia,
      icon: ShieldAlert,
      tone: 'warning',
      caption: 'expired or within 30 days',
    },
    {
      key: 'terminated',
      label: 'Terminated',
      value: hub?.terminated_count ?? 0,
      icon: UserMinus,
      tone: 'muted',
      action: hub?.terminated_count
        ? { label: 'View', onClick: () => setHubQuery({ ...hubQuery, status: 'terminated', includeTerminated: true }) }
        : undefined,
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <DashboardHeader
            title="Employee hub"
            hint="Teams View and List View show the same people — only the grouping changes. Terminated staff stay in the hub behind the switch; archived staff leave it entirely."
            description="Staff records, teams, absence, documents and compliance. Add employees, manage teams and open a full profile."
            actions={
              <>
              <Button
                variant="outline"
                onClick={() => (tab === 'staff' ? refetch() : loadJobTitles())}
                disabled={tab === 'staff' ? isRefetching : jobTitlesLoading}
              >
                {(tab === 'staff' ? isRefetching : jobTitlesLoading) ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!can(user, 'guards.write')}>Add employees</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
                  <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
                    <DialogTitle>Add staff member</DialogTitle>
                    <DialogDescription className="sr-only">
                      Enter employee and employment details to add a new staff member.
                    </DialogDescription>
                  </DialogHeader>
                  <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6">
                    <GuardFormWizard
                      form={addForm}
                      mains={mains}
                      subs={subs}
                      onSubmit={handleCreate}
                      isPending={createGuard.isPending}
                      submitLabel="Create staff"
                      photoFile={photoFile}
                      onPhotoFileChange={setPhotoFile}
                      existingJobTitles={guards.map((g) => g.job_title || '').filter(Boolean)}
                      jobTitles={jobTitleNames}
                      onCreateJobTitle={handleCreateJobTitle}
                      allowLogin
                    />
                  </div>
                </DialogContent>
              </Dialog>
              </>
            }
          />

          <div className="mb-6 mt-6">
            <StatCards cards={statCards} />
          </div>

          {canJobTitlesView && (
            <div className="mb-4">
              <ModuleTabs tabs={TABS} value={tab} onChange={setTab} />
            </div>
          )}

          {tab === 'teams' ? (
            <ManageTeamsPanel
              guards={guards}
              canManage={canModule(user, 'guards', 'teams_manage')}
              onChanged={() => {
                loadTeams();
                loadHub();
              }}
            />
          ) : tab === 'job-titles' && canJobTitlesView ? (
            <JobTitlesPanel
              titles={jobTitles}
              loading={jobTitlesLoading}
              onChanged={loadJobTitles}
              canCreate={canModule(user, 'guards', 'job_titles_create')}
              canEdit={canModule(user, 'guards', 'job_titles_edit')}
              canDelete={canModule(user, 'guards', 'job_titles_delete')}
            />
          ) : (
          <>
          <div className="mb-4">
            <EmployeeHubControls
              query={hubQuery}
              onChange={setHubQuery}
              teams={teams}
              view={hubView}
              onViewChange={setHubView}
              notRegistered={hub?.not_registered ?? 0}
              terminatedCount={hub?.terminated_count ?? 0}
              showStatus={hubView === 'teams'}
            />
          </div>

          <div className="mb-4">
            <FilterBar
              onClear={() => {
                setSearch('');
                setFilterContractor('all');
                setFilterSubContractor('all');
                setFilterArea('');
                setFilterPostcode('');
                setFilterNearby('');
              }}
            >
              <FilterField label="Search" className="min-w-[220px] flex-1">
                <Input
                  placeholder="Name, phone, area or postcode…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FilterField>
              <FilterField label="Contractor">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={filterContractor}
                  onChange={(e) => setFilterContractor(e.target.value)}
                  aria-label="Filter by contractor"
                >
                  <option value="all">All contractors</option>
                  {mains.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Sub-contractor">
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                  value={filterSubContractor}
                  onChange={(e) => setFilterSubContractor(e.target.value)}
                  aria-label="Filter by sub-contractor"
                >
                  <option value="all">All sub-contractors</option>
                  {subs.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </FilterField>
              <FilterField label="Area">
                <Input placeholder="Service area" value={filterArea} onChange={(e) => setFilterArea(e.target.value)} />
              </FilterField>
              <FilterField label="Postcode">
                <Input placeholder="Postcode" value={filterPostcode} onChange={(e) => setFilterPostcode(e.target.value)} />
              </FilterField>
              <FilterField label="Nearby areas">
                <Input placeholder="Nearby" value={filterNearby} onChange={(e) => setFilterNearby(e.target.value)} />
              </FilterField>
            </FilterBar>
          </div>
          {(mains.length === 0 && subs.length === 0) && (
            <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Add at least one main or sub contractor on the{' '}
              <Link href="/contractors" className="font-medium underline">Contractors</Link> page before you can link staff.
            </div>
          )}

          <div className="mb-4 flex flex-wrap gap-2 border-b pb-3">
            {([
              ['active', 'Active staff'],
              ['archived', `Archived (${archivedGuards.length})`],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setListView(id)}
                className={cn(
                  'rounded-full px-4 py-1.5 text-sm font-medium transition-colors',
                  listView === id
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'bg-muted text-muted-foreground hover:bg-muted/80'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {hubView === 'teams' ? (
            <ResultsCard title={listView === 'archived' ? 'Archived staff' : 'Employees by team'} count={hub?.total}>
              <div className="space-y-6 p-4">
                <p className="text-sm text-muted-foreground">
                  Grouped by team. Anyone in no team is listed under “No team”, so the two views
                  always add up to the same people.
                </p>
                {hubLoading ? (
                  <InlineTableSkeleton />
                ) : !hub || hub.groups.length === 0 ? (
                  <p className="py-12 text-center text-sm text-muted-foreground">
                    No employees match your filters.
                  </p>
                ) : (
                  hub.groups.map((group) => (
                    <div key={group.team_id}>
                      <h3 className="mb-2 text-sm font-semibold">
                        {group.team_name}{' '}
                        <span className="font-normal text-muted-foreground">
                          ({group.employees.length})
                        </span>
                      </h3>
                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {group.employees.map((e) => (
                          <EmployeeCard key={`${group.team_id}-${e.id}`} employee={e} onQuickView={setQuickView} />
                        ))}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </ResultsCard>
          ) : (
          <ResultsCard
            title={listView === 'archived' ? 'Archived staff' : 'Employees'}
            count={total}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          >
            <div className="p-4">
              {listView === 'archived' ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  Off the Staff list and out of every rota and payroll picker, with their portal login
                  switched off. Their shifts, attendance and payroll history are untouched — restoring
                  someone brings the record back but leaves their login disabled.
                </p>
              ) : null}
              {isLoading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || areaQ || postcodeQ || nearbyQ || filterContractor !== 'all' || filterSubContractor !== 'all'
                    ? 'No staff match your filters.'
                    : 'No staff yet. Click "Add staff" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Job title" colKey="job_title" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Team(s)</TableHead>
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
                            <TableCell className="font-medium whitespace-nowrap">
                              <Link href={`/guards/${guard.id}`} className="flex items-center gap-2 hover:underline">
                                <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[10px] font-semibold text-primary">
                                  {initialsOf(guard.full_name)}
                                </span>
                                {guard.full_name}
                              </Link>
                            </TableCell>
                            <TableCell className="text-sm">{guard.job_title || '-'}</TableCell>
                            <TableCell className="max-w-[200px] text-sm">
                              <div className="flex flex-wrap gap-1">
                                {(teamsByGuard.get(guard.id) ?? []).length ? (
                                  (teamsByGuard.get(guard.id) ?? []).map((t) => (
                                    <Pill key={t} tone="info">
                                      {t}
                                    </Pill>
                                  ))
                                ) : (
                                  <Pill tone="muted">No team</Pill>
                                )}
                              </div>
                            </TableCell>
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
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="size-8 p-0"
                                  onClick={() =>
                                    setQuickView(
                                      hub?.employees.find((e) => e.id === guard.id) ?? {
                                        id: guard.id,
                                        full_name: guard.full_name,
                                        job_title: guard.job_title,
                                        email: guard.email,
                                        phone: guard.phone,
                                        photo_url: guard.photo_url,
                                        teams: [],
                                        terminated: false,
                                        registered: false,
                                        archived: guard.deleted_at != null,
                                      }
                                    )
                                  }
                                  title="Quick view"
                                >
                                  <Eye className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" className="size-8 p-0" asChild title="View full profile">
                                  <Link href={`/guards/${guard.id}`}>
                                    <UserRound className="size-4" />
                                  </Link>
                                </Button>
                                {guard.email ? (
                                  <EmailDialog defaultEmail={guard.email} defaultName={guard.full_name} compact />
                                ) : null}
                                <RowActionsMenu
                                  actions={guardActions(guard)}
                                  label={`${guard.full_name} actions`}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <div className="mt-3 border-t pt-3">
                    <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="employees" />
                  </div>
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
            </div>
          </ResultsCard>
          )}
          </>
          )}
        </div>

        <div className="container mx-auto px-4 pb-8">
          <QuickLinks
            links={[
              {
                key: 'absence',
                title: 'Absence',
                description: 'Annual leave, sickness and lateness, booked from each employee profile.',
                icon: CalendarOff,
                tone: 'info',
                action: { label: 'Open a profile', href: '/guards' },
              },
              {
                key: 'documents',
                title: 'Staff documents',
                description: 'Contracts, SIA badges and certificates, with expiry tracking.',
                icon: FolderOpen,
                tone: 'neutral',
                action: { label: 'Manage documents', href: '/documents' },
              },
              {
                key: 'rota',
                title: 'Rotas & shifts',
                description: 'Schedule these employees and publish their shifts.',
                icon: Users,
                tone: 'positive',
                action: { label: 'Open rotas', href: '/rota' },
              },
            ]}
          />
        </div>

        <EmployeeQuickView employee={quickView} onClose={() => setQuickView(null)} />

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-4xl max-h-[92vh] overflow-hidden flex flex-col gap-0 p-0">
            <DialogHeader className="shrink-0 px-6 pt-6 pb-2">
              <DialogTitle className="break-words">Edit staff — {editingGuard?.full_name}</DialogTitle>
              <DialogDescription className="sr-only">Update this staff member&apos;s profile.</DialogDescription>
            </DialogHeader>
            <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-6 pb-6 space-y-4">
              {editingGuard && (
                <PortalLoginPanel
                  kind="staff"
                  recordId={editingGuard.id}
                  load={api.guards.portalLogins}
                  save={api.guards.setPortalLoginPassword}
                  create={api.guards.createPortalLogin}
                  defaultEmail={editingGuard.email ?? ''}
                />
              )}
              <GuardFormWizard
                form={editForm}
                mains={mains}
                subs={subs}
                onSubmit={handleUpdate}
                isPending={updateGuard.isPending}
                submitLabel="Save changes"
                existingJobTitles={guards.map((g) => g.job_title || '').filter(Boolean)}
                jobTitles={jobTitleNames}
                onCreateJobTitle={handleCreateJobTitle}
              />
            </div>
          </DialogContent>
        </Dialog>

        <DeleteRecordDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          noun="staff member"
          archiveHint="Their shifts, attendance and payroll history stay exactly as they are, and any portal login they hold is switched off."
          loadImpact={api.guards.deleteImpact}
          onArchive={(id) => deleteGuard.mutateAsync({ id })}
          onDeletePermanently={(id) => deleteGuard.mutateAsync({ id, permanent: true })}
          canArchive={can(user, 'guards.delete')}
          canDeletePermanently={can(user, 'guards.delete')}
        />
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
