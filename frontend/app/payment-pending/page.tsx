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

function PaymentPendingContent() {
  const t = useTranslations('payment');
  const tc = useTranslations('common');
  const searchParams = useSearchParams();
  const ref = searchParams.get('ref') || '';
  const [receipt, setReceipt] = useState<ReceiptPublic | null>(null);
  const [loading, setLoading] = useState(!!ref);

  useEffect(() => {
    if (!ref) return;
    api.receipts
      .public(ref)
      .then(setReceipt)
      .catch(() => setReceipt(null))
      .finally(() => setLoading(false));
  }, [ref]);

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-primary/5">
      <div className="absolute top-4 end-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">{t('title')}</CardTitle>
          <CardDescription>{t('description')}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
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
                <span className="text-amber-600 dark:text-amber-400 font-medium">
                  {receipt.status === 'pending' ? t('awaiting') : receipt.status}
                </span>
              </div>
            </div>
          )}
          {!loading && ref && !receipt && (
            <p className="text-center text-destructive text-sm">{t('notFound')}</p>
          )}
          {!ref && (
            <p className="text-center text-muted-foreground text-sm">{t('noRef')}</p>
          )}
          <Button asChild className="w-full">
            <Link href="/login">{tc('backToSignIn')}</Link>
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
