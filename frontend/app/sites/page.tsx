'use client';

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
import { Label } from '@/components/ui/label';
import Link from 'next/link';
import { useSites, useCreateSite, useUpdateSite, useDeleteSite } from '@/hooks/use-sites';
import { useDirectoryContractorsList } from '@/hooks/use-directory-contractors';
import { useMainContractors } from '@/hooks/use-main-contractors';
import { useSubContractors } from '@/hooks/use-sub-contractors';
import { siteSchema, type SiteFormData } from '@/lib/validation';
import type { Client, Site } from '@/lib/types';
import { api } from '@/lib/api';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { MapPin, Pencil, Trash2 } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

function SiteForm({
  form,
  clients,
  mains,
  subs,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<SiteFormData>>;
  clients: Client[];
  mains: { id: string; name: string }[];
  subs: { id: string; name: string }[];
  onSubmit: (data: SiteFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const cid = watch('contractor_id');
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2 rounded-md border border-border p-3 bg-muted/30">
          <p className="text-sm font-medium">Contractor <span className="text-destructive">*</span></p>
          <p className="text-xs text-muted-foreground mb-2">Choose a main contractor or a sub contractor from your directory.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Main contractor</Label>
              <Select
                value={cid && mains.some((m) => m.id === cid) ? cid : '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    if (mains.some((m) => m.id === cid)) {
                      setValue('contractor_id', undefined);
                    }
                    return;
                  }
                  setValue('contractor_id', v);
                  setValue('main_contractor_id', undefined);
                  setValue('sub_contractor_id', undefined);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Main" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {mains.map((m) => (
                    <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sub contractor</Label>
              <Select
                value={cid && subs.some((s) => s.id === cid) ? cid : '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    if (subs.some((s) => s.id === cid)) {
                      setValue('contractor_id', undefined);
                    }
                    return;
                  }
                  setValue('contractor_id', v);
                  setValue('main_contractor_id', undefined);
                  setValue('sub_contractor_id', undefined);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Sub" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {subs.map((s) => (
                    <SelectItem key={s.id} value={s.id}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {errors.main_contractor_id && <p className="text-xs text-destructive">{errors.main_contractor_id.message}</p>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Site Name <span className="text-destructive">*</span></Label>
          <Input {...register('name')} placeholder="City Centre Office" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Client</Label>
          <select
            className="w-full border rounded-md px-3 py-2 bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring"
            {...register('client_id', { valueAsNumber: true })}
          >
            <option value="">— None —</option>
            {clients.map((c) => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label>Default Hourly Rate (£)</Label>
          <Input type="number" step="0.01" min="0" {...register('default_hourly_rate', { valueAsNumber: true })} placeholder="12.50" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input {...register('address')} placeholder="123 High Street, London" />
          {errors.address && <p className="text-xs text-destructive">{errors.address.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact Person</Label>
          <Input {...register('contact_person')} placeholder="John Smith" />
        </div>
        <div className="space-y-1">
          <Label>Contact Phone</Label>
          <Input {...register('contact_phone')} placeholder="+44 20 0000 0000" />
          {errors.contact_phone && <p className="text-xs text-destructive">{errors.contact_phone.message}</p>}
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

export default function SitesPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSite, setEditingSite] = useState<Site | null>(null);
  const [clients, setClients] = useState<Client[]>([]);
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const { data: sites = [], isLoading, refetch, isRefetching } = useSites();
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
  const createSite = useCreateSite();
  const updateSite = useUpdateSite();
  const deleteSite = useDeleteSite();

  useEffect(() => { api.clients.list().then(setClients).catch(() => {}); }, []);

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const contractorLabel = useMemo(() => {
    const dirNames = new Map(dirRows.map((c) => [c.id, c.name]));
    const mm = new Map(legMains.map((m) => [m.id, m.name]));
    const sm = new Map(legSubs.map((s) => [s.id, s.name]));
    return (site: Site) => {
      if (site.contractor_id) return dirNames.get(site.contractor_id) ?? 'Contractor';
      if (site.sub_contractor_id) return sm.get(site.sub_contractor_id) ?? `Sub #${site.sub_contractor_id}`;
      if (site.main_contractor_id) return mm.get(site.main_contractor_id) ?? `Main #${site.main_contractor_id}`;
      return '—';
    };
  }, [dirRows, legMains, legSubs]);

  const addForm = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema) as Resolver<SiteFormData>,
    defaultValues: { client_id: undefined, default_hourly_rate: undefined, contractor_id: undefined },
  });

  const editForm = useForm<SiteFormData>({ resolver: zodResolver(siteSchema) as Resolver<SiteFormData> });

  const sanitize = (data: SiteFormData): Omit<Site, 'id' | 'company_id' | 'created_at'> => {
    const o: Omit<Site, 'id' | 'company_id' | 'created_at'> = {
      name: data.name,
      address: data.address,
      contact_person: data.contact_person,
      contact_phone: data.contact_phone,
    };
    const cid = data.client_id;
    if (cid != null && !Number.isNaN(Number(cid))) o.client_id = cid;
    const rate = data.default_hourly_rate;
    if (rate != null && !Number.isNaN(Number(rate))) o.default_hourly_rate = rate;
    if (data.contractor_id) {
      o.contractor_id = data.contractor_id;
      o.main_contractor_id = null;
      o.sub_contractor_id = null;
    } else if (data.main_contractor_id) {
      o.main_contractor_id = data.main_contractor_id;
      o.sub_contractor_id = null;
      o.contractor_id = null;
    } else if (data.sub_contractor_id) {
      o.sub_contractor_id = data.sub_contractor_id;
      o.main_contractor_id = null;
      o.contractor_id = null;
    }
    return o;
  };

  const handleCreate = async (data: SiteFormData) => {
    try {
      await createSite.mutateAsync(sanitize(data));
      setAddOpen(false);
      addForm.reset();
    } catch (err) { console.error(err); }
  };

  const openEdit = (site: Site) => {
    setEditingSite(site);
    editForm.reset({
      name: site.name,
      client_id: site.client_id ?? undefined,
      default_hourly_rate: site.default_hourly_rate ?? undefined,
      address: site.address ?? '',
      contact_person: site.contact_person ?? '',
      contact_phone: site.contact_phone ?? '',
      main_contractor_id: site.main_contractor_id ?? undefined,
      sub_contractor_id: site.sub_contractor_id ?? undefined,
      contractor_id: site.contractor_id ?? undefined,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: SiteFormData) => {
    if (!editingSite) return;
    try {
      await updateSite.mutateAsync({ id: editingSite.id, data: sanitize(data) });
      setEditOpen(false);
      setEditingSite(null);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this site? This cannot be undone.')) return;
    try { await deleteSite.mutateAsync(id); } catch (err) { console.error(err); }
  };

  const getSearchText = useCallback(
    (s: Site) =>
      [s.name, s.address, clientMap.get(s.client_id ?? 0), contractorLabel(s), s.contact_person, s.contact_phone, String(s.default_hourly_rate ?? '')]
        .filter(Boolean)
        .join(' '),
    [clientMap, contractorLabel]
  );

  const getSortValue = useCallback(
    (s: Site, key: string) => {
      switch (key) {
        case 'name':
          return s.name;
        case 'contractor':
          return contractorLabel(s);
        case 'client':
          return clientMap.get(s.client_id ?? 0) ?? '';
        case 'rate':
          return s.default_hourly_rate ?? 0;
        case 'address':
          return s.address || '';
        case 'contact_person':
          return s.contact_person || '';
        case 'contact_phone':
          return s.contact_phone || '';
        default:
          return '';
      }
    },
    [clientMap, contractorLabel]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    sites,
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
              <h1 className="text-3xl font-bold flex items-center gap-2"><MapPin className="size-7" /> Sites</h1>
              <p className="text-muted-foreground mt-1">{sites.length} site{sites.length !== 1 ? 's' : ''} configured</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button>Add Site</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Site</DialogTitle>
                  </DialogHeader>
                  <SiteForm form={addForm} clients={clients} mains={mains} subs={subs} onSubmit={handleCreate} isPending={createSite.isPending} submitLabel="Create Site" />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Search by site name, client or address..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          {(mains.length === 0 && subs.length === 0) && (
            <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Add at least one main or sub contractor on the{' '}
              <Link href="/contractors" className="font-medium underline">Contractors</Link> page before you can link sites.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Sites</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading sites...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No sites match your search.' : 'No sites yet. Click "Add Site" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Site Name" colKey="name" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Contractor" colKey="contractor" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Client" colKey="client" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Default Rate" colKey="rate" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Address" colKey="address" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Contact Person" colKey="contact_person" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Contact Phone" colKey="contact_phone" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((site) => (
                        <TableRow key={site.id}>
                          <TableCell className="font-medium whitespace-nowrap">{site.name}</TableCell>
                          <TableCell className="text-sm max-w-[160px] truncate" title={contractorLabel(site)}>{contractorLabel(site)}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {site.client_id ? (
                              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary/10 text-primary">
                                {clientMap.get(site.client_id) ?? `Client #${site.client_id}`}
                              </span>
                            ) : '-'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap font-medium">
                            {site.default_hourly_rate != null ? `£${Number(site.default_hourly_rate).toFixed(2)}/hr` : '-'}
                          </TableCell>
                          <TableCell className="max-w-[200px] truncate">{site.address || '-'}</TableCell>
                          <TableCell>{site.contact_person || '-'}</TableCell>
                          <TableCell>{site.contact_phone || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(site)} title="Edit site">
                                <Pencil className="size-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(site.id)}
                                disabled={deleteSite.isPending}
                                title="Delete site"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </div>
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Site — {editingSite?.name}</DialogTitle>
            </DialogHeader>
            <SiteForm form={editForm} clients={clients} mains={mains} subs={subs} onSubmit={handleUpdate} isPending={updateSite.isPending} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
