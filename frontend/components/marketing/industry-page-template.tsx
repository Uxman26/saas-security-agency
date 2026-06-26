'use client';

import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { MarketingSection, SectionHeading } from '@/components/marketing/marketing-section';
import { MarketingFaqAccordion } from '@/components/marketing/marketing-faq-accordion';
import { RichInline } from '@/components/marketing/marketing-rich-text';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, CheckCircle2 } from 'lucide-react';

type Props = {
  activeNav?: 'industries';
  eyebrow: string;
  title: string;
  paragraph: string;
  cta: string;
  disclaimer?: string;
  problems: { title: string; text: string }[];
  capabilities: { title: string; text: string }[];
  workflow: string[];
  faqs: { q: string; a: string }[];
};

export function IndustryPageTemplate({
  activeNav = 'industries',
  eyebrow,
  title,
  paragraph,
  cta,
  disclaimer,
  problems,
  capabilities,
  workflow,
  faqs,
}: Props) {
  const ts = useTranslations('marketing.industrySections');
  const tc = useTranslations('marketing.cta');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active={activeNav} />
      <MarketingSection variant="hero" className="py-16 md:py-24">
        <div className="container mx-auto px-4 max-w-4xl">
          <Eyebrow>{eyebrow}</Eyebrow>
          <h1 className="text-3xl md:text-5xl font-bold tracking-tight leading-tight">
            <RichInline text={title} />
          </h1>
          <p className="mt-6 text-lg text-muted-foreground leading-relaxed">
            <RichInline text={paragraph} />
          </p>
          <div className="mt-8">
            <MarketingCta href="/book-demo">{cta}</MarketingCta>
          </div>
          {disclaimer && (
            <p className="mt-8 text-sm text-muted-foreground rounded-lg border border-primary/20 bg-primary/5 p-4 border-s-4 border-s-primary">
              <RichInline text={disclaimer} />
            </p>
          )}
        </div>
      </MarketingSection>
      <MarketingSection variant="muted">
        <div className="container mx-auto px-4 max-w-5xl">
          <SectionHeading title={ts('problems')} />
          <div className="grid md:grid-cols-3 gap-5">
            {problems.map((p) => (
              <Card key={p.title} className="marketing-card-hover border-t-2 border-t-amber-500/50">
                <CardHeader className="pb-2">
                  <div className="mb-2 flex size-9 items-center justify-center rounded-lg bg-amber-500/10 text-amber-600">
                    <AlertTriangle className="size-4" />
                  </div>
                  <CardTitle className="text-base">{p.title}</CardTitle>
                </CardHeader>
                <CardContent className="text-sm text-muted-foreground leading-relaxed">
                  <RichInline text={p.text} />
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </MarketingSection>
      <MarketingSection>
        <div className="container mx-auto px-4 max-w-5xl">
          <SectionHeading title={ts('capabilities')} />
          <div className="grid sm:grid-cols-2 gap-5">
            {capabilities.map((c) => (
              <div key={c.title} className="rounded-xl border bg-card p-5 marketing-card-hover group">
                <div className="flex gap-3 items-start">
                  <div className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                    <CheckCircle2 className="size-4" />
                  </div>
                  <div>
                    <h3 className="font-semibold">{c.title}</h3>
                    <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                      <RichInline text={c.text} />
                    </p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </MarketingSection>
      <MarketingSection variant="accent">
        <div className="container mx-auto px-4 max-w-3xl">
          <SectionHeading title={ts('workflow')} />
          <ol className="space-y-4">
            {workflow.map((step, i) => (
              <li key={i} className="flex gap-4 rounded-xl border bg-card p-4 marketing-card-hover">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground font-bold text-sm">
                  {i + 1}
                </span>
                <span className="text-muted-foreground pt-1 leading-relaxed">
                  <RichInline text={step} />
                </span>
              </li>
            ))}
          </ol>
        </div>
      </MarketingSection>
      <MarketingSection variant="muted">
        <div className="container mx-auto px-4 max-w-3xl">
          <SectionHeading title={ts('faqs')} />
          <MarketingFaqAccordion items={faqs} />
        </div>
      </MarketingSection>
      <MarketingSection border={false} variant="cta" className="py-16">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <SectionHeading
            title={ts('finalTitle')}
            subtitle={<RichInline text={ts('finalText')} />}
            align="center"
          />
          <div className="flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{cta}</MarketingCta>
            <MarketingCta href="/pricing" variant="outline">{tc('viewPricing')}</MarketingCta>
          </div>
        </div>
      </MarketingSection>
      <MarketingFooter />
    </div>
  );
}
