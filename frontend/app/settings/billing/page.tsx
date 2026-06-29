'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BillingCycleToggle } from '@/components/billing/billing-cycle-toggle';
import { PricingGrid } from '@/components/billing/pricing-grid';
import { api } from '@/lib/api';
import type { PlanTier } from '@/lib/types';
import { DEFAULT_PLAN_TIERS } from '@/lib/plan-tiers';
import { CreditCard, Loader2, Receipt } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';

type Subscription = {
  subscription_tier?: string | null;
  billing_cycle?: string | null;
  subscription_status?: string | null;
  subscription_end?: string | null;
};

export default function BillingSettingsPage() {
  const tp = useTranslations('marketing.plans');
  const tcommon = useTranslations('common');
  const tpayment = useTranslations('payment');
  const tb = useTranslations('billing');
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [receipts, setReceipts] = useState<Awaited<ReturnType<typeof api.billing.receipts>>>([]);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [yearlyDiscount, setYearlyDiscount] = useState(20);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ tier: string; amount: number } | null>(null);

  const load = async () => {
    const [pkg, subscription, billingReceipts, stripeCfg] = await Promise.all([
      api.packages.list().catch(() => DEFAULT_PLAN_TIERS),
      api.subscriptions.get().catch(() => null),
      api.billing.receipts().catch(() => []),
      api.stripe.config().catch((): { enabled: boolean; publishable_key: string; yearly_discount_percent?: number } => ({
        enabled: false,
        publishable_key: '',
      })),
    ]);
    setTiers(pkg.length ? pkg : DEFAULT_PLAN_TIERS);
    setSub(subscription);
    setReceipts(billingReceipts);
    setStripeEnabled(stripeCfg.enabled);
    if (stripeCfg.yearly_discount_percent) setYearlyDiscount(stripeCfg.yearly_discount_percent);
    if (subscription?.billing_cycle === 'yearly' || subscription?.billing_cycle === 'monthly') {
      setCycle(subscription.billing_cycle);
    }
    setLoading(false);
  };

  useEffect(() => {
    void load();
  }, []);

  const openPortal = async () => {
    try {
      const { url } = await api.stripe.portal();
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Billing portal unavailable');
    }
  };

  const upgrade = async (tier: string) => {
    setUpgrading(tier);
    setPreview(null);
    try {
      const p = await api.stripe.previewChange(tier, cycle);
      setPreview({ tier, amount: p.amount_due });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not preview upgrade');
      setUpgrading(null);
    }
  };

  const confirmUpgrade = async () => {
    if (!preview) return;
    try {
      await api.stripe.changePlan(preview.tier, cycle);
      toast.success('Plan upgraded successfully');
      setPreview(null);
      setUpgrading(null);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upgrade failed');
    }
  };

  if (loading) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="flex justify-center py-24">
            <Loader2 className="size-8 animate-spin text-muted-foreground" />
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={<span className="flex items-center gap-2"><CreditCard className="size-7" /> {tb('title')}</span>}
            description={tb('description')}
            actions={
              stripeEnabled ? (
                <Button variant="outline" onClick={() => void openPortal()}>{tb('managePayment')}</Button>
              ) : undefined
            }
          />

          {sub && (
            <Card className="mb-8">
              <CardHeader>
                <CardTitle className="text-base">{tb('currentPlan')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">{tb('plan')}</p>
                  <p className="font-semibold capitalize">{sub.subscription_tier}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tb('billingCycle')}</p>
                  <p className="font-semibold capitalize">{sub.billing_cycle || 'monthly'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tb('status')}</p>
                  <p className="font-semibold capitalize">{sub.subscription_status || '—'}</p>
                </div>
              </CardContent>
            </Card>
          )}

          <div className="flex justify-center mb-8">
            <BillingCycleToggle
              value={cycle}
              onChange={setCycle}
              yearlyDiscount={yearlyDiscount}
              monthlyLabel={tpayment('monthly')}
              yearlyLabel={tpayment('yearly', { discount: yearlyDiscount })}
            />
          </div>

          <PricingGrid
            tiers={tiers}
            cycle={cycle}
            yearlyDiscount={yearlyDiscount}
            tp={tp}
            tr={tp}
            tcommon={tcommon}
            perMonthLabel={tcommon('perMonth')}
            getStartedLabel={tcommon('getStarted')}
            currentPlanLabel={tb('currentPlanBadge')}
            upgradeLabel={tb('upgrade')}
            currentTier={sub?.subscription_tier}
            currentCycle={sub?.billing_cycle}
            onUpgrade={(tier) => void upgrade(tier)}
            upgradingTier={upgrading}
          />

          <p className="mt-6 text-center text-sm text-muted-foreground">{tb('upgradeOnlyNote')}</p>

          {preview && (
            <Card className="mt-8 max-w-md mx-auto border-primary/30">
              <CardHeader>
                <CardTitle className="text-base">{tb('confirmUpgrade')}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-sm text-muted-foreground">
                  {tb('amountDueNow', { amount: preview.amount.toFixed(2) })}
                </p>
                <div className="flex gap-2">
                  <Button className="flex-1" onClick={() => void confirmUpgrade()}>{tb('confirm')}</Button>
                  <Button variant="outline" className="flex-1" onClick={() => { setPreview(null); setUpgrading(null); }}>
                    {tb('cancel')}
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {receipts.length > 0 && (
            <Card className="mt-10">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2"><Receipt className="size-4" /> {tb('receipts')}</CardTitle>
              </CardHeader>
              <CardContent className="divide-y">
                {receipts.map((r) => (
                  <div key={r.id} className="flex flex-wrap items-center justify-between gap-2 py-3 text-sm">
                    <div>
                      <p className="font-medium">{r.plan_name || 'Subscription'}</p>
                      <p className="text-muted-foreground">{r.paid_at ? new Date(r.paid_at).toLocaleDateString() : '—'}</p>
                    </div>
                    <div className="text-end">
                      <p className="font-semibold">£{r.amount.toFixed(2)}</p>
                      {r.invoice_url ? (
                        <Link href={r.invoice_url} target="_blank" className="text-primary text-xs hover:underline">Invoice</Link>
                      ) : null}
                    </div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
