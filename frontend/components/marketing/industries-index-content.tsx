'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Marketing3DHero, Marketing3DShell } from '@/components/marketing/marketing-3d-shell';
import { Eyebrow } from '@/components/marketing/marketing-cta';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { MagicCard } from '@/components/ui/magic-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { Button } from '@/components/ui/button';
import {
  ArrowRight,
  Building2,
  CalendarDays,
  Shield,
  Sparkles,
  Users,
} from 'lucide-react';

const HREFS = [
  '/industries/security',
  '/industries/cleaning-facilities',
  '/industries/event-staffing',
  '/industries/temporary-staffing',
] as const;

const INDUSTRY_ICONS = [Shield, Sparkles, CalendarDays, Users] as const;

export function IndustriesIndexContent() {
  const t = useTranslations('marketing.industriesIndex');
  const tc = useTranslations('marketing.cta');
  const items = t.raw('items') as { title: string; desc: string }[];

  return (
    <Marketing3DShell active="industries">
      <div className="mx-auto w-full max-w-6xl space-y-12 px-4 py-12 md:py-16">
        <Marketing3DHero eyebrow={<Eyebrow>{t('badge')}</Eyebrow>} title={t('title')}>
          <p className="text-base leading-relaxed text-muted-foreground md:text-lg">
            <RichInline text={t('intro')} />
          </p>
        </Marketing3DHero>

        <div className="grid gap-4 md:grid-cols-2">
          {items.map((item, i) => {
            const Icon = INDUSTRY_ICONS[i] ?? Building2;
            return (
              <BlurFade key={HREFS[i]} delay={0.06 + i * 0.05} inView>
                <Link href={HREFS[i]} className="group block h-full">
                  <MagicCard
                    className="h-full rounded-2xl"
                    gradientSize={240}
                    gradientFrom="#E04E00"
                    gradientTo="#FD8018"
                    gradientColor="rgba(224,78,0,0.1)"
                    gradientOpacity={0.55}
                  >
                    <div className="relative flex h-full flex-col p-6 transition-transform duration-200 group-hover:-translate-y-0.5">
                      <div className="mb-4 flex items-start justify-between gap-3">
                        <span className="inline-flex size-11 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-border/60 dark:bg-primary/20">
                          <Icon className="size-5 text-primary" />
                        </span>
                        <ArrowRight className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary rtl:group-hover:-translate-x-0.5 rtl:rotate-180" />
                      </div>
                      <h2 className="text-lg font-semibold leading-snug transition-colors group-hover:text-primary">
                        {item.title}
                      </h2>
                      <p className="mt-2 flex-1 text-sm leading-relaxed text-muted-foreground">
                        <RichInline text={item.desc} />
                      </p>
                      <span className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-primary">
                        {t('learnMore')}
                        <ArrowRight className="size-3.5 rtl:rotate-180" />
                      </span>
                    </div>
                  </MagicCard>
                </Link>
              </BlurFade>
            );
          })}
        </div>

        <BlurFade delay={0.2} inView>
          <div className="relative overflow-hidden rounded-3xl border border-dashed border-primary/30 bg-primary/5 p-6 md:p-8 dark:bg-primary/10">
            <BorderBeam size={100} duration={10} colorFrom="#E04E00" colorTo="#FD8018" borderWidth={1} />
            <div className="relative flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div className="max-w-xl">
                <div className="mb-3 inline-flex size-10 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
                  <Building2 className="size-5 text-primary" />
                </div>
                <h2 className="text-xl font-bold tracking-tight">{t('otherTitle')}</h2>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  <RichInline text={t('otherDesc')} />
                </p>
              </div>
              <Button asChild size="lg" className="shrink-0">
                <Link href="/book-demo">{tc('bookDemo')}</Link>
              </Button>
            </div>
          </div>
        </BlurFade>
      </div>
    </Marketing3DShell>
  );
}
