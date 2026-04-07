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
import { useGuards, useCreateGuard, useUpdateGuard, useDeleteGuard } from '@/hooks/use-guards';
import { useMainContractors } from '@/hooks/use-main-contractors';
import { useSubContractors } from '@/hooks/use-sub-contractors';
import { guardSchema } from '@/lib/validation';
import type { Guard } from '@/lib/types';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { EmailDialog } from '@/components/email-dialog';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import { formatDateUK } from '@/lib/date-format';
import { Pencil, Trash2, Users } from 'lucide-react';
import type { z } from 'zod';

type GuardFormData = z.infer<typeof guardSchema>;

function getSiaStatus(date?: string): 'expired' | 'critical' | 'warning' | 'ok' | null {
  if (!date) return null;
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  return 'ok';
}

function GuardForm({
  form,
  mains,
  subs,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<GuardFormData>>;
  mains: { id: number; name: string }[];
  subs: { id: number; name: string }[];
  onSubmit: (data: GuardFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, setValue, watch, formState: { errors } } = form;
  const mid = watch('main_contractor_id');
  const sid = watch('sub_contractor_id');
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2 rounded-md border border-border p-3 bg-muted/30">
          <p className="text-sm font-medium">Contractor <span className="text-destructive">*</span></p>
          <p className="text-xs text-muted-foreground mb-2">Choose a main contractor or a sub contractor.</p>
          <div className="grid sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Main contractor</Label>
              <Select
                value={mid != null && mid > 0 ? String(mid) : '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    setValue('main_contractor_id', undefined);
                    return;
                  }
                  setValue('main_contractor_id', parseInt(v, 10));
                  setValue('sub_contractor_id', undefined);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Main" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {mains.map((m) => (
                    <SelectItem key={m.id} value={String(m.id)}>{m.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label>Sub contractor</Label>
              <Select
                value={sid != null && sid > 0 ? String(sid) : '__none__'}
                onValueChange={(v) => {
                  if (v === '__none__') {
                    setValue('sub_contractor_id', undefined);
                    return;
                  }
                  setValue('sub_contractor_id', parseInt(v, 10));
                  setValue('main_contractor_id', undefined);
                }}
              >
                <SelectTrigger><SelectValue placeholder="Sub" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">— None —</SelectItem>
                  {subs.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          {errors.main_contractor_id && <p className="text-xs text-destructive">{errors.main_contractor_id.message}</p>}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Full Name <span className="text-destructive">*</span></Label>
          <Input {...register('full_name')} placeholder="John Smith" />
          {errors.full_name && <p className="text-xs text-destructive">{errors.full_name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" {...register('email')} placeholder="guard@example.com" />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input {...register('phone')} placeholder="+44 7700 000000" />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Badge Number</Label>
          <Input {...register('badge_number')} placeholder="BADGE-001" />
        </div>
        <div className="space-y-1">
          <Label>License Number</Label>
          <Input {...register('license_number')} placeholder="LIC-001" />
        </div>
        <div className="space-y-1">
          <Label>SIA Number</Label>
          <Input {...register('sia_number')} placeholder="SIA-0000-0000" />
        </div>
        <div className="space-y-1">
          <Label>SIA Expiry Date</Label>
          <Input type="date" {...register('sia_expiry_date')} />
        </div>
        <div className="space-y-1">
          <Label>Visa Status</Label>
          <Input {...register('visa_status')} placeholder="e.g. Valid, Expired, N/A" />
        </div>
        <div className="space-y-1">
          <Label>RTW Status</Label>
          <Input {...register('rtw_status')} placeholder="Right to Work status" />
        </div>
        <div className="space-y-1">
          <Label>DBS check</Label>
          <Input {...register('dbs_status')} placeholder="e.g. Clear, Pending, N/A" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input {...register('address')} placeholder="123 High Street, London" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Employment History (5 years)</Label>
          <Input {...register('employment_history')} placeholder="Brief employment summary" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

export default function GuardsPage() {
  const { user } = useAuth();
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingGuard, setEditingGuard] = useState<Guard | null>(null);
  const [search, setSearch] = useState('');

  const { data: guards = [], isLoading, refetch, isRefetching } = useGuards();
  const { data: mains = [] } = useMainContractors();
  const { data: subs = [] } = useSubContractors();
  const createGuard = useCreateGuard();
  const updateGuard = useUpdateGuard();
  const deleteGuard = useDeleteGuard();

  const addForm = useForm<GuardFormData>({
    resolver: zodResolver(guardSchema),
    defaultValues: {
      sia_expiry_date: '',
      employment_history: '',
      visa_status: '',
      rtw_status: '',
      dbs_status: '',
    },
  });

  const editForm = useForm<GuardFormData>({ resolver: zodResolver(guardSchema) });

  const contractorLabel = useMemo(() => {
    const mm = new Map(mains.map((m) => [m.id, m.name]));
    const sm = new Map(subs.map((s) => [s.id, s.name]));
    return (g: Guard) => {
      if (g.sub_contractor_id) return sm.get(g.sub_contractor_id) ?? `Sub #${g.sub_contractor_id}`;
      if (g.main_contractor_id) return mm.get(g.main_contractor_id) ?? `Main #${g.main_contractor_id}`;
      return '—';
    };
  }, [mains, subs]);

  const handleCreate = async (data: GuardFormData) => {
    try {
      await createGuard.mutateAsync(data);
      setAddOpen(false);
      addForm.reset();
    } catch (err) { console.error(err); }
  };

  const openEdit = (guard: Guard) => {
    setEditingGuard(guard);
    editForm.reset({
      full_name: guard.full_name,
      email: guard.email ?? '',
      phone: guard.phone ?? '',
      badge_number: guard.badge_number ?? '',
      license_number: guard.license_number ?? '',
      sia_number: guard.sia_number ?? '',
      sia_expiry_date: guard.sia_expiry_date ?? '',
      visa_status: guard.visa_status ?? '',
      rtw_status: guard.rtw_status ?? '',
      employment_history: guard.employment_history ?? '',
      address: guard.address ?? '',
      dbs_status: guard.dbs_status ?? '',
      main_contractor_id: guard.main_contractor_id ?? undefined,
      sub_contractor_id: guard.sub_contractor_id ?? undefined,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: GuardFormData) => {
    if (!editingGuard) return;
    try {
      await updateGuard.mutateAsync({ id: editingGuard.id, data });
      setEditOpen(false);
      setEditingGuard(null);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this guard? This cannot be undone.')) return;
    try { await deleteGuard.mutateAsync(id); } catch (err) { console.error(err); }
  };

  const filtered = useMemo(() =>
    guards.filter(g =>
      g.full_name.toLowerCase().includes(search.toLowerCase()) ||
      (g.badge_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (g.sia_number ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (g.email ?? '').toLowerCase().includes(search.toLowerCase())
    ), [guards, search]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><Users className="size-7" /> Guards</h1>
              <p className="text-muted-foreground mt-1">{guards.length} guard{guards.length !== 1 ? 's' : ''} registered</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button disabled={!can(user, 'guards.write')}>Add Guard</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Guard</DialogTitle>
                  </DialogHeader>
                  <GuardForm form={addForm} mains={mains} subs={subs} onSubmit={handleCreate} isPending={createGuard.isPending} submitLabel="Create Guard" />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Search by name, email, badge or SIA number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          {(mains.length === 0 && subs.length === 0) && (
            <div className="mb-4 rounded-md border border-amber-500/50 bg-amber-50/50 dark:bg-amber-950/20 px-4 py-3 text-sm text-amber-900 dark:text-amber-200">
              Add a main or sub contractor under Contractors before you can link guards.
            </div>
          )}

          <Card>
            <CardHeader>
              <CardTitle>All Guards</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading guards...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No guards match your search.' : 'No guards yet. Click "Add Guard" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Contractor</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Badge</TableHead>
                        <TableHead>SIA Number</TableHead>
                        <TableHead>SIA Expiry</TableHead>
                        <TableHead>RTW</TableHead>
                        <TableHead>Visa</TableHead>
                        <TableHead>DBS</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((guard) => {
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
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Guard — {editingGuard?.full_name}</DialogTitle>
            </DialogHeader>
            <GuardForm form={editForm} mains={mains} subs={subs} onSubmit={handleUpdate} isPending={updateGuard.isPending} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
