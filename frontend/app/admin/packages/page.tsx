'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InlineTableSkeleton } from '@/components/skeletons';
import { api } from '@/lib/api';
import type { PackageFeature, PlanTier } from '@/lib/types';
import { formatPlanLimit } from '@/lib/plan-company-defaults';
import { formatPriceGBP } from '@/lib/plan-tiers';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { Check, Minus, Plus, Trash2 } from 'lucide-react';

const GROUP_ORDER = ['core', 'apps', 'comms', 'limits_support'] as const;

const GROUP_LABELS: Record<string, string> = {
  core: 'Core capabilities',
  apps: 'Apps & add-ons',
  comms: 'Communications',
  limits_support: 'Service level',
};

const TIER_BLURB: Record<string, string> = {
  basic: 'Entry plan for a single small operation',
  standard: 'Growing operations with sales and messaging',
  premium: 'Full platform with every app included',
  enterprise: 'Unlimited scale with dedicated support',
};

function groupFeatures(features: PackageFeature[]) {
  const seen = new Set<string>(GROUP_ORDER);
  const order = [...GROUP_ORDER, ...features.map((f) => f.group).filter((g) => !seen.has(g) && seen.add(g))];
  return order
    .map((group) => ({ group, items: features.filter((f) => f.group === group) }))
    .filter((g) => g.items.length > 0);
}

function FeatureLine({ label, included }: { label: string; included: boolean }) {
  return (
    <div className={cn('flex items-start gap-2 text-sm', included ? 'text-foreground' : 'text-muted-foreground/60')}>
      {included ? (
        <Check className="mt-0.5 size-4 shrink-0 text-emerald-600 dark:text-emerald-400" />
      ) : (
        <Minus className="mt-0.5 size-4 shrink-0" />
      )}
      <span className={cn(!included && 'line-through decoration-muted-foreground/40')}>{label}</span>
    </div>
  );
}

export default function AdminPackagesPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const canEdit = can('billing.write', 'config.write');
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [features, setFeatures] = useState<PackageFeature[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<PlanTier | null>(null);
  const [price, setPrice] = useState('');
  const [trialDays, setTrialDays] = useState('30');
  const [maxGuards, setMaxGuards] = useState('');
  const [maxSites, setMaxSites] = useState('');
  const [maxUsers, setMaxUsers] = useState('');
  const [draftFeatures, setDraftFeatures] = useState<Record<string, boolean>>({});
  const [saving, setSaving] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [newKey, setNewKey] = useState('');
  const [newLabel, setNewLabel] = useState('');
  const [newDesc, setNewDesc] = useState('');
  const [newGroup, setNewGroup] = useState('apps');

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([api.admin.packages(), api.admin.packageFeatures()])
      .then(([t, f]) => {
        setTiers(t);
        setFeatures(f);
      })
      .catch(() => toast.error('Failed to load packages'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const grouped = useMemo(() => groupFeatures(features), [features]);

  const openEdit = (t: PlanTier) => {
    setSelected(t);
    setPrice(String(t.price_gbp));
    setTrialDays(String(t.trial_days ?? 30));
    setMaxGuards(t.max_guards != null ? String(t.max_guards) : '');
    setMaxSites(t.max_sites != null ? String(t.max_sites) : '');
    setMaxUsers(t.max_users != null ? String(t.max_users) : '');
    setDraftFeatures(Object.fromEntries(features.map((f) => [f.key, !!t.features?.[f.key]])));
  };

  const toggleFeature = (key: string) => setDraftFeatures((prev) => ({ ...prev, [key]: !prev[key] }));

  const save = async () => {
    if (!selected) return;
    setSaving(true);
    try {
      const updated = await api.admin.patchPackage(selected.tier, {
        price_gbp: parseFloat(price),
        // Empty means unlimited, and null is how the API records that — sending
        // undefined would leave the previous cap in place instead.
        max_guards: maxGuards ? parseInt(maxGuards, 10) : null,
        max_sites: maxSites ? parseInt(maxSites, 10) : null,
        max_users: maxUsers ? parseInt(maxUsers, 10) : null,
        features: draftFeatures,
        trial_days: trialDays ? parseInt(trialDays, 10) : undefined,
      });
      setTiers((prev) => prev.map((t) => (t.tier === updated.tier ? updated : t)));
      setSelected(null);
      toast.success('Package updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const addFeature = async () => {
    if (!newKey.trim() || !newLabel.trim()) {
      toast.error('Key and label are required');
      return;
    }
    try {
      await api.admin.addPackageFeature({
        key: newKey.trim(),
        label: newLabel.trim(),
        description: newDesc.trim(),
        group: newGroup,
      });
      setNewKey('');
      setNewLabel('');
      setNewDesc('');
      setAddOpen(false);
      load();
      toast.success('Feature added — tick it on the packages that include it');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not add feature');
    }
  };

  const removeFeature = async (f: PackageFeature) => {
    try {
      await api.admin.deletePackageFeature(f.key);
      load();
      toast.success(`${f.label} removed`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not remove feature');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-3xl font-bold">Subscription packages</h1>
              <p className="mt-1 text-sm text-muted-foreground">
                What each plan costs, what it caps, and exactly which features and apps it includes.
              </p>
            </div>
            <div className="flex gap-2">
              {canEdit && (
                <Button variant="outline" size="sm" onClick={() => setAddOpen(true)}>
                  <Plus className="size-4" /> Add feature / app
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={load}>
                Refresh
              </Button>
            </div>
          </div>

          {loading ? (
            <InlineTableSkeleton />
          ) : tiers.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">No packages.</div>
          ) : (
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
              {tiers.map((t) => {
                const included = features.filter((f) => t.features?.[f.key]).length;
                return (
                  <Card key={t.tier} className="flex flex-col">
                    <CardHeader className="pb-3">
                      <CardTitle className="flex items-baseline justify-between capitalize">
                        <span>{t.tier}</span>
                        <span className="text-2xl font-bold">{formatPriceGBP(t.price_gbp)}</span>
                      </CardTitle>
                      <p className="text-xs text-muted-foreground">{TIER_BLURB[t.tier] ?? 'Custom plan'}</p>
                      <p className="text-xs text-muted-foreground">
                        per month · {t.trial_days ?? 30}-day trial · {included} of {features.length} features
                      </p>
                    </CardHeader>
                    <CardContent className="flex flex-1 flex-col gap-4">
                      <div className="grid grid-cols-3 gap-2 rounded-md border p-2 text-center text-xs">
                        <div>
                          <p className="text-muted-foreground">Staff</p>
                          <p className="font-semibold">{formatPlanLimit(t.max_guards)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Sites</p>
                          <p className="font-semibold">{formatPlanLimit(t.max_sites)}</p>
                        </div>
                        <div>
                          <p className="text-muted-foreground">Users</p>
                          <p className="font-semibold">{formatPlanLimit(t.max_users)}</p>
                        </div>
                      </div>

                      <div className="flex-1 space-y-3">
                        {grouped.map(({ group, items }) => (
                          <div key={group}>
                            <p className="mb-1 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                              {GROUP_LABELS[group] ?? group}
                            </p>
                            <div className="space-y-1">
                              {items.map((f) => (
                                <FeatureLine key={f.key} label={f.label} included={!!t.features?.[f.key]} />
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>

                      {canEdit && (
                        <Button size="sm" variant="outline" className="w-full" onClick={() => openEdit(t)}>
                          Edit package
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {!loading && canEdit && features.some((f) => f.custom) && (
            <Card className="mt-6">
              <CardHeader>
                <CardTitle className="text-base">Custom features</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {features
                  .filter((f) => f.custom)
                  .map((f) => (
                    <div key={f.key} className="flex items-center justify-between gap-3 rounded-md border p-2 text-sm">
                      <div className="min-w-0">
                        <p className="font-medium">{f.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {f.key}
                          {f.description ? ` · ${f.description}` : ''}
                        </p>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeFeature(f)}>
                        <Trash2 className="size-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
          <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="capitalize">Edit {selected?.tier} package</DialogTitle>
            </DialogHeader>
            {selected && (
              <div className="space-y-5">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <Label htmlFor="price">Monthly price (GBP)</Label>
                    <Input id="price" type="number" step="0.01" value={price} onChange={(e) => setPrice(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="trialDays">Trial days</Label>
                    <Input id="trialDays" type="number" min={1} max={365} value={trialDays} onChange={(e) => setTrialDays(e.target.value)} className="mt-1" />
                  </div>
                  <div>
                    <Label htmlFor="guards">Max staff</Label>
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
                </div>

                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    <p className="font-medium">Included features & apps</p>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => {
                        setSelected(null);
                        setAddOpen(true);
                      }}
                    >
                      <Plus className="size-4" /> Add feature
                    </Button>
                  </div>
                  {grouped.map(({ group, items }) => (
                    <div key={group} className="rounded-md border p-3">
                      <p className="mb-2 text-[10px] font-extrabold uppercase tracking-wider text-muted-foreground">
                        {GROUP_LABELS[group] ?? group}
                      </p>
                      <div className="space-y-2">
                        {items.map((f) => (
                          <label key={f.key} className="flex items-start gap-2 text-sm">
                            <input
                              type="checkbox"
                              className="mt-0.5 rounded border"
                              checked={!!draftFeatures[f.key]}
                              onChange={() => toggleFeature(f.key)}
                            />
                            <span>
                              {f.label}
                              {f.description ? (
                                <span className="block text-xs text-muted-foreground">{f.description}</span>
                              ) : null}
                            </span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>

                <Button onClick={save} disabled={saving} className="w-full">
                  {saving ? 'Saving...' : 'Save package'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={addOpen} onOpenChange={setAddOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add feature or app</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="f_label">Name</Label>
                <Input id="f_label" value={newLabel} onChange={(e) => setNewLabel(e.target.value)} className="mt-1" placeholder="Visitor kiosk" />
              </div>
              <div>
                <Label htmlFor="f_key">Key</Label>
                <Input id="f_key" value={newKey} onChange={(e) => setNewKey(e.target.value)} className="mt-1" placeholder="visitor_kiosk" />
              </div>
              <div>
                <Label htmlFor="f_desc">Description</Label>
                <Input id="f_desc" value={newDesc} onChange={(e) => setNewDesc(e.target.value)} className="mt-1" placeholder="What tenants get with it" />
              </div>
              <div>
                <Label htmlFor="f_group">Group</Label>
                <select
                  id="f_group"
                  value={newGroup}
                  onChange={(e) => setNewGroup(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm"
                >
                  {GROUP_ORDER.map((g) => (
                    <option key={g} value={g}>
                      {GROUP_LABELS[g]}
                    </option>
                  ))}
                </select>
              </div>
              <Button onClick={addFeature} className="w-full">
                Add feature
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
