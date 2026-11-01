'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PasswordInput } from '@/components/ui/password-input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PlatformAdmin, PlatformRole } from '@/lib/types';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';

const PASSWORD_HINT = 'At least 9 characters with uppercase, lowercase, number and special character.';

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

export default function AdminRolesPage() {
  const { user } = useAuth();
  const { can, loaded: permsLoaded, reload: reloadPerms } = usePlatformPermissions();
  const canRead = can('config.read');
  const canWrite = can('config.write');
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ full_name: '', email: '', password: '', role_slug: '' });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.admin.platformRoles(), api.admin.platformAdmins()])
      .then(([r, a]) => {
        setRoles(r);
        setAdmins(a);
        setLoadError(null);
      })
      .catch((e) => {
        const msg = errMsg(e, 'Failed to load roles');
        setLoadError(msg);
        toast.error(msg);
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user || !permsLoaded) return;
    if (!canRead) {
      setLoading(false);
      return;
    }
    load();
  }, [user, permsLoaded, canRead, load]);

  const roleName = useMemo(() => Object.fromEntries(roles.map((r) => [r.slug, r.name])), [roles]);
  const assignedCount = useMemo(() => {
    const out: Record<string, number> = {};
    for (const a of admins) {
      if (!a.is_active) continue;
      const slugs = a.roles.length ? a.roles.map((r) => r.slug) : ['super_admin'];
      for (const s of slugs) out[s] = (out[s] || 0) + 1;
    }
    return out;
  }, [admins]);

  const openCreate = () => {
    setForm({ full_name: '', email: '', password: '', role_slug: roles.find((r) => r.slug === 'admin_viewer')?.slug || roles[0]?.slug || '' });
    setOpen(true);
  };

  const create = async () => {
    if (!form.full_name.trim() || !form.email.trim() || !form.password || !form.role_slug) {
      toast.error('Name, email, password and role are required');
      return;
    }
    setSaving(true);
    try {
      await api.admin.createPlatformAdmin({ ...form, email: form.email.trim() });
      toast.success('Platform admin added');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not add admin'));
    } finally {
      setSaving(false);
    }
  };

  const changeRole = async (a: PlatformAdmin, slug: string) => {
    setBusyId(a.id);
    try {
      await api.admin.setPlatformAdminRole(a.id, slug);
      toast.success(`${a.full_name || a.email} is now ${roleName[slug] || slug}`);
      if (a.id === user?.id) reloadPerms();
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not change role'));
    } finally {
      setBusyId(null);
    }
  };

  const toggleActive = async (a: PlatformAdmin) => {
    setBusyId(a.id);
    try {
      await api.admin.setPlatformAdminActive(a.id, !a.is_active);
      toast.success(a.is_active ? 'Admin deactivated' : 'Admin activated');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not update admin'));
    } finally {
      setBusyId(null);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold">Platform roles</h1>
              <p className="text-sm text-muted-foreground mt-1">
                Who can sign in to the super admin portal, and what each of them can do.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={!canRead || loading}>
                Refresh
              </Button>
              {canWrite && (
                <Button size="sm" onClick={openCreate} disabled={!roles.length}>
                  Add platform admin
                </Button>
              )}
            </div>
          </div>

          {permsLoaded && !canRead ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Your platform role does not include settings access (config.read), so you cannot view roles.
                Ask a Super Admin to change your role.
              </CardContent>
            </Card>
          ) : (
            <>
              {loadError && (
                <Card className="border-destructive/50">
                  <CardContent className="py-4 text-sm text-destructive">{loadError}</CardContent>
                </Card>
              )}

              <Card>
                <CardHeader><CardTitle>Platform admins</CardTitle></CardHeader>
                <CardContent>
                  {loading && !admins.length ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : admins.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No platform admins.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Email</TableHead>
                            <TableHead>Role</TableHead>
                            <TableHead>Access</TableHead>
                            <TableHead>Status</TableHead>
                            {canWrite && <TableHead className="text-end">Actions</TableHead>}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {admins.map((a) => {
                            const current = a.roles.length === 1 ? a.roles[0].slug : a.roles.length ? '' : 'super_admin';
                            return (
                              <TableRow key={a.id}>
                                <TableCell className="font-medium">
                                  {a.full_name || `#${a.id}`}
                                  {a.id === user?.id && <span className="ms-2 text-xs text-muted-foreground">(you)</span>}
                                </TableCell>
                                <TableCell>{a.email}</TableCell>
                                <TableCell className="min-w-[200px]">
                                  {canWrite ? (
                                    <Select
                                      value={current || undefined}
                                      onValueChange={(v) => v !== current && void changeRole(a, v)}
                                      disabled={busyId === a.id}
                                    >
                                      <SelectTrigger className="h-8">
                                        <SelectValue placeholder={a.roles.map((r) => r.name).join(', ')} />
                                      </SelectTrigger>
                                      <SelectContent>
                                        {roles.map((r) => (
                                          <SelectItem key={r.slug} value={r.slug}>{r.name}</SelectItem>
                                        ))}
                                      </SelectContent>
                                    </Select>
                                  ) : (
                                    a.roles.map((r) => r.name).join(', ') || 'Super Admin'
                                  )}
                                </TableCell>
                                <TableCell>
                                  {a.full_access ? (
                                    <Badge>Full access</Badge>
                                  ) : (
                                    <Badge variant="secondary">{a.permission_count} permissions</Badge>
                                  )}
                                </TableCell>
                                <TableCell>
                                  {a.is_active ? (
                                    <Badge variant="outline">Active</Badge>
                                  ) : (
                                    <Badge variant="destructive">Inactive</Badge>
                                  )}
                                </TableCell>
                                {canWrite && (
                                  <TableCell className="text-end">
                                    {a.id !== user?.id && (
                                      <Button
                                        size="sm"
                                        variant="outline"
                                        disabled={busyId === a.id}
                                        onClick={() => void toggleActive(a)}
                                      >
                                        {a.is_active ? 'Deactivate' : 'Activate'}
                                      </Button>
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                            );
                          })}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
                <CardContent>
                  {loading && !roles.length ? (
                    <p className="text-sm text-muted-foreground">Loading...</p>
                  ) : roles.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No roles defined.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Name</TableHead>
                            <TableHead>Admins</TableHead>
                            <TableHead>Permissions</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {roles.map((r) => (
                            <TableRow key={r.id}>
                              <TableCell className="align-top">
                                <div className="font-medium">{r.name}</div>
                                <div className="font-mono text-xs text-muted-foreground">{r.slug}</div>
                              </TableCell>
                              <TableCell className="align-top">{assignedCount[r.slug] || 0}</TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-1 max-w-2xl">
                                  {r.permissions.map((p) => (
                                    <Badge key={p} variant="secondary" className="font-mono text-[11px] font-normal">
                                      {p}
                                    </Badge>
                                  ))}
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
            </>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Add platform admin</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="pa-name">Full name</Label>
                <Input
                  id="pa-name"
                  className="mt-1"
                  value={form.full_name}
                  onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pa-email">Email</Label>
                <Input
                  id="pa-email"
                  type="email"
                  className="mt-1"
                  autoComplete="off"
                  value={form.email}
                  onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="pa-password">Password</Label>
                <PasswordInput
                  id="pa-password"
                  className="mt-1"
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">{PASSWORD_HINT}</p>
              </div>
              <div>
                <Label>Role</Label>
                <Select value={form.role_slug} onValueChange={(v) => setForm((f) => ({ ...f, role_slug: v }))}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => (
                      <SelectItem key={r.slug} value={r.slug}>{r.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.role_slug && (
                  <p className="text-xs text-muted-foreground mt-1">
                    {roles.find((r) => r.slug === form.role_slug)?.permissions.join(', ')}
                  </p>
                )}
              </div>
              <p className="text-xs text-muted-foreground">
                They sign in at the super admin login page with this email and password.
              </p>
              <Button disabled={saving} onClick={() => void create()}>
                {saving ? 'Adding...' : 'Add admin'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
