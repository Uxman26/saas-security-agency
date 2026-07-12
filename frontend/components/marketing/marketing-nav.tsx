'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarketingBrand } from '@/components/marketing/marketing-brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';

const INDUSTRY_KEYS = [
  { href: '/industries/security', key: 'security' },
  { href: '/industries/cleaning-facilities', key: 'cleaning' },
  { href: '/industries/event-staffing', key: 'eventStaffing' },
  { href: '/industries/temporary-staffing', key: 'tempStaffing' },
  { href: '/industries', key: 'otherIndustries' },
] as const;

type Props = { active?: 'home' | 'about' | 'pricing' | 'platform' | 'industries' | 'help' };

export function MarketingNav({ active }: Props) {
  const t = useTranslations('marketing.nav');
  const [open, setOpen] = useState(false);
  const [indOpen, setIndOpen] = useState(false);

  const navLink = (href: string, label: string, isActive: boolean) => (
    <Link
      href={href}
      className={cn(
        'text-sm transition-colors',
        isActive ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => setOpen(false)}
    >
      {label}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur-md">
      <div className="container mx-auto flex h-16 md:h-[4.5rem] items-center justify-between gap-4 px-4">
        <MarketingBrand size="nav" />
        <div className="hidden lg:flex items-center gap-6 text-sm">
          {navLink('/platform', t('product'), active === 'platform')}
          <div className="relative group">
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 text-sm transition-colors',
                active === 'industries' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('industries')} <ChevronDown className="size-3.5" />
            </button>
            <div className="absolute start-0 top-full pt-2 hidden group-hover:block group-focus-within:block min-w-[280px]">
              <div className="rounded-lg border bg-card shadow-lg p-2">
                {INDUSTRY_KEYS.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {t(i.key)}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {navLink('/pricing', t('pricing'), active === 'pricing')}
          {navLink('/about', t('about'), active === 'about')}
          {navLink('/help', t('help'), active === 'help')}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:flex" />
          <Link href="/login" className="hidden md:block">
            <Button variant="ghost" size="sm">{t('signIn')}</Button>
          </Link>
          <Link href="/book-demo" className="hidden sm:block">
            <Button size="sm">{t('bookDemo')}</Button>
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="lg:hidden border-t bg-background px-4 py-4 space-y-3">
          <Link href="/platform" className="block text-sm font-medium" onClick={() => setOpen(false)}>{t('product')}</Link>
          <button type="button" className="flex w-full items-center justify-between text-sm font-medium" onClick={() => setIndOpen((v) => !v)}>
            {t('industries')} <ChevronDown className={cn('size-4 transition', indOpen && 'rotate-180')} />
          </button>
          {indOpen && (
            <div className="ps-3 space-y-2 border-s ms-2">
              {INDUSTRY_KEYS.map((i) => (
                <Link key={i.href} href={i.href} className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                  {t(i.key)}
                </Link>
              ))}
            </div>
          )}
          <Link href="/pricing" className="block text-sm font-medium" onClick={() => setOpen(false)}>{t('pricing')}</Link>
          <Link href="/about" className="block text-sm font-medium" onClick={() => setOpen(false)}>{t('about')}</Link>
          <Link href="/help" className="block text-sm font-medium" onClick={() => setOpen(false)}>{t('help')}</Link>
          <Link href="/login" className="block text-sm" onClick={() => setOpen(false)}>{t('signIn')}</Link>
          <Link href="/book-demo" onClick={() => setOpen(false)}>
            <Button className="w-full">{t('bookDemo')}</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
