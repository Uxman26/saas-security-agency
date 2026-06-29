'use client';

import Link from 'next/link';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import type { PlanTier } from '@/lib/types';
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
  currentTier?: string | null;
  currentCycle?: string | null;
  onUpgrade?: (tier: string) => void;
  upgradingTier?: string | null;
};

export function PricingGrid({
  tiers,
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
        const features = planFeatures(tier, tp, tr);
        const details = planDetails(tier, tp);
        const price = planDisplayPrice(tier, cycle, yearlyDiscount);
        const isCurrent = currentTier === tier.tier && (currentCycle || 'monthly') === cycle;
        const canChange = canChangeToPlan(currentTier, currentCycle, tier.tier, cycle);
        const isEnterprise = tier.tier === 'enterprise';
        const signupHref = `/signup?tier=${tier.tier}&cycle=${cycle}`;

        return (
          <Card
            key={tier.tier}
            className={`relative flex flex-col ${highlighted ? 'border-primary shadow-lg shadow-primary/10 ring-1 ring-primary/20' : 'border-border/80'}`}
          >
            {highlighted && (
              <div className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-0.5 text-xs font-medium text-primary-foreground">
                {tcommon('popular')}
              </div>
            )}
            {isCurrent && (
              <div className="absolute -top-3 right-4 rounded-full border bg-background px-3 py-0.5 text-xs font-medium text-primary">
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
            </CardHeader>
            <CardContent className="flex-1 space-y-2.5">
              {features.map((f) => (
                <div key={f} className="flex items-start gap-2 text-sm">
                  <Check className="size-4 shrink-0 text-primary mt-0.5" />
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
                  <Link href={signupHref}>{getStartedLabel}</Link>
                </Button>
              )}
            </CardFooter>
          </Card>
        );
      })}
    </div>
  );
}
