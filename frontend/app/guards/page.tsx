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
import { useGuards, useCreateGuard, useDeleteGuard } from '@/hooks/use-guards';
import { guardSchema } from '@/lib/validation';
import type { Guard } from '@/lib/types';

export default function GuardsPage() {
  const [open, setOpen] = useState(false);
  const { data: guards = [], isLoading, refetch, isRefetching } = useGuards();
  const createGuard = useCreateGuard();
  const deleteGuard = useDeleteGuard();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<Guard, 'id' | 'company_id' | 'created_at'>>({
    resolver: zodResolver(guardSchema),
  });

  const handleCreate = async (data: Omit<Guard, 'id' | 'company_id' | 'created_at'>) => {
    try {
      await createGuard.mutateAsync(data);
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteGuard.mutateAsync(id);
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
            <h1 className="text-3xl font-bold">Guards</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Add Guard</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Guard</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Full Name</Label>
                    <Input {...register('full_name')} />
                    {errors.full_name && <p className="text-sm text-destructive">{errors.full_name.message}</p>}
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
                    <Label>Badge Number</Label>
                    <Input {...register('badge_number')} />
                  </div>
                  <div className="space-y-2">
                    <Label>License Number</Label>
                    <Input {...register('license_number')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input {...register('address')} />
                  </div>
                  <Button type="submit" className="w-full" disabled={createGuard.isPending}>
                    {createGuard.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All Guards</CardTitle>
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
                      <TableHead>Badge Number</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {guards.map((guard) => (
                      <TableRow key={guard.id}>
                        <TableCell>{guard.full_name}</TableCell>
                        <TableCell>{guard.email || '-'}</TableCell>
                        <TableCell>{guard.phone || '-'}</TableCell>
                        <TableCell>{guard.badge_number || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(guard.id)}
                            disabled={deleteGuard.isPending}
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
