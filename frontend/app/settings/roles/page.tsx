'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import type { Role, CompanyUser, PermissionMatrix } from '@/lib/types';
import { Shield, Trash2 } from 'lucide-react';

const MODULE_KEYS = [
  'clients',
  'sites',
  'guards',
  'rota',
  'invoices',
  'contractors',
  'reports',
  'settings',
] as const;

const MODULE_LABELS: Record<string, string> = {
  clients: 'Clients',
  sites: 'Sites',
  guards: 'Guards',
  rota: 'Rota',
  invoices: 'Invoices',
  contractors: 'Contractors',
  reports: 'Reports',
  settings: 'Settings',
};

const ACTIONS = ['view', 'create', 'edit', 'delete'] as const;

function emptyMatrix(): PermissionMatrix {
  const row = () => ({ view: false, create: false, edit: false, delete: false });
  return Object.fromEntries(MODULE_KEYS.map((k) => [k, row()]));
}

function cloneMatrix(m: PermissionMatrix): PermissionMatrix {
  return JSON.parse(JSON.stringify(m)) as PermissionMatrix;
}

function MatrixTable({
  matrix,
  onToggle,
  readOnly,
}: {
  matrix: PermissionMatrix;
  onToggle: (mod: string, act: string, v: boolean) => void;
  readOnly: boolean;
}) {
  return (
    <div className="overflow-x-auto rounded-md border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="w-40">Module</TableHead>
            {ACTIONS.map((a) => (
              <TableHead key={a} className="text-center capitalize w-24">
                {a}
              </TableHead>
            ))}
          </TableRow>
        </TableHeader>
        <TableBody>
          {MODULE_KEYS.map((mod) => (
            <TableRow key={mod}>
              <TableCell className="font-medium">{MODULE_LABELS[mod] ?? mod}</TableCell>
              {ACTIONS.map((act) => (
                <TableCell key={act} className="text-center">
                  <input
                    type="checkbox"
                    className="size-4 accent-primary cursor-pointer disabled:opacity-50"
                    checked={Boolean((matrix[mod] as Record<string, boolean> | undefined)?.[act])}
                    disabled={readOnly}
                    onChange={(e) => onToggle(mod, act, e.target.checked)}
                  />
                </TableCell>
              ))}
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

export default function RolesSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMatrix, setNewMatrix] = useState<PermissionMatrix>(emptyMatrix);
  const [editId, setEditId] = useState<number | null>(null);
  const [editMatrix, setEditMatrix] = useState<PermissionMatrix>(emptyMatrix);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    const [r, u] = await Promise.all([api.roles.list(), api.users.list()]);
    setRoles(r);
    setUsers(u);
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!can(user, 'roles.read')) {
      router.replace('/dashboard');
      return;
    }
    load()
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [user, router, load]);

  const toggleCell = (
    matrix: PermissionMatrix,
    setM: (m: PermissionMatrix) => void,
    mod: string,
    act: string,
    v: boolean
  ) => {
    const prev = matrix[mod] ?? { view: false, create: false, edit: false, delete: false };
    setM({
      ...matrix,
      [mod]: { ...prev, [act]: v },
    });
  };

  const startEdit = (role: Role) => {
    if (role.is_system || !role.uses_matrix) return;
    setEditId(role.id);
    setEditMatrix(cloneMatrix(role.matrix));
  };

  const saveEdit = async () => {
    if (editId == null) return;
    setSaving(true);
    try {
      await api.roles.update(editId, { matrix: editMatrix });
      await load();
      setEditId(null);
    } finally {
      setSaving(false);
    }
  };

  const createRole = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.roles.create({ name, matrix: newMatrix });
      setCreateOpen(false);
      setNewName('');
      setNewMatrix(emptyMatrix());
      await load();
    } finally {
      setSaving(false);
    }
  };

  const removeRole = async (id: number) => {
    if (!confirm('Delete this role? Users must not be assigned to it.')) return;
    setSaving(true);
    try {
      await api.roles.delete(id);
      if (editId === id) setEditId(null);
      await load();
    } finally {
      setSaving(false);
    }
  };

  const patchUserRole = async (userId: number, roleId: string) => {
    const rid = parseInt(roleId, 10);
    if (Number.isNaN(rid)) return;
    setSaving(true);
    try {
      const updated = await api.users.patchRole(userId, rid);
      setUsers((prev) => prev.map((u) => (u.id === userId ? updated : u)));
    } finally {
      setSaving(false);
    }
  };

  const canWrite = user && can(user, 'roles.write');
  const canDelete = user && can(user, 'roles.delete');
  const editing = editId != null ? roles.find((r) => r.id === editId) : null;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <Nav />
        <div className="container mx-auto px-4 py-8 max-w-6xl">
          <div className="flex items-center gap-3 mb-6">
            <Shield className="size-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Roles & permissions</h1>
              <p className="text-muted-foreground text-sm">
                System roles are fixed; create custom roles with a permission matrix and assign them to users.
              </p>
            </div>
          </div>

          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <Card className="mb-8 border-border/60">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>Roles</CardTitle>
                    <CardDescription>Predefined and custom roles for your organisation.</CardDescription>
                  </div>
                  {canWrite && (
                    <Button onClick={() => setCreateOpen(true)} size="sm">
                      New custom role
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Slug</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roles.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{r.slug}</TableCell>
                          <TableCell>{r.is_system ? 'System' : 'Custom'}</TableCell>
                          <TableCell className="text-right space-x-2">
                            {!r.is_system && r.uses_matrix && canWrite && (
                              <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                                Edit matrix
                              </Button>
                            )}
                            {!r.is_system && canDelete && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive"
                                onClick={() => removeRole(r.id)}
                                disabled={saving}
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>

                  {editing && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <p className="font-medium">Editing: {editing.name}</p>
                        <div className="flex gap-2">
                          <Button variant="outline" size="sm" onClick={() => setEditId(null)}>
                            Cancel
                          </Button>
                          <Button size="sm" onClick={saveEdit} disabled={saving}>
                            Save matrix
                          </Button>
                        </div>
                      </div>
                      <MatrixTable
                        matrix={editMatrix}
                        readOnly={false}
                        onToggle={(mod, act, v) => toggleCell(editMatrix, setEditMatrix, mod, act, v)}
                      />
                    </div>
                  )}

                  {roles.some((r) => r.is_system && !r.uses_matrix) && (
                    <p className="text-sm text-muted-foreground">
                      Guard and some system roles use a fixed permission bundle (not the matrix above).
                    </p>
                  )}
                </CardContent>
              </Card>

              <Card className="border-border/60">
                <CardHeader>
                  <CardTitle>Users</CardTitle>
                  <CardDescription>Assign a role to each user in your organisation.</CardDescription>
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Email</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead className="w-[240px]">Role</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell>{u.full_name}</TableCell>
                          <TableCell>
                            {canWrite ? (
                              <Select
                                value={u.role_id != null ? String(u.role_id) : undefined}
                                onValueChange={(v) => patchUserRole(u.id, v)}
                                disabled={saving}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {roles.map((r) => (
                                    <SelectItem key={r.id} value={String(r.id)}>
                                      {r.name}
                                    </SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            ) : (
                              <span className="text-sm text-muted-foreground">{u.role_name ?? '—'}</span>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          )}

          <Dialog open={createOpen} onOpenChange={setCreateOpen}>
            <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>New custom role</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-2">
                <div className="space-y-2">
                  <Label htmlFor="rn">Name</Label>
                  <Input
                    id="rn"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Regional lead"
                  />
                </div>
                <MatrixTable
                  matrix={newMatrix}
                  readOnly={false}
                  onToggle={(mod, act, v) => toggleCell(newMatrix, setNewMatrix, mod, act, v)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setCreateOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={createRole} disabled={saving || !newName.trim()}>
                  Create role
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>
    </ProtectedRoute>
  );
}
