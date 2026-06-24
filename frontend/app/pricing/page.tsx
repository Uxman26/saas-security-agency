'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { PlanTier } from '@/lib/types';
import { formatPriceGBP, planDisplay, planDetails, planFeatures, DEFAULT_PLAN_TIERS } from '@/lib/plan-tiers';

export default function PricingPage() {
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.packages
      .list()
      .then((rows) => setTiers(rows.length ? rows : DEFAULT_PLAN_TIERS))
      .catch(() => setTiers(DEFAULT_PLAN_TIERS))
      .finally(() => setLoading(false));
  }, []);

  const cols = tiers.length >= 4 ? 'lg:grid-cols-4' : tiers.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="pricing" />
      <div className="container mx-auto px-4 pt-16 pb-16 md:pt-24 md:pb-24">
        <div className="mx-auto max-w-2xl text-center mb-12">
          <Eyebrow>ControlOps pricing</Eyebrow>
          <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            Choose a plan that fits your workforce
          </h1>
          <p className="mt-4 text-muted-foreground">
            Select the ControlOps plan that matches your team size and operational requirements. You can change your plan as your business develops.
          </p>
          <p className="mt-4 text-sm text-muted-foreground">
            Need help choosing? <Link href="/book-demo" className="text-primary font-medium hover:underline">Book a demonstration</Link> and we will recommend the most suitable setup.
          </p>
        </div>
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : tiers.length === 0 ? (
          <p className="text-center text-muted-foreground">Plans are unavailable right now.</p>
        ) : (
          <div className={`mx-auto grid max-w-6xl gap-8 md:grid-cols-2 ${cols} lg:gap-6`}>
            {tiers.map((tier) => {
              const { name, description, highlighted } = planDisplay(tier);
              const features = planFeatures(tier);
              const details = planDetails(tier);
              return (
                <Card
                  key={tier.tier}
                  className={`relative flex flex-col ${
                    highlighted ? 'border-primary shadow-lg shadow-primary/10' : 'border-border/80'
                  }`}
                >
                  {highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                      Popular
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl">{name}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">{formatPriceGBP(tier.price_gbp)}</span>
                      <span className="text-muted-foreground">/month</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">{details.vat}</p>
                  </CardHeader>
                  <CardContent className="flex-1 space-y-3">
                    {features.map((f) => (
                      <div key={f} className="flex items-center gap-2 text-sm">
                        <Check className="size-4 shrink-0 text-primary" />
                        <span>{f}</span>
                      </div>
                    ))}
                    <div className="pt-3 mt-3 border-t space-y-1.5 text-xs text-muted-foreground">
                      <p><strong className="text-foreground font-medium">Support:</strong> {details.support}</p>
                      <p><strong className="text-foreground font-medium">Setup:</strong> {details.setup}</p>
                      <p><strong className="text-foreground font-medium">Contract:</strong> {details.contract}</p>
                      <p><strong className="text-foreground font-medium">Cancellation:</strong> {details.cancellation}</p>
                      <p><strong className="text-foreground font-medium">Trial:</strong> {details.trial}</p>
                      <p><strong className="text-foreground font-medium">Plan changes:</strong> {details.changes}</p>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 flex-col gap-2">
                    <Button asChild className="w-full" variant={highlighted ? 'default' : 'outline'} size="lg">
                      <Link href={`/signup?tier=${tier.tier}`}>Get started</Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-12 text-center">
          <MarketingCta href="/book-demo" variant="outline">Discuss your requirements</MarketingCta>
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          Already have an account?{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">Sign in</Link>
        </p>
      </div>
      <MarketingFooter />
    </div>
  );
}
