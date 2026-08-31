'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Marketing3DHero, Marketing3DShell } from '@/components/marketing/marketing-3d-shell';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { MagicCard } from '@/components/ui/magic-card';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { Shield, Target, Users } from 'lucide-react';

export function AboutContent() {
  const t = useTranslations('marketing.about');
  const tc = useTranslations('marketing.cta');

  return (
    <Marketing3DShell active="about">
      <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-12 md:py-16">
        <Marketing3DHero eyebrow={<Eyebrow>{t('badge')}</Eyebrow>} title={t('title')}>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            <RichInline text={t('hero')} />
          </p>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            <RichInline text={t('hero2')} />
          </p>
        </Marketing3DHero>

        <div className="grid gap-4 md:grid-cols-2">
          <BlurFade delay={0.08} inView>
            <MagicCard
              className="h-full rounded-2xl"
              gradientFrom="#F45100"
              gradientTo="#FF6A1F"
              gradientColor="rgba(224,78,0,0.1)"
              gradientOpacity={0.55}
            >
              <div className="p-6 md:p-7">
                <span className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
                  <Users className="size-5 text-primary" />
                </span>
                <h2 className="text-xl font-bold tracking-tight">{t('whoTitle')}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                  <RichInline text={t('whoText')} />
                </p>
              </div>
            </MagicCard>
          </BlurFade>

          <BlurFade delay={0.12} inView>
            <MagicCard
              className="h-full rounded-2xl"
              gradientFrom="#F45100"
              gradientTo="#FF6A1F"
              gradientColor="rgba(224,78,0,0.1)"
              gradientOpacity={0.55}
            >
              <div className="p-6 md:p-7">
                <span className="mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
                  <Target className="size-5 text-primary" />
                </span>
                <h2 className="text-xl font-bold tracking-tight">{t('missionTitle')}</h2>
                <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                  <RichInline text={t('missionText')} />
                </p>
              </div>
            </MagicCard>
          </BlurFade>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <BlurFade delay={0.1} inView>
            <SpotlightCard
              className="h-full rounded-2xl border-border/70 bg-card/80 p-6 backdrop-blur-md md:p-7 dark:border-white/10 dark:bg-[#11161D]/80"
              spotlightColor="rgba(224, 78, 0, 0.16)"
            >
              <h2 className="text-xl font-bold tracking-tight">{t('audienceTitle')}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                <RichInline text={t('audienceText')} />
              </p>
            </SpotlightCard>
          </BlurFade>

          <BlurFade delay={0.14} inView>
            <div className="relative h-full overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-6 md:p-7 dark:bg-primary/10">
              <BorderBeam size={90} duration={9} colorFrom="#F45100" colorTo="#FF6A1F" borderWidth={1} />
              <span className="relative mb-4 inline-flex size-11 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
                <Shield className="size-5 text-primary" />
              </span>
              <h2 className="relative text-xl font-bold tracking-tight">{t('securityTitle')}</h2>
              <p className="relative mt-3 text-sm leading-relaxed text-muted-foreground md:text-[15px]">
                <RichInline text={t('securityText')} />
              </p>
            </div>
          </BlurFade>
        </div>

        <BlurFade delay={0.12} inView>
          <div className="relative overflow-hidden rounded-3xl border border-border/70 bg-card/60 px-6 py-12 text-center backdrop-blur-md dark:border-white/10 dark:bg-[#11161D]/60">
            <BorderBeam size={120} duration={11} colorFrom="#F45100" colorTo="#FF6A1F" borderWidth={1.5} />
            <div className="relative">
              <MarketingCta href="/book-demo">{t('cta')}</MarketingCta>
              <p className="mt-4 text-sm text-muted-foreground">
                <Link href="/pricing" className="font-medium text-primary hover:underline">
                  {tc('viewPricing')}
                </Link>
              </p>
            </div>
          </div>
        </BlurFade>
      </div>
    </Marketing3DShell>
  );
}
