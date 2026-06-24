'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';
import {
  Users,
  MapPin,
  Calendar,
  FileText,
  Wallet,
  ClipboardList,
  BarChart3,
  Check,
  ArrowRight,
} from 'lucide-react';

const CAPABILITY_ICONS = [Users, MapPin, Calendar, FileText, ClipboardList, Wallet, Wallet, BarChart3];

type Titled = { title: string; text: string };
type Cap = Titled & { href: string };
type Industry = Titled & { href: string; cta: string };
type Faq = { q: string; a: string };

export function HomePage() {
  const t = useTranslations('marketing.home');
  const tc = useTranslations('marketing.cta');
  const highlights = t.raw('highlights') as Titled[];
  const capabilities = t.raw('capabilities') as Cap[];
  const industries = t.raw('industries') as Industry[];
  const qualification = t.raw('qualification') as string[];
  const steps = t.raw('steps') as Titled[];
  const faqs = t.raw('faqs') as Faq[];
  const dashboardTiles = t.raw('dashboardTiles') as string[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="home" />

      <section className="border-b border-border/50 overflow-hidden">
        <div className="container mx-auto px-4 py-16 md:py-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            <div>
              <Eyebrow>{t('heroBadge')}</Eyebrow>
              <h1 className="text-3xl md:text-5xl font-bold tracking-tight">{t('heroTitle')}</h1>
              <p className="mt-6 text-lg text-muted-foreground leading-relaxed">{t('heroText')}</p>
              <p className="mt-4 text-muted-foreground">
                {t.rich('heroSpecialist', { b: (c) => <strong className="text-foreground font-semibold">{c}</strong> })}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
                <Button asChild variant="outline" size="lg">
                  <Link href="/pricing">{tc('viewPricing')}</Link>
                </Button>
              </div>
              <p className="mt-6 text-sm text-muted-foreground">{t('heroReassurance')}</p>
            </div>
            <div className="relative rounded-2xl border bg-card shadow-xl overflow-hidden">
              <div className="bg-muted/50 px-4 py-3 border-b flex items-center gap-2">
                <div className="size-3 rounded-full bg-red-400/80" />
                <div className="size-3 rounded-full bg-amber-400/80" />
                <div className="size-3 rounded-full bg-green-400/80" />
                <span className="ms-2 text-xs text-muted-foreground">{t('dashboardLabel')}</span>
              </div>
              <div className="p-4 space-y-3 bg-gradient-to-br from-background to-muted/30">
                <div className="grid grid-cols-3 gap-2">
                  {dashboardTiles.map((l) => (
                    <div key={l} className="rounded-lg border bg-card p-3 text-xs">
                      <p className="text-muted-foreground">{l}</p>
                      <p className="mt-1 text-lg font-bold text-primary">—</p>
                    </div>
                  ))}
                </div>
                <div className="rounded-lg border bg-card p-4 h-32 flex items-center justify-center text-sm text-muted-foreground">
                  {t('dashboardPreview')}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-14 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {highlights.map((h) => (
              <div key={h.title} className="rounded-xl border bg-card p-5">
                <p className="font-semibold text-foreground">{h.title}</p>
                <p className="mt-2 text-sm text-muted-foreground">{h.text}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl font-bold">{t('platformTitle')}</h2>
            <p className="mt-4 text-muted-foreground text-lg">{t('platformIntro')}</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
            {capabilities.map(({ title, text, href }, i) => {
              const Icon = CAPABILITY_ICONS[i];
              return (
                <Card key={title} className="h-full hover:border-primary/30 transition-colors">
                  <CardHeader className="pb-2">
                    <div className="rounded-lg bg-primary/10 p-2 w-fit text-primary mb-2">
                      <Icon className="size-4" />
                    </div>
                    <CardTitle className="text-base">
                      <Link href={href} className="hover:text-primary">{title}</Link>
                    </CardTitle>
                    <CardDescription className="text-sm leading-relaxed">{text}</CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="max-w-3xl mb-12">
            <h2 className="text-3xl font-bold">{t('industriesTitle')}</h2>
            <p className="mt-4 text-muted-foreground text-lg">{t('industriesIntro')}</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {industries.map((ind) => (
              <Card key={ind.title} className="flex flex-col">
                <CardHeader>
                  <CardTitle className="text-lg">{ind.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed">{ind.text}</CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0">
                  <Button asChild variant="outline" size="sm">
                    <Link href={ind.href}>{ind.cta} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" /></Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4 max-w-3xl">
          <h2 className="text-3xl font-bold">{t('qualifyTitle')}</h2>
          <p className="mt-4 text-muted-foreground text-lg">{t('qualifyIntro')}</p>
          <ul className="mt-8 space-y-3">
            {qualification.map((item) => (
              <li key={item} className="flex items-start gap-3 text-muted-foreground">
                <Check className="size-5 text-primary shrink-0 mt-0.5" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-10">
            <MarketingCta href="/book-demo">{tc('discussRequirements')}</MarketingCta>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-3xl font-bold">{t('howTitle')}</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, i) => (
              <div key={step.title} className="text-center">
                <div className="mx-auto mb-4 flex size-12 items-center justify-center rounded-full border-2 border-primary bg-primary/10 font-bold text-primary">
                  {i + 1}
                </div>
                <h3 className="font-semibold">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground">{step.text}</p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <MarketingCta href="/book-demo">{t('howCta')}</MarketingCta>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold">{t('demoTitle')}</h2>
          <p className="mt-4 text-muted-foreground text-lg">{t('demoText')}</p>
          <div className="mt-8">
            <MarketingCta href="/book-demo">{t('demoCta')}</MarketingCta>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-8">
          <div className="rounded-2xl border bg-card p-6">
            <h3 className="text-xl font-semibold">{t('value1Title')}</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">{t('value1Text')}</p>
          </div>
          <div className="rounded-2xl border bg-card p-6">
            <h3 className="text-xl font-semibold">{t('value2Title')}</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">{t('value2Text')}</p>
            <Link href="/industries/security" className="mt-4 inline-flex items-center text-sm font-medium text-primary hover:underline">
              {t('value2Link')} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold">{t('pricingTitle')}</h2>
          <p className="mt-4 text-muted-foreground text-lg">{t('pricingText')}</p>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/pricing">{t('comparePlans')}</MarketingCta>
            <Button asChild variant="outline" size="lg">
              <Link href="/book-demo">{tc('discussRequirements')}</Link>
            </Button>
          </div>
        </div>
      </section>

      <section className="border-b border-border/50 py-20 bg-muted/20">
        <div className="container mx-auto px-4 max-w-2xl">
          <h2 className="text-3xl font-bold text-center mb-10">{t('faqTitle')}</h2>
          <div className="space-y-4">
            {faqs.map((f) => (
              <div key={f.q} className="rounded-xl border bg-card p-5">
                <h3 className="font-semibold">{f.q}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">{f.a}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="py-20">
        <ScrollReveal className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl font-bold">{t('finalTitle')}</h2>
          <p className="mt-4 text-muted-foreground text-lg">{t('finalText')}</p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <Button asChild variant="outline" size="lg">
              <Link href="/pricing">{tc('viewPricing')}</Link>
            </Button>
          </div>
        </ScrollReveal>
      </section>

      <MarketingFooter />
    </div>
  );
}
