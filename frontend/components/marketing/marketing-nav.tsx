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

/** Shared pill chrome — matches language + theme toggles. */
const pillChrome =
  'inline-flex h-9 items-center justify-center rounded-full border border-border/80 bg-muted/70 px-3.5 text-sm font-medium shadow-sm transition-colors hover:bg-muted dark:border-white/12 dark:bg-[#1a1f28] dark:hover:bg-[#222833]';

const pillCluster =
  'inline-flex h-9 items-center gap-0.5 rounded-full border border-border/80 bg-muted/70 p-1 shadow-sm backdrop-blur-md dark:border-white/12 dark:bg-[#151A22]/90';

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
        isActive ? 'font-medium text-foreground' : 'text-muted-foreground hover:text-foreground'
      )}
      onClick={() => setOpen(false)}
    >
      {label}
    </Link>
  );

  return (
    <nav className="sticky top-0 z-50 w-full border-b border-border/50 bg-background/95 backdrop-blur-md">
      <div className="container mx-auto flex h-[4.25rem] items-center justify-between gap-4 px-4 md:h-[5rem]">
        <MarketingBrand size="nav" />
        <div className="hidden items-center gap-6 text-sm lg:flex">
          {navLink('/platform', t('product'), active === 'platform')}
          <div className="group relative">
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 text-sm transition-colors',
                active === 'industries'
                  ? 'font-medium text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              )}
            >
              {t('industries')} <ChevronDown className="size-3.5" />
            </button>
            <div className="absolute start-0 top-full hidden min-w-[280px] pt-2 group-hover:block group-focus-within:block">
              <div className="rounded-lg border bg-card p-2 shadow-lg">
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

        <div className="flex shrink-0 items-center gap-2">
          {/* Language + theme grouped in one pill cluster */}
          <div className={cn(pillCluster, 'hidden sm:inline-flex')}>
            <LanguageSwitcher
              className={cn(
                'h-7 min-w-0 border-0 bg-transparent px-2.5 shadow-none',
                'hover:bg-background/80 dark:border-0 dark:bg-transparent dark:hover:bg-white/10',
                'data-[size=sm]:h-7'
              )}
            />
            <span className="mx-0.5 h-4 w-px shrink-0 bg-border/80 dark:bg-white/15" aria-hidden />
            <ThemeToggle
              className={cn(
                'h-7 border-0 bg-transparent p-0 shadow-none',
                'dark:border-0 dark:bg-transparent dark:shadow-none'
              )}
            />
          </div>

          <Link
            href="/login"
            className={cn(pillChrome, 'hidden text-foreground md:inline-flex')}
          >
            {t('signIn')}
          </Link>

          <Link
            href="/book-demo"
            className={cn(
              pillChrome,
              'hidden border-primary/30 bg-primary text-primary-foreground shadow-sm',
              'hover:bg-primary/90 hover:text-primary-foreground',
              'dark:border-primary/40 dark:bg-primary dark:text-primary-foreground dark:hover:bg-primary/90',
              'sm:inline-flex'
            )}
          >
            {t('bookDemo')}
          </Link>

          {/* Mobile: theme alone (language opens in drawer) */}
          <ThemeToggle className="sm:hidden" />

          <Button
            variant="ghost"
            size="icon"
            className={cn(pillChrome, 'size-9 px-0 lg:hidden')}
            onClick={() => setOpen((v) => !v)}
            aria-label="Menu"
          >
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>

      {open && (
        <div className="space-y-3 border-t bg-background px-4 py-4 lg:hidden">
          <Link href="/platform" className="block text-sm font-medium" onClick={() => setOpen(false)}>
            {t('product')}
          </Link>
          <button
            type="button"
            className="flex w-full items-center justify-between text-sm font-medium"
            onClick={() => setIndOpen((v) => !v)}
          >
            {t('industries')}{' '}
            <ChevronDown className={cn('size-4 transition', indOpen && 'rotate-180')} />
          </button>
          {indOpen && (
            <div className="ms-2 space-y-2 border-s ps-3">
              {INDUSTRY_KEYS.map((i) => (
                <Link
                  key={i.href}
                  href={i.href}
                  className="block text-sm text-muted-foreground"
                  onClick={() => setOpen(false)}
                >
                  {t(i.key)}
                </Link>
              ))}
            </div>
          )}
          <Link href="/pricing" className="block text-sm font-medium" onClick={() => setOpen(false)}>
            {t('pricing')}
          </Link>
          <Link href="/about" className="block text-sm font-medium" onClick={() => setOpen(false)}>
            {t('about')}
          </Link>
          <Link href="/help" className="block text-sm font-medium" onClick={() => setOpen(false)}>
            {t('help')}
          </Link>

          <div className="flex items-center gap-2 pt-1">
            <LanguageSwitcher className="flex-1" />
          </div>

          <div className="flex flex-col gap-2 pt-1">
            <Link
              href="/login"
              className={cn(pillChrome, 'w-full text-foreground')}
              onClick={() => setOpen(false)}
            >
              {t('signIn')}
            </Link>
            <Link
              href="/book-demo"
              className={cn(
                pillChrome,
                'w-full border-primary/30 bg-primary text-primary-foreground hover:bg-primary/90',
                'dark:border-primary/40 dark:bg-primary dark:text-primary-foreground'
              )}
              onClick={() => setOpen(false)}
            >
              {t('bookDemo')}
            </Link>
          </div>
        </div>
      )}
    </nav>
  );
}
