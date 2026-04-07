'use client';

import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useMainContractors, useCreateMainContractor, useUpdateMainContractor, useDeleteMainContractor } from '@/hooks/use-main-contractors';
import { useSubContractors, useCreateSubContractor, useUpdateSubContractor, useDeleteSubContractor } from '@/hooks/use-sub-contractors';
import { mainContractorSchema, subContractorSchema } from '@/lib/validation';
import type { MainContractor, SubContractor } from '@/lib/types';
import { EmailDialog } from '@/components/email-dialog';
import { Building2, Network, Pencil, Trash2 } from 'lucide-react';
import { z } from 'zod';

type MainForm = z.infer<typeof mainContractorSchema>;
type SubForm = z.infer<typeof subContractorSchema>;

const emptyMainDefaults = (): MainForm => ({
  name: '',
  status: 'active',
  contact_person: '',
  phone: '',
  email: '',
  address: '',
  registration_number: '',
  contract_start_date: '',
  contract_end_date: '',
});

const emptySubDefaults = (mainId: number): SubForm => ({
  ...emptyMainDefaults(),
  main_contractor_id: mainId,
});

function MainFormWrapper({
  form,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<MainForm>>;
  onSubmit: (data: MainForm) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const st = watch('status');
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Company name <span className="text-destructive">*</span></Label>
          <Input {...register('name')} placeholder="Acme Security Ltd" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact person</Label>
          <Input {...register('contact_person')} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input {...register('phone')} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Registration number</Label>
          <Input {...register('registration_number')} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input {...register('address')} />
        </div>
        <div className="space-y-1">
          <Label>Contract start</Label>
          <Input type="date" {...register('contract_start_date')} />
        </div>
        <div className="space-y-1">
          <Label>Contract end</Label>
          <Input type="date" {...register('contract_end_date')} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={st} onValueChange={(v) => setValue('status', v as 'active' | 'inactive')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>{isPending ? 'Saving...' : submitLabel}</Button>
    </form>
  );
}

function SubFormWrapper({
  form,
  mains,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<SubForm>>;
  mains: MainContractor[];
  onSubmit: (data: SubForm) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const st = watch('status');
  const mid = watch('main_contractor_id');
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Parent main contractor <span className="text-destructive">*</span></Label>
          <Select value={mid?.toString() || ''} onValueChange={(v) => setValue('main_contractor_id', parseInt(v, 10))}>
            <SelectTrigger><SelectValue placeholder="Select main contractor" /></SelectTrigger>
            <SelectContent>
              {mains.map((m) => (
                <SelectItem key={m.id} value={m.id.toString()}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.main_contractor_id && <p className="text-xs text-destructive">{errors.main_contractor_id.message}</p>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Company name <span className="text-destructive">*</span></Label>
          <Input {...register('name')} />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact person</Label>
          <Input {...register('contact_person')} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input {...register('phone')} />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" {...register('email')} />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Registration number</Label>
          <Input {...register('registration_number')} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input {...register('address')} />
        </div>
        <div className="space-y-1">
          <Label>Contract start</Label>
          <Input type="date" {...register('contract_start_date')} />
        </div>
        <div className="space-y-1">
          <Label>Contract end</Label>
          <Input type="date" {...register('contract_end_date')} />
        </div>
        <div className="space-y-1">
          <Label>Status</Label>
          <Select value={st} onValueChange={(v) => setValue('status', v as 'active' | 'inactive')}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending || mains.length === 0}>{isPending ? 'Saving...' : submitLabel}</Button>
    </form>
  );
}

export default function ContractorsPage() {
  const [mainOpen, setMainOpen] = useState(false);
  const [mainEditOpen, setMainEditOpen] = useState(false);
  const [editingMain, setEditingMain] = useState<MainContractor | null>(null);
  const [subOpen, setSubOpen] = useState(false);
  const [subEditOpen, setSubEditOpen] = useState(false);
  const [editingSub, setEditingSub] = useState<SubContractor | null>(null);
  const [searchMain, setSearchMain] = useState('');
  const [searchSub, setSearchSub] = useState('');

  const { data: mains = [], isLoading: loadMain, refetch: refMain, isRefetching: refetchingMain } = useMainContractors();
  const { data: subs = [], isLoading: loadSub, refetch: refSub, isRefetching: refetchingSub } = useSubContractors();
  const createMain = useCreateMainContractor();
  const updateMain = useUpdateMainContractor();
  const deleteMain = useDeleteMainContractor();
  const createSub = useCreateSubContractor();
  const updateSub = useUpdateSubContractor();
  const deleteSub = useDeleteSubContractor();

  const mainMap = useMemo(() => new Map(mains.map((m) => [m.id, m.name])), [mains]);

  const addMainForm = useForm<MainForm>({
    resolver: zodResolver(mainContractorSchema),
    defaultValues: emptyMainDefaults(),
  });
  const editMainForm = useForm<MainForm>({ resolver: zodResolver(mainContractorSchema) });

  const addSubForm = useForm<SubForm>({
    resolver: zodResolver(subContractorSchema),
    defaultValues: emptySubDefaults(1),
  });
  const editSubForm = useForm<SubForm>({ resolver: zodResolver(subContractorSchema) });

  const toMainPayload = (d: MainForm) => ({
    name: d.name,
    contact_person: d.contact_person || undefined,
    phone: d.phone || undefined,
    email: d.email || undefined,
    address: d.address || undefined,
    registration_number: d.registration_number || undefined,
    contract_start_date: d.contract_start_date || undefined,
    contract_end_date: d.contract_end_date || undefined,
    status: d.status,
  });

  const toSubPayload = (d: SubForm) => ({
    main_contractor_id: d.main_contractor_id,
    name: d.name,
    contact_person: d.contact_person || undefined,
    phone: d.phone || undefined,
    email: d.email || undefined,
    address: d.address || undefined,
    registration_number: d.registration_number || undefined,
    contract_start_date: d.contract_start_date || undefined,
    contract_end_date: d.contract_end_date || undefined,
    status: d.status,
  });

  const handleCreateMain = async (d: MainForm) => {
    try {
      await createMain.mutateAsync(toMainPayload(d));
      setMainOpen(false);
      addMainForm.reset(emptyMainDefaults());
    } catch (e) { console.error(e); }
  };

  const openEditMain = (m: MainContractor) => {
    setEditingMain(m);
    editMainForm.reset({
      name: m.name,
      contact_person: m.contact_person ?? '',
      phone: m.phone ?? '',
      email: m.email ?? '',
      address: m.address ?? '',
      registration_number: m.registration_number ?? '',
      contract_start_date: m.contract_start_date ?? '',
      contract_end_date: m.contract_end_date ?? '',
      status: (m.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    });
    setMainEditOpen(true);
  };

  const handleUpdateMain = async (d: MainForm) => {
    if (!editingMain) return;
    try {
      await updateMain.mutateAsync({ id: editingMain.id, data: toMainPayload(d) });
      setMainEditOpen(false);
      setEditingMain(null);
    } catch (e) { console.error(e); }
  };

  const handleCreateSub = async (d: SubForm) => {
    try {
      await createSub.mutateAsync(toSubPayload(d));
      setSubOpen(false);
      if (mains[0]) addSubForm.reset(emptySubDefaults(mains[0].id));
    } catch (e) { console.error(e); }
  };

  const openEditSub = (s: SubContractor) => {
    setEditingSub(s);
    const mid = s.main_contractor_id && s.main_contractor_id > 0 ? s.main_contractor_id : (mains[0]?.id ?? 1);
    editSubForm.reset({
      main_contractor_id: mid,
      name: s.name,
      contact_person: s.contact_person ?? '',
      phone: s.phone ?? '',
      email: s.email ?? '',
      address: s.address ?? '',
      registration_number: s.registration_number ?? s.license_number ?? '',
      contract_start_date: s.contract_start_date ?? '',
      contract_end_date: s.contract_end_date ?? '',
      status: (s.status === 'inactive' ? 'inactive' : 'active') as 'active' | 'inactive',
    });
    setSubEditOpen(true);
  };

  const handleUpdateSub = async (d: SubForm) => {
    if (!editingSub) return;
    try {
      await updateSub.mutateAsync({ id: editingSub.id, data: toSubPayload(d) });
      setSubEditOpen(false);
      setEditingSub(null);
    } catch (e) { console.error(e); }
  };

  const filteredMains = useMemo(() =>
    mains.filter((m) =>
      m.name.toLowerCase().includes(searchMain.toLowerCase()) ||
      (m.registration_number ?? '').toLowerCase().includes(searchMain.toLowerCase())
    ), [mains, searchMain]);

  const filteredSubs = useMemo(() =>
    subs.filter((s) =>
      s.name.toLowerCase().includes(searchSub.toLowerCase()) ||
      (mainMap.get(s.main_contractor_id ?? 0) ?? '').toLowerCase().includes(searchSub.toLowerCase())
    ), [subs, searchSub, mainMap]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8 space-y-10">
          <div className="flex flex-col sm:flex-row justify-between items-start gap-4">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><Network className="size-7" /> Contractors</h1>
              <p className="text-muted-foreground mt-1">Main contractors and sub contractors (linked to a parent main).</p>
            </div>
            <Button variant="outline" onClick={() => { refMain(); refSub(); }} disabled={refetchingMain || refetchingSub}>
              Refresh all
            </Button>
          </div>

          <section>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2"><Building2 className="size-5" /> Main contractors</h2>
              <Dialog open={mainOpen} onOpenChange={setMainOpen}>
                <DialogTrigger asChild>
                  <Button>Add main contractor</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Onboard main contractor</DialogTitle></DialogHeader>
                  <MainFormWrapper form={addMainForm} onSubmit={handleCreateMain} isPending={createMain.isPending} submitLabel="Create" />
                </DialogContent>
              </Dialog>
            </div>
            <Input placeholder="Search mains..." value={searchMain} onChange={(e) => setSearchMain(e.target.value)} className="max-w-md mb-4" />
            <Card>
              <CardHeader><CardTitle>Main contractors ({mains.length})</CardTitle></CardHeader>
              <CardContent>
                {loadMain ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredMains.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No main contractors yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Reg. no.</TableHead>
                          <TableHead>Contract</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredMains.map((m) => (
                          <TableRow key={m.id}>
                            <TableCell className="font-medium whitespace-nowrap">{m.name}</TableCell>
                            <TableCell>{m.contact_person || '-'}</TableCell>
                            <TableCell>{m.phone || '-'}</TableCell>
                            <TableCell>{m.email || '-'}</TableCell>
                            <TableCell>{m.registration_number || '-'}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {m.contract_start_date || '—'} → {m.contract_end_date || '—'}
                            </TableCell>
                            <TableCell>
                              <span className={m.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}>{m.status}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditMain(m)}><Pencil className="size-4" /></Button>
                                {m.email && <EmailDialog defaultEmail={m.email} defaultName={m.name} />}
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm('Delete this main contractor?')) deleteMain.mutate(m.id); }} disabled={deleteMain.isPending}><Trash2 className="size-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>

          <section>
            <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-4">
              <h2 className="text-xl font-semibold flex items-center gap-2"><Network className="size-5" /> Sub contractors</h2>
              <Dialog open={subOpen} onOpenChange={(o) => {
                setSubOpen(o);
                if (o && mains[0]) addSubForm.reset(emptySubDefaults(mains[0].id));
              }}>
                <DialogTrigger asChild>
                  <Button disabled={mains.length === 0}>Add sub contractor</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader><DialogTitle>Onboard sub contractor</DialogTitle></DialogHeader>
                  <SubFormWrapper form={addSubForm} mains={mains} onSubmit={handleCreateSub} isPending={createSub.isPending} submitLabel="Create" />
                </DialogContent>
              </Dialog>
            </div>
            {mains.length === 0 && (
              <p className="text-sm text-amber-700 dark:text-amber-400 mb-4 border border-amber-500/40 rounded-md p-3 bg-amber-50/50 dark:bg-amber-950/20">Add at least one main contractor before creating sub contractors.</p>
            )}
            <Input placeholder="Search subs..." value={searchSub} onChange={(e) => setSearchSub(e.target.value)} className="max-w-md mb-4" />
            <Card>
              <CardHeader><CardTitle>Sub contractors ({subs.length})</CardTitle></CardHeader>
              <CardContent>
                {loadSub ? (
                  <div className="text-center py-8 text-muted-foreground">Loading...</div>
                ) : filteredSubs.length === 0 ? (
                  <div className="text-center py-12 text-muted-foreground">No sub contractors yet.</div>
                ) : (
                  <div className="overflow-x-auto">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Main</TableHead>
                          <TableHead>Name</TableHead>
                          <TableHead>Contact</TableHead>
                          <TableHead>Phone</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Reg. no.</TableHead>
                          <TableHead>Contract</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead>Actions</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {filteredSubs.map((s) => (
                          <TableRow key={s.id}>
                            <TableCell className="text-sm">{mainMap.get(s.main_contractor_id ?? 0) ?? '—'}</TableCell>
                            <TableCell className="font-medium whitespace-nowrap">{s.name}</TableCell>
                            <TableCell>{s.contact_person || '-'}</TableCell>
                            <TableCell>{s.phone || '-'}</TableCell>
                            <TableCell>{s.email || '-'}</TableCell>
                            <TableCell>{s.registration_number || s.license_number || '-'}</TableCell>
                            <TableCell className="text-xs whitespace-nowrap">
                              {s.contract_start_date || '—'} → {s.contract_end_date || '—'}
                            </TableCell>
                            <TableCell>
                              <span className={s.status === 'active' ? 'text-green-600' : 'text-muted-foreground'}>{s.status}</span>
                            </TableCell>
                            <TableCell>
                              <div className="flex gap-1">
                                <Button variant="ghost" size="sm" onClick={() => openEditSub(s)}><Pencil className="size-4" /></Button>
                                {s.email && <EmailDialog defaultEmail={s.email} defaultName={s.name} />}
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => { if (confirm('Delete?')) deleteSub.mutate(s.id); }} disabled={deleteSub.isPending}><Trash2 className="size-4" /></Button>
                              </div>
                            </TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                )}
              </CardContent>
            </Card>
          </section>
        </div>

        <Dialog open={mainEditOpen} onOpenChange={setMainEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit main — {editingMain?.name}</DialogTitle></DialogHeader>
            <MainFormWrapper form={editMainForm} onSubmit={handleUpdateMain} isPending={updateMain.isPending} submitLabel="Save" />
          </DialogContent>
        </Dialog>

        <Dialog open={subEditOpen} onOpenChange={setSubEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader><DialogTitle>Edit sub — {editingSub?.name}</DialogTitle></DialogHeader>
            <SubFormWrapper form={editSubForm} mains={mains} onSubmit={handleUpdateSub} isPending={updateSub.isPending} submitLabel="Save" />
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
