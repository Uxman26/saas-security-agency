'use client';

import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingSection, SectionHeading } from '@/components/marketing/marketing-section';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import SkewCards, { type SkewCardItem } from '@/components/ui/gradient-card-showcase';
import { BlurFade } from '@/components/ui/blur-fade';
import {
  Users,
  MapPin,
  Calendar,
  FileText,
  PoundSterling,
  Wallet,
  Receipt,
  BarChart3,
  type LucideIcon,
} from 'lucide-react';

const SECTION_ICONS: LucideIcon[] = [
  Users,
  MapPin,
  Calendar,
  FileText,
  PoundSterling,
  Wallet,
  Receipt,
  BarChart3,
];

/** ControlOps orange-family gradients for the 3D skew showcase. */
const GRADIENTS: Array<{ from: string; to: string }> = [
  { from: '#E04E00', to: '#FD8018' },
  { from: '#FD8018', to: '#ffbc00' },
  { from: '#E04E00', to: '#c2410c' },
  { from: '#f97316', to: '#E04E00' },
  { from: '#ffbc00', to: '#E04E00' },
  { from: '#ea580c', to: '#FD8018' },
  { from: '#E04E00', to: '#fb923c' },
  { from: '#c2410c', to: '#ffbc00' },
];

export function PlatformContent() {
  const t = useTranslations('marketing.platform');
  const tc = useTranslations('marketing.cta');
  const sections = t.raw('sections') as { id: string; title: string; text: string }[];

  const cards: SkewCardItem[] = useMemo(
    () =>
      sections.map((s, i) => {
        const g = GRADIENTS[i % GRADIENTS.length];
        return {
          id: s.id,
          title: s.title,
          desc: s.text,
          href: '/book-demo',
          cta: 'Book a demo',
          icon: SECTION_ICONS[i],
          gradientFrom: g.from,
          gradientTo: g.to,
        };
      }),
    [sections]
  );

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="platform" />
      <MarketingSection variant="hero" className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <BlurFade delay={0.05}>
            <Eyebrow>{t('badge')}</Eyebrow>
          </BlurFade>
          <BlurFade delay={0.12}>
            <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          </BlurFade>
          <BlurFade delay={0.2}>
            <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
              <RichInline text={t('intro')} />
            </p>
          </BlurFade>
          <BlurFade delay={0.28}>
            <div className="mt-8 flex flex-wrap gap-4">
              <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
              <MarketingCta href="/pricing" variant="outline">
                {tc('viewPricing')}
              </MarketingCta>
            </div>
          </BlurFade>
        </div>
      </MarketingSection>

      {/* 3D product capability showcase */}
      <section className="relative overflow-hidden border-b border-border/50 bg-[#0B0F14] py-16 md:py-24">
        <div
          className="pointer-events-none absolute inset-0 opacity-70"
          aria-hidden
          style={{
            background:
              'radial-gradient(ellipse 60% 50% at 15% 20%, color-mix(in oklab, #E04E00 28%, transparent), transparent 55%), radial-gradient(ellipse 50% 45% at 85% 75%, color-mix(in oklab, #FD8018 18%, transparent), transparent 50%)',
          }}
        />
        <div className="container relative z-10 mx-auto px-4">
          <BlurFade delay={0.05}>
            <div className="mx-auto mb-10 max-w-2xl text-center md:mb-14">
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#FD8018]">
                Product showcase
              </p>
              <h2 className="mt-3 text-2xl font-bold tracking-tight text-white md:text-4xl">
                Capabilities that run every shift
              </h2>
              <p className="mt-3 text-sm text-white/65 md:text-base">
                Hover a card to unskew the panel — workforce, sites, rotas, records, rates, payroll and billing in one animated view.
              </p>
            </div>
          </BlurFade>
          <SkewCards cards={cards} />
        </div>
      </section>

      <MarketingSection variant="cta" border={false}>
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <SectionHeading
            title={t('finalTitle')}
            subtitle={<RichInline text={t('finalText')} />}
            align="center"
          />
          <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
        </div>
      </MarketingSection>
      <MarketingFooter />
    </div>
  );
}
