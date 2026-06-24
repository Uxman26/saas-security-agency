'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ChevronDown, Menu, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ThemeToggle } from '@/components/theme-toggle';
import { MarketingBrand } from '@/components/marketing/marketing-brand';
import { LanguageSwitcher } from '@/components/language-switcher';
import { cn } from '@/lib/utils';

const INDUSTRIES = [
  { href: '/industries/security', label: 'Security' },
  { href: '/industries/cleaning-facilities', label: 'Cleaning & Facilities' },
  { href: '/industries/event-staffing', label: 'Event Staffing' },
  { href: '/industries/temporary-staffing', label: 'Temporary Staffing' },
  { href: '/industries', label: 'Other Multi-site Service Businesses' },
];

type Props = { active?: 'home' | 'about' | 'pricing' | 'platform' | 'industries' };

export function MarketingNav({ active }: Props) {
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
      <div className="container mx-auto flex h-14 items-center justify-between px-4">
        <MarketingBrand />
        <div className="hidden lg:flex items-center gap-6 text-sm">
          {navLink('/platform', 'Product', active === 'platform')}
          <div className="relative group">
            <button
              type="button"
              className={cn(
                'flex items-center gap-1 text-sm transition-colors',
                active === 'industries' ? 'text-foreground font-medium' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Industries <ChevronDown className="size-3.5" />
            </button>
            <div className="absolute start-0 top-full pt-2 hidden group-hover:block group-focus-within:block min-w-[280px]">
              <div className="rounded-lg border bg-card shadow-lg p-2">
                {INDUSTRIES.map((i) => (
                  <Link
                    key={i.href}
                    href={i.href}
                    className="block rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground"
                  >
                    {i.label}
                  </Link>
                ))}
              </div>
            </div>
          </div>
          {navLink('/pricing', 'Pricing', active === 'pricing')}
          {navLink('/about', 'About', active === 'about')}
        </div>
        <div className="flex items-center gap-2">
          <LanguageSwitcher className="hidden sm:flex" />
          <Link href="/login" className="hidden md:block">
            <Button variant="ghost" size="sm">Sign in</Button>
          </Link>
          <Link href="/book-demo" className="hidden sm:block">
            <Button size="sm">Book a demo</Button>
          </Link>
          <ThemeToggle />
          <Button variant="ghost" size="icon" className="lg:hidden" onClick={() => setOpen((v) => !v)} aria-label="Menu">
            {open ? <X className="size-5" /> : <Menu className="size-5" />}
          </Button>
        </div>
      </div>
      {open && (
        <div className="lg:hidden border-t bg-background px-4 py-4 space-y-3">
          <Link href="/platform" className="block text-sm font-medium" onClick={() => setOpen(false)}>Product</Link>
          <button type="button" className="flex w-full items-center justify-between text-sm font-medium" onClick={() => setIndOpen((v) => !v)}>
            Industries <ChevronDown className={cn('size-4 transition', indOpen && 'rotate-180')} />
          </button>
          {indOpen && (
            <div className="ps-3 space-y-2 border-s ms-2">
              {INDUSTRIES.map((i) => (
                <Link key={i.href} href={i.href} className="block text-sm text-muted-foreground" onClick={() => setOpen(false)}>
                  {i.label}
                </Link>
              ))}
            </div>
          )}
          <Link href="/pricing" className="block text-sm font-medium" onClick={() => setOpen(false)}>Pricing</Link>
          <Link href="/about" className="block text-sm font-medium" onClick={() => setOpen(false)}>About</Link>
          <Link href="/login" className="block text-sm" onClick={() => setOpen(false)}>Sign in</Link>
          <Link href="/book-demo" onClick={() => setOpen(false)}>
            <Button className="w-full">Book a demo</Button>
          </Link>
        </div>
      )}
    </nav>
  );
}
