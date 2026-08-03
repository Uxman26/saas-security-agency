'use client';

import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';

export function MarketingShiftStory() {
  const t = useTranslations('marketing.home');
  const gapFeatures = t.raw('storyGapFeatures') as string[];
  const workflowSteps = t.raw('workflowSteps') as string[];

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:gap-8">
      <div
        className={cn(
          'relative rounded-2xl border border-border bg-card p-7 md:p-9 shadow-sm',
          'dark:border-border/80 dark:bg-card'
        )}
      >
        <span
          className={cn(
            'absolute -top-3 end-4 z-10 rounded-full border border-emerald-500/35 bg-emerald-500 px-3 py-1 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm',
            'dark:border-emerald-400/40 dark:bg-emerald-600 sm:end-6 sm:px-4 sm:text-xs'
          )}
        >
          {t('storyBeforeFeatures')}
        </span>

        <p className="text-xs font-bold uppercase tracking-[0.14em] text-red-600 dark:text-red-400">
          {t('storyGapLabel')}
        </p>
        <h2 className="mt-4 max-w-md text-2xl font-bold leading-tight text-foreground md:text-[1.7rem]">
          {t('storyGapTitle')}
        </h2>
        <p className="mt-4 max-w-md text-sm leading-relaxed text-muted-foreground md:text-[0.95rem]">
          {t('storyGapText')}
        </p>

        <div className="mt-8 space-y-3">
          {gapFeatures.map((feature) => (
            <div
              key={feature}
              className={cn(
                'rounded-xl border border-border bg-card px-5 py-4 text-center text-sm font-bold text-foreground',
                'dark:border-border/70 dark:bg-background/40'
              )}
            >
              {feature}
            </div>
          ))}
        </div>
      </div>

      <div
        className={cn(
          'rounded-2xl border border-border bg-muted/50 p-7 md:p-9 shadow-sm',
          'dark:border-border/80 dark:bg-muted/30'
        )}
      >
        <p className="text-xs font-bold uppercase tracking-[0.14em] text-emerald-700 dark:text-emerald-400">
          {t('storyTargetLabel')}
        </p>

        <div className="mt-8 space-y-9">
          <div>
            <h3 className="text-base font-bold text-foreground">{t('problemSectionLabel')}</h3>
            <p className="mt-3 text-sm italic leading-relaxed text-muted-foreground md:text-[0.95rem]">
              &ldquo;{t('problemTitle')}&rdquo;
            </p>
          </div>

          <div>
            <h3 className="text-base font-bold text-foreground">{t('workflowSectionLabel')}</h3>
            <ol className="mt-4 space-y-3.5">
              {workflowSteps.map((step, i) => (
                <li key={step} className="flex items-center gap-3.5">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-foreground text-xs font-bold text-background">
                    {i + 1}
                  </span>
                  <span className="text-sm font-medium text-foreground md:text-[0.95rem]">{step}</span>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
