'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import type { ReceiptPublic } from '@/lib/types';
import { CreditCard, Loader2 } from 'lucide-react';
import { toast } from '@/lib/toast';

function PaymentPendingContent() {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref') || '';
  const success = searchParams.get('success') === '1';
  const canceled = searchParams.get('canceled') === '1';
  const sessionId = searchParams.get('session_id') || '';
  const [receipt, setReceipt] = useState<ReceiptPublic | null>(null);
  const [loading, setLoading] = useState(!!ref);
  const [stripeEnabled, setStripeEnabled] = useState(false);
  const [yearlyDiscount, setYearlyDiscount] = useState(20);
  const [billingCycle, setBillingCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [paying, setPaying] = useState(false);
  const [verified, setVerified] = useState(false);

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
      .then(setReceipt)
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [ref]);

  useEffect(() => {
    if (!success || !sessionId || verified) return;
    api.stripe
      .sessionStatus(sessionId)
      .then(() => {
        setVerified(true);
        if (ref) return api.receipts.public(ref).then(setReceipt);
      })
      .catch(() => toast.error(t('verifyFailed')));
  }, [success, sessionId, verified, ref, t]);

  const payWithStripe = async () => {
    if (!ref) return;
    setPaying(true);
    try {
      const { url } = await api.stripe.checkoutSession(ref, billingCycle);
      window.location.href = url;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t('stripeUnavailable'));
      setPaying(false);
    }
  };

  const isPaid = receipt?.status === 'paid' || verified;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{isPaid ? t('paymentSuccessTitle') : t('title')}</CardTitle>
          <CardDescription>{isPaid ? t('paymentSuccessDescription') : t('description')}</CardDescription>
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
              {paying ? t('processing') : t('payWithCard')}
              </Button>
            </>
          ) : null}
          <Button asChild className="w-full" variant={isPaid ? 'default' : 'outline'}>
            <Link href="/login">{isPaid ? tc('backToSignIn') : tc('backToSignIn')}</Link>
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
