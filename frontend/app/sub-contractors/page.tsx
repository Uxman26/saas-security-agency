'use client';

import { useState } from 'react';
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
import { useSubContractors, useCreateSubContractor, useDeleteSubContractor } from '@/hooks/use-sub-contractors';
import { subContractorSchema } from '@/lib/validation';
import type { SubContractor } from '@/lib/types';

export default function SubContractorsPage() {
  const [open, setOpen] = useState(false);
  const { data: subContractors = [], isLoading, refetch, isRefetching } = useSubContractors();
  const createSubContractor = useCreateSubContractor();
  const deleteSubContractor = useDeleteSubContractor();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<SubContractor, 'id' | 'company_id' | 'created_at'>>({
    resolver: zodResolver(subContractorSchema),
  });

  const handleCreate = async (data: Omit<SubContractor, 'id' | 'company_id' | 'created_at'>) => {
    try {
      await createSubContractor.mutateAsync(data);
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteSubContractor.mutateAsync(id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Sub-Contractors</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>Add Sub-Contractor</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Sub-Contractor</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
                    <div className="space-y-2">
                      <Label>Name</Label>
                      <Input {...register('name')} />
                      {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Email</Label>
                      <Input type="email" {...register('email')} />
                      {errors.email && <p className="text-sm text-destructive">{errors.email.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Phone</Label>
                      <Input {...register('phone')} />
                      {errors.phone && <p className="text-sm text-destructive">{errors.phone.message}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label>Address</Label>
                      <Input {...register('address')} />
                    </div>
                    <div className="space-y-2">
                      <Label>Contact Person</Label>
                      <Input {...register('contact_person')} />
                    </div>
                    <div className="space-y-2">
                      <Label>License Number</Label>
                      <Input {...register('license_number')} />
                    </div>
                    <Button type="submit" className="w-full" disabled={createSubContractor.isPending}>
                      {createSubContractor.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All Sub-Contractors</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Phone</TableHead>
                      <TableHead>Contact Person</TableHead>
                      <TableHead>License Number</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {subContractors.map((subContractor) => (
                      <TableRow key={subContractor.id}>
                        <TableCell>{subContractor.name}</TableCell>
                        <TableCell>{subContractor.email || '-'}</TableCell>
                        <TableCell>{subContractor.phone || '-'}</TableCell>
                        <TableCell>{subContractor.contact_person || '-'}</TableCell>
                        <TableCell>{subContractor.license_number || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(subContractor.id)}
                            disabled={deleteSubContractor.isPending}
                          >
                            Delete
                          </Button>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
