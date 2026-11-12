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
import type { PlatformAdmin, PlatformPermissionDef, PlatformRole } from '@/lib/types';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { Crown, Pencil, Plus, Trash2 } from 'lucide-react';

const PASSWORD_HINT = 'At least 9 characters with uppercase, lowercase, number and special character.';

// Plain-English names for the permission codes in admin_platform_ext_service.PLATFORM_PERMS.
const MODULE_LABELS: Record<string, string> = {
  tenants: 'Companies & users',
  billing: 'Billing & packages',
  trials: 'Trials',
  refunds: 'Refunds',
  support: 'Support tickets & live chat',
  security: 'Security',
  ops: 'Operations & monitoring',
  config: 'Settings, team & roles',
  audit: 'Audit trail',
  impersonate: 'Log in as a tenant',
};

const ACTION_LABELS: Record<string, string> = {
  read: 'View',
  write: 'Edit',
  lock: 'Lock / unlock',
  create: 'Create',
  approve: 'Approve',
  process: 'Process',
  cancel: 'Cancel',
  override: 'Override',
  policies: 'Manage policies',
  start: 'Allowed',
};

/** Starting points for the roles most teams need; the super admin can tick more or fewer. */
const ROLE_TEMPLATES: { name: string; description: string; permissions: string[] }[] = [
  {
    name: 'Support',
    description: 'Answers tickets and live chat, looks up tenants',
    permissions: ['tenants.read', 'support.read', 'support.write', 'trials.read', 'audit.read'],
  },
  {
    name: 'Technical',
    description: 'Monitors the platform, jobs, errors and security',
    permissions: ['tenants.read', 'ops.read', 'ops.write', 'security.read', 'audit.read'],
  },
  {
    name: 'Assistant',
    description: 'Read-only view across the portal',
    permissions: ['tenants.read', 'billing.read', 'trials.read', 'support.read', 'ops.read', 'audit.read'],
  },
];

function errMsg(e: unknown, fallback: string) {
  return e instanceof Error && e.message ? e.message : fallback;
}

type MemberForm = { full_name: string; email: string; password: string; role_slug: string };
type RoleForm = { name: string; description: string; permissions: string[] };

export default function AdminTeamPage() {
  const { user } = useAuth();
  const { can, loaded: permsLoaded, reload: reloadPerms } = usePlatformPermissions();
  const canRead = can('config.read');
  const canWrite = can('config.write');
  const [tab, setTab] = useState<'members' | 'roles'>('members');
  const [roles, setRoles] = useState<PlatformRole[]>([]);
  const [admins, setAdmins] = useState<PlatformAdmin[]>([]);
  const [catalog, setCatalog] = useState<PlatformPermissionDef[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<number | null>(null);
  const [saving, setSaving] = useState(false);

  // null = closed; editing holds the member being edited, otherwise it is "add".
  const [memberOpen, setMemberOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<PlatformAdmin | null>(null);
  const [memberForm, setMemberForm] = useState<MemberForm>({ full_name: '', email: '', password: '', role_slug: '' });

  const [roleOpen, setRoleOpen] = useState(false);
  const [editingRole, setEditingRole] = useState<PlatformRole | null>(null);
  const [roleForm, setRoleForm] = useState<RoleForm>({ name: '', description: '', permissions: [] });

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.admin.platformRoles(), api.admin.platformAdmins(), api.admin.platformPermissions()])
      .then(([r, a, c]) => {
        setRoles(r);
        setAdmins(a);
        setCatalog(c);
      })
      .catch((e) => toast.error(errMsg(e, 'Failed to load team')))
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
    for (const a of admins) for (const r of a.roles) out[r.slug] = (out[r.slug] || 0) + 1;
    return out;
  }, [admins]);
  const modules = useMemo(() => {
    const out: { module: string; perms: PlatformPermissionDef[] }[] = [];
    for (const p of catalog) {
      const g = out.find((x) => x.module === p.module);
      if (g) g.perms.push(p);
      else out.push({ module: p.module, perms: [p] });
    }
    return out;
  }, [catalog]);

  // ---- Members ----

  const openAddMember = () => {
    setEditingMember(null);
    setMemberForm({
      full_name: '',
      email: '',
      password: '',
      role_slug: roles.find((r) => !r.is_system)?.slug || roles.find((r) => r.slug === 'admin_viewer')?.slug || '',
    });
    setMemberOpen(true);
  };

  const openEditMember = (a: PlatformAdmin) => {
    setEditingMember(a);
    setMemberForm({ full_name: a.full_name || '', email: a.email, password: '', role_slug: a.roles[0]?.slug || '' });
    setMemberOpen(true);
  };

  const saveMember = async () => {
    if (!memberForm.full_name.trim()) {
      toast.error('Name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingMember) {
        await api.admin.updatePlatformAdmin(editingMember.id, {
          full_name: memberForm.full_name.trim(),
          ...(memberForm.password ? { password: memberForm.password } : {}),
        });
        const current = editingMember.roles.length === 1 ? editingMember.roles[0].slug : '';
        if (!editingMember.owner && memberForm.role_slug && memberForm.role_slug !== current) {
          await api.admin.setPlatformAdminRole(editingMember.id, memberForm.role_slug);
          if (editingMember.id === user?.id) reloadPerms();
        }
        toast.success('Super user updated');
      } else {
        if (!memberForm.email.trim() || !memberForm.password || !memberForm.role_slug) {
          toast.error('Name, email, password and role are required');
          setSaving(false);
          return;
        }
        await api.admin.createPlatformAdmin({ ...memberForm, email: memberForm.email.trim() });
        toast.success('Super user added');
      }
      setMemberOpen(false);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not save super user'));
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (a: PlatformAdmin) => {
    if (a.is_active && !window.confirm(`Deactivate ${a.full_name || a.email}? They will not be able to sign in.`)) return;
    setBusyId(a.id);
    try {
      await api.admin.setPlatformAdminActive(a.id, !a.is_active);
      toast.success(a.is_active ? 'Super user deactivated' : 'Super user activated');
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not update super user'));
    } finally {
      setBusyId(null);
    }
  };

  // ---- Roles ----

  const openAddRole = (template?: RoleForm) => {
    setEditingRole(null);
    setRoleForm(template ? { ...template, permissions: [...template.permissions] } : { name: '', description: '', permissions: [] });
    setRoleOpen(true);
  };

  const openEditRole = (r: PlatformRole) => {
    setEditingRole(r);
    setRoleForm({ name: r.name, description: r.description || '', permissions: [...r.permissions] });
    setRoleOpen(true);
  };

  const togglePerm = (code: string) =>
    setRoleForm((f) => ({
      ...f,
      permissions: f.permissions.includes(code) ? f.permissions.filter((c) => c !== code) : [...f.permissions, code],
    }));

  const toggleModule = (perms: PlatformPermissionDef[]) =>
    setRoleForm((f) => {
      const codes = perms.map((p) => p.code);
      const all = codes.every((c) => f.permissions.includes(c));
      return {
        ...f,
        permissions: all ? f.permissions.filter((c) => !codes.includes(c)) : [...new Set([...f.permissions, ...codes])],
      };
    });

  const saveRole = async () => {
    if (!roleForm.name.trim()) {
      toast.error('Role name is required');
      return;
    }
    setSaving(true);
    try {
      if (editingRole) {
        await api.admin.updatePlatformRole(editingRole.slug, roleForm);
        toast.success('Role updated');
      } else {
        await api.admin.createPlatformRole(roleForm);
        toast.success('Role created');
      }
      setRoleOpen(false);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not save role'));
    } finally {
      setSaving(false);
    }
  };

  const deleteRole = async (r: PlatformRole) => {
    if (!window.confirm(`Delete the ${r.name} role?`)) return;
    try {
      await api.admin.deletePlatformRole(r.slug);
      toast.success(`${r.name} deleted`);
      setRoleOpen(false);
      load();
    } catch (e) {
      toast.error(errMsg(e, 'Could not delete role'));
    }
  };

  const roleReadOnly = !!editingRole?.is_system || !canWrite;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="mx-auto w-full px-4 sm:px-6 lg:px-8 xl:px-10 py-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <div>
              <h1 className="text-3xl font-bold">Team & roles</h1>
              <p className="text-sm text-muted-foreground mt-1">
                The ControlOps team who can sign in to this portal. The Super Admin can do everything; super users
                only get what their role allows.
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load} disabled={!canRead || loading}>
                Refresh
              </Button>
              {canWrite && tab === 'members' && (
                <Button size="sm" onClick={openAddMember} disabled={!roles.length}>
                  <Plus className="size-4" /> Add super user
                </Button>
              )}
              {canWrite && tab === 'roles' && (
                <Button size="sm" onClick={() => openAddRole()}>
                  <Plus className="size-4" /> New role
                </Button>
              )}
            </div>
          </div>

          {permsLoaded && !canRead ? (
            <Card>
              <CardContent className="py-6 text-sm text-muted-foreground">
                Your role does not include team access. Ask the Super Admin to change your role.
              </CardContent>
            </Card>
          ) : (
            <>
              <div className="inline-flex rounded-md border p-1">
                {(['members', 'roles'] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setTab(t)}
                    className={cn(
                      'rounded px-4 py-1.5 text-sm font-medium',
                      tab === t ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground'
                    )}
                  >
                    {t === 'members' ? `Super users (${admins.length})` : `Roles (${roles.length})`}
                  </button>
                ))}
              </div>

              {tab === 'members' ? (
                <Card>
                  <CardContent className="pt-6">
                    {loading && !admins.length ? (
                      <p className="text-sm text-muted-foreground">Loading...</p>
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
                            {admins.map((a) => (
                              <TableRow key={a.id}>
                                <TableCell className="font-medium">
                                  {a.full_name || `#${a.id}`}
                                  {a.id === user?.id && <span className="ms-2 text-xs text-muted-foreground">(you)</span>}
                                </TableCell>
                                <TableCell>{a.email}</TableCell>
                                <TableCell>
                                  {a.owner ? (
                                    <Badge className="gap-1"><Crown className="size-3" /> Super Admin</Badge>
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
                                  {a.is_active ? <Badge variant="outline">Active</Badge> : <Badge variant="destructive">Inactive</Badge>}
                                </TableCell>
                                {canWrite && (
                                  <TableCell className="text-end space-x-2 whitespace-nowrap">
                                    {(!a.owner || a.id === user?.id) && (
                                      <Button size="sm" variant="outline" onClick={() => openEditMember(a)}>
                                        <Pencil className="size-4" /> Edit
                                      </Button>
                                    )}
                                    {!a.owner && a.id !== user?.id && (
                                      <Button size="sm" variant="outline" disabled={busyId === a.id} onClick={() => void toggleActive(a)}>
                                        {a.is_active ? 'Deactivate' : 'Activate'}
                                      </Button>
                                    )}
                                  </TableCell>
                                )}
                              </TableRow>
                            ))}
                          </TableBody>
                        </Table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              ) : (
                <div className="space-y-4">
                  {canWrite && (
                    <Card>
                      <CardContent className="flex flex-wrap items-center gap-2 py-4 text-sm">
                        <span className="text-muted-foreground">Quick start:</span>
                        {ROLE_TEMPLATES.filter((t) => !roles.some((r) => r.name.toLowerCase() === t.name.toLowerCase())).map((t) => (
                          <Button key={t.name} size="sm" variant="outline" onClick={() => openAddRole(t)}>
                            <Plus className="size-4" /> {t.name}
                          </Button>
                        ))}
                      </CardContent>
                    </Card>
                  )}
                  <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                    {roles.map((r) => (
                      <Card key={r.id} className="flex flex-col">
                        <CardHeader className="pb-2">
                          <CardTitle className="flex items-center justify-between gap-2 text-base">
                            <span>{r.name}</span>
                            <Badge variant={r.is_system ? 'secondary' : 'outline'}>{r.is_system ? 'Built-in' : 'Custom'}</Badge>
                          </CardTitle>
                          {r.description && <p className="text-xs text-muted-foreground">{r.description}</p>}
                          <p className="text-xs text-muted-foreground">
                            {assignedCount[r.slug] || 0} super user{assignedCount[r.slug] === 1 ? '' : 's'} ·{' '}
                            {r.slug === 'super_admin' ? 'everything' : `${r.permissions.length} permissions`}
                          </p>
                        </CardHeader>
                        <CardContent className="mt-auto">
                          <Button size="sm" variant="outline" className="w-full" onClick={() => openEditRole(r)}>
                            {r.is_system || !canWrite ? 'View permissions' : (<><Pencil className="size-4" /> Edit role</>)}
                          </Button>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        <Dialog open={memberOpen} onOpenChange={setMemberOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{editingMember ? `Edit ${editingMember.full_name || editingMember.email}` : 'Add super user'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="m-name">Full name</Label>
                <Input id="m-name" className="mt-1" value={memberForm.full_name} onChange={(e) => setMemberForm((f) => ({ ...f, full_name: e.target.value }))} />
              </div>
              <div>
                <Label htmlFor="m-email">Email</Label>
                <Input
                  id="m-email"
                  type="email"
                  className="mt-1"
                  autoComplete="off"
                  disabled={!!editingMember}
                  value={memberForm.email}
                  onChange={(e) => setMemberForm((f) => ({ ...f, email: e.target.value }))}
                />
              </div>
              <div>
                <Label htmlFor="m-password">{editingMember ? 'New password (leave blank to keep)' : 'Password'}</Label>
                <PasswordInput
                  id="m-password"
                  className="mt-1"
                  autoComplete="new-password"
                  value={memberForm.password}
                  onChange={(e) => setMemberForm((f) => ({ ...f, password: e.target.value }))}
                />
                <p className="text-xs text-muted-foreground mt-1">{PASSWORD_HINT}</p>
              </div>
              {editingMember?.owner ? (
                <p className="text-xs text-muted-foreground">The Super Admin always has full access; no role is needed.</p>
              ) : (
                <div>
                  <Label>Role</Label>
                  <Select value={memberForm.role_slug} onValueChange={(v) => setMemberForm((f) => ({ ...f, role_slug: v }))}>
                    <SelectTrigger className="mt-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                    <SelectContent>
                      {roles.map((r) => (
                        <SelectItem key={r.slug} value={r.slug}>{r.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {memberForm.role_slug && (
                    <p className="text-xs text-muted-foreground mt-1">
                      {memberForm.role_slug === 'super_admin'
                        ? 'Full access to everything.'
                        : roles.find((r) => r.slug === memberForm.role_slug)?.description ||
                          `${roles.find((r) => r.slug === memberForm.role_slug)?.permissions.length ?? 0} permissions`}
                    </p>
                  )}
                </div>
              )}
              {!editingMember && (
                <p className="text-xs text-muted-foreground">
                  They sign in at the super admin login page with this email and password, and see only what their role
                  ({roleName[memberForm.role_slug] || 'none'}) allows.
                </p>
              )}
              <Button className="w-full" disabled={saving} onClick={() => void saveMember()}>
                {saving ? 'Saving...' : editingMember ? 'Save changes' : 'Add super user'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingRole ? (roleReadOnly ? editingRole.name : `Edit ${editingRole.name}`) : 'New role'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              {editingRole?.is_system && (
                <p className="rounded-md bg-muted p-3 text-xs text-muted-foreground">
                  Built-in roles cannot be changed. Create a custom role to choose your own permissions.
                </p>
              )}
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label htmlFor="r-name">Role name</Label>
                  <Input id="r-name" className="mt-1" placeholder="Support" disabled={roleReadOnly} value={roleForm.name} onChange={(e) => setRoleForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label htmlFor="r-desc">Description</Label>
                  <Input id="r-desc" className="mt-1" disabled={roleReadOnly} value={roleForm.description} onChange={(e) => setRoleForm((f) => ({ ...f, description: e.target.value }))} />
                </div>
              </div>

              {editingRole?.slug === 'super_admin' ? (
                <p className="text-sm">Full access to everything in the portal.</p>
              ) : (
                <div className="space-y-2">
                  <p className="font-medium text-sm">Permissions</p>
                  {modules.map(({ module, perms }) => {
                    const all = perms.every((p) => roleForm.permissions.includes(p.code));
                    return (
                      <div key={module} className="rounded-md border p-3">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input type="checkbox" disabled={roleReadOnly} checked={all} onChange={() => toggleModule(perms)} />
                          {MODULE_LABELS[module] || module}
                        </label>
                        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 ps-6">
                          {perms.map((p) => (
                            <label key={p.code} className="flex items-center gap-1.5 text-sm text-muted-foreground">
                              <input
                                type="checkbox"
                                disabled={roleReadOnly}
                                checked={roleForm.permissions.includes(p.code)}
                                onChange={() => togglePerm(p.code)}
                              />
                              {ACTION_LABELS[p.action] || p.action}
                              {p.sensitive && <span className="text-[10px] uppercase text-amber-600 dark:text-amber-400">sensitive</span>}
                            </label>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}

              {!roleReadOnly && (
                <div className="flex gap-2">
                  {editingRole && (
                    <Button variant="outline" onClick={() => void deleteRole(editingRole)} disabled={saving}>
                      <Trash2 className="size-4 text-destructive" /> Delete
                    </Button>
                  )}
                  <Button className="flex-1" disabled={saving} onClick={() => void saveRole()}>
                    {saving ? 'Saving...' : editingRole ? 'Save role' : 'Create role'}
                  </Button>
                </div>
              )}
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
