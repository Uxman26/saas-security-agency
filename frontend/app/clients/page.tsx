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
import { useClients, useCreateClient, useUpdateClient, useDeleteClient } from '@/hooks/use-clients';
import { clientSchema } from '@/lib/validation';
import type { Client } from '@/lib/types';
import { EmailDialog } from '@/components/email-dialog';
import { Building2, Pencil, Trash2 } from 'lucide-react';

type ClientFormData = Omit<Client, 'id' | 'company_id' | 'created_at'>;

function ClientForm({
  form,
  onSubmit,
  isPending,
  submitLabel,
}: {
  form: ReturnType<typeof useForm<ClientFormData>>;
  onSubmit: (data: ClientFormData) => void;
  isPending: boolean;
  submitLabel: string;
}) {
  const { register, handleSubmit, formState: { errors } } = form;
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
        <div className="space-y-1 sm:col-span-2 flex items-center gap-2 pt-1">
          <input type="checkbox" id="drsd" className="size-4 accent-primary" {...register('double_rate_special_days')} />
          <Label htmlFor="drsd" className="font-normal cursor-pointer">
            Double billing rate on bank holidays & special days (when defined in Settings)
          </Label>
        </div>
      </div>
      <Button type="submit" className="w-full" disabled={isPending}>
        {isPending ? 'Saving...' : submitLabel}
      </Button>
    </form>
  );
}

export default function ClientsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');

  const { data: clients = [], isLoading, refetch, isRefetching } = useClients();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();

  const clientDefaults: ClientFormData = {
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: '',
    double_rate_special_days: false,
  };
  const addForm = useForm<ClientFormData>({ resolver: zodResolver(clientSchema), defaultValues: clientDefaults });
  const editForm = useForm<ClientFormData>({ resolver: zodResolver(clientSchema), defaultValues: clientDefaults });

  const handleCreate = async (data: ClientFormData) => {
    try {
      await createClient.mutateAsync(data);
      setAddOpen(false);
      addForm.reset();
    } catch (err) { console.error(err); }
  };

  const openEdit = (client: Client) => {
    setEditingClient(client);
    editForm.reset({
      name: client.name,
      email: client.email ?? '',
      phone: client.phone ?? '',
      address: client.address ?? '',
      contact_person: client.contact_person ?? '',
      double_rate_special_days: client.double_rate_special_days ?? false,
    });
    setEditOpen(true);
  };

  const handleUpdate = async (data: ClientFormData) => {
    if (!editingClient) return;
    try {
      await updateClient.mutateAsync({ id: editingClient.id, data });
      setEditOpen(false);
      setEditingClient(null);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    try { await deleteClient.mutateAsync(id); } catch (err) { console.error(err); }
  };

  const filtered = useMemo(() =>
    clients.filter(c =>
      c.name.toLowerCase().includes(search.toLowerCase()) ||
      (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
      (c.contact_person ?? '').toLowerCase().includes(search.toLowerCase())
    ), [clients, search]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><Building2 className="size-7" /> Clients</h1>
              <p className="text-muted-foreground mt-1">{clients.length} client{clients.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button>Add Client</Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add New Client</DialogTitle>
                  </DialogHeader>
                  <ClientForm form={addForm} onSubmit={handleCreate} isPending={createClient.isPending} submitLabel="Create Client" />
                </DialogContent>
              </Dialog>
            </div>
          </div>

          <div className="mb-4">
            <Input
              placeholder="Search by name, email or contact person..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-md"
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Clients</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Loading clients...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No clients match your search.' : 'No clients yet. Click "Add Client" to get started.'}
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
                        <TableHead>Address</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((client) => (
                        <TableRow key={client.id}>
                          <TableCell className="font-medium whitespace-nowrap">{client.name}</TableCell>
                          <TableCell>{client.email || '-'}</TableCell>
                          <TableCell className="whitespace-nowrap">{client.phone || '-'}</TableCell>
                          <TableCell>{client.contact_person || '-'}</TableCell>
                          <TableCell className="max-w-[200px] truncate">{client.address || '-'}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button variant="ghost" size="sm" onClick={() => openEdit(client)} title="Edit client">
                                <Pencil className="size-4" />
                              </Button>
                              {client.email && (
                                <EmailDialog defaultEmail={client.email} defaultName={client.name} />
                              )}
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(client.id)}
                                disabled={deleteClient.isPending}
                                title="Delete client"
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
              <DialogTitle>Edit Client — {editingClient?.name}</DialogTitle>
            </DialogHeader>
            <ClientForm form={editForm} onSubmit={handleUpdate} isPending={updateClient.isPending} submitLabel="Save Changes" />
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}
