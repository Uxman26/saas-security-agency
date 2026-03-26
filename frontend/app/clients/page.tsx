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
import { useClients, useCreateClient, useDeleteClient } from '@/hooks/use-clients';
import { clientSchema } from '@/lib/validation';
import type { Client } from '@/lib/types';

export default function ClientsPage() {
  const [open, setOpen] = useState(false);
  const { data: clients = [], isLoading, refetch, isRefetching } = useClients();
  const createClient = useCreateClient();
  const deleteClient = useDeleteClient();

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<Omit<Client, 'id' | 'company_id' | 'created_at'>>({
    resolver: zodResolver(clientSchema),
  });

  const handleCreate = async (data: Omit<Client, 'id' | 'company_id' | 'created_at'>) => {
    try {
      await createClient.mutateAsync(data);
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteClient.mutateAsync(id);
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
            <h1 className="text-3xl font-bold">Clients</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
                <DialogTrigger asChild>
                  <Button>Add Client</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Client</DialogTitle>
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
                    <Button type="submit" className="w-full" disabled={createClient.isPending}>
                      {createClient.isPending ? 'Creating...' : 'Create'}
                    </Button>
                  </form>
                </DialogContent>
              </Dialog>
            </div>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All Clients</CardTitle>
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
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {clients.map((client) => (
                      <TableRow key={client.id}>
                        <TableCell>{client.name}</TableCell>
                        <TableCell>{client.email || '-'}</TableCell>
                        <TableCell>{client.phone || '-'}</TableCell>
                        <TableCell>{client.contact_person || '-'}</TableCell>
                        <TableCell>
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleDelete(client.id)}
                            disabled={deleteClient.isPending}
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
