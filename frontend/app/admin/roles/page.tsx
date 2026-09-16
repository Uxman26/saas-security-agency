'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PlatformRoleAssignment } from '@/lib/types';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';

export default function AdminRolesPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const [roles, setRoles] = useState<Record<string, unknown>[]>([]);
  const [assignments, setAssignments] = useState<PlatformRoleAssignment[]>([]);
  const [open, setOpen] = useState(false);
  const [userId, setUserId] = useState('');
  const [roleSlug, setRoleSlug] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.admin.platformRoles(), api.admin.platformRoleAssignments()])
      .then(([r, a]) => {
        setRoles(r);
        setAssignments(a);
      })
      .catch(() => toast.error('Failed to load roles'));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  useEffect(() => {
    if (!roleSlug && roles.length) {
      const slug = String(roles[0].slug || roles[0].key || '');
      if (slug) setRoleSlug(slug);
    }
  }, [roles, roleSlug]);

  const assign = async () => {
    const uid = parseInt(userId, 10);
    if (!uid || !roleSlug) {
      toast.error('User ID and role required');
      return;
    }
    setSaving(true);
    try {
      await api.admin.assignPlatformRole({ user_id: uid, role_slug: roleSlug });
      toast.success('Role assigned');
      setOpen(false);
      setUserId('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Assign failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h1 className="text-3xl font-bold">Platform roles</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
              {can('config.write') && (
                <Button size="sm" onClick={() => setOpen(true)}>Assign role</Button>
              )}
            </div>
          </div>

          <Card>
            <CardHeader><CardTitle>Roles</CardTitle></CardHeader>
            <CardContent>
              {roles.length === 0 ? (
                <p className="text-sm text-muted-foreground">No roles defined.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Slug</TableHead>
                        <TableHead>Permissions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {roles.map((r, i) => (
                      <TableRow key={String(r.id ?? r.slug ?? i)}>
                        <TableCell>{String(r.name || '—')}</TableCell>
                        <TableCell className="font-mono text-xs">{String(r.slug || '—')}</TableCell>
                        <TableCell className="text-xs text-muted-foreground max-w-md">
                          {Array.isArray(r.permissions) ? (r.permissions as string[]).join(', ') : String(r.description || '—')}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Assignments</CardTitle></CardHeader>
            <CardContent>
              {assignments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No assignments.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>User</TableHead>
                      <TableHead>Email</TableHead>
                      <TableHead>Role</TableHead>
                      <TableHead>Assigned</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {assignments.map((a) => (
                      <TableRow key={`${a.user_id}-${a.role_id}`}>
                        <TableCell>{a.full_name || `#${a.user_id}`}</TableCell>
                        <TableCell>{a.email || '—'}</TableCell>
                        <TableCell>{a.role_name || a.role_slug || '—'}</TableCell>
                        <TableCell className="text-sm">
                          {a.assigned_at ? new Date(a.assigned_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Assign platform role</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Admin user ID</Label>
                <Input className="mt-1" value={userId} onChange={(e) => setUserId(e.target.value)} />
              </div>
              <div>
                <Label>Role</Label>
                <Select value={roleSlug} onValueChange={setRoleSlug}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Select role" /></SelectTrigger>
                  <SelectContent>
                    {roles.map((r) => {
                      const slug = String(r.slug || '');
                      return (
                        <SelectItem key={slug} value={slug}>
                          {String(r.name || slug)}
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
              </div>
              <Button disabled={saving} onClick={() => void assign()}>
                {saving ? 'Assigning...' : 'Assign'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
