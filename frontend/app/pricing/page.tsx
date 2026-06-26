'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { Check, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import type { PlanTier } from '@/lib/types';
import { formatPriceGBP, planDisplay, planDetails, planFeatures, DEFAULT_PLAN_TIERS } from '@/lib/plan-tiers';

export default function PricingPage() {
  const t = useTranslations('marketing.pricing');
  const tp = useTranslations('marketing.plans');
  const tc = useTranslations('marketing.cta');
  const tcommon = useTranslations('common');
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
      <MarketingSection variant="hero" border={false} className="pt-16 pb-8 md:pt-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center mb-12">
            <Eyebrow>{t('badge')}</Eyebrow>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl">{t('title')}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
            <p className="mt-4 text-sm text-muted-foreground">
              {t('helpPrefix')}{' '}
              <Link href="/book-demo" className="text-primary font-medium hover:underline">{tc('bookDemoLink')}</Link>{' '}
              {t('helpSuffix')}
            </p>
          </div>
        {loading ? (
          <div className="flex justify-center py-16 text-muted-foreground">
            <Loader2 className="size-8 animate-spin" />
          </div>
        ) : tiers.length === 0 ? (
          <p className="text-center text-muted-foreground">{t('unavailable')}</p>
        ) : (
          <div className={`mx-auto grid max-w-6xl gap-8 md:grid-cols-2 ${cols} lg:gap-6`}>
            {tiers.map((tier) => {
              const { name, description, highlighted } = planDisplay(tier, tp);
              const features = planFeatures(tier, tp, tp);
              const details = planDetails(tier, tp);
              const labels = t.raw('labels') as Record<string, string>;
              return (
                <Card
                  key={tier.tier}
                  className={`relative flex flex-col marketing-card-hover ${highlighted ? 'border-primary shadow-lg shadow-primary/15 ring-1 ring-primary/20' : 'border-border/80'}`}
                >
                  {highlighted && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                      {tcommon('popular')}
                    </div>
                  )}
                  <CardHeader className="pb-4">
                    <CardTitle className="text-xl">{name}</CardTitle>
                    <CardDescription>{description}</CardDescription>
                    <div className="mt-4 flex items-baseline gap-1">
                      <span className="text-3xl font-bold text-foreground">{formatPriceGBP(tier.price_gbp)}</span>
                      <span className="text-muted-foreground">{tcommon('perMonth')}</span>
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
                      <p><strong className="text-foreground font-medium">{labels.support}:</strong> {details.support}</p>
                      <p><strong className="text-foreground font-medium">{labels.setup}:</strong> {details.setup}</p>
                      <p><strong className="text-foreground font-medium">{labels.contract}:</strong> {details.contract}</p>
                      <p><strong className="text-foreground font-medium">{labels.cancellation}:</strong> {details.cancellation}</p>
                      <p><strong className="text-foreground font-medium">{labels.trial}:</strong> {details.trial}</p>
                      <p><strong className="text-foreground font-medium">{labels.planChanges}:</strong> {details.changes}</p>
                    </div>
                  </CardContent>
                  <CardFooter className="pt-4 flex-col gap-2">
                    <Button asChild className="w-full" variant={highlighted ? 'default' : 'outline'} size="lg">
                      <Link href={`/signup?tier=${tier.tier}`}>{tc('getStarted')}</Link>
                    </Button>
                  </CardFooter>
                </Card>
              );
            })}
          </div>
        )}
        <div className="mt-12 text-center">
          <MarketingCta href="/book-demo" variant="outline">{tc('discussRequirements')}</MarketingCta>
        </div>
        <p className="mt-8 text-center text-sm text-muted-foreground">
          {tcommon('alreadyHaveAccount')}{' '}
          <Link href="/login" className="text-primary font-medium hover:underline">{tcommon('signIn')}</Link>
        </p>
        </div>
      </MarketingSection>
      <MarketingFooter />
    </div>
  );
}
