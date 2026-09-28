'use client';

import Link from 'next/link';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { PackageFeature, PlanTier } from '@/lib/types';
import {
  canChangeToPlan,
  formatPriceGBP,
  planDetails,
  planDisplay,
  planDisplayPrice,
  planFeatures,
} from '@/lib/plan-tiers';

type TFn = (key: string, values?: Record<string, string | number>) => string;
type TRaw = { raw: (key: string) => unknown };

type Props = {
  tiers: PlanTier[];
  /** Feature catalogue; when present, cards list what the package actually grants. */
  featureCatalog?: PackageFeature[];
  cycle: 'monthly' | 'yearly';
  yearlyDiscount: number;
  tp: TFn;
  tr: TRaw;
  tcommon: TFn;
  perMonthLabel: string;
  currentPlanLabel?: string;
  upgradeLabel?: string;
  contactLabel?: string;
  getStartedLabel: string;
  /** Free-trial offer for signup cards. Omit (or pass enabled: false) to hide it. */
  trial?: {
    enabled: boolean;
    /** Resolved per package by the API; falls back to the platform default. */
    defaultDays?: number | null;
    /** Renders the "no card required" wording when the platform is not asking for one. */
    requireCard?: boolean;
    label: (days: number, requireCard: boolean) => string;
    ctaLabel: (days: number) => string;
  };
  currentTier?: string | null;
  currentCycle?: string | null;
  onUpgrade?: (tier: string) => void;
  upgradingTier?: string | null;
};

export function PricingGrid({
  tiers,
  featureCatalog,
  cycle,
  yearlyDiscount,
  tp,
  tr,
  tcommon,
  perMonthLabel,
  currentPlanLabel = 'Current plan',
  upgradeLabel = 'Upgrade',
  contactLabel = 'Contact sales',
  getStartedLabel,
  trial,
  currentTier,
  currentCycle,
  onUpgrade,
  upgradingTier,
}: Props) {
  const cols = tiers.length >= 4 ? 'lg:grid-cols-4' : tiers.length === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2';

  return (
    <div className={`mx-auto grid max-w-6xl gap-6 md:grid-cols-2 ${cols}`}>
      {tiers.map((tier) => {
        const { name, description, highlighted } = planDisplay(tier, tp);
        const features = planFeatures(tier, tp, tr, featureCatalog);
        const details = planDetails(tier, tp);
        const price = planDisplayPrice(tier, cycle, yearlyDiscount);
        const isCurrent = currentTier === tier.tier && (currentCycle || 'monthly') === cycle;
        const canChange = canChangeToPlan(currentTier, currentCycle, tier.tier, cycle);
        const isEnterprise = tier.tier === 'enterprise';
        // Enterprise goes through sales, and an existing tenant upgrading is past the
        // trial, so the offer only applies to a fresh self-serve signup.
        const trialDays = tier.trial_days ?? trial?.defaultDays ?? null;
        const showTrial = Boolean(trial?.enabled && trialDays && !isEnterprise && !onUpgrade);
        const signupHref = `/signup?tier=${tier.tier}&cycle=${cycle}${showTrial ? '&trial=1' : ''}`;

        return (
          <Card
            key={tier.tier}
            className={`relative flex flex-col ${highlighted ? 'border-foreground shadow-lg shadow-foreground/10 ring-1 ring-foreground/10' : 'border-border/80'}`}
          >
            {highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-foreground px-3 py-0.5 text-xs font-medium text-background">
                {tcommon('popular')}
              </div>
            )}
            {isCurrent && (
              <div className="absolute -top-3 right-4 rounded-full border bg-background px-3 py-0.5 text-xs font-medium text-foreground">
                {currentPlanLabel}
              </div>
            )}
            <CardHeader className="pb-3">
              <CardTitle className="text-xl">{name}</CardTitle>
              <CardDescription>{description}</CardDescription>
              <div className="mt-4 flex items-baseline gap-1">
                <span className="text-4xl font-bold tracking-tight">{formatPriceGBP(price)}</span>
                <span className="text-muted-foreground">{perMonthLabel}</span>
              </div>
              {cycle === 'yearly' ? (
                <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium mt-1">
                  Billed yearly · {yearlyDiscount}% off
                </p>
              ) : (
                <p className="text-xs text-muted-foreground mt-1">{details.vat}</p>
              )}
              {showTrial && trial && trialDays ? (
                <p className="mt-2 inline-flex w-fit items-center gap-1.5 rounded-full bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-700 dark:text-emerald-400">
                  <Sparkles className="size-3.5 shrink-0" />
                  {trial.label(trialDays, Boolean(trial.requireCard))}
                </p>
              ) : null}
            </CardHeader>
            <CardContent className="flex-1 space-y-2.5">
              {features.map((f) => (
                <div key={f} className="flex items-start gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-foreground mt-0.5" />
                  <span>{f}</span>
                </div>
              ))}
            </CardContent>
            <CardFooter className="pt-2">
              {onUpgrade ? (
                <Button
                  className="w-full"
                  variant={highlighted ? 'default' : 'outline'}
                  size="lg"
                  disabled={!canChange || isCurrent || upgradingTier === tier.tier}
                  onClick={() => onUpgrade(tier.tier)}
                >
                  {isCurrent ? currentPlanLabel : canChange ? upgradeLabel : '—'}
                </Button>
              ) : isEnterprise ? (
                <Button asChild className="w-full" variant="outline" size="lg">
                  <Link href="/book-demo">{contactLabel}</Link>
                </Button>
              ) : (
                <Button asChild className="w-full" variant={highlighted ? 'default' : 'outline'} size="lg">
                  <Link href={signupHref}>
                    {showTrial && trial && trialDays ? trial.ctaLabel(trialDays) : getStartedLabel}
                  </Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
