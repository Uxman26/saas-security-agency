'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BillingCycleToggle } from '@/components/billing/billing-cycle-toggle';
import { PricingGrid } from '@/components/billing/pricing-grid';
import { Pill } from '@/components/module-dashboard';
import { api } from '@/lib/api';
import type { BillingReceipt, PackageFeature, PlanTier, SubscriptionInvoice, TrialStatus } from '@/lib/types';
import { DEFAULT_PLAN_TIERS } from '@/lib/plan-tiers';
import { CreditCard, Download, Eye, FileText, Loader2, Package, Receipt } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type Subscription = {
  subscription_tier?: string | null;
  billing_cycle?: string | null;
  subscription_status?: string | null;
  subscription_end?: string | null;
};

type Tab = 'overview' | 'invoices' | 'receipts' | 'plans';

const STATUS_TONE: Record<string, 'positive' | 'info' | 'danger' | 'warning' | 'muted'> = {
  paid: 'positive',
  unpaid: 'info',
  overdue: 'danger',
  partial: 'warning',
  cancelled: 'muted',
  voided: 'muted',
  refunded: 'muted',
  active: 'positive',
  trialing: 'info',
};

function fmtMoney(n: number, currency = 'gbp') {
  const v = Number.isFinite(n) ? n : 0;
  const code = (currency || 'gbp').toLowerCase();
  if (code === 'gbp') {
    return `£${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  return `${code.toUpperCase()} ${v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtDate(v?: string | null) {
  if (!v) return '—';
  const d = new Date(v);
  return Number.isNaN(d.getTime()) ? '—' : d.toLocaleDateString('en-GB');
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function StatusPill({ status }: { status?: string | null }) {
  const value = (status || '—').toLowerCase();
  return (
    <Pill tone={STATUS_TONE[value] || 'muted'}>
      <span className="capitalize">{value}</span>
    </Pill>
  );
}

function MetaCell({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="min-w-[7.5rem] space-y-1">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <div className="text-sm font-semibold text-foreground">{children}</div>
    </div>
  );
}

export default function BillingSettingsPage() {
  const tp = useTranslations('marketing.plans');
  const tcommon = useTranslations('common');
  const tpayment = useTranslations('payment');
  const tb = useTranslations('billing');
  const [tab, setTab] = useState<Tab>('overview');
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [featureCatalog, setFeatureCatalog] = useState<PackageFeature[]>([]);
  const [sub, setSub] = useState<Subscription | null>(null);
  const [trial, setTrial] = useState<TrialStatus | null>(null);
  const [receipts, setReceipts] = useState<BillingReceipt[]>([]);
  const [invoices, setInvoices] = useState<SubscriptionInvoice[]>([]);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [yearlyDiscount, setYearlyDiscount] = useState(20);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [loading, setLoading] = useState(true);
  const [upgrading, setUpgrading] = useState<string | null>(null);
  const [preview, setPreview] = useState<{ tier: string; amount: number } | null>(null);
  const [selectedInvoice, setSelectedInvoice] = useState<SubscriptionInvoice | null>(null);
  const [selectedReceipt, setSelectedReceipt] = useState<BillingReceipt | null>(null);
  const [downloading, setDownloading] = useState<string | null>(null);

  const load = async () => {
    const [pkg, pkgFeatures, subscription, billingReceipts, billingInvoices, stripeCfg, trialStatus] = await Promise.all([
      api.packages.list().catch(() => DEFAULT_PLAN_TIERS),
      api.packages.features().catch((): PackageFeature[] => []),
      api.subscriptions.get().catch(() => null),
      api.billing.receipts().catch(() => []),
      api.billing.invoices().catch(() => []),
      api.stripe.config().catch((): { enabled: boolean; publishable_key: string; yearly_discount_percent?: number } => ({
        enabled: false,
        publishable_key: '',
      })),
      api.subscriptions.trialStatus().catch(() => null),
    ]);
    setTiers(pkg.length ? pkg : DEFAULT_PLAN_TIERS);
    setFeatureCatalog(pkgFeatures);
    setSub(subscription);
    setTrial(trialStatus);
    setReceipts(billingReceipts);
    setInvoices(billingInvoices);
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
      setTab('plans');
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

  const downloadInvoice = async (inv: SubscriptionInvoice) => {
    const key = `inv-${inv.id}`;
    setDownloading(key);
    try {
      const blob = await api.billing.invoicePdf(inv.id);
      downloadBlob(blob, `${inv.invoice_number}.pdf`);
    } catch {
      toast.error(tb('downloadFailed'));
    } finally {
      setDownloading(null);
    }
  };

  const downloadReceipt = async (r: BillingReceipt) => {
    const key = `rcpt-${r.id}`;
    setDownloading(key);
    try {
      const blob = await api.billing.receiptPdf(r.id);
      downloadBlob(blob, `${r.receipt_number}.pdf`);
    } catch {
      toast.error(tb('downloadFailed'));
    } finally {
      setDownloading(null);
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

  const showTrial = !!(trial && (trial.trial_active || trial.trial_expired || trial.subscription_required));

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage className="max-w-6xl">
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <CreditCard className="size-7" /> {tb('title')}
              </span>
            }
            description={tb('description')}
            actions={
              stripeEnabled ? (
                <Button variant="outline" onClick={() => void openPortal()}>
                  {tb('managePayment')}
                </Button>
              ) : undefined
            }
          />

          <ModuleTabs
            tabs={[
              { id: 'overview', label: 'Overview' },
              { id: 'invoices', label: `${tb('invoices')} (${invoices.length})` },
              { id: 'receipts', label: `${tb('receipts')} (${receipts.length})` },
              { id: 'plans', label: 'Plans' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'overview' && (
            <div className="space-y-6">
              {showTrial && trial ? (
                <Card className="border-primary/20 bg-primary/[0.03]">
                  <CardHeader className="pb-3">
                    <CardTitle className="text-base">{tb('trialStatus')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                      <MetaCell label={tb('status')}>
                        {trial.label ||
                          (trial.trial_active
                            ? tb('trialActive')
                            : trial.trial_expired
                              ? tb('trialExpired')
                              : tb('subscriptionRequired'))}
                      </MetaCell>
                      <MetaCell label="Package">
                        <span className="capitalize">
                          {(trial.plan_tier || '').replace(/_/g, ' ') || '—'}
                          {trial.billing_cycle ? ` · ${trial.billing_cycle}` : ''}
                        </span>
                      </MetaCell>
                      <MetaCell label="Started">
                        {trial.trial_starts_on ? new Date(trial.trial_starts_on).toLocaleDateString() : '—'}
                      </MetaCell>
                      <MetaCell label={tb('endsOn')}>
                        {trial.trial_ends_on ? new Date(trial.trial_ends_on).toLocaleDateString() : '—'}
                      </MetaCell>
                      {trial.trial_active ? (
                        <MetaCell label={tb('daysRemaining')}>{trial.days_remaining ?? '—'}</MetaCell>
                      ) : null}
                    </div>
                    {(trial.trial_expired || trial.subscription_required) && !trial.can_use_paid_features ? (
                      <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900 dark:border-amber-900/50 dark:bg-amber-950/40 dark:text-amber-200">
                        {trial.restriction ||
                          'Adding new records and paid features are locked until the subscription is activated. You can still view and edit existing data.'}
                        <div className="mt-2">
                          <Button size="sm" onClick={() => setTab('plans')}>
                            {tb('upgradeNow')}
                          </Button>
                        </div>
                      </div>
                    ) : null}
                  </CardContent>
                </Card>
              ) : null}

              {sub ? (
                <Card>
                  <CardHeader className="pb-3">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <CardTitle className="text-base flex items-center gap-2">
                        <Package className="size-4" /> {tb('currentPlan')}
                      </CardTitle>
                      <StatusPill status={sub.subscription_status} />
                    </div>
                  </CardHeader>
                  <CardContent>
                    <div className="flex flex-wrap gap-x-8 gap-y-4">
                      <MetaCell label={tb('plan')}>
                        <span className="capitalize">{sub.subscription_tier || '—'}</span>
                      </MetaCell>
                      <MetaCell label={tb('billingCycle')}>
                        <span className="capitalize">{sub.billing_cycle || 'monthly'}</span>
                      </MetaCell>
                      {sub.subscription_end ? (
                        <MetaCell label={tb('endsOn')}>{new Date(sub.subscription_end).toLocaleDateString()}</MetaCell>
                      ) : null}
                    </div>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <Button variant="outline" size="sm" onClick={() => setTab('plans')}>
                        {tb('upgrade')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setTab('invoices')}>
                        {tb('invoices')}
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => setTab('receipts')}>
                        {tb('receipts')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : (
                <Card>
                  <CardContent className="flex flex-col items-start gap-3 py-8 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <p className="font-medium">{tb('subscriptionRequired')}</p>
                      <p className="text-sm text-muted-foreground mt-1">{tb('description')}</p>
                    </div>
                    <Button onClick={() => setTab('plans')}>{tb('upgradeNow')}</Button>
                  </CardContent>
                </Card>
              )}

              <div className="grid gap-4 sm:grid-cols-2">
                <button
                  type="button"
                  onClick={() => setTab('invoices')}
                  className="rounded-lg border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <FileText className="size-4 text-primary" /> {tb('invoices')}
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{invoices.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tb('noInvoices').split('.')[0]}.</p>
                </button>
                <button
                  type="button"
                  onClick={() => setTab('receipts')}
                  className="rounded-lg border bg-card p-4 text-start transition-colors hover:border-primary/40 hover:bg-muted/40"
                >
                  <div className="flex items-center gap-2 text-sm font-semibold">
                    <Receipt className="size-4 text-primary" /> {tb('receipts')}
                  </div>
                  <p className="mt-2 text-2xl font-bold tabular-nums">{receipts.length}</p>
                  <p className="mt-1 text-xs text-muted-foreground">{tb('noReceipts').split('.')[0]}.</p>
                </button>
              </div>
            </div>
          )}

          {tab === 'invoices' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <FileText className="size-4" /> {tb('invoices')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {invoices.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">{tb('noInvoices')}</p>
                ) : (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tb('invoiceNumber')}</TableHead>
                          <TableHead className="hidden sm:table-cell">{tb('plan')}</TableHead>
                          <TableHead className="hidden md:table-cell">{tb('period')}</TableHead>
                          <TableHead className="hidden lg:table-cell">{tb('dueDate')}</TableHead>
                          <TableHead className="text-right">{tb('amount')}</TableHead>
                          <TableHead className="text-right hidden sm:table-cell">{tb('paid')}</TableHead>
                          <TableHead>{tb('status')}</TableHead>
                          <TableHead className="text-right w-[88px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {invoices.map((inv) => (
                          <TableRow key={inv.id}>
                            <TableCell className="font-medium font-mono text-xs">{inv.invoice_number}</TableCell>
                            <TableCell className="capitalize hidden sm:table-cell">
                              {(inv.subscription_tier || '').replace(/_/g, ' ')} · {inv.billing_cycle}
                            </TableCell>
                            <TableCell className="text-muted-foreground hidden md:table-cell">
                              {fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}
                            </TableCell>
                            <TableCell className="hidden lg:table-cell">{fmtDate(inv.due_date)}</TableCell>
                            <TableCell className="text-right tabular-nums">{fmtMoney(inv.total_amount)}</TableCell>
                            <TableCell className="text-right tabular-nums hidden sm:table-cell">{fmtMoney(inv.amount_paid)}</TableCell>
                            <TableCell>
                              <StatusPill status={inv.status} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedInvoice(inv)}
                                  title={tb('viewDetails')}
                                >
                                  <Eye className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void downloadInvoice(inv)}
                                  disabled={downloading === `inv-${inv.id}`}
                                  title={tb('download')}
                                >
                                  {downloading === `inv-${inv.id}` ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Download className="size-4" />
                                  )}
                                </Button>
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
          )}

          {tab === 'receipts' && (
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Receipt className="size-4" /> {tb('receipts')}
                </CardTitle>
              </CardHeader>
              <CardContent>
                {receipts.length === 0 ? (
                  <p className="text-sm text-muted-foreground py-10 text-center">{tb('noReceipts')}</p>
                ) : (
                  <div className="overflow-x-auto -mx-1 px-1">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>{tb('invoiceNumber')}</TableHead>
                          <TableHead className="hidden sm:table-cell">{tb('plan')}</TableHead>
                          <TableHead className="hidden md:table-cell">{tb('paidOn')}</TableHead>
                          <TableHead className="hidden lg:table-cell">{tb('card')}</TableHead>
                          <TableHead className="text-right">{tb('amount')}</TableHead>
                          <TableHead>{tb('status')}</TableHead>
                          <TableHead className="text-right w-[120px]" />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {receipts.map((r) => (
                          <TableRow key={r.id}>
                            <TableCell className="font-medium font-mono text-xs">{r.receipt_number}</TableCell>
                            <TableCell className="hidden sm:table-cell">
                              {r.plan_name || 'Subscription'}
                              {r.billing_cycle ? ` · ${r.billing_cycle}` : ''}
                            </TableCell>
                            <TableCell className="hidden md:table-cell">{fmtDate(r.paid_at)}</TableCell>
                            <TableCell className="text-muted-foreground hidden lg:table-cell">
                              {r.payment_method_last4 ? `•••• ${r.payment_method_last4}` : '—'}
                            </TableCell>
                            <TableCell className="text-right tabular-nums">{fmtMoney(r.amount, r.currency)}</TableCell>
                            <TableCell>
                              <StatusPill status={r.status || 'paid'} />
                            </TableCell>
                            <TableCell className="text-right">
                              <div className="flex justify-end gap-1">
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => setSelectedReceipt(r)}
                                  title={tb('viewDetails')}
                                >
                                  <Eye className="size-4" />
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => void downloadReceipt(r)}
                                  disabled={downloading === `rcpt-${r.id}`}
                                  title={tb('download')}
                                >
                                  {downloading === `rcpt-${r.id}` ? (
                                    <Loader2 className="size-4 animate-spin" />
                                  ) : (
                                    <Download className="size-4" />
                                  )}
                                </Button>
                                {r.invoice_url ? (
                                  <Button variant="ghost" size="sm" asChild title={tb('openInvoice')}>
                                    <Link href={r.invoice_url} target="_blank" rel="noreferrer">
                                      <FileText className="size-4" />
                                    </Link>
                                  </Button>
                                ) : null}
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
          )}

          {tab === 'plans' && (
            <div className="space-y-6">
              <div className="flex justify-center">
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
                featureCatalog={featureCatalog}
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

              <p className="text-center text-sm text-muted-foreground">{tb('upgradeOnlyNote')}</p>

              {preview ? (
                <Card className={cn('mx-auto max-w-md border-primary/30')}>
                  <CardHeader>
                    <CardTitle className="text-base">{tb('confirmUpgrade')}</CardTitle>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <p className="text-sm text-muted-foreground">
                      {tb('amountDueNow', { amount: preview.amount.toFixed(2) })}
                    </p>
                    <div className="flex gap-2">
                      <Button className="flex-1" onClick={() => void confirmUpgrade()}>
                        {tb('confirm')}
                      </Button>
                      <Button
                        variant="outline"
                        className="flex-1"
                        onClick={() => {
                          setPreview(null);
                          setUpgrading(null);
                        }}
                      >
                        {tb('cancel')}
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              ) : null}
            </div>
          )}

          <Dialog
            open={!!selectedInvoice}
            onOpenChange={(open) => {
              if (!open) setSelectedInvoice(null);
            }}
          >
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              {selectedInvoice && (
                <>
                  <DialogHeader>
                    <DialogTitle>{tb('invoiceDetails')}</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="font-mono text-sm">{selectedInvoice.invoice_number}</p>
                      <p className="text-sm text-muted-foreground capitalize mt-1">
                        {(selectedInvoice.subscription_tier || '').replace(/_/g, ' ')} · {selectedInvoice.billing_cycle}
                      </p>
                    </div>
                    <StatusPill status={selectedInvoice.status} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('invoiceDate')}</p>
                      <p>{fmtDate(selectedInvoice.created_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('dueDate')}</p>
                      <p className="font-medium">{fmtDate(selectedInvoice.due_date)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('period')}</p>
                      <p>
                        {fmtDate(selectedInvoice.period_start)} – {fmtDate(selectedInvoice.period_end)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('paidOn')}</p>
                      <p>{fmtDate(selectedInvoice.paid_at)}</p>
                    </div>
                  </div>
                  <div className="rounded-lg border overflow-hidden text-sm">
                    <div className="flex justify-between p-3 bg-muted/50 font-medium">
                      <span>{tb('plan')}</span>
                      <span>{tb('amount')}</span>
                    </div>
                    <div className="flex justify-between p-3 border-t">
                      <span className="capitalize">{(selectedInvoice.subscription_tier || '').replace(/_/g, ' ')} plan</span>
                      <span>{fmtMoney(selectedInvoice.amount_ex_vat)}</span>
                    </div>
                  </div>
                  <div className="ml-auto w-full max-w-xs space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tb('subtotal')}</span>
                      <span>{fmtMoney(selectedInvoice.amount_ex_vat)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tb('vat')}</span>
                      <span>{fmtMoney(selectedInvoice.vat_amount)}</span>
                    </div>
                    <div className="flex justify-between border-t pt-2 font-semibold">
                      <span>{tb('total')}</span>
                      <span>{fmtMoney(selectedInvoice.total_amount)}</span>
                    </div>
                    <div className="flex justify-between text-green-600">
                      <span>{tb('paid')}</span>
                      <span>{fmtMoney(selectedInvoice.amount_paid)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">{tb('outstanding')}</span>
                      <span>{fmtMoney(Math.max(0, selectedInvoice.total_amount - selectedInvoice.amount_paid))}</span>
                    </div>
                  </div>
                  <div className="flex justify-end">
                    <Button
                      onClick={() => void downloadInvoice(selectedInvoice)}
                      disabled={downloading === `inv-${selectedInvoice.id}`}
                    >
                      {downloading === `inv-${selectedInvoice.id}` ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="size-4 mr-2" />
                      )}
                      {tb('download')}
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          <Dialog
            open={!!selectedReceipt}
            onOpenChange={(open) => {
              if (!open) setSelectedReceipt(null);
            }}
          >
            <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
              {selectedReceipt && (
                <>
                  <DialogHeader>
                    <DialogTitle>{tb('receiptDetails')}</DialogTitle>
                  </DialogHeader>
                  <div className="flex items-start justify-between gap-4">
                    <p className="font-mono text-sm">{selectedReceipt.receipt_number}</p>
                    <StatusPill status={selectedReceipt.status || 'paid'} />
                  </div>
                  <div className="grid sm:grid-cols-2 gap-4 text-sm">
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('plan')}</p>
                      <p>{selectedReceipt.plan_name || 'Subscription'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('billingCycle')}</p>
                      <p className="capitalize">{selectedReceipt.billing_cycle || '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('paidOn')}</p>
                      <p>{fmtDate(selectedReceipt.paid_at)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('card')}</p>
                      <p>{selectedReceipt.payment_method_last4 ? `•••• ${selectedReceipt.payment_method_last4}` : '—'}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('amount')}</p>
                      <p className="font-semibold">{fmtMoney(selectedReceipt.amount, selectedReceipt.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('refunded')}</p>
                      <p>{fmtMoney(selectedReceipt.amount_refunded || 0, selectedReceipt.currency)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase text-muted-foreground mb-1">{tb('nextRenewal')}</p>
                      <p>{fmtDate(selectedReceipt.next_renewal_date)}</p>
                    </div>
                  </div>
                  <div className="flex justify-end gap-2">
                    {selectedReceipt.invoice_url ? (
                      <Button variant="outline" asChild>
                        <Link href={selectedReceipt.invoice_url} target="_blank" rel="noreferrer">
                          {tb('openInvoice')}
                        </Link>
                      </Button>
                    ) : null}
                    <Button
                      onClick={() => void downloadReceipt(selectedReceipt)}
                      disabled={downloading === `rcpt-${selectedReceipt.id}`}
                    >
                      {downloading === `rcpt-${selectedReceipt.id}` ? (
                        <Loader2 className="size-4 mr-2 animate-spin" />
                      ) : (
                        <Download className="size-4 mr-2" />
                      )}
                      {tb('download')}
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
