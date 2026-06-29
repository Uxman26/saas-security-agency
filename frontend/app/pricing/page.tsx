'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Loader2 } from 'lucide-react';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { MarketingSection } from '@/components/marketing/marketing-section';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { BillingCycleToggle } from '@/components/billing/billing-cycle-toggle';
import { PricingGrid } from '@/components/billing/pricing-grid';
import { api } from '@/lib/api';
import type { PlanTier } from '@/lib/types';
import { DEFAULT_PLAN_TIERS } from '@/lib/plan-tiers';

export default function PricingPage() {
  const t = useTranslations('marketing.pricing');
  const tp = useTranslations('marketing.plans');
  const tc = useTranslations('marketing.cta');
  const tcommon = useTranslations('common');
  const tpayment = useTranslations('payment');
  const [tiers, setTiers] = useState<PlanTier[]>([]);
  const [loading, setLoading] = useState(true);
  const [cycle, setCycle] = useState<'monthly' | 'yearly'>('monthly');
  const [yearlyDiscount, setYearlyDiscount] = useState(20);

  useEffect(() => {
    api.packages
      .list()
      .then((rows) => setTiers(rows.length ? rows : DEFAULT_PLAN_TIERS))
      .catch(() => setTiers(DEFAULT_PLAN_TIERS))
      .finally(() => setLoading(false));
    api.stripe
      .config()
      .then((c) => {
        if (c.yearly_discount_percent) setYearlyDiscount(c.yearly_discount_percent);
      })
      .catch(() => {});
  }, []);

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="pricing" />
      <MarketingSection variant="hero" border={false} className="pt-16 pb-8 md:pt-24">
        <div className="container mx-auto px-4">
          <div className="mx-auto max-w-2xl text-center mb-10">
            <Eyebrow>{t('badge')}</Eyebrow>
            <h1 className="text-3xl font-bold tracking-tight text-foreground sm:text-4xl md:text-5xl">{t('title')}</h1>
            <p className="mt-4 text-lg text-muted-foreground">{t('subtitle')}</p>
          </div>

          <div className="flex justify-center mb-10">
            <BillingCycleToggle
              value={cycle}
              onChange={setCycle}
              yearlyDiscount={yearlyDiscount}
              monthlyLabel={tpayment('monthly')}
              yearlyLabel={tpayment('yearly', { discount: yearlyDiscount })}
            />
          </div>

          {loading ? (
            <div className="flex justify-center py-16 text-muted-foreground">
              <Loader2 className="size-8 animate-spin" />
            </div>
          ) : tiers.length === 0 ? (
            <p className="text-center text-muted-foreground">{t('unavailable')}</p>
          ) : (
            <PricingGrid
              tiers={tiers}
              cycle={cycle}
              yearlyDiscount={yearlyDiscount}
              tp={tp}
              tr={tp}
              tcommon={tcommon}
              perMonthLabel={tcommon('perMonth')}
              getStartedLabel={tc('getStarted')}
              contactLabel={t('contactSales')}
            />
          )}

          <p className="mt-8 text-center text-sm text-muted-foreground max-w-xl mx-auto">{t('upgradeNote')}</p>

          <div className="mt-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">
              {t('helpPrefix')}{' '}
              <Link href="/book-demo" className="text-primary font-medium hover:underline">{tc('bookDemoLink')}</Link>{' '}
              {t('helpSuffix')}
            </p>
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
