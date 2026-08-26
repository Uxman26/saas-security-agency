'use client';

import { Fragment, useCallback, useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { companyUserSchema, companyUserUpdateSchema, passwordFieldSchema } from '@/lib/validation';
import type { z } from 'zod';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { AppShell } from '@/components/app-shell';
import { InlineFormSkeleton } from '@/components/skeletons';
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
import { canModule, isAdminBypass } from '@/lib/permissions';
import type {
  Role,
  CompanyUser,
  PermissionMatrix,
  AppModule,
  AppModuleActionDef,
  Client,
  Site,
  Guard,
} from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import {
  Shield,
  Trash2,
  UserPlus,
  Eye,
  Pencil,
  KeyRound,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';

type CompanyUserFormData = z.infer<typeof companyUserSchema>;
type CompanyUserUpdateFormData = z.infer<typeof companyUserUpdateSchema>;
import { toast } from '@/lib/toast';

/** Client/Staff linkage plus site pins, shared by the add and edit user dialogs.
 *
 * Only rendered for the roles that need it: the API requires client_id for Client and
 * guard_id for Staff, and site pins are meaningless on any other role.
 */
function UserScopeFields({
  roleSlug,
  clientId,
  guardId,
  siteIds,
  clients,
  sites,
  guards,
  onClientChange,
  onGuardChange,
  onSitesChange,
}: {
  roleSlug: string | null;
  clientId: number | null | undefined;
  guardId: number | null | undefined;
  siteIds: number[];
  clients: Client[];
  sites: Site[];
  guards: Guard[];
  onClientChange: (v: number | null) => void;
  onGuardChange: (v: number | null) => void;
  onSitesChange: (v: number[]) => void;
}) {
  const clientSites = useMemo(
    () => (clientId ? sites.filter((s) => s.client_id === clientId) : []),
    [sites, clientId]
  );

  if (roleSlug === 'staff') {
    return (
      <div className="space-y-1">
        <Label>
          Staff profile <span className="text-destructive">*</span>
        </Label>
        <Select
          value={guardId ? String(guardId) : undefined}
          onValueChange={(v) => onGuardChange(v ? Number(v) : null)}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select staff member" />
          </SelectTrigger>
          <SelectContent>
            {guards.map((g) => (
              <SelectItem key={g.id} value={String(g.id)}>
                {g.full_name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground">The Staff role must be linked to a staff profile.</p>
      </div>
    );
  }

  if (roleSlug !== 'client') return null;

  return (
    <div className="space-y-3 rounded-md border p-3">
      <div className="space-y-1">
        <Label>
          Client <span className="text-destructive">*</span>
        </Label>
        <Select
          value={clientId ? String(clientId) : undefined}
          onValueChange={(v) => {
            const next = v ? Number(v) : null;
            onClientChange(next);
            // Pins belong to the old client's sites; keeping them would be invalid.
            onSitesChange([]);
          }}
        >
          <SelectTrigger>
            <SelectValue placeholder="Select client" />
          </SelectTrigger>
          <SelectContent>
            {clients.map((c) => (
              <SelectItem key={c.id} value={String(c.id)}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {clientId ? (
        <div className="space-y-1">
          <Label>Site access</Label>
          {clientSites.length === 0 ? (
            <p className="text-xs text-muted-foreground">This client has no sites yet.</p>
          ) : (
            <>
              <div className="max-h-48 overflow-y-auto rounded-md border divide-y">
                {clientSites.map((s) => {
                  const checked = siteIds.includes(s.id);
                  return (
                    <label key={s.id} className="flex items-center gap-2 p-2 text-sm cursor-pointer">
                      <input
                        type="checkbox"
                        className="size-4 accent-primary"
                        checked={checked}
                        onChange={(e) =>
                          onSitesChange(
                            e.target.checked
                              ? [...siteIds, s.id]
                              : siteIds.filter((id) => id !== s.id)
                          )
                        }
                      />
                      <span>{s.name}</span>
                    </label>
                  );
                })}
              </div>
              <p className="text-[11px] text-muted-foreground">
                {siteIds.length === 0
                  ? 'None selected — this login sees every site of the client.'
                  : `Restricted to ${siteIds.length} of ${clientSites.length} sites.`}
              </p>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

const CORE_ACTIONS = ['view', 'create', 'edit', 'delete'] as const;
const CORE_LABELS: Record<string, string> = {
  view: 'View',
  create: 'Add',
  edit: 'Edit',
  delete: 'Delete',
};

const FALLBACK_ACTIONS: AppModuleActionDef[] = CORE_ACTIONS.map((k) => ({
  key: k,
  label: CORE_LABELS[k],
  parent: null,
}));

/** A module's permission list, as served by the backend catalogue. */
function actionsOf(mod: AppModule): AppModuleActionDef[] {
  return mod.actions && mod.actions.length ? mod.actions : FALLBACK_ACTIONS;
}

function specialActionsOf(mod: AppModule): AppModuleActionDef[] {
  return actionsOf(mod).filter((a) => !CORE_ACTIONS.includes(a.key as (typeof CORE_ACTIONS)[number]));
}

function emptyMatrix(modules: AppModule[]): PermissionMatrix {
  return Object.fromEntries(
    modules.map((m) => [m.key, Object.fromEntries(actionsOf(m).map((a) => [a.key, false]))])
  );
}

function cloneMatrix(m: PermissionMatrix): PermissionMatrix {
  return JSON.parse(JSON.stringify(m)) as PermissionMatrix;
}

function grantedCount(matrix: PermissionMatrix, mod: AppModule): number {
  const cell = matrix[mod.key] ?? {};
  return actionsOf(mod).filter((a) => cell[a.key]).length;
}

function MatrixTable({
  matrix,
  modules,
  onToggle,
  onToggleModule,
  readOnly,
}: {
  matrix: PermissionMatrix;
  modules: AppModule[];
  onToggle: (mod: string, act: string, v: boolean) => void;
  onToggleModule: (mod: AppModule, v: boolean) => void;
  readOnly: boolean;
}) {
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const anyExpanded = Object.values(expanded).some(Boolean);

  const toggleAllRows = () => {
    if (anyExpanded) {
      setExpanded({});
      return;
    }
    setExpanded(Object.fromEntries(modules.map((m) => [m.key, true])));
  };

  return (
    <div className="space-y-2">
      <div className="flex justify-end">
        <Button type="button" variant="ghost" size="sm" onClick={toggleAllRows}>
          {anyExpanded ? 'Collapse all' : 'Expand all actions'}
        </Button>
      </div>
      <div className="overflow-x-auto rounded-md border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-56">Module</TableHead>
              {CORE_ACTIONS.map((a) => (
                <TableHead key={a} className="text-center w-20">
                  {CORE_LABELS[a]}
                </TableHead>
              ))}
              <TableHead className="w-44 text-right">Specific actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {modules.map((mod) => {
              const cell = matrix[mod.key] ?? {};
              const available = new Set(actionsOf(mod).map((a) => a.key));
              const specials = specialActionsOf(mod);
              const isOpen = Boolean(expanded[mod.key]);
              const total = actionsOf(mod).length;
              const granted = grantedCount(matrix, mod);
              return (
                <Fragment key={mod.key}>
                  <TableRow>
                    <TableCell className="font-medium">
                      {mod.name}
                      <span className="ml-2 text-xs text-muted-foreground">
                        {granted}/{total}
                      </span>
                    </TableCell>
                    {CORE_ACTIONS.map((act) => (
                      <TableCell key={act} className="text-center">
                        {available.has(act) ? (
                          <input
                            type="checkbox"
                            aria-label={`${mod.name} ${CORE_LABELS[act]}`}
                            className="size-4 accent-primary cursor-pointer disabled:opacity-50"
                            checked={Boolean(cell[act])}
                            disabled={readOnly}
                            onChange={(e) => onToggle(mod.key, act, e.target.checked)}
                          />
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    ))}
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        {!readOnly && (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => onToggleModule(mod, granted < total)}
                          >
                            {granted < total ? 'All' : 'None'}
                          </Button>
                        )}
                        {specials.length > 0 ? (
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            aria-expanded={isOpen}
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [mod.key]: !prev[mod.key] }))
                            }
                          >
                            {isOpen ? (
                              <ChevronDown className="mr-1 size-3" />
                            ) : (
                              <ChevronRight className="mr-1 size-3" />
                            )}
                            {specials.length}
                          </Button>
                        ) : (
                          <span className="pr-2 text-xs text-muted-foreground">—</span>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                  {isOpen && specials.length > 0 && (
                    <TableRow className="bg-muted/40 hover:bg-muted/40">
                      <TableCell colSpan={CORE_ACTIONS.length + 2} className="py-3">
                        <div className="grid grid-cols-1 gap-x-6 gap-y-2 pl-2 sm:grid-cols-2 lg:grid-cols-3">
                          {specials.map((a) => (
                            <label
                              key={a.key}
                              className="flex items-center gap-2 text-sm"
                              title={`${mod.key}.${a.key}`}
                            >
                              <input
                                type="checkbox"
                                className="size-4 shrink-0 accent-primary cursor-pointer disabled:opacity-50"
                                checked={Boolean(cell[a.key])}
                                disabled={readOnly}
                                onChange={(e) => onToggle(mod.key, a.key, e.target.checked)}
                              />
                              <span className="truncate">{a.label}</span>
                            </label>
                          ))}
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              );
            })}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}

export default function RolesSettingsPage() {
  const router = useRouter();
  const { user } = useAuth();
  const [roles, setRoles] = useState<Role[]>([]);
  const [appModules, setAppModules] = useState<AppModule[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newMatrix, setNewMatrix] = useState<PermissionMatrix>({});
  const [editId, setEditId] = useState<number | null>(null);
  const [editMatrix, setEditMatrix] = useState<PermissionMatrix>({});
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
  const [editName, setEditName] = useState('');
  const [viewMatrixRole, setViewMatrixRole] = useState<Role | null>(null);
  const [viewMatrix, setViewMatrix] = useState<PermissionMatrix>({});
  const [allModules, setAllModules] = useState<AppModule[]>([]);
  const [moduleEdit, setModuleEdit] = useState<AppModule | null>(null);
  const [moduleCreateOpen, setModuleCreateOpen] = useState(false);
  const [newModuleKey, setNewModuleKey] = useState('');
  const [newModuleName, setNewModuleName] = useState('');
  const [newModulePath, setNewModulePath] = useState('');
  const [tab, setTab] = useState<'roles' | 'users' | 'modules'>('roles');
  // Needed to link Client/Staff logins and to pin a Client login to specific sites.
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);

  const userForm = useForm<CompanyUserFormData>({
    resolver: zodResolver(companyUserSchema),
    defaultValues: { email: '', password: '', full_name: '', role_id: 1, client_id: null, guard_id: null, site_ids: [] },
  });

  const editUserForm = useForm<CompanyUserUpdateFormData>({
    resolver: zodResolver(companyUserUpdateSchema),
    defaultValues: { email: '', password: '', full_name: '', role_id: 1, client_id: null, guard_id: null, site_ids: [] },
  });

  const assignableRoles = useMemo(() => roles.filter((r) => r.slug !== 'admin'), [roles]);

  const slugForRoleId = useCallback(
    (id: number | null | undefined) => roles.find((r) => r.id === id)?.slug ?? null,
    [roles]
  );

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
    const [r, u, mods, allMods] = await Promise.all([
      api.roles.list(),
      api.users.list(),
      api.modules.list(),
      api.modules.list({ all_modules: true }),
    ]);
    setRoles(r);
    setUsers(u);
    setAppModules(mods);
    setAllModules(allMods);
    setNewMatrix(emptyMatrix(mods));
    // Best-effort: these only feed the Client/Staff pickers, so a caller without
    // permission on those modules still gets a working Users tab.
    api.clients.list().then(setClients).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
    api.guards.list().then(setGuards).catch(() => {});
  }, []);

  useEffect(() => {
    if (!user) return;
    if (!canModule(user, 'roles', 'view')) {
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
    const prev = matrix[mod] ?? {};
    setM({
      ...matrix,
      [mod]: { ...prev, [act]: v },
    });
  };

  const toggleModuleAll = (
    matrix: PermissionMatrix,
    setM: (m: PermissionMatrix) => void,
    mod: AppModule,
    v: boolean
  ) => {
    const actions: AppModuleActionDef[] =
      mod.actions && mod.actions.length
        ? mod.actions
        : (['view', 'create', 'edit', 'delete'] as const).map((k) => ({
            key: k,
            label: k,
            parent: null,
          }));
    setM({
      ...matrix,
      [mod.key]: Object.fromEntries(actions.map((a) => [a.key, v])),
    });
  };

  const startEdit = (role: Role) => {
    if (role.slug === 'admin') {
      setViewMatrixRole(role);
      setViewMatrix(cloneMatrix(role.matrix));
      return;
    }
    if (!role.uses_matrix) return;
    setEditId(role.id);
    setEditName(role.name);
    setEditMatrix(cloneMatrix(role.matrix));
  };

  const saveEdit = async () => {
    if (editId == null) return;
    setSaving(true);
    try {
      const payload: { matrix: PermissionMatrix; name?: string } = { matrix: editMatrix };
      const role = roles.find((r) => r.id === editId);
      if (role && !role.is_system && editName.trim() && editName.trim() !== role.name) {
        payload.name = editName.trim();
      }
      await api.roles.update(editId, payload);
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
      setNewMatrix(emptyMatrix(appModules));
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
    const slug = slugForRoleId(data.role_id);
    // The API returns a 400 for these, but catching them here keeps the dialog open with
    // the half-filled form instead of surfacing a toast over a closed one.
    if (slug === 'client' && !data.client_id) {
      toast.error('Select a client for this login');
      return;
    }
    if (slug === 'staff' && !data.guard_id) {
      toast.error('Select a staff profile for this login');
      return;
    }
    setSaving(true);
    try {
      await api.users.create({
        email: data.email,
        password: data.password,
        full_name: data.full_name,
        role_id: data.role_id,
        client_id: slug === 'client' ? data.client_id : null,
        guard_id: slug === 'staff' ? data.guard_id : null,
        site_ids: slug === 'client' ? (data.site_ids ?? []) : [],
      });
      setAddUserOpen(false);
      userForm.reset({ email: '', password: '', full_name: '', role_id: 0, client_id: null, guard_id: null, site_ids: [] });
      await load();
      toast.success('User created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create user');
    } finally {
      setSaving(false);
    }
  };

  const createModule = async () => {
    const key = newModuleKey.trim();
    const name = newModuleName.trim();
    const path = newModulePath.trim();
    if (!key || !name || !path) return;
    setSaving(true);
    try {
      await api.modules.create({ key, name, sidebar_path: path, icon: 'LayoutDashboard', section_key: 'sectionOperations' });
      setModuleCreateOpen(false);
      setNewModuleKey('');
      setNewModuleName('');
      setNewModulePath('');
      await load();
      toast.success('Module created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to create module');
    } finally {
      setSaving(false);
    }
  };

  const saveModuleEdit = async () => {
    if (!moduleEdit) return;
    setSaving(true);
    try {
      await api.modules.update(moduleEdit.id, {
        name: moduleEdit.name,
        sidebar_path: moduleEdit.sidebar_path,
        section_key: moduleEdit.section_key,
        is_active: moduleEdit.is_active,
        icon: moduleEdit.icon,
      });
      setModuleEdit(null);
      await load();
      toast.success('Module updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to update module');
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
      client_id: u.client_id ?? null,
      guard_id: u.guard_id ?? null,
      site_ids: u.site_ids ?? [],
    });
  };

  const saveEditUser = async (data: CompanyUserUpdateFormData) => {
    if (!editUser) return;
    setSaving(true);
    try {
      const slug = slugForRoleId(data.role_id);
      await api.users.update(editUser.id, {
        email: data.email,
        full_name: data.full_name,
        role_id: data.role_id,
        ...(data.password ? { password: data.password } : {}),
        ...(slug === 'client' ? { client_id: data.client_id ?? null } : {}),
        ...(slug === 'staff' ? { guard_id: data.guard_id ?? null } : {}),
        // Always sent for Client logins so clearing every box clears the pins; other
        // roles have no pins to manage.
        ...(slug === 'client' ? { site_ids: data.site_ids ?? [] } : {}),
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

  const canWrite = user && canModule(user, 'roles', 'edit');
  const canDelete = user && canModule(user, 'roles', 'delete');
  // The Users tab is gated on the fine-grained users_* rights the API itself enforces.
  // Gating it on roles.edit hid Edit and Reset password from roles that were granted
  // exactly those rights, leaving no way to set a user's password from this screen.
  const canCreateUsers = user && canModule(user, 'roles', 'users_create');
  const canEditUsers = user && canModule(user, 'roles', 'users_edit');
  const canResetUserPassword = user && canModule(user, 'roles', 'users_reset_password');
  const canDeleteUsers = user && canModule(user, 'roles', 'users_delete');
  const canAssignRole = user && canModule(user, 'roles', 'users_assign_role');
  const canManageModules = user && isAdminBypass(user);
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
            <InlineFormSkeleton />
          ) : (
            <>
              <ModuleTabs
                tabs={[
                  { id: 'roles', label: 'Roles' },
                  { id: 'users', label: 'Users' },
                  { id: 'modules', label: 'Modules' },
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
                            {r.slug === 'admin' && (
                              <Button variant="outline" size="sm" onClick={() => startEdit(r)}>
                                View matrix
                              </Button>
                            )}
                            {r.slug !== 'admin' && r.uses_matrix && canWrite && (
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
                        <div className="space-y-2">
                          <p className="font-medium">Editing: {editing.name}</p>
                          {!editing.is_system && (
                            <div className="flex items-center gap-2">
                              <Label htmlFor="edit-role-name" className="text-sm text-muted-foreground">Name</Label>
                              <Input
                                id="edit-role-name"
                                value={editName}
                                onChange={(e) => setEditName(e.target.value)}
                                className="max-w-xs"
                              />
                            </div>
                          )}
                        </div>
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
                        modules={appModules}
                        readOnly={false}
                        onToggle={(mod, act, v) => toggleCell(editMatrix, setEditMatrix, mod, act, v)}
                        onToggleModule={(mod, v) => toggleModuleAll(editMatrix, setEditMatrix, mod, v)}
                      />
                    </div>
                  )}

                  {viewMatrixRole && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between gap-4 flex-wrap">
                        <p className="font-medium">Admin role matrix (read-only)</p>
                        <Button variant="outline" size="sm" onClick={() => setViewMatrixRole(null)}>
                          Close
                        </Button>
                      </div>
                      <MatrixTable
                        matrix={viewMatrix}
                        modules={appModules}
                        readOnly={true}
                        onToggle={() => {}}
                        onToggleModule={() => {}}
                      />
                    </div>
                  )}

                  {roles.some((r) => r.slug === 'admin') && !viewMatrixRole && (
                    <p className="text-sm text-muted-foreground">
                      The Admin role is fixed and cannot be renamed, edited, or deleted.
                    </p>
                  )}
                </CardContent>
              </Card>
              )}

              {tab === 'modules' && (
              <Card className="border-border/60">
                <CardHeader className="flex flex-row items-center justify-between gap-4">
                  <div>
                    <CardTitle>App modules</CardTitle>
                    <CardDescription>Sidebar modules and permission keys. New modules appear in the role matrix after refresh.</CardDescription>
                  </div>
                  {canManageModules && (
                    <Button size="sm" onClick={() => setModuleCreateOpen(true)}>
                      New module
                    </Button>
                  )}
                </CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Key</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Section</TableHead>
                        <TableHead>Active</TableHead>
                        {canManageModules && <TableHead className="text-right">Actions</TableHead>}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allModules.map((m) => (
                        <TableRow key={m.id}>
                          <TableCell className="font-mono text-xs">{m.key}</TableCell>
                          <TableCell>{m.name}</TableCell>
                          <TableCell className="text-sm text-muted-foreground">{m.sidebar_path}</TableCell>
                          <TableCell className="text-sm">{m.section_key}</TableCell>
                          <TableCell>{m.is_active ? 'Yes' : 'No'}</TableCell>
                          {canManageModules && (
                            <TableCell className="text-right">
                              <Button variant="outline" size="sm" onClick={() => setModuleEdit(m)}>
                                Edit
                              </Button>
                            </TableCell>
                          )}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
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
                  {canCreateUsers && (
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
                            ) : canAssignRole ? (
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
                              {canEditUsers && (
                                <Button variant="ghost" size="sm" onClick={() => openEditUser(u)}>
                                  <Pencil className="size-3.5 mr-1" />
                                  Edit
                                </Button>
                              )}
                              {canResetUserPassword && (
                                <Button variant="ghost" size="sm" onClick={() => { setResetUser(u); setResetPassword(''); }}>
                                  <KeyRound className="size-3.5 mr-1" />
                                  Reset password
                                </Button>
                              )}
                              {canDeleteUsers && (
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
                    <UserScopeFields
                      roleSlug={slugForRoleId(userForm.watch('role_id'))}
                      clientId={userForm.watch('client_id')}
                      guardId={userForm.watch('guard_id')}
                      siteIds={userForm.watch('site_ids') ?? []}
                      clients={clients}
                      sites={sites}
                      guards={guards}
                      onClientChange={(v) => userForm.setValue('client_id', v, { shouldValidate: true })}
                      onGuardChange={(v) => userForm.setValue('guard_id', v, { shouldValidate: true })}
                      onSitesChange={(v) => userForm.setValue('site_ids', v, { shouldValidate: true })}
                    />
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
                    <UserScopeFields
                      roleSlug={slugForRoleId(editUserForm.watch('role_id'))}
                      clientId={editUserForm.watch('client_id')}
                      guardId={editUserForm.watch('guard_id')}
                      siteIds={editUserForm.watch('site_ids') ?? []}
                      clients={clients}
                      sites={sites}
                      guards={guards}
                      onClientChange={(v) => editUserForm.setValue('client_id', v, { shouldValidate: true })}
                      onGuardChange={(v) => editUserForm.setValue('guard_id', v, { shouldValidate: true })}
                      onSitesChange={(v) => editUserForm.setValue('site_ids', v, { shouldValidate: true })}
                    />
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
                  modules={appModules}
                  readOnly={false}
                  onToggle={(mod, act, v) => toggleCell(newMatrix, setNewMatrix, mod, act, v)}
                  onToggleModule={(mod, v) => toggleModuleAll(newMatrix, setNewMatrix, mod, v)}
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

          <Dialog open={moduleCreateOpen} onOpenChange={setModuleCreateOpen}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>New module</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <div className="space-y-1">
                  <Label>Key</Label>
                  <Input value={newModuleKey} onChange={(e) => setNewModuleKey(e.target.value)} placeholder="e.g. sub_contractors" />
                </div>
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={newModuleName} onChange={(e) => setNewModuleName(e.target.value)} placeholder="Sub-contractors" />
                </div>
                <div className="space-y-1">
                  <Label>Sidebar path</Label>
                  <Input value={newModulePath} onChange={(e) => setNewModulePath(e.target.value)} placeholder="/sub-contractors" />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setModuleCreateOpen(false)}>Cancel</Button>
                <Button onClick={createModule} disabled={saving || !newModuleKey.trim() || !newModuleName.trim() || !newModulePath.trim()}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!moduleEdit} onOpenChange={(open) => !open && setModuleEdit(null)}>
            <DialogContent className="sm:max-w-md">
              <DialogHeader>
                <DialogTitle>Edit module</DialogTitle>
              </DialogHeader>
              {moduleEdit && (
                <div className="space-y-3">
                  <div className="space-y-1">
                    <Label>Key</Label>
                    <Input value={moduleEdit.key} disabled />
                  </div>
                  <div className="space-y-1">
                    <Label>Name</Label>
                    <Input value={moduleEdit.name} onChange={(e) => setModuleEdit({ ...moduleEdit, name: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Sidebar path</Label>
                    <Input value={moduleEdit.sidebar_path} onChange={(e) => setModuleEdit({ ...moduleEdit, sidebar_path: e.target.value })} />
                  </div>
                  <div className="space-y-1">
                    <Label>Section key</Label>
                    <Input value={moduleEdit.section_key} onChange={(e) => setModuleEdit({ ...moduleEdit, section_key: e.target.value })} />
                  </div>
                  <div className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      className="size-4 accent-primary"
                      checked={moduleEdit.is_active}
                      onChange={(e) => setModuleEdit({ ...moduleEdit, is_active: e.target.checked })}
                    />
                    <Label>Active</Label>
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setModuleEdit(null)}>Cancel</Button>
                <Button onClick={saveModuleEdit} disabled={saving}>Save</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
      </ModulePage>
    </AppShell>
    </ProtectedRoute>
  );
}
