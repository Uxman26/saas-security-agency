'use client';

import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingSection, SectionHeading } from '@/components/marketing/marketing-section';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import {
  Users,
  MapPin,
  Calendar,
  FileText,
  PoundSterling,
  Wallet,
  Receipt,
  BarChart3,
} from 'lucide-react';

const SECTION_ICONS = [Users, MapPin, Calendar, FileText, PoundSterling, Wallet, Receipt, BarChart3];

export function PlatformContent() {
  const t = useTranslations('marketing.platform');
  const tc = useTranslations('marketing.cta');
  const sections = t.raw('sections') as { id: string; title: string; text: string }[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="platform" />
      <MarketingSection variant="hero" className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            <RichInline text={t('intro')} />
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <MarketingCta href="/pricing" variant="outline">{tc('viewPricing')}</MarketingCta>
          </div>
        </div>
      </MarketingSection>
      <MarketingSection>
        <div className="container mx-auto px-4 max-w-4xl space-y-6">
          {sections.map((s, i) => {
            const Icon = SECTION_ICONS[i];
            return (
              <div
                key={s.id}
                id={s.id}
                className="scroll-mt-24 rounded-2xl border bg-card p-6 md:p-8 marketing-card-hover group"
              >
                <div className="flex gap-4 items-start">
                  <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-primary/15 to-primary/5 text-primary group-hover:from-primary group-hover:to-[#DF3C01] group-hover:text-primary-foreground transition-all">
                    <Icon className="size-6" />
                  </div>
                  <div>
                    <h2 className="text-xl md:text-2xl font-bold">{s.title}</h2>
                    <p className="mt-3 text-muted-foreground leading-relaxed">
                      <RichInline text={s.text} />
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </MarketingSection>
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
