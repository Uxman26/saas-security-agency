'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { BillingCycleToggle } from '@/components/billing/billing-cycle-toggle';
import { PricingGrid } from '@/components/billing/pricing-grid';
import { api } from '@/lib/api';
import type { BillingReceipt, PlanTier, SubscriptionInvoice, TrialStatus } from '@/lib/types';
import { DEFAULT_PLAN_TIERS } from '@/lib/plan-tiers';
import { CreditCard, Download, Eye, FileText, Loader2, Receipt } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

type Subscription = {
  subscription_tier?: string | null;
  billing_cycle?: string | null;
  subscription_status?: string | null;
  subscription_end?: string | null;
};

const STATUS_STYLES: Record<string, string> = {
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  unpaid: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  voided: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
  refunded: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
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
    <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize', STATUS_STYLES[value] || 'bg-muted text-muted-foreground')}>
      {value}
    </span>
  );
}

export default function BillingSettingsPage() {
  const tp = useTranslations('marketing.plans');
  const tcommon = useTranslations('common');
  const tpayment = useTranslations('payment');
  const tb = useTranslations('billing');
  const [tiers, setTiers] = useState<PlanTier[]>([]);
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
    const [pkg, subscription, billingReceipts, billingInvoices, stripeCfg, trialStatus] = await Promise.all([
      api.packages.list().catch(() => DEFAULT_PLAN_TIERS),
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

          {trial && (trial.trial_active || trial.trial_expired || trial.subscription_required) && (
            <Card className="mb-8 border-primary/20">
              <CardHeader>
                <CardTitle className="text-base">{tb('trialStatus')}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-wrap gap-6 text-sm">
                <div>
                  <p className="text-muted-foreground">{tb('status')}</p>
                  <p className="font-semibold">
                    {trial.label ||
                      (trial.trial_active
                        ? tb('trialActive')
                        : trial.trial_expired
                          ? tb('trialExpired')
                          : tb('subscriptionRequired'))}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Package</p>
                  <p className="font-semibold capitalize">
                    {(trial.plan_tier || '').replace(/_/g, ' ') || '—'}
                    {trial.billing_cycle ? ` · ${trial.billing_cycle}` : ''}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">Started</p>
                  <p className="font-semibold">
                    {trial.trial_starts_on ? new Date(trial.trial_starts_on).toLocaleDateString() : '—'}
                  </p>
                </div>
                <div>
                  <p className="text-muted-foreground">{tb('endsOn')}</p>
                  <p className="font-semibold">
                    {trial.trial_ends_on ? new Date(trial.trial_ends_on).toLocaleDateString() : '—'}
                  </p>
                </div>
                {trial.trial_active && (
                  <div>
                    <p className="text-muted-foreground">{tb('daysRemaining')}</p>
                    <p className="font-semibold">{trial.days_remaining ?? '—'}</p>
                  </div>
                )}
                {(trial.trial_expired || trial.subscription_required) && !trial.can_use_paid_features && (
                  <div className="w-full">
                    <p className="text-muted-foreground mb-2">
                      {trial.restriction ||
                        'Adding new records and paid features are locked until the subscription is activated. You can still view and edit existing data.'}
                    </p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

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
                {sub.subscription_end && (
                  <div>
                    <p className="text-muted-foreground">{tb('endsOn')}</p>
                    <p className="font-semibold">{new Date(sub.subscription_end).toLocaleDateString()}</p>
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><FileText className="size-4" /> {tb('invoices')}</CardTitle>
            </CardHeader>
            <CardContent>
              {invoices.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{tb('noInvoices')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tb('invoiceNumber')}</TableHead>
                      <TableHead>{tb('plan')}</TableHead>
                      <TableHead>{tb('period')}</TableHead>
                      <TableHead>{tb('dueDate')}</TableHead>
                      <TableHead className="text-right">{tb('amount')}</TableHead>
                      <TableHead className="text-right">{tb('paid')}</TableHead>
                      <TableHead>{tb('status')}</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {invoices.map((inv) => (
                      <TableRow key={inv.id}>
                        <TableCell className="font-medium font-mono text-xs">{inv.invoice_number}</TableCell>
                        <TableCell className="capitalize">{(inv.subscription_tier || '').replace(/_/g, ' ')} · {inv.billing_cycle}</TableCell>
                        <TableCell className="text-muted-foreground">{fmtDate(inv.period_start)} – {fmtDate(inv.period_end)}</TableCell>
                        <TableCell>{fmtDate(inv.due_date)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(inv.total_amount)}</TableCell>
                        <TableCell className="text-right">{fmtMoney(inv.amount_paid)}</TableCell>
                        <TableCell><StatusPill status={inv.status} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedInvoice(inv)} title={tb('viewDetails')}>
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void downloadInvoice(inv)}
                              disabled={downloading === `inv-${inv.id}`}
                              title={tb('download')}
                            >
                              {downloading === `inv-${inv.id}` ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          <Card className="mb-8">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2"><Receipt className="size-4" /> {tb('receipts')}</CardTitle>
            </CardHeader>
            <CardContent>
              {receipts.length === 0 ? (
                <p className="text-sm text-muted-foreground py-6 text-center">{tb('noReceipts')}</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{tb('invoiceNumber')}</TableHead>
                      <TableHead>{tb('plan')}</TableHead>
                      <TableHead>{tb('paidOn')}</TableHead>
                      <TableHead>{tb('card')}</TableHead>
                      <TableHead className="text-right">{tb('amount')}</TableHead>
                      <TableHead>{tb('status')}</TableHead>
                      <TableHead className="text-right" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {receipts.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell className="font-medium font-mono text-xs">{r.receipt_number}</TableCell>
                        <TableCell>{r.plan_name || 'Subscription'}{r.billing_cycle ? ` · ${r.billing_cycle}` : ''}</TableCell>
                        <TableCell>{fmtDate(r.paid_at)}</TableCell>
                        <TableCell className="text-muted-foreground">{r.payment_method_last4 ? `•••• ${r.payment_method_last4}` : '—'}</TableCell>
                        <TableCell className="text-right">{fmtMoney(r.amount, r.currency)}</TableCell>
                        <TableCell><StatusPill status={r.status || 'paid'} /></TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => setSelectedReceipt(r)} title={tb('viewDetails')}>
                              <Eye className="size-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => void downloadReceipt(r)}
                              disabled={downloading === `rcpt-${r.id}`}
                              title={tb('download')}
                            >
                              {downloading === `rcpt-${r.id}` ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
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
              )}
            </CardContent>
          </Card>

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

          <Dialog open={!!selectedInvoice} onOpenChange={(open) => { if (!open) setSelectedInvoice(null); }}>
            <DialogContent className="max-w-2xl">
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
                      <p>{fmtDate(selectedInvoice.period_start)} – {fmtDate(selectedInvoice.period_end)}</p>
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
                  <div className="ml-auto w-64 space-y-2 text-sm">
                    <div className="flex justify-between"><span className="text-muted-foreground">{tb('subtotal')}</span><span>{fmtMoney(selectedInvoice.amount_ex_vat)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{tb('vat')}</span><span>{fmtMoney(selectedInvoice.vat_amount)}</span></div>
                    <div className="flex justify-between border-t pt-2 font-semibold"><span>{tb('total')}</span><span>{fmtMoney(selectedInvoice.total_amount)}</span></div>
                    <div className="flex justify-between text-green-600"><span>{tb('paid')}</span><span>{fmtMoney(selectedInvoice.amount_paid)}</span></div>
                    <div className="flex justify-between"><span className="text-muted-foreground">{tb('outstanding')}</span><span>{fmtMoney(Math.max(0, selectedInvoice.total_amount - selectedInvoice.amount_paid))}</span></div>
                  </div>
                  <div className="flex justify-end">
                    <Button onClick={() => void downloadInvoice(selectedInvoice)} disabled={downloading === `inv-${selectedInvoice.id}`}>
                      {downloading === `inv-${selectedInvoice.id}` ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
                      {tb('download')}
                    </Button>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          <Dialog open={!!selectedReceipt} onOpenChange={(open) => { if (!open) setSelectedReceipt(null); }}>
            <DialogContent className="max-w-lg">
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
                        <Link href={selectedReceipt.invoice_url} target="_blank" rel="noreferrer">{tb('openInvoice')}</Link>
                      </Button>
                    ) : null}
                    <Button onClick={() => void downloadReceipt(selectedReceipt)} disabled={downloading === `rcpt-${selectedReceipt.id}`}>
                      {downloading === `rcpt-${selectedReceipt.id}` ? <Loader2 className="size-4 mr-2 animate-spin" /> : <Download className="size-4 mr-2" />}
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
