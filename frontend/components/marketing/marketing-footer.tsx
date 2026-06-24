'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingBrand } from '@/components/marketing/marketing-brand';

const productLinks = [
  { href: '/platform', key: 'platform' },
  { href: '/platform#workforce', key: 'workforce' },
  { href: '/platform#rota', key: 'rota' },
  { href: '/platform#sites', key: 'sites' },
  { href: '/platform#records', key: 'records' },
  { href: '/platform#payroll', key: 'payroll' },
  { href: '/platform#invoicing', key: 'invoicing' },
  { href: '/platform#reporting', key: 'reporting' },
  { href: '/pricing', key: 'pricing' },
] as const;

const industryLinks = [
  { href: '/industries/security', key: 'security' },
  { href: '/industries/cleaning-facilities', key: 'cleaning' },
  { href: '/industries/event-staffing', key: 'eventStaffing' },
  { href: '/industries/temporary-staffing', key: 'tempStaffing' },
  { href: '/industries', key: 'otherIndustries' },
] as const;

const companyLinks = [
  { href: '/about', key: 'about' },
  { href: '/contact', key: 'contact' },
  { href: '/book-demo', key: 'bookDemo' },
  { href: '/login', key: 'signIn' },
] as const;

const legalLinks = [
  { href: '/privacy', key: 'privacy' },
  { href: '/terms', key: 'terms' },
  { href: '/cookies', key: 'cookies' },
  { href: '/dpa', key: 'dpa' },
  { href: '/accessibility', key: 'accessibility' },
  { href: '/security', key: 'security' },
] as const;

export function MarketingFooter() {
  const t = useTranslations('marketing.footer');
  const tn = useTranslations('marketing.nav');

  return (
    <footer className="border-t border-border/50 py-12 bg-muted/20">
      <div className="container mx-auto px-4">
        <div className="grid gap-10 md:grid-cols-2 lg:grid-cols-5">
          <div className="lg:col-span-2">
            <MarketingBrand linked={false} />
            <p className="mt-3 text-sm text-muted-foreground max-w-md">{t('desc')}</p>
            <p className="mt-4 text-xs text-muted-foreground">{t('tagline')}</p>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">{t('product')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {productLinks.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{t(l.key)}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">{t('industries')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {industryLinks.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{tn(l.key)}</Link></li>
              ))}
            </ul>
          </div>
          <div>
            <p className="text-sm font-semibold mb-3">{t('company')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground mb-6">
              {companyLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="hover:text-foreground">
                    {l.key === 'contact' ? t('contact') : l.key === 'about' ? t('about') : tn(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="text-sm font-semibold mb-3">{t('legal')}</p>
            <ul className="space-y-2 text-sm text-muted-foreground">
              {legalLinks.map((l) => (
                <li key={l.href}><Link href={l.href} className="hover:text-foreground">{t(l.key)}</Link></li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-10 text-xs text-muted-foreground border-t pt-6">
          © {new Date().getFullYear()} {t('copyright')}
        </p>
      </div>
    </footer>
  );
}
