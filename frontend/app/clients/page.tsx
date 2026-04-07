'use client';

import { useMemo, useState } from 'react';
import { useForm, type Resolver } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  useClients,
  useCreateClient,
  useUpdateClient,
  useDeleteClient,
  useClientRenewals,
  useRenewClientContract,
} from '@/hooks/use-clients';
import { clientSchema, clientRenewSchema } from '@/lib/validation';
import type { Client } from '@/lib/types';
import type { z } from 'zod';
import { EmailDialog } from '@/components/email-dialog';
import { Building2, Pencil, Trash2, CalendarClock, History } from 'lucide-react';
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

export default function ClientsPage() {
  const [addOpen, setAddOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [renewClient, setRenewClient] = useState<Client | null>(null);
  const [historyClient, setHistoryClient] = useState<Client | null>(null);
  const [search, setSearch] = useState('');

  const { data: clients = [], isLoading, refetch, isRefetching } = useClients();
  const createClient = useCreateClient();
  const updateClient = useUpdateClient();
  const deleteClient = useDeleteClient();
  const renewContract = useRenewClientContract();

  const clientDefaults: ClientFormData = {
    name: '',
    email: '',
    phone: '',
    address: '',
    contact_person: '',
    double_rate_special_days: false,
    contract_start_date: '',
    contract_end_date: '',
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
      contact_person: client.contact_person ?? '',
      double_rate_special_days: client.double_rate_special_days ?? false,
      contract_start_date: client.contract_start_date ?? '',
      contract_end_date: client.contract_end_date ?? '',
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

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this client? This cannot be undone.')) return;
    try {
      await deleteClient.mutateAsync(id);
    } catch (err) {
      console.error(err);
    }
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

  const filtered = useMemo(
    () =>
      clients.filter(
        (c) =>
          c.name.toLowerCase().includes(search.toLowerCase()) ||
          (c.email ?? '').toLowerCase().includes(search.toLowerCase()) ||
          (c.contact_person ?? '').toLowerCase().includes(search.toLowerCase())
      ),
    [clients, search]
  );

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2">
                <Building2 className="size-7" /> Clients
              </h1>
              <p className="text-muted-foreground mt-1">
                {clients.length} client{clients.length !== 1 ? 's' : ''}
              </p>
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
                        <TableHead>Contract end</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Phone</TableHead>
                        <TableHead>Contact Person</TableHead>
                        <TableHead>Address</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((client) => {
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
                                <Button variant="ghost" size="sm" onClick={() => openEdit(client)} title="Edit client">
                                  <Pencil className="size-4" />
                                </Button>
                                <Button variant="ghost" size="sm" onClick={() => openRenew(client)} title="Renew contract">
                                  <CalendarClock className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setHistoryClient(client)}
                                  title="Renewal history"
                                >
                                  <History className="size-4" />
                                </Button>
                                {client.email && <EmailDialog defaultEmail={client.email} defaultName={client.name} />}
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
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={editOpen} onOpenChange={setEditOpen}>
          <DialogContent className="sm:max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Edit Client — {editingClient?.name}</DialogTitle>
            </DialogHeader>
            <ClientForm form={editForm} onSubmit={handleUpdate} isPending={updateClient.isPending} submitLabel="Save Changes" />
          </DialogContent>
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
      </div>
    </ProtectedRoute>
  );
}
