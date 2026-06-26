'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { Eyebrow, MarketingCta } from '@/components/marketing/marketing-cta';
import { ScrollReveal } from '@/components/marketing/scroll-reveal';
import { MarketingFaqAccordion } from '@/components/marketing/marketing-faq-accordion';
import { MarketingSection, SectionHeading } from '@/components/marketing/marketing-section';
import { MarketingDashboardPreview } from '@/components/marketing/marketing-dashboard-preview';
import { MarketingStatsStrip } from '@/components/marketing/marketing-stats-strip';
import { RichInline, richTags } from '@/components/marketing/marketing-rich-text';
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
  LayoutDashboard,
  FileCheck,
  Receipt,
} from 'lucide-react';

const CAPABILITY_ICONS = [Users, MapPin, Calendar, FileText, ClipboardList, Wallet, Wallet, BarChart3];
const HIGHLIGHT_ICONS = [LayoutDashboard, Calendar, FileCheck, Receipt];

type Titled = { title: string; text: string };
type Cap = Titled & { href: string };
type Industry = Titled & { href: string; cta: string };
type Faq = { q: string; a: string };
type DashStat = { label: string; value: string; change?: string; trend?: 'up' | 'down' | 'warn' };
type Shift = { site: string; time: string; staff: string; status: string };
type ImpactStat = { value: string; label: string; desc: string };

export function HomePage() {
  const t = useTranslations('marketing.home');
  const tc = useTranslations('marketing.cta');
  const highlights = t.raw('highlights') as Titled[];
  const capabilities = t.raw('capabilities') as Cap[];
  const industries = t.raw('industries') as Industry[];
  const qualification = t.raw('qualification') as string[];
  const steps = t.raw('steps') as Titled[];
  const faqs = t.raw('faqs') as Faq[];
  const dashboardStats = t.raw('dashboardStats') as DashStat[];
  const dashboardShifts = t.raw('dashboardShifts') as Shift[];
  const impactStats = t.raw('impactStats') as ImpactStat[];

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav active="home" />

      <MarketingSection variant="hero" className="py-16 md:py-24">
        <div className="container mx-auto px-4">
          <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
            <div className="animate-fade-in-up">
              <Eyebrow>{t('heroBadge')}</Eyebrow>
              <h1 className="text-3xl md:text-5xl lg:text-[3.25rem] font-bold tracking-tight leading-[1.15]">
                {t.rich('heroTitle', richTags)}
              </h1>
              <p className="mt-6 text-lg md:text-xl text-muted-foreground leading-relaxed">
                <RichInline text={t('heroText')} variant="hero" />
              </p>
              <p className="mt-4 text-base text-muted-foreground leading-relaxed">
                {t.rich('heroSpecialist', richTags)}
              </p>
              <div className="mt-8 flex flex-wrap gap-4">
                <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
                <Button asChild variant="outline" size="lg" className="border-primary/30 hover:bg-primary/5">
                  <Link href="/pricing">{tc('viewPricing')}</Link>
                </Button>
              </div>
              <div className="mt-6 rounded-xl border border-primary/20 bg-gradient-to-r from-primary/8 to-transparent p-4">
                <p className="text-sm leading-relaxed">
                  <RichInline text={t('heroReassurance')} />
                </p>
              </div>
            </div>
            <MarketingDashboardPreview
              label={t('dashboardLabel')}
              stats={dashboardStats}
              shifts={dashboardShifts}
              chartLabel={t('dashboardChart')}
              revenueLabel={t('dashboardRevenue')}
              revenueValue={t('dashboardRevenueValue')}
              shiftsTitle={t('dashboardShiftsTitle')}
            />
          </div>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted" className="py-12 md:py-14">
        <div className="container mx-auto px-4">
          <MarketingStatsStrip items={impactStats} />
        </div>
      </MarketingSection>

      <MarketingSection className="py-14">
        <div className="container mx-auto px-4">
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {highlights.map((h, i) => {
              const Icon = HIGHLIGHT_ICONS[i];
              return (
                <div
                  key={h.title}
                  className="group relative overflow-hidden rounded-2xl border bg-card p-6 marketing-card-hover border-t-[3px] border-t-primary shadow-sm"
                >
                  <div className="absolute -top-8 -end-8 size-24 rounded-full bg-primary/5 blur-2xl group-hover:bg-primary/10 transition-colors" />
                  <div className="relative mb-4 flex size-12 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-[#DF3C01] text-white shadow-md shadow-primary/25 group-hover:scale-105 transition-transform">
                    <Icon className="size-6" />
                  </div>
                  <p className="relative font-bold text-foreground text-lg">{h.title}</p>
                  <p className="relative mt-2 text-sm text-muted-foreground leading-relaxed">
                    <RichInline text={h.text} />
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </MarketingSection>

      <MarketingSection variant="accent">
        <div className="container mx-auto px-4">
          <SectionHeading
            title={<RichInline text={t('platformTitle')} variant="hero" />}
            subtitle={<RichInline text={t('platformIntro')} />}
          />
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {capabilities.map(({ title, text, href }, i) => {
              const Icon = CAPABILITY_ICONS[i];
              return (
                <Card key={title} className="h-full marketing-card-hover group border-border/60 shadow-sm">
                  <CardHeader className="pb-2">
                    <div className="rounded-xl bg-gradient-to-br from-primary/20 to-primary/5 p-3 w-fit text-primary mb-3 group-hover:from-primary group-hover:to-[#DF3C01] group-hover:text-primary-foreground transition-all shadow-sm">
                      <Icon className="size-5" />
                    </div>
                    <CardTitle className="text-base font-bold">
                      <Link href={href} className="hover:text-primary transition-colors">{title}</Link>
                    </CardTitle>
                    <CardDescription className="text-sm leading-relaxed mt-2">
                      <RichInline text={text} />
                    </CardDescription>
                  </CardHeader>
                </Card>
              );
            })}
          </div>
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="container mx-auto px-4">
          <SectionHeading
            title={<RichInline text={t('industriesTitle')} variant="hero" />}
            subtitle={<RichInline text={t('industriesIntro')} />}
          />
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {industries.map((ind) => (
              <Card key={ind.title} className="flex flex-col marketing-card-hover shadow-sm overflow-hidden">
                <div className="h-1 bg-gradient-to-r from-primary via-[#FD8018] to-[#DF3C01]" />
                <CardHeader>
                  <CardTitle className="text-lg font-bold">{ind.title}</CardTitle>
                  <CardDescription className="text-sm leading-relaxed mt-2">
                    <RichInline text={ind.text} />
                  </CardDescription>
                </CardHeader>
                <CardContent className="mt-auto pt-0">
                  <Button asChild variant="outline" size="sm" className="border-primary/30 hover:bg-primary/5 hover:text-primary">
                    <Link href={ind.href}>{ind.cta} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" /></Link>
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted">
        <div className="container mx-auto px-4 max-w-4xl">
          <SectionHeading
            title={t('qualifyTitle')}
            subtitle={<RichInline text={t('qualifyIntro')} />}
            align="center"
          />
          <ul className="grid sm:grid-cols-2 gap-3">
            {qualification.map((item) => (
              <li
                key={item}
                className="flex items-start gap-3 rounded-xl border bg-card p-4 text-sm text-muted-foreground marketing-card-hover shadow-sm"
              >
                <div className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 mt-0.5">
                  <Check className="size-3.5 text-primary" />
                </div>
                <RichInline text={item} />
              </li>
            ))}
          </ul>
          <div className="mt-10 text-center">
            <MarketingCta href="/book-demo">{tc('discussRequirements')}</MarketingCta>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="container mx-auto px-4">
          <SectionHeading title={t('howTitle')} align="center" />
          <div className="grid md:grid-cols-3 gap-8 max-w-4xl mx-auto">
            {steps.map((step, i) => (
              <div key={step.title} className="relative text-center group">
                {i < steps.length - 1 && (
                  <div className="hidden md:block absolute top-8 start-[calc(50%+2.5rem)] w-[calc(100%-5rem)] h-0.5 bg-gradient-to-r from-primary/50 to-transparent" />
                )}
                <div className="mx-auto mb-5 flex size-16 items-center justify-center rounded-2xl bg-gradient-to-br from-primary to-[#DF3C01] font-bold text-2xl text-white shadow-lg shadow-primary/30 group-hover:scale-105 transition-transform">
                  {i + 1}
                </div>
                <h3 className="font-bold text-lg">{step.title}</h3>
                <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
                  <RichInline text={step.text} />
                </p>
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <MarketingCta href="/book-demo">{t('howCta')}</MarketingCta>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection variant="cta">
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <SectionHeading
            title={t('demoTitle')}
            subtitle={<RichInline text={t('demoText')} />}
            align="center"
          />
          <MarketingCta href="/book-demo">{t('demoCta')}</MarketingCta>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted">
        <div className="container mx-auto px-4 max-w-4xl grid md:grid-cols-2 gap-6">
          <div className="rounded-2xl border bg-card p-6 marketing-card-hover border-s-4 border-s-primary shadow-sm">
            <h3 className="text-xl font-bold">{t('value1Title')}</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              <RichInline text={t('value1Text')} />
            </p>
          </div>
          <div className="rounded-2xl border bg-card p-6 marketing-card-hover shadow-sm">
            <h3 className="text-xl font-bold">{t('value2Title')}</h3>
            <p className="mt-3 text-muted-foreground leading-relaxed">
              <RichInline text={t('value2Text')} />
            </p>
            <Link href="/industries/security" className="mt-4 inline-flex items-center text-sm font-semibold text-primary hover:underline">
              {t('value2Link')} <ArrowRight className="size-3.5 ms-1 rtl:rotate-180" />
            </Link>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection>
        <div className="container mx-auto px-4 text-center max-w-2xl">
          <SectionHeading
            title={t('pricingTitle')}
            subtitle={<RichInline text={t('pricingText')} />}
            align="center"
          />
          <div className="flex flex-wrap justify-center gap-4">
            <MarketingCta href="/pricing">{t('comparePlans')}</MarketingCta>
            <Button asChild variant="outline" size="lg" className="border-primary/30 hover:bg-primary/5">
              <Link href="/book-demo">{tc('discussRequirements')}</Link>
            </Button>
          </div>
        </div>
      </MarketingSection>

      <MarketingSection variant="muted">
        <div className="container mx-auto px-4 max-w-2xl">
          <SectionHeading title={t('faqTitle')} align="center" />
          <MarketingFaqAccordion items={faqs} />
        </div>
      </MarketingSection>

      <MarketingSection border={false} className="py-20 marketing-cta-bg">
        <ScrollReveal className="container mx-auto px-4 text-center max-w-2xl">
          <h2 className="text-3xl md:text-4xl font-bold">
            <RichInline text={t('finalTitle')} variant="hero" />
          </h2>
          <p className="mt-4 text-muted-foreground text-lg leading-relaxed">
            <RichInline text={t('finalText')} />
          </p>
          <div className="mt-10 flex flex-wrap justify-center gap-4">
            <MarketingCta href="/book-demo">{tc('bookDemo')}</MarketingCta>
            <Button asChild variant="outline" size="lg" className="border-primary/30 hover:bg-primary/5">
              <Link href="/pricing">{tc('viewPricing')}</Link>
            </Button>
          </div>
        </ScrollReveal>
      </MarketingSection>

      <MarketingFooter />
    </div>
  );
}
