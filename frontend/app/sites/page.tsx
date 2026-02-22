'use client';

import { useState, useEffect } from 'react';
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
import { useSites, useCreateSite, useDeleteSite } from '@/hooks/use-sites';
import { siteSchema, type SiteFormData } from '@/lib/validation';
import type { Client } from '@/lib/types';
import { api } from '@/lib/api';

export default function SitesPage() {
  const [open, setOpen] = useState(false);
  const [clients, setClients] = useState<Client[]>([]);
  const { data: sites = [], isLoading, refetch, isRefetching } = useSites();
  const createSite = useCreateSite();
  const deleteSite = useDeleteSite();

  useEffect(() => {
    api.clients.list().then(setClients).catch(() => {});
  }, []);

  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<SiteFormData>({
    resolver: zodResolver(siteSchema),
    defaultValues: { client_id: undefined, default_hourly_rate: undefined },
  });

  const handleCreate = async (data: SiteFormData) => {
    const payload = {
      ...data,
      client_id: data.client_id ?? undefined,
      default_hourly_rate: data.default_hourly_rate ?? undefined,
    };
    if (payload.client_id != null && Number.isNaN(Number(payload.client_id))) delete (payload as Record<string, unknown>).client_id;
    if (payload.default_hourly_rate != null && Number.isNaN(Number(payload.default_hourly_rate))) delete (payload as Record<string, unknown>).default_hourly_rate;
    try {
      await createSite.mutateAsync(payload);
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteSite.mutateAsync(id);
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
            <h1 className="text-3xl font-bold">Sites</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Add Site</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Site</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input {...register('name')} />
                    {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Client</Label>
                    <select className="w-full border rounded px-3 py-2" {...register('client_id', { valueAsNumber: true })}>
                      <option value="">None</option>
                      {clients.map((c) => (
                        <option key={c.id} value={c.id}>{c.name}</option>
                      ))}
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Default Hourly Rate (£)</Label>
                    <Input type="number" step="0.01" {...register('default_hourly_rate', { valueAsNumber: true })} />
                  </div>
                  <div className="space-y-2">
                    <Label>Address</Label>
                    <Input {...register('address')} />
                    {errors.address && <p className="text-sm text-destructive">{errors.address.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Person</Label>
                    <Input {...register('contact_person')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Contact Phone</Label>
                    <Input {...register('contact_phone')} />
                    {errors.contact_phone && <p className="text-sm text-destructive">{errors.contact_phone.message}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={createSite.isPending}>
                    {createSite.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Sites</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Client ID</TableHead>
                    <TableHead>Default Rate</TableHead>
                    <TableHead>Address</TableHead>
                    <TableHead>Contact</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {sites.map((site) => (
                    <TableRow key={site.id}>
                      <TableCell>{site.name}</TableCell>
                      <TableCell>{site.client_id ?? '-'}</TableCell>
                      <TableCell>{site.default_hourly_rate != null ? `£${site.default_hourly_rate}` : '-'}</TableCell>
                      <TableCell>{site.address || '-'}</TableCell>
                      <TableCell>{site.contact_person || site.contact_phone || '-'}</TableCell>
                      <TableCell>
                        <Button variant="destructive" size="sm" onClick={() => handleDelete(site.id)} disabled={deleteSite.isPending}>
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
