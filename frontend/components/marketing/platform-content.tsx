'use client';

import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';

export function PlatformContent() {
  const t = useTranslations('marketing.platform');
  const tc = useTranslations('marketing.cta');
  const sections = t.raw('sections') as { id: string; title: string; text: string }[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="platform" />
      <section className="border-b border-border/50 py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{t('badge')}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('title')}</h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{t('intro')}</p>
          <div className="mt-8 flex flex-wrap gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <MarketingCta href="/pricing" variant="outline">{tc('viewPricing')}</MarketingCta>
          </div>
        </div>
      </section>
      <section className="py-16">
        <div className="container mx-auto px-4 max-w-4xl space-y-16">
          {sections.map((s) => (
            <div key={s.id} id={s.id} className="scroll-mt-20 border-b border-border/50 pb-12 last:border-0">
              <h2 className="text-2xl font-bold">{s.title}</h2>
              <p className="mt-4 text-muted-foreground leading-relaxed">{s.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section className="py-16 bg-muted/20 border-t">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-2xl font-bold">{t('finalTitle')}</h2>
          <p className="mt-4 text-muted-foreground">{t('finalText')}</p>
          <div className="mt-8">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
          </div>
        </div>
      </section>
      <MarketingFooter />
    </div>
  );
}
