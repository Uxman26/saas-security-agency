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
import { useSubContractors, useCreateSubContractor, useUpdateSubContractor, useDeleteSubContractor } from '@/hooks/use-sub-contractors';
import { subContractorSchema } from '@/lib/validation';
import type { SubContractor } from '@/lib/types';
import { EmailDialog } from '@/components/email-dialog';
import { UserCog, Pencil, Trash2 } from 'lucide-react';

type SubContractorFormData = Omit<SubContractor, 'id' | 'company_id' | 'created_at'>;

function SubContractorForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<SubContractorFormData>>;
  onSubmit: (data: SubContractorFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, formState: { errors } } = form;
  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="space-y-1 sm:col-span-2">
          <Label>Company / Contractor Name <span className="text-destructive">*</span></Label>
          <Input {...register('name')} placeholder="Smith Security Services Ltd" />
          {errors.name && <p className="text-xs text-destructive">{errors.name.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Email</Label>
          <Input type="email" {...register('email')} placeholder="contact@contractor.com" />
          {errors.email && <p className="text-xs text-destructive">{errors.email.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input {...register('phone')} placeholder="+44 20 0000 0000" />
          {errors.phone && <p className="text-xs text-destructive">{errors.phone.message}</p>}
        </div>
        <div className="space-y-1">
          <Label>Contact Person</Label>
          <Input {...register('contact_person')} placeholder="Jane Smith" />
        </div>
        <div className="space-y-1">
          <Label>License Number</Label>
          <Input {...register('license_number')} placeholder="SIA-LIC-0000" />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input {...register('address')} placeholder="123 Business Park, London" />
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

export default function SubContractorsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingSC, setEditingSC] = useState<SubContractor | null>(null);
  const [search, setSearch] = useState('');

  const { data: subContractors = [], isLoading, refetch, isRefetching } = useSubContractors();
  const createSubContractor = useCreateSubContractor();
  const updateSubContractor = useUpdateSubContractor();
  const deleteSubContractor = useDeleteSubContractor();

  const addForm = useForm<SubContractorFormData>({ resolver: zodResolver(subContractorSchema) });
  const editForm = useForm<SubContractorFormData>({ resolver: zodResolver(subContractorSchema) });

  const handleCreate = async (data: SubContractorFormData) => {
    try {
      await createSubContractor.mutateAsync(data);
      setAddOpen(false);
      addForm.reset();
    } catch (err) { console.error(err); }
  };

  const openEdit = (sc: SubContractor) => {
    setEditingSC(sc);
    editForm.reset({
      name: sc.name,
      email: sc.email ?? '',
      phone: sc.phone ?? '',
      address: sc.address ?? '',
      contact_person: sc.contact_person ?? '',
      license_number: sc.license_number ?? '',
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: SubContractorFormData) => {
    if (!editingSC) return;
    try {
      await updateSubContractor.mutateAsync({ id: editingSC.id, data });
      setEditOpen(false);
      setEditingSC(null);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this sub-contractor? This cannot be undone.')) return;
    try { await deleteSubContractor.mutateAsync(id); } catch (err) { console.error(err); }
  };

  const filtered = useMemo(() =>
    subContractors.filter(sc =>
      sc.name.toLowerCase().includes(search.toLowerCase()) ||
      (sc.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (sc.license_number ?? '').toLowerCase().includes(search.toLowerCase())
    ), [subContractors, search]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><UserCog className="size-7" /> Sub-Contractors</h1>
              <p className="text-muted-foreground mt-1">{subContractors.length} sub-contractor{subContractors.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button>Add Sub-Contractor</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Sub-Contractor</DialogTitle>
                  </DialogHeader>
                  <SubContractorForm form={addForm} onSubmit={handleCreate} isPending={createSubContractor.isPending} submitLabel="Create Sub-Contractor" />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Search by name, email or license number..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Sub-Contractors</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No sub-contractors match your search.' : 'No sub-contractors yet. Click "Add Sub-Contractor" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Contact Person</TableHead>
                        <TableHead>License Number</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((sc) => (
                        <TableRow key={sc.id}>
                          <TableCell className="font-medium whitespace-nowrap">{sc.name}</TableCell>
                          <TableCell>{sc.email || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{sc.phone || '-'}</TableCell>
                          <TableCell>{sc.contact_person || '-'}</TableCell>
                          <TableCell>{sc.license_number || '-'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{sc.address || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(sc)} title="Edit">
                                <Pencil className="size-4" />
                              </Button>
                              {sc.email && (
                                <EmailDialog defaultEmail={sc.email} defaultName={sc.name} />
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(sc.id)}
                                disabled={deleteSubContractor.isPending}
                                title="Delete"
                              >
                                <Trash2 className="size-4" />
                              </Button>
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
        </div>

        {/* Edit Dialog */}
        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Sub-Contractor — {editingSC?.name}</DialogTitle>
            </DialogHeader>
            <SubContractorForm form={editForm} onSubmit={handleUpdate} isPending={updateSubContractor.isPending} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
