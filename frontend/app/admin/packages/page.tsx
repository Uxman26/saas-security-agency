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
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';
import type { PlanTier } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminPackagesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanTier | null>(null);
  const [price, setPrice] = useState('');
  const [maxGuards, setMaxGuards] = useState('');
  const [maxSites, setMaxSites] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.admin.packages().then(setTiers).catch(() => toast.error('Failed to load packages')).finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    load();
  }, [user, router, load]);

  const openEdit = (t: PlanTier) => {
    setSelected(t);
    setPrice(String(t.price_gbp));
    setMaxGuards(t.max_guards != null ? String(t.max_guards) : '');
    setMaxSites(t.max_sites != null ? String(t.max_sites) : '');
    setMaxUsers(t.max_users != null ? String(t.max_users) : '');
  };

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api.admin.patchPackage(selected.tier, {
        price_gbp: parseFloat(price),
        max_guards: maxGuards ? parseInt(maxGuards, 10) : undefined,
        max_sites: maxSites ? parseInt(maxSites, 10) : undefined,
        max_users: maxUsers ? parseInt(maxUsers, 10) : undefined,
      });
      setTiers((prev) => prev.map((t) => (t.tier === updated.tier ? updated : t)));
      setSelected(updated);
      toast.success('Package updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Subscription packages</h1>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Plan tiers</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : tiers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No packages.</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableCell>Tier</TableCell>
                      <TableCell>Price (GBP/mo)</TableCell>
                      <TableCell>Max guards</TableCell>
                      <TableCell>Max sites</TableCell>
                      <TableCell />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {tiers.map((t) => (
                      <TableRow key={t.tier}>
                        <TableCell className="capitalize font-medium">{t.tier}</TableCell>
                        <TableCell>£{t.price_gbp.toFixed(2)}</TableCell>
                        <TableCell>{t.max_guards ?? '∞'}</TableCell>
                        <TableCell>{t.max_sites ?? '∞'}</TableCell>
                        <TableCell>
                          <Button size="sm" variant="outline" onClick={() => openEdit(t)}>
                            Edit
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
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="capitalize">Edit {selected?.tier} package</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-4">
                <div>
                  <Label htmlFor="price">Monthly price (GBP)</Label>
                  <Input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="guards">Max guards</Label>
                  <Input id="guards" type="number" value={maxGuards} onChange={(e) => setMaxGuards(e.target.value)} className="mt-1" placeholder="Unlimited" />
                </div>
                <div>
                  <Label htmlFor="sites">Max sites</Label>
                  <Input id="sites" type="number" value={maxSites} onChange={(e) => setMaxSites(e.target.value)} className="mt-1" placeholder="Unlimited" />
                </div>
                <div>
                  <Label htmlFor="users">Max users</Label>
                  <Input id="users" type="number" value={maxUsers} onChange={(e) => setMaxUsers(e.target.value)} className="mt-1" placeholder="Unlimited" />
                </div>
                <Button onClick={save} disabled={saving}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
