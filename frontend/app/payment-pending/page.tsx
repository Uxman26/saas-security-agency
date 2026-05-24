'use client';

import { Suspense, useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { ThemeToggle } from '@/components/theme-toggle';
import { api } from '@/lib/api';
import type { ReceiptPublic } from '@/lib/types';

function PaymentPendingContent() {
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
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>
      <Card className="w-full max-w-lg shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl">Payment pending</CardTitle>
          <CardDescription>
            Your subscription receipt was generated. Pay using the reference below, then sign in after the platform admin marks it paid.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {loading && <p className="text-center text-muted-foreground">Loading receipt...</p>}
          {!loading && ref && receipt && (
            <div className="rounded-lg border bg-muted/40 p-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Reference</span>
                <span className="font-mono font-semibold">{receipt.ref_id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Company</span>
                <span>{receipt.company_name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Plan</span>
                <span className="capitalize">{receipt.subscription_tier}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Amount</span>
                <span className="font-semibold">£{receipt.amount.toFixed(2)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Period</span>
                <span>{receipt.period_days} days</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                <span className="text-amber-600 dark:text-amber-400 font-medium capitalize">{receipt.status}</span>
              </div>
            </div>
          )}
          {!loading && ref && !receipt && (
            <p className="text-center text-destructive text-sm">Receipt not found. Check your reference ID.</p>
          )}
          {!ref && (
            <p className="text-center text-muted-foreground text-sm">No receipt reference provided.</p>
          )}
          <Button asChild className="w-full">
            <Link href="/login">Back to sign in</Link>
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

export default function PaymentPendingPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">Loading...</div>}>
      <PaymentPendingContent />
    </Suspense>
  );
}
