'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companyUserSchema, companyUserUpdateSchema, passwordFieldSchema } from '@/lib/validation';
import type { z } from 'zod';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
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
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { Shield, Trash2, UserPlus, Eye, Pencil, KeyRound } from 'lucide-react';

type CompanyUserFormData = z.infer<typeof companyUserSchema>;
type CompanyUserUpdateFormData = z.infer<typeof companyUserUpdateSchema>;
import { toast } from '@/lib/toast';

const MODULE_KEYS = [
  'clients',
  'sites',
  'guards',
  'rota',
  'invoices',
  'contractors',
  'reports',
  'settings',
  'leads',
  'portal',
  'patrol',
  'incidents',
] as const;

const MODULE_LABELS: Record<string, string> = {
  clients: 'Clients',
  sites: 'Sites',
  guards: 'Staff',
  rota: 'Rota',
  invoices: 'Invoices',
  contractors: 'Contractors',
  reports: 'Reports',
  settings: 'Settings',
  leads: 'Leads',
  portal: 'Self-service portal (view= sites/current/hours, create= upcoming, edit= previous)',
  patrol: 'Patrol (view=read, create/edit=write/scan)',
  incidents: 'Incidents (view=read, create/edit=write)',
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
  const [roleSearch, setRoleSearch] = useState('');
  const [roleKind, setRoleKind] = useState<'all' | 'system' | 'custom'>('all');
  const roleSort = useTableSort();
  const [rolePage, setRolePage] = useState(1);
  const [rolePageSize, setRolePageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [userSearch, setUserSearch] = useState('');
  const [userRoleId, setUserRoleId] = useState<string>('');
  const userSort = useTableSort();
  const [userPage, setUserPage] = useState(1);
  const [userPageSize, setUserPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);
  const [addUserOpen, setAddUserOpen] = useState(false);
  const [viewUser, setViewUser] = useState<CompanyUser | null>(null);
  const [editUser, setEditUser] = useState<CompanyUser | null>(null);
  const [resetUser, setResetUser] = useState<CompanyUser | null>(null);
  const [resetPassword, setResetPassword] = useState('');
  const [tab, setTab] = useState<'roles' | 'users'>('roles');

  const userForm = useForm<CompanyUserFormData>({
    resolver: zodResolver(companyUserSchema),
    defaultValues: { email: '', password: '', full_name: '', role_id: 1 },
  });

  const editUserForm = useForm<CompanyUserUpdateFormData>({
    resolver: zodResolver(companyUserUpdateSchema),
    defaultValues: { email: '', password: '', full_name: '', role_id: 1 },
  });

  const assignableRoles = useMemo(() => roles.filter((r) => r.slug !== 'admin'), [roles]);

  const openAddUser = () => {
    const def = assignableRoles[0];
    if (!def) {
      toast.error('Create a custom role first. Admin cannot be assigned to new users.');
      return;
    }
    userForm.reset({
      email: '',
      password: '',
      full_name: '',
      role_id: def.id,
    });
    setAddUserOpen(true);
  };

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

  const removeRole = (id: number) => {
    toast.confirm('Delete this role?', async () => {
      setSaving(true);
      try {
        await api.roles.delete(id);
        if (editId === id) setEditId(null);
        await load();
        toast.success('Role deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        setSaving(false);
      }
    }, { label: 'Delete', description: 'Users must not be assigned to it.' });
  };

  const createUser = async (data: CompanyUserFormData) => {
    setSaving(true);
    try {
      await api.users.create(data);
      setAddUserOpen(false);
      userForm.reset({ email: '', password: '', full_name: '', role_id: 0 });
      await load();
      toast.success('User created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create user');
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
      toast.success('Role updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update role');
    } finally {
      setSaving(false);
    }
  };

  const openEditUser = (u: CompanyUser) => {
    setEditUser(u);
    const fallback = assignableRoles[0]?.id ?? roles[0]?.id ?? 1;
    editUserForm.reset({
      email: u.email,
      full_name: u.full_name,
      password: '',
      role_id: u.role_slug === 'admin' ? (u.role_id ?? fallback) : (u.role_id ?? fallback),
    });
  };

  const saveEditUser = async (data: CompanyUserUpdateFormData) => {
    if (!editUser) return;
    setSaving(true);
    try {
      await api.users.update(editUser.id, {
        email: data.email,
        full_name: data.full_name,
        role_id: data.role_id,
        ...(data.password ? { password: data.password } : {}),
      });
      setEditUser(null);
      await load();
      toast.success('User updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const deleteUser = (userId: number) => {
    toast.confirm('Delete this user?', async () => {
      setSaving(true);
      try {
        await api.users.delete(userId);
        await load();
        toast.success('User deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        setSaving(false);
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const saveResetPassword = async () => {
    if (!resetUser) return;
    const parsed = passwordFieldSchema.safeParse(resetPassword);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? 'Invalid password');
      return;
    }
    setSaving(true);
    try {
      await api.users.resetPassword(resetUser.id, resetPassword);
      setResetUser(null);
      setResetPassword('');
      toast.success('Password reset');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to reset password');
    } finally {
      setSaving(false);
    }
  };

  const canWrite = user && can(user, 'roles.write');
  const canDelete = user && can(user, 'roles.delete');
  const editing = editId != null ? roles.find((r) => r.id === editId) : null;

  const rolesForTable = useMemo(() => {
    if (roleKind === 'system') return roles.filter((r) => r.is_system);
    if (roleKind === 'custom') return roles.filter((r) => !r.is_system);
    return roles;
  }, [roles, roleKind]);

  const getRoleSearchText = useCallback(
    (r: Role) => [r.name, r.slug, r.is_system ? 'system' : 'custom'].join(' '),
    []
  );
  const getRoleSortValue = useCallback((r: Role, key: string) => {
    switch (key) {
      case 'name':
        return r.name;
      case 'slug':
        return r.slug;
      case 'type':
        return r.is_system ? 'system' : 'custom';
      default:
        return '';
    }
  }, []);

  const roleList = useTableList(
    rolesForTable,
    roleSearch,
    roleSort.sortKey,
    roleSort.sortDir,
    rolePage,
    rolePageSize,
    getRoleSearchText,
    getRoleSortValue
  );

  const usersForTable = useMemo(() => {
    if (!userRoleId) return users;
    const rid = parseInt(userRoleId, 10);
    if (Number.isNaN(rid)) return users;
    return users.filter((u) => u.role_id === rid);
  }, [users, userRoleId]);

  const getUserSearchText = useCallback(
    (u: CompanyUser) => [u.email, u.full_name, u.role_name ?? '', String(u.role_id ?? '')].join(' '),
    []
  );
  const getUserSortValue = useCallback((u: CompanyUser, key: string) => {
    switch (key) {
      case 'email':
        return u.email;
      case 'name':
        return u.full_name;
      case 'role':
        return u.role_name ?? '';
      default:
        return '';
    }
  }, []);

  const userList = useTableList(
    usersForTable,
    userSearch,
    userSort.sortKey,
    userSort.sortDir,
    userPage,
    userPageSize,
    getUserSearchText,
    getUserSortValue
  );

  useEffect(() => {
    setRolePage(1);
  }, [roleSearch, roleKind]);
  useEffect(() => {
    setRolePage((x) => Math.min(x, roleList.pageCount));
  }, [roleList.pageCount]);

  useEffect(() => {
    setUserPage(1);
  }, [userSearch, userRoleId]);
  useEffect(() => {
    setUserPage((x) => Math.min(x, userList.pageCount));
  }, [userList.pageCount]);

  return (
    <ProtectedRoute>
      <AppShell>
      <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><Shield className="size-7 text-primary" /> Roles & permissions</span>}
            description="The Admin role is fixed. Create custom roles with a permission matrix and assign them to users."
          />

          {loading ? (
            <p className="text-muted-foreground">Loading…</p>
          ) : (
            <>
              <ModuleTabs
                tabs={[
                  { id: 'roles', label: 'Roles' },
                  { id: 'users', label: 'Users' },
                ]}
                value={tab}
                onChange={setTab}
              />

              {tab === 'roles' && (
              <Card className="border-border/60">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>Roles</CardTitle>
                    <CardDescription>Admin is fixed. Create custom roles and assign permissions.</CardDescription>
                  </div>
                  {canWrite && (
                    <Button onClick={() => setCreateOpen(true)} size="sm">
                      New custom role
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                    <Input
                      placeholder="Search roles..."
                      value={roleSearch}
                      onChange={(e) => setRoleSearch(e.target.value)}
                      className="max-w-md"
                    />
                    <Select value={roleKind} onValueChange={(v) => setRoleKind(v as 'all' | 'system' | 'custom')}>
                      <SelectTrigger className="w-[160px]">
                        <SelectValue placeholder="Type" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All types</SelectItem>
                        <SelectItem value="system">System</SelectItem>
                        <SelectItem value="custom">Custom</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  {roleList.total === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">{rolesForTable.length === 0 ? 'No roles.' : 'No matches.'}</p>
                  ) : (
                    <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Name" colKey="name" sortKey={roleSort.sortKey} sortDir={roleSort.sortDir} onSort={roleSort.toggleSort} />
                        <SortableHead label="Slug" colKey="slug" sortKey={roleSort.sortKey} sortDir={roleSort.sortDir} onSort={roleSort.toggleSort} />
                        <SortableHead label="Type" colKey="type" sortKey={roleSort.sortKey} sortDir={roleSort.sortDir} onSort={roleSort.toggleSort} />
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {roleList.pageRows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium">{r.name}</TableCell>
                          <TableCell className="text-muted-foreground text-sm">{r.slug}</TableCell>
                          <TableCell>{r.is_system ? 'System' : 'Custom'}</TableCell>
                          <TableCell className="text-right space-x-1 whitespace-nowrap">
                            {!r.is_system && r.slug !== 'admin' && r.uses_matrix && canWrite && (
                              <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                                Edit matrix
                              </Button>
                            )}
                            {!r.is_system && r.slug !== 'admin' && canDelete && (
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
                  <TablePaginationBar
                    safePage={roleList.safePage}
                    pageCount={roleList.pageCount}
                    total={roleList.total}
                    pageSize={rolePageSize}
                    rangeStart={roleList.rangeStart}
                    rangeEnd={roleList.rangeEnd}
                    onPageChange={setRolePage}
                    onPageSizeChange={(n) => {
                      setRolePageSize(n);
                      setRolePage(1);
                    }}
                  />
                    </>
                  )}

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

                  {roles.some((r) => r.slug === 'admin') && (
                    <p className="text-sm text-muted-foreground">
                      The Admin role is fixed and cannot be renamed, edited, or deleted.
                    </p>
                  )}
                </CardContent>
              </Card>
              )}

              {tab === 'users' && (
              <Card className="border-border/60">
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div>
                    <CardTitle>Users</CardTitle>
                    <CardDescription>Create users and assign roles for app login access.</CardDescription>
                  </div>
                  {canWrite && (
                    <Button size="sm" onClick={openAddUser}>
                      <UserPlus className="size-4 mr-1" />
                      Add user
                    </Button>
                  )}
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3 flex-wrap">
                    <Input
                      placeholder="Search users..."
                      value={userSearch}
                      onChange={(e) => setUserSearch(e.target.value)}
                      className="max-w-md"
                      name="user-list-filter"
                      autoComplete="off"
                      type="search"
                      inputMode="search"
                    />
                    <Select value={userRoleId || '__all'} onValueChange={(v) => setUserRoleId(v === '__all' ? '' : v)}>
                      <SelectTrigger className="w-[200px]">
                        <SelectValue placeholder="Filter by role" />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="__all">All roles</SelectItem>
                        {roles.map((r) => (
                          <SelectItem key={r.id} value={String(r.id)}>
                            {r.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  {userList.total === 0 ? (
                    <p className="text-sm text-muted-foreground py-4">{usersForTable.length === 0 ? 'No users.' : 'No matches.'}</p>
                  ) : (
                    <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Email" colKey="email" sortKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.toggleSort} />
                        <SortableHead label="Name" colKey="name" sortKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.toggleSort} />
                        <SortableHead label="Role" colKey="role" sortKey={userSort.sortKey} sortDir={userSort.sortDir} onSort={userSort.toggleSort} className="w-[200px]" />
                        <TableHead className="text-right w-[280px]">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {userList.pageRows.map((u) => (
                        <TableRow key={u.id}>
                          <TableCell className="text-sm">{u.email}</TableCell>
                          <TableCell>{u.full_name}</TableCell>
                          <TableCell>
                            {u.role_slug === 'admin' ? (
                              <span className="text-sm font-medium" title="Only one Admin is allowed">
                                {u.role_name ?? 'Admin'}
                              </span>
                            ) : canWrite ? (
                              <Select
                                value={u.role_id != null ? String(u.role_id) : undefined}
                                onValueChange={(v) => patchUserRole(u.id, v)}
                                disabled={saving}
                              >
                                <SelectTrigger className="w-full">
                                  <SelectValue placeholder="Role" />
                                </SelectTrigger>
                                <SelectContent>
                                  {assignableRoles.map((r) => (
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
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1 flex-wrap">
                              <Button variant="ghost" size="sm" onClick={() => setViewUser(u)}>
                                <Eye className="size-3.5 mr-1" />
                                View
                              </Button>
                              {canWrite && (
                                <>
                                  <Button variant="ghost" size="sm" onClick={() => openEditUser(u)}>
                                    <Pencil className="size-3.5 mr-1" />
                                    Edit
                                  </Button>
                                  <Button variant="ghost" size="sm" onClick={() => { setResetUser(u); setResetPassword(''); }}>
                                    <KeyRound className="size-3.5 mr-1" />
                                    Reset password
                                  </Button>
                                </>
                              )}
                              {canDelete && (
                                <Button variant="ghost" size="sm" className="text-destructive" onClick={() => deleteUser(u.id)} disabled={saving}>
                                  <Trash2 className="size-3.5 mr-1" />
                                  Delete
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={userList.safePage}
                    pageCount={userList.pageCount}
                    total={userList.total}
                    pageSize={userPageSize}
                    rangeStart={userList.rangeStart}
                    rangeEnd={userList.rangeEnd}
                    onPageChange={setUserPage}
                    onPageSizeChange={(n) => {
                      setUserPageSize(n);
                      setUserPage(1);
                    }}
                  />
                    </>
                  )}
                </CardContent>
              </Card>
              )}

              <Dialog open={addUserOpen} onOpenChange={setAddUserOpen}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Add user</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={userForm.handleSubmit(createUser)} className="space-y-4">
                    <div className="space-y-1">
                      <Label>Full name</Label>
                      <Input {...userForm.register('full_name')} placeholder="Jane Smith" />
                      {userForm.formState.errors.full_name && (
                        <p className="text-xs text-destructive">{userForm.formState.errors.full_name.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input type="email" autoComplete="off" {...userForm.register('email')} placeholder="user@company.com" />
                      {userForm.formState.errors.email && (
                        <p className="text-xs text-destructive">{userForm.formState.errors.email.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Password</Label>
                      <PasswordInput autoComplete="new-password" {...userForm.register('password')} />
                      {userForm.formState.errors.password && (
                        <p className="text-xs text-destructive">{userForm.formState.errors.password.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Role</Label>
                      <Select
                        value={userForm.watch('role_id') ? String(userForm.watch('role_id')) : undefined}
                        onValueChange={(v) => userForm.setValue('role_id', parseInt(v, 10), { shouldValidate: true })}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select role" />
                        </SelectTrigger>
                        <SelectContent>
                          {assignableRoles.map((r) => (
                            <SelectItem key={r.id} value={String(r.id)}>
                              {r.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-muted-foreground">Admin is unique and cannot be assigned to new users.</p>
                      {userForm.formState.errors.role_id && (
                        <p className="text-xs text-destructive">{userForm.formState.errors.role_id.message}</p>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setAddUserOpen(false)}>
                        Cancel
                      </Button>
                      <Button type="submit" disabled={saving}>
                        {saving ? 'Creating...' : 'Create user'}
                      </Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog open={!!viewUser} onOpenChange={(open) => !open && setViewUser(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>User details</DialogTitle>
                  </DialogHeader>
                  {viewUser && (
                    <dl className="space-y-3 text-sm">
                      <div><dt className="text-muted-foreground">Name</dt><dd className="font-medium">{viewUser.full_name}</dd></div>
                      <div><dt className="text-muted-foreground">Email</dt><dd className="font-medium">{viewUser.email}</dd></div>
                      <div><dt className="text-muted-foreground">Role</dt><dd className="font-medium">{viewUser.role_name ?? '—'}</dd></div>
                    </dl>
                  )}
                </DialogContent>
              </Dialog>

              <Dialog open={!!editUser} onOpenChange={(open) => !open && setEditUser(null)}>
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Edit user</DialogTitle>
                  </DialogHeader>
                  <form onSubmit={editUserForm.handleSubmit(saveEditUser)} className="space-y-4">
                    <div className="space-y-1">
                      <Label>Full name</Label>
                      <Input {...editUserForm.register('full_name')} />
                      {editUserForm.formState.errors.full_name && (
                        <p className="text-xs text-destructive">{editUserForm.formState.errors.full_name.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Email</Label>
                      <Input type="email" autoComplete="off" {...editUserForm.register('email')} />
                      {editUserForm.formState.errors.email && (
                        <p className="text-xs text-destructive">{editUserForm.formState.errors.email.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>New password (optional)</Label>
                      <PasswordInput autoComplete="new-password" {...editUserForm.register('password')} placeholder="Leave blank to keep current" />
                      {editUserForm.formState.errors.password && (
                        <p className="text-xs text-destructive">{editUserForm.formState.errors.password.message}</p>
                      )}
                    </div>
                    <div className="space-y-1">
                      <Label>Role</Label>
                      {editUser?.role_slug === 'admin' ? (
                        <Input value={editUser.role_name ?? 'Admin'} disabled />
                      ) : (
                        <Select
                          value={editUserForm.watch('role_id') ? String(editUserForm.watch('role_id')) : undefined}
                          onValueChange={(v) => editUserForm.setValue('role_id', parseInt(v, 10), { shouldValidate: true })}
                        >
                          <SelectTrigger><SelectValue placeholder="Select role" /></SelectTrigger>
                          <SelectContent>
                            {assignableRoles.map((r) => (
                              <SelectItem key={r.id} value={String(r.id)}>{r.name}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <DialogFooter>
                      <Button type="button" variant="outline" onClick={() => setEditUser(null)}>Cancel</Button>
                      <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save changes'}</Button>
                    </DialogFooter>
                  </form>
                </DialogContent>
              </Dialog>

              <Dialog
                open={!!resetUser}
                onOpenChange={(open) => {
                  if (!open) {
                    setResetUser(null);
                    setResetPassword('');
                  }
                }}
              >
                <DialogContent className="sm:max-w-md">
                  <DialogHeader>
                    <DialogTitle>Reset password</DialogTitle>
                  </DialogHeader>
                  {resetUser && (
                    <form
                      className="space-y-4"
                      autoComplete="off"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void saveResetPassword();
                      }}
                    >
                      <p className="text-sm text-muted-foreground">
                        Set a new password for {resetUser.full_name || resetUser.email}.
                      </p>
                      {/* Keep browser autofill inside the dialog instead of the Users search field */}
                      <input
                        type="email"
                        name="username"
                        autoComplete="username"
                        value={resetUser.email}
                        readOnly
                        tabIndex={-1}
                        aria-hidden
                        className="sr-only"
                      />
                      <div className="space-y-1">
                        <Label htmlFor="reset-user-password">New password</Label>
                        <PasswordInput
                          id="reset-user-password"
                          name="new-password"
                          autoComplete="new-password"
                          value={resetPassword}
                          onChange={(e) => setResetPassword(e.target.value)}
                        />
                      </div>
                      <DialogFooter>
                        <Button type="button" variant="outline" onClick={() => setResetUser(null)}>
                          Cancel
                        </Button>
                        <Button type="submit" disabled={saving}>
                          {saving ? 'Saving…' : 'Reset password'}
                        </Button>
                      </DialogFooter>
                    </form>
                  )}
                </DialogContent>
              </Dialog>
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
      </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}
