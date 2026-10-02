'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { api } from '@/lib/api';
import type { Vendor } from '@/lib/types';
import { Plus, Pencil, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

const empty = () => ({ name: '', email: '', phone: '', address: '', notes: '', status: 'active' });

export default function VendorsPage() {
  const { user } = useAuth();
  const canWrite = canModule(user, 'vendors', 'create');
  const canEdit = canModule(user, 'vendors', 'edit');
  const canDelete = canModule(user, 'vendors', 'delete');
  const [rows, setRows] = useState<Vendor[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [editId, setEditId] = useState<number | null>(null);
  const [form, setForm] = useState(empty());

  const load = useCallback(async () => {
    setLoading(true);
    try {
      setRows(await api.vendors.list());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load vendors');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const submit = async () => {
    if (!form.name.trim()) {
      toast.error('Name is required');
      return;
    }
    try {
      if (editId) await api.vendors.update(editId, form);
      else await api.vendors.create(form);
      setOpen(false);
      setEditId(null);
      setForm(empty());
      await load();
      toast.success(editId ? 'Vendor updated' : 'Vendor created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Vendors / Suppliers"
            description="Manage suppliers used on expenses and fixed monthly costs."
            actions={
              canWrite ? (
                <Dialog
                  open={open}
                  onOpenChange={(v) => {
                    setOpen(v);
                    if (!v) {
                      setEditId(null);
                      setForm(empty());
                    }
                  }}
                >
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 me-1" /> Add vendor
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>{editId ? 'Edit vendor' : 'New vendor'}</DialogTitle>
                    </DialogHeader>
                    <div className="space-y-3">
                      <div>
                        <Label>Name</Label>
                        <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Email</Label>
                        <Input value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Phone</Label>
                        <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Address</Label>
                        <Input value={form.address} onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))} />
                      </div>
                      <div>
                        <Label>Notes</Label>
                        <Input value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                      </div>
                      <Button onClick={submit} className="w-full">
                        Save
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              ) : null
            }
          />
          <div className="rounded-lg border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Phone</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-24" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={5}>Loading…</TableCell>
                  </TableRow>
                ) : rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5}>No vendors yet.</TableCell>
                  </TableRow>
                ) : (
                  rows.map((v) => (
                    <TableRow key={v.id}>
                      <TableCell className="font-medium">{v.name}</TableCell>
                      <TableCell>{v.email || '—'}</TableCell>
                      <TableCell>{v.phone || '—'}</TableCell>
                      <TableCell>{v.status}</TableCell>
                      <TableCell className="flex gap-1">
                        {canEdit ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={() => {
                              setEditId(v.id);
                              setForm({
                                name: v.name,
                                email: v.email || '',
                                phone: v.phone || '',
                                address: v.address || '',
                                notes: v.notes || '',
                                status: v.status,
                              });
                              setOpen(true);
                            }}
                          >
                            <Pencil className="size-4" />
                          </Button>
                        ) : null}
                        {canDelete ? (
                          <Button
                            size="icon"
                            variant="ghost"
                            onClick={async () => {
                              try {
                                await api.vendors.delete(v.id);
                                await load();
                              } catch (e) {
                                toast.error(e instanceof Error ? e.message : 'Delete failed');
                              }
                            }}
                          >
                            <Trash2 className="size-4 text-destructive" />
                          </Button>
                        ) : null}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
