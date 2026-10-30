'use client';

import { Suspense, useEffect, useState, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import type { ReceiptPublic } from '@/lib/types';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';
import { analytics } from '@/lib/analytics';
import { parseEmailVerificationRequired } from '@/lib/sidebar-modules';

function PaymentPendingContent() {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const router = useRouter();
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref') || '';
  // Set by signup / verify / login links: go straight on to Stripe card entry.
  const autoCheckout = searchParams.get('checkout') === '1';
  const cycleParam = searchParams.get('cycle');
  const couponParam = searchParams.get('coupon') || '';
  const success = searchParams.get('success') === '1';
  const canceled = searchParams.get('canceled') === '1';
  const sessionId = searchParams.get('session_id') || '';
  const [receipt, setReceipt] = useState<ReceiptPublic | null>(null);
  const [loading, setLoading] = useState(!!ref);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [yearlyDiscount, setYearlyDiscount] = useState(20);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>(
    cycleParam === 'yearly' ? 'yearly' : 'monthly'
  );
  const [paying, setPaying] = useState(false);
  const [verified, setVerified] = useState(false);
  const purchasedRef = useRef(false);
  const autoCheckoutRef = useRef(false);

  useEffect(() => {
    api.stripe
      .config()
      .then((c) => {
        setStripeEnabled(c.enabled);
        if (c.yearly_discount_percent) setYearlyDiscount(c.yearly_discount_percent);
      })
      .catch(() => setStripeEnabled(false));
  }, []);

  useEffect(() => {
    if (!ref) return;
    api.receipts
      .public(ref)
      .then((r) => {
        setReceipt(r);
        // No cycle in the link (e.g. from login) → use the one chosen at signup.
        if (!cycleParam && r.billing_cycle === 'yearly') setBillingCycle('yearly');
        return r;
      })
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [ref]);

  useEffect(() => {
    if (canceled && !success) {
      analytics.checkoutAbandoned(receipt?.subscription_tier);
    }
  }, [canceled, success, receipt?.subscription_tier]);

  useEffect(() => {
    if (!success || !sessionId || verified) return;
    api.stripe
      .sessionStatus(sessionId)
      .then(() => {
        setVerified(true);
        if (ref) return api.receipts.public(ref).then(setReceipt);
      })
      .catch(() => {
        analytics.paymentFailed(receipt?.subscription_tier, 'session_verify');
        toast.error(t('verifyFailed'));
      });
  }, [success, sessionId, verified, ref, t, receipt?.subscription_tier]);

  useEffect(() => {
    if (purchasedRef.current) return;
    const isPaid = receipt?.status === 'paid' || verified;
    if (!isPaid || !receipt) return;
    purchasedRef.current = true;
    analytics.purchase({
      tier: receipt.subscription_tier,
      value: receipt.amount,
      transaction_id: receipt.ref_id,
      cycle: billingCycle,
    });
    analytics.subscriptionActivated(receipt.subscription_tier);
  }, [receipt, verified, billingCycle]);

  const payWithStripe = async (cycle: 'monthly' | 'yearly' = billingCycle) => {
    if (!ref) return;
    setPaying(true);
    try {
      analytics.beginCheckout(receipt?.subscription_tier, receipt?.amount, cycle);
      const { url } = await api.stripe.checkoutSession(ref, cycle, couponParam || undefined);
      window.location.href = url;
    } catch (e) {
      const verify = parseEmailVerificationRequired(e);
      if (verify?.email) {
        const q = new URLSearchParams({ email: verify.email, ref });
        q.set('cycle', cycle);
        if (couponParam) q.set('coupon', couponParam);
        router.replace(`/verify-email?${q.toString()}`);
        return;
      }
      analytics.paymentFailed(receipt?.subscription_tier, 'checkout_session');
      toast.error(e instanceof Error ? e.message : t('stripeUnavailable'));
      setPaying(false);
    }
  };

  const isPaid = receipt?.status === 'paid' || verified;
  // A card-free signup trial: checkout only saves the card, the first charge is at trial end.
  const trialEnds = !isPaid && receipt?.trial_ends_at ? new Date(receipt.trial_ends_at) : null;
  const trialEndsLabel = trialEnds
    ? trialEnds.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })
    : '';

  useEffect(() => {
    if (!autoCheckout || autoCheckoutRef.current) return;
    if (!stripeEnabled || !receipt || isPaid || canceled || success) return;
    autoCheckoutRef.current = true;
    // Drop the flag first so Back from Stripe shows this page instead of bouncing again.
    const q = new URLSearchParams(searchParams.toString());
    q.delete('checkout');
    window.history.replaceState(null, '', `${window.location.pathname}?${q.toString()}`);
    const cycle = cycleParam === 'yearly' || (!cycleParam && receipt.billing_cycle === 'yearly') ? 'yearly' : 'monthly';
    void payWithStripe(cycle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoCheckout, stripeEnabled, receipt, isPaid, canceled, success]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">
            {isPaid ? t('paymentSuccessTitle') : trialEnds ? t('trialTitle') : t('title')}
          </CardTitle>
          <CardDescription>
            {isPaid ? t('paymentSuccessDescription') : trialEnds ? t('trialDescription') : t('description')}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {canceled && !isPaid ? (
            <p className="text-center text-sm text-muted-foreground rounded-lg border border-amber-500/30 bg-amber-500/10 p-3">
              {t('paymentCanceled')}
            </p>
          ) : null}
          {loading && <p className="text-center text-muted-foreground">{t('loadingReceipt')}</p>}
          {!loading && ref && receipt && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('reference')}</span>
                <span className="font-mono font-semibold">{receipt.ref_id}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('organisation')}</span>
                <span>{receipt.company_name}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('plan')}</span>
                <span className="capitalize">{receipt.subscription_tier}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('amount')}</span>
                <span className="font-semibold">£{receipt.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('cycle')}</span>
                <span>{t('days', { count: receipt.period_days })}</span>
              </div>
              {trialEnds ? (
                <>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t('trialEnds')}</span>
                    <span>{trialEndsLabel}</span>
                  </div>
                  <div className="flex justify-between gap-4 border-t pt-2">
                    <span className="text-muted-foreground">{t('dueToday')}</span>
                    <span className="font-semibold text-emerald-600 dark:text-emerald-400">£0.00</span>
                  </div>
                  <div className="flex justify-between gap-4">
                    <span className="text-muted-foreground">{t('firstCharge')}</span>
                    <span>
                      £{receipt.amount.toFixed(2)} &middot; {trialEndsLabel}
                    </span>
                  </div>
                </>
              ) : null}
              <div className="flex justify-between gap-4">
                <span className="text-muted-foreground">{t('status')}</span>
                <span
                  className={
                    isPaid ? 'text-emerald-600 dark:text-emerald-400 font-medium' : 'text-amber-600 dark:text-amber-400 font-medium'
                  }
                >
                  {isPaid ? t('paid') : receipt.status === 'pending' ? t('awaiting') : receipt.status}
                </span>
              </div>
            </div>
          )}
          {!loading && ref && !receipt && (
            <p className="text-center text-destructive text-sm">{t('notFound')}</p>
          )}
          {!ref && <p className="text-center text-muted-foreground text-sm">{t('noRef')}</p>}
          {!isPaid && stripeEnabled && ref && receipt ? (
            <>
              <div className="flex rounded-lg border p-1 gap-1">
                <button
                  type="button"
                  className={`flex-1 rounded-md py-2 text-sm font-medium ${billingCycle === 'monthly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setBillingCycle('monthly')}
                >
                  {t('monthly')}
                </button>
                <button
                  type="button"
                  className={`flex-1 rounded-md py-2 text-sm font-medium ${billingCycle === 'yearly' ? 'bg-primary text-primary-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setBillingCycle('yearly')}
                >
                  {t('yearly', { discount: yearlyDiscount })}
                </button>
              </div>
              <Button className="w-full" onClick={() => void payWithStripe()} disabled={paying}>
              {paying ? <Loader2 className="size-4 mr-2 animate-spin" /> : <CreditCard className="size-4 mr-2" />}
              {paying ? t('processing') : trialEnds ? t('addCard') : t('payWithCard')}
              </Button>
            </>
          ) : null}
          <Button asChild className="w-full" variant={isPaid ? 'default' : trialEnds ? 'ghost' : 'outline'}>
            <Link href="/login">{trialEnds ? t('continueTrial') : tc('backToSignIn')}</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPendingPage() {
  const tv = useTranslations('verify');
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{tv('loading')}</div>}>
      <PaymentPendingContent />
    </Suspense>
  );
}
