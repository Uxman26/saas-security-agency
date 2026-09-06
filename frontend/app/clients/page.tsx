'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  useRestoreClient,
  useClientRenewals,
  useRenewClientContract,
} from '@/hooks/use-clients';
import { PasswordInput } from '@/components/ui/password-input';
import { PortalLoginPanel } from '@/components/portal-login-panel';
import { api } from '@/lib/api';
import { cn } from '@/lib/utils';
import { clientSchema, clientRenewSchema, PASSWORD_REQUIREMENTS_MSG } from '@/lib/validation';
import type { Client, RecordView } from '@/lib/types';
import { DeleteRecordDialog, type DeleteRecordTarget } from '@/components/delete-record-dialog';
import type { z } from 'zod';
import { EmailDialog } from '@/components/email-dialog';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
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
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { ArchiveRestore, Building2, Eye, Pencil, Trash2, CalendarClock, History, AlertTriangle, CheckCircle2, FileText, MapPin, Users } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
type ClientFormData = z.output<typeof clientSchema>;
type RenewFormData = z.output<typeof clientRenewSchema>;

function stripEmptyDates<T extends ClientFormData>(data: T): T {
  return {
    ...data,
    contract_start_date: data.contract_start_date?.trim() || undefined,
    contract_end_date: data.contract_end_date?.trim() || undefined,
  };
}

function contractTone(end?: string): { label: string; tone: 'none' | 'ok' | 'soon' | 'expired' } {
  if (!end) return { label: '—', tone: 'none' };
  const endMs = new Date(`${end}T12:00:00`).getTime();
  const t = new Date();
  t.setHours(12, 0, 0, 0);
  const days = Math.round((endMs - t.getTime()) / 86400000);
  if (days < 0) return { label: 'Expired', tone: 'expired' };
  if (days <= 30) return { label: `${days}d left`, tone: 'soon' };
  return { label: 'Valid', tone: 'ok' };
}

function statusClass(tone: 'none' | 'ok' | 'soon' | 'expired') {
  if (tone === 'expired') return 'text-red-600 dark:text-red-400 font-medium';
  if (tone === 'soon') return 'text-amber-600 dark:text-amber-500 font-medium';
  if (tone === 'ok') return 'text-green-600 dark:text-green-500 font-medium';
  return 'text-muted-foreground';
}

function ClientForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
  allowLogin = false,
}: {
  form: ReturnType<typeof useForm<ClientFormData>>;
  onSubmit: (data: ClientFormData) => void;
  isPending: boolean;
  submitLabel: string;
  /** Only the Add dialog provisions logins; editing a client must not silently make one. */
  allowLogin?: boolean;
}) {
  const { register, handleSubmit, watch, formState: { errors } } = form;
  const createLogin = watch('create_login');
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Company / Client Name <span className="text-destructive">*</span></Label>
          <Input {...register('name')} placeholder="Acme Security Ltd" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" {...register('email')} placeholder="contact@client.com" />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input {...register('phone')} placeholder="+44 20 0000 0000" />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact Person</Label>
          <Input {...register('contact_person')} placeholder="Jane Doe" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input {...register('address')} placeholder="123 Business Park, London" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Postcode</Label>
          <Input {...register('postcode')} placeholder="e.g. E15 2AB" />
        </div>
        <div className="space-y-1">
          <Label>Contract start</Label>
          <Input type="date" {...register('contract_start_date')} />
        </div>
        <div className="space-y-1">
          <Label>Contract end</Label>
          <Input type="date" {...register('contract_end_date')} />
        </div>
        <div className="space-y-1 sm:col-span-2 flex items-center gap-2 pt-1">
          <input type="checkbox" id="drsd" className="size-4 accent-primary" {...register('double_rate_special_days')} />
          <Label htmlFor="drsd" className="font-normal cursor-pointer">
            Double billing rate on bank holidays & special days (when defined in Settings)
          </Label>
        </div>
      </div>

      {allowLogin && (
        <div className="rounded-md border p-3 space-y-3">
          <div className="flex items-start gap-2">
            <input
              type="checkbox"
              id="create_login"
              className="size-4 mt-0.5 accent-primary"
              {...register('create_login')}
            />
            <div className="space-y-0.5">
              <Label htmlFor="create_login" className="font-normal cursor-pointer">
                Create a portal login for this client
              </Label>
              <p className="text-xs text-muted-foreground">
                Signs in with the Email above and gets the Client role. Manage what that role
                can see in Settings → Roles &amp; Permissions.
              </p>
            </div>
          </div>

          {createLogin && (
            <div className="space-y-1">
              <Label>
                Login password <span className="text-destructive">*</span>
              </Label>
              <PasswordInput autoComplete="new-password" {...register('login_password')} />
              {errors.login_password ? (
                <p className="text-xs text-destructive">{errors.login_password.message}</p>
              ) : (
                <p className="text-xs text-muted-foreground">{PASSWORD_REQUIREMENTS_MSG}</p>
              )}
            </div>
          )}
        </div>
      )}

      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

function RenewalHistoryDialog({ clientId, clientName }: { clientId: number; clientName: string }) {
  const { data: rows = [], isLoading } = useClientRenewals(clientId);
  return (
    <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Renewal history — {clientName}</DialogTitle>
      </DialogHeader>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-muted-foreground">No renewals recorded yet.</p>
      ) : (
        <ul className="space-y-3 text-sm">
          {rows.map((r) => (
            <li key={r.id} className="border border-border rounded-md p-3">
              <div className="font-medium">
                {r.previous_end_date ?? '—'} → {r.new_end_date}
              </div>
              {r.note ? <p className="text-muted-foreground mt-1">{r.note}</p> : null}
              <p className="text-xs text-muted-foreground mt-1">{new Date(r.created_at).toLocaleString()}</p>
            </li>
          ))}
        </ul>
      )}
    </DialogContent>
  );
}

/** Read-only client details, for roles that hold clients.view without clients.edit. */
function ClientDetailsDialog({ client }: { client: Client }) {
  const { label, tone } = contractTone(client.contract_end_date);
  const rows: Array<[string, string]> = [
    ['Name', client.name],
    ['Contact person', client.contact_person || '—'],
    ['Email', client.email || '—'],
    ['Phone', client.phone || '—'],
    ['Address', client.address || '—'],
    ['Postcode', client.postcode || '—'],
    ['Contract start', client.contract_start_date || '—'],
    ['Contract end', client.contract_end_date || '—'],
    ['Double rate on special days', client.double_rate_special_days ? 'Yes' : 'No'],
    ['Added', new Date(client.created_at).toLocaleString()],
  ];
  return (
    <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
      <DialogHeader>
        <DialogTitle>Client — {client.name}</DialogTitle>
      </DialogHeader>
      <dl className="grid grid-cols-1 sm:grid-cols-[minmax(0,10rem)_1fr] gap-x-4 gap-y-2 text-sm">
        {rows.map(([k, v]) => (
          <div key={k} className="contents">
            <dt className="text-muted-foreground">{k}</dt>
            <dd className="break-words font-medium">{v}</dd>
          </div>
        ))}
        <dt className="text-muted-foreground">Contract status</dt>
        <dd className={statusClass(tone)}>{label}</dd>
      </dl>
    </DialogContent>
  );
}

export default function ClientsPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'clients', 'create');
  const canEditMod = canModule(permUser, 'clients', 'edit');
  const canDeleteMod = canModule(permUser, 'clients', 'delete');
  const canViewMod = canModule(permUser, 'clients', 'view');
  const [viewClient, setViewClient] = useState<Client | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [renewClient, setRenewClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'valid' | 'soon' | 'expired' | 'none'>('all');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [resultsView, setResultsView] = useState<ResultsView>('list');

  // Archived clients live behind their own tab: out of every list and picker, still
  // there to restore or delete outright.
  const [listView, setListView] = useState<RecordView>('active');
  const { data: clients = [], isLoading, refetch, isRefetching } = useClients(listView);
  const { data: archivedClients = [] } = useClients('archived');
  const [deleteTarget, setDeleteTarget] = useState<DeleteRecordTarget | null>(null);
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const restoreClient = useRestoreClient();
  const renewContract = useRenewClientContract();

  const clientDefaults: ClientFormData = {
    name: '',
    email: '',
    phone: '',
    address: '',
    postcode: '',
    contact_person: '',
    double_rate_special_days: false,
    contract_start_date: '',
    contract_end_date: '',
    create_login: false,
    login_password: '',
  };
  const addForm = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema) as Resolver<ClientFormData>,
    defaultValues: clientDefaults,
  });
  const editForm = useForm<ClientFormData>({
    resolver: zodResolver(clientSchema) as Resolver<ClientFormData>,
    defaultValues: clientDefaults,
  });
  const renewForm = useForm<RenewFormData>({
    resolver: zodResolver(clientRenewSchema) as Resolver<RenewFormData>,
    defaultValues: { new_end_date: '', note: '' },
  });

  const handleCreate = async (data: ClientFormData) => {
    try {
      await createClient.mutateAsync(stripEmptyDates(data));
      setAddOpen(false);
      addForm.reset();
    } catch (err) {
      console.error(err);
    }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    editForm.reset({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      postcode: client.postcode ?? '',
      contact_person: client.contact_person ?? '',
      double_rate_special_days: client.double_rate_special_days ?? false,
      contract_start_date: client.contract_start_date ?? '',
      contract_end_date: client.contract_end_date ?? '',
      // Edit never provisions a login; keep these clear so the PUT stays a plain update.
      create_login: false,
      login_password: '',
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: ClientFormData) => {
    if (!editingClient) return;
    try {
      await updateClient.mutateAsync({ id: editingClient.id, data: stripEmptyDates(data) });
      setEditOpen(false);
      setEditingClient(null);
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = (client: Client) => {
    setDeleteTarget({ id: client.id, name: client.name, archived: client.deleted_at != null });
  };

  const openRenew = (c: Client) => {
    setRenewClient(c);
    renewForm.reset({ new_end_date: '', note: '' });
  };

  const handleRenew = async (data: RenewFormData) => {
    if (!renewClient) return;
    try {
      await renewContract.mutateAsync({
        id: renewClient.id,
        data: { new_end_date: data.new_end_date, note: data.note?.trim() || undefined },
      });
      setRenewClient(null);
    } catch (err) {
      console.error(err);
    }
  };

  const byStatus = useMemo(() => {
    if (statusFilter === 'all') return clients;
    return clients.filter((c) => {
      const t = contractTone(c.contract_end_date).tone;
      if (statusFilter === 'none') return t === 'none';
      if (statusFilter === 'valid') return t === 'ok';
      if (statusFilter === 'soon') return t === 'soon';
      if (statusFilter === 'expired') return t === 'expired';
      return true;
    });
  }, [clients, statusFilter]);

  const getSearchText = useCallback(
    (c: Client) =>
      [c.name, c.email, c.phone, c.contact_person, c.address, c.contract_end_date, c.contract_start_date]
        .filter(Boolean)
        .join(' '),
    []
  );

  const getSortValue = useCallback((c: Client, key: string) => {
    switch (key) {
      case 'name':
        return c.name;
      case 'contract_end':
        return c.contract_end_date || '';
      case 'status':
        return contractTone(c.contract_end_date).label;
      case 'email':
        return c.email || '';
      case 'phone':
        return c.phone || '';
      case 'contact_person':
        return c.contact_person || '';
      case 'address':
        return c.address || '';
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    byStatus,
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
  }, [search, statusFilter, listView]);

  useEffect(() => {
    setPage((p) => Math.min(p, pageCount));
  }, [pageCount]);

  /**
   * What one client can have done to it. Defined once so the table and the card grid
   * offer the same menu and each permission is checked in a single place.
   */
  const clientActions = (client: Client) => [
    { label: 'View details', icon: Eye, onSelect: () => setViewClient(client), disabled: !canViewMod },
    {
      label: 'Edit client',
      icon: Pencil,
      onSelect: () => openEdit(client),
      disabled: !canEditMod || client.deleted_at != null,
    },
    { label: 'Renew contract', icon: CalendarClock, onSelect: () => openRenew(client), disabled: !canEditMod },
    { label: 'Renewal history', icon: History, onSelect: () => setHistoryClient(client) },
    {
      label: 'Restore client',
      icon: ArchiveRestore,
      onSelect: () => void restoreClient.mutateAsync(client.id),
      disabled: !canDeleteMod || client.deleted_at == null,
    },
    {
      label: client.deleted_at != null ? 'Delete permanently' : 'Archive or delete',
      icon: Trash2,
      onSelect: () => handleDelete(client),
      destructive: true,
      disabled: !canDeleteMod,
    },
  ];

  /** The five cards along the top, in the same shape every module dashboard uses. */
  const contractCounts = clients.reduce(
    (acc, c) => {
      const t = contractTone(c.contract_end_date).tone;
      acc[t] = (acc[t] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );
  const statCards: StatCardSpec[] = [
    {
      key: 'total',
      label: 'Total clients',
      value: clients.length,
      icon: Building2,
      tone: 'neutral',
      caption: listView === 'archived' ? 'archived' : 'active',
    },
    {
      key: 'valid',
      label: 'Contracts valid',
      value: contractCounts.ok ?? 0,
      icon: CheckCircle2,
      tone: 'positive',
    },
    {
      key: 'soon',
      label: 'Expiring soon',
      value: contractCounts.soon ?? 0,
      icon: CalendarClock,
      tone: 'warning',
      caption: 'within 30 days',
      action: contractCounts.soon ? { label: 'View', onClick: () => setStatusFilter('soon') } : undefined,
    },
    {
      key: 'expired',
      label: 'Expired',
      value: contractCounts.expired ?? 0,
      icon: AlertTriangle,
      tone: 'danger',
      action: contractCounts.expired
        ? { label: 'View', onClick: () => setStatusFilter('expired') }
        : undefined,
    },
    {
      key: 'archived',
      label: 'Archived',
      value: archivedClients.length,
      icon: Trash2,
      tone: 'muted',
      action: archivedClients.length ? { label: 'View', onClick: () => setListView('archived') } : undefined,
    },
  ];

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <DashboardHeader
            title="Clients"
            hint="A client can own many sites. Anything filtered by client — invoices, payroll, rota — covers every site assigned to it."
            description="Client records, contracts and portal access. Track renewals and the sites each client is billed for."
            actions={
              <>

              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                {canCreateMod ? (
                  <DialogTrigger asChild>
                    <Button>Add Client</Button>
                  </DialogTrigger>
                ) : null}
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                  </DialogHeader>
                  <ClientForm form={addForm} onSubmit={handleCreate} isPending={createClient.isPending} submitLabel="Create Client" allowLogin />
                </DialogContent>
              </Dialog>
              </>
            }
          />

          <StatCards cards={statCards} />

          <div className="mb-4 flex flex-wrap gap-2 border-b pb-3">
            {([
              ['active', 'Active clients'],
              ['archived', `Archived (${archivedClients.length})`],
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

          <div className="mb-4">
            <FilterBar
              onClear={() => {
                setSearch('');
                setStatusFilter('all');
              }}
            >
              <FilterField label="Search" className="min-w-[240px] flex-1">
                <Input
                  placeholder="Name, email, phone, address or contract date…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </FilterField>
              <FilterField label="Contract status">
                <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Contract status" />
                  </SelectTrigger>
                  <SelectContent position="popper" className="w-[var(--radix-select-trigger-width)]">
                    <SelectItem value="all">All statuses</SelectItem>
                    <SelectItem value="valid">Valid (&gt;30d)</SelectItem>
                    <SelectItem value="soon">Expiring (≤30d)</SelectItem>
                    <SelectItem value="expired">Expired</SelectItem>
                    <SelectItem value="none">No end date</SelectItem>
                  </SelectContent>
                </Select>
              </FilterField>
            </FilterBar>
          </div>

          <ResultsCard
            title={listView === 'archived' ? 'Archived clients' : 'Clients'}
            count={total}
            view={resultsView}
            onViewChange={setResultsView}
            pageSize={pageSize}
            onPageSizeChange={(n) => {
              setPageSize(n);
              setPage(1);
            }}
          >
            <div className="min-h-[280px] p-4">
              {listView === 'archived' ? (
                <p className="mb-3 text-sm text-muted-foreground">
                  Out of every list and picker. Their invoices, renewals and sites are untouched —
                  restore a client to bring the whole relationship back.
                </p>
              ) : null}
              {isLoading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search || statusFilter !== 'all'
                    ? 'No clients match your filters.'
                    : 'No clients yet. Click "Add Client" to get started.'}
                </div>
              ) : resultsView === 'cards' ? (
                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                  {pageRows.map((client) => {
                    const { label, tone } = contractTone(client.contract_end_date);
                    return (
                      <div key={client.id} className="rounded-lg border p-4">
                        <div className="flex items-start gap-3">
                          <RecordAvatar name={client.name} />
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{client.name}</p>
                            <p className="truncate text-xs text-muted-foreground">
                              {client.contact_person || client.email || '—'}
                            </p>
                          </div>
                          <RowActionsMenu actions={clientActions(client)} label={`${client.name} actions`} />
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <Pill
                            dot
                            tone={
                              tone === 'expired' ? 'danger' : tone === 'soon' ? 'warning' : tone === 'ok' ? 'positive' : 'muted'
                            }
                          >
                            {label}
                          </Pill>
                          {client.deleted_at ? <Pill tone="muted">Archived</Pill> : null}
                        </div>
                        <p className="mt-2 truncate text-xs text-muted-foreground">
                          {[client.address, client.postcode].filter(Boolean).join(', ') || 'No address'}
                        </p>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Contract end" colKey="contract_end" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Email" colKey="email" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Phone" colKey="phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Contact Person" colKey="contact_person" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Address" colKey="address" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((client) => {
                        const { label, tone } = contractTone(client.contract_end_date);
                        const expiredRow = tone === 'expired';
                        return (
                          <TableRow
                            key={client.id}
                            className={expiredRow ? 'bg-red-500/10 dark:bg-red-950/25 border-red-500/20' : undefined}
                          >
                            <TableCell className="font-medium whitespace-nowrap">{client.name}</TableCell>
                            <TableCell className="whitespace-nowrap text-sm">
                              {client.contract_end_date || '—'}
                            </TableCell>
                            <TableCell className={`whitespace-nowrap text-sm ${statusClass(tone)}`}>{label}</TableCell>
                            <TableCell>{client.email || '-'}</TableCell>
                            <TableCell className="whitespace-nowrap">{client.phone || '-'}</TableCell>
                            <TableCell>{client.contact_person || '-'}</TableCell>
                            <TableCell className="max-w-[160px] truncate">{client.address || '-'}</TableCell>
                            <TableCell className="text-right">
                              <div className="flex items-center justify-end gap-0.5 flex-wrap">
                                {canViewMod ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => setViewClient(client)}
                                    title="View client"
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                ) : null}
                                {canViewMod ? (
                                  <Button
                                    variant="ghost"
                                    size="icon"
                                    className="size-8"
                                    onClick={() => setViewClient(client)}
                                    title="View details"
                                  >
                                    <Eye className="size-4" />
                                  </Button>
                                ) : null}
                                {client.email ? (
                                  <EmailDialog defaultEmail={client.email} defaultName={client.name} />
                                ) : null}
                                <RowActionsMenu
                                  actions={clientActions(client)}
                                  label={`${client.name} actions`}
                                />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
              {total > 0 ? (
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3 border-t pt-3">
                  <ShowingCount rangeStart={rangeStart} rangeEnd={rangeEnd} total={total} noun="clients" />
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

          <div className="mt-6">
            <QuickLinks
              links={[
                {
                  key: 'sites',
                  title: 'Sites',
                  description: 'The places each client is billed for, and who covers them.',
                  icon: MapPin,
                  tone: 'neutral',
                  action: { label: 'Manage sites', href: '/sites' },
                },
                {
                  key: 'invoices',
                  title: 'Invoices',
                  description: 'Raise and chase invoices across every site a client owns.',
                  icon: FileText,
                  tone: 'positive',
                  action: { label: 'View invoices', href: '/invoices' },
                },
                {
                  key: 'requests',
                  title: 'Staff requests',
                  description: 'Cover requests raised by clients from their portal.',
                  icon: Users,
                  tone: 'info',
                  action: { label: 'View requests', href: '/requests' },
                },
              ]}
            />
          </div>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Client — {editingClient?.name}</DialogTitle>
            </DialogHeader>
            <ClientForm form={editForm} onSubmit={handleUpdate} isPending={updateClient.isPending} submitLabel="Save Changes" />
            {editingClient ? (
              // Its own control, saved separately from the client fields: a password change
              // takes effect immediately and must not ride along with an unsaved edit.
              <PortalLoginPanel
                kind="client"
                recordId={editingClient.id}
                load={api.clients.portalLogins}
                save={api.clients.setPortalLoginPassword}
              />
            ) : null}
          </DialogContent>
        </Dialog>

        <Dialog open={!!viewClient} onOpenChange={(o) => !o && setViewClient(null)}>
          {viewClient && <ClientDetailsDialog client={viewClient} />}
        </Dialog>

        <Dialog open={!!historyClient} onOpenChange={(o) => !o && setHistoryClient(null)}>
          {historyClient && (
            <RenewalHistoryDialog clientId={historyClient.id} clientName={historyClient.name} />
          )}
        </Dialog>

        <Dialog open={!!renewClient} onOpenChange={(o) => !o && setRenewClient(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>Renew contract — {renewClient?.name}</DialogTitle>
            </DialogHeader>
            <form
              className="space-y-4"
              onSubmit={renewForm.handleSubmit(handleRenew)}
            >
              {renewClient?.contract_end_date ? (
                <p className="text-sm text-muted-foreground">
                  Current end: <span className="font-medium text-foreground">{renewClient.contract_end_date}</span>. New date must be
                  after this.
                </p>
              ) : (
                <p className="text-sm text-muted-foreground">Set the contract end date (first renewal).</p>
              )}
              <div className="space-y-1">
                <Label>New contract end date <span className="text-destructive">*</span></Label>
                <Input type="date" {...renewForm.register('new_end_date')} />
                {renewForm.formState.errors.new_end_date && (
                  <p className="text-xs text-destructive">{renewForm.formState.errors.new_end_date.message}</p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Note (optional)</Label>
                <textarea
                  className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
                  {...renewForm.register('note')}
                />
              </div>
              <Button type="submit" className="w-full" disabled={renewContract.isPending}>
                {renewContract.isPending ? 'Saving…' : 'Record renewal'}
              </Button>
            </form>
          </DialogContent>
        </Dialog>

        <DeleteRecordDialog
          target={deleteTarget}
          onClose={() => setDeleteTarget(null)}
          noun="client"
          archiveHint="Its invoices, renewals and sites stay exactly as they are, and the sites keep pointing at it so a restore puts everything back."
          loadImpact={api.clients.deleteImpact}
          onArchive={(id) => deleteClient.mutateAsync({ id })}
          onDeletePermanently={(id) => deleteClient.mutateAsync({ id, permanent: true })}
          canArchive={canDeleteMod}
          canDeletePermanently={canDeleteMod}
        />
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
