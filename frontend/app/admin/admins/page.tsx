'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { AdminUserDetail } from '@/lib/types';
import { ALL_SIDEBAR_PATHS, SIDEBAR_LABELS } from '@/lib/sidebar-modules';
import { toast } from '@/lib/toast';

export default function AdminAdminsPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [admins, setAdmins] = useState<AdminUserDetail[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<AdminUserDetail | null>(null);
  const [modules, setModules] = useState<string[]>([]);
  const [newPassword, setNewPassword] = useState('');

  const load = useCallback(() => {
    api.admin.admins().then(setAdmins).catch(() => toast.error('Failed to load admins'));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
    setLoading(false);
  }, [user, router, load]);

  const openDetail = (a: AdminUserDetail) => {
    setSelected(a);
    setModules([...a.sidebar_modules]);
    setNewPassword('');
  };

  const toggleModule = (path: string) => {
    setModules((prev) => (prev.includes(path) ? prev.filter((p) => p !== path) : [...prev, path]));
  };

  const saveModules = async () => {
    if (!selected) return;
    try {
      const updated = await api.admin.patchSidebar(selected.id, modules);
      setSelected(updated);
      load();
      toast.success('Sidebar modules updated');
    } catch {
      toast.error('Failed to update modules');
    }
  };

  const savePassword = async () => {
    if (!selected || newPassword.length < 6) {
      toast.error('Password must be at least 6 characters');
      return;
    }
    try {
      await api.admin.resetPassword(selected.id, newPassword);
      setNewPassword('');
      toast.success('Password reset');
    } catch {
      toast.error('Failed to reset password');
    }
  };

  const toggleActive = async () => {
    if (!selected) return;
    try {
      await api.admin.patchUserActive(selected.id, !selected.is_active);
      const refreshed = await api.admin.admin(selected.id);
      setSelected(refreshed);
      load();
      toast.success(refreshed.is_active ? 'Admin activated' : 'Admin deactivated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Company admins</h1>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>All tenant admins</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : admins.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No admins.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell>Email</TableCell>
                      <TableCell>Company</TableCell>
                      <TableCell>Plan</TableCell>
                      <TableCell>Status</TableCell>
                      <TableCell>Days left</TableCell>
                      <TableCell>Active</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {admins.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.full_name}</TableCell>
                        <TableCell>{a.email}</TableCell>
                        <TableCell>{a.company_name ?? '-'}</TableCell>
                        <TableCell className="capitalize">{a.subscription_tier ?? '-'}</TableCell>
                        <TableCell className="capitalize">{a.subscription_status ?? '-'}</TableCell>
                        <TableCell>{a.subscription_days_left ?? '-'}</TableCell>
                        <TableCell>
                          <span className={a.is_active ? 'text-green-600' : 'text-red-600'}>
                            {a.is_active ? 'Yes' : 'No'}
                          </span>
                        </TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openDetail(a)}>
                            Manage
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

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{selected?.full_name}</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-6 text-sm">
                <div className="grid grid-cols-2 gap-2">
                  <span className="text-muted-foreground">Email</span>
                  <span>{selected.email}</span>
                  <span className="text-muted-foreground">Company</span>
                  <span>{selected.company_name}</span>
                  <span className="text-muted-foreground">Subscription</span>
                  <span className="capitalize">
                    {selected.subscription_tier} ({selected.subscription_status})
                  </span>
                  <span className="text-muted-foreground">Period end</span>
                  <span>
                    {selected.subscription_end
                      ? new Date(selected.subscription_end).toLocaleString()
                      : '-'}
                  </span>
                  <span className="text-muted-foreground">Days left</span>
                  <span>{selected.subscription_days_left ?? '-'}</span>
                  <span className="text-muted-foreground">Account active</span>
                  <span className={selected.is_active ? 'text-green-600' : 'text-red-600'}>
                    {selected.is_active ? 'Yes' : 'No'}
                  </span>
                </div>

                <div>
                  <Button
                    size="sm"
                    variant={selected.is_active ? 'destructive' : 'default'}
                    onClick={toggleActive}
                  >
                    {selected.is_active ? 'Deactivate account' : 'Activate account'}
                  </Button>
                </div>

                <div>
                  <p className="font-medium mb-2">Receipts</p>
                  {selected.receipts.length === 0 ? (
                    <p className="text-muted-foreground">No receipts</p>
                  ) : (
                    <ul className="space-y-1 border rounded-md p-2">
                      {selected.receipts.map((r) => (
                        <li key={r.id} className="flex justify-between gap-2">
                          <span className="font-mono text-xs">{r.ref_id}</span>
                          <span className="capitalize">{r.status}</span>
                          <span>£{r.amount.toFixed(2)}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div>
                  <p className="font-medium mb-2">Sidebar modules</p>
                  <div className="grid grid-cols-1 gap-2 max-h-48 overflow-y-auto border rounded-md p-3">
                    {ALL_SIDEBAR_PATHS.map((path) => (
                      <label key={path} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={modules.includes(path)}
                          disabled={path === '/dashboard'}
                          onChange={() => toggleModule(path)}
                          className="rounded border"
                        />
                        <span>{SIDEBAR_LABELS[path] ?? path}</span>
                      </label>
                    ))}
                  </div>
                  <Button className="mt-2" size="sm" onClick={saveModules}>
                    Save modules
                  </Button>
                </div>

                <div>
                  <p className="font-medium mb-2">Reset password</p>
                  <Label htmlFor="new_pw">New password</Label>
                  <Input
                    id="new_pw"
                    type="password"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    className="mt-1"
                  />
                  <Button className="mt-2" size="sm" variant="destructive" onClick={savePassword}>
                    Reset password
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
