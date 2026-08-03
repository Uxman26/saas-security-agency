'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail, MapPin, MessageCircle } from 'lucide-react';
import { MarketingBrand } from '@/components/marketing/marketing-brand';
import { GsapReveal } from '@/components/marketing/gsap-reveal';
import { cn } from '@/lib/utils';

const ACCENT = '#E8590C';
const ACCENT_SOLID = '#E04E00';
const FOOTER_BG = '#0B0F14';

const aboutLinks = [
  { href: '/about', key: 'about' as const },
  { href: '/platform', key: 'platform' as const },
  { href: '/industries/security', key: 'securityIndustry' as const },
  { href: '/pricing', key: 'pricing' as const },
];

const helpfulLinks = [
  { href: '/help', key: 'help' as const },
  { href: '/contact', key: 'contact' as const },
  { href: '/book-demo', key: 'bookDemo' as const, badge: true },
  { href: '/login', key: 'signIn' as const },
];

const legalLinks = [
  { href: '/privacy', key: 'privacy' as const },
  { href: '/terms', key: 'terms' as const },
  { href: '/cookies', key: 'cookies' as const },
  { href: '/security', key: 'security' as const },
];

function SocialIcon({
  label,
  href,
  children,
}: {
  label: string;
  href: string;
  children: React.ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={label}
      className="flex size-9 items-center justify-center rounded-full text-slate-300 transition-colors hover:bg-white/10 hover:text-white"
    >
      {children}
    </a>
  );
}

function AccentIcon({ children }: { children: React.ReactNode }) {
  return (
    <span className="mt-0.5 flex size-4 shrink-0 items-center justify-center" style={{ color: ACCENT }}>
      {children}
    </span>
  );
}

export function MarketingFooter() {
  const t = useTranslations('marketing.footer');
  const tn = useTranslations('marketing.nav');
  const year = new Date().getFullYear();

  return (
    <footer className="relative overflow-hidden text-white" style={{ backgroundColor: FOOTER_BG }}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(224,78,0,0.10), transparent 55%)',
        }}
      />

      <div className="container relative mx-auto px-4 pb-10 pt-16 md:pb-12 md:pt-20">
        <GsapReveal className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12" stagger={0.08}>
          <div data-reveal className="max-w-sm">
            <div className="[&_img]:brightness-0 [&_img]:invert">
              <MarketingBrand linked size="default" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-slate-400">{t('desc')}</p>
            <p className="mt-3 text-xs font-medium tracking-wide" style={{ color: ACCENT }}>
              {t('tagline')}
            </p>
          </div>

          <div data-reveal>
            <p className="mb-4 text-sm font-semibold text-white">{t('aboutUs')}</p>
            <ul className="space-y-3 text-sm text-slate-400">
              {aboutLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-white">
                    {l.key === 'securityIndustry' ? tn('security') : t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div data-reveal>
            <p className="mb-4 text-sm font-semibold text-white">{t('helpfulLinks')}</p>
            <ul className="space-y-3 text-sm text-slate-400">
              {helpfulLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-2 transition-colors hover:text-white"
                  >
                    {l.key === 'signIn' || l.key === 'bookDemo' ? tn(l.key) : t(l.key)}
                    {l.badge && (
                      <span
                        className="inline-flex size-4 items-center justify-center rounded-[3px] text-[9px] text-white"
                        style={{ backgroundColor: ACCENT_SOLID }}
                      >
                        <MessageCircle className="size-2.5" />
                      </span>
                    )}
                  </Link>
                </li>
              ))}
            </ul>
            <p className="mb-3 mt-8 text-sm font-semibold text-white">{t('legal')}</p>
            <ul className="space-y-2.5 text-sm text-slate-400">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className="transition-colors hover:text-white">
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </div>

          <div data-reveal>
            <p className="mb-4 text-sm font-semibold text-white">{t('contactUs')}</p>
            <ul className="space-y-4 text-sm text-slate-400">
              <li>
                <a
                  href={`mailto:${t('email')}`}
                  className="inline-flex items-start gap-3 transition-colors hover:text-white"
                >
                  <AccentIcon>
                    <Mail className="size-4" />
                  </AccentIcon>
                  <span>{t('email')}</span>
                </a>
              </li>
              <li>
                <Link
                  href="/contact"
                  className="inline-flex items-start gap-3 transition-colors hover:text-white"
                >
                  <AccentIcon>
                    <MessageCircle className="size-4" />
                  </AccentIcon>
                  <span>{t('contactCta')}</span>
                </Link>
              </li>
              <li className="inline-flex items-start gap-3">
                <AccentIcon>
                  <MapPin className="size-4" />
                </AccentIcon>
                <span>{t('location')}</span>
              </li>
            </ul>
          </div>
        </GsapReveal>

        <div className="relative mt-14 border-t border-white/10 pt-10 md:mt-16 md:pt-12">
          <div
            aria-hidden
            className={cn(
              'pointer-events-none select-none overflow-hidden',
              'text-center font-bold uppercase leading-none tracking-[-0.04em]',
              'text-[clamp(3.5rem,18vw,11rem)] text-transparent'
            )}
            style={{ WebkitTextStroke: '1px rgba(224, 78, 0, 0.35)' }}
          >
            CONTROLOPS
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-between gap-4 px-1 sm:flex-row sm:items-end">
            <div className="flex items-center gap-1">
              <SocialIcon label="LinkedIn" href="https://www.linkedin.com/">
                <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                  <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .77 0 1.73v20.54C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
                </svg>
              </SocialIcon>
              <SocialIcon label="X" href="https://x.com/">
                <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                  <path d="M18.9 2H21.7l-7.1 8.1L23 22h-6.4l-5-6.5L6 22H3.2l7.6-8.7L1 2h6.6l4.5 5.9L18.9 2zm-1.1 18h1.6L7.3 3.9H5.6L17.8 20z" />
                </svg>
              </SocialIcon>
              <SocialIcon label="Website" href="https://controlops.co.uk">
                <svg
                  viewBox="0 0 24 24"
                  className="size-4 fill-none stroke-current"
                  strokeWidth="1.75"
                  aria-hidden
                >
                  <circle cx="12" cy="12" r="9" />
                  <path d="M3 12h18M12 3c2.5 2.7 3.8 5.7 3.8 9s-1.3 6.3-3.8 9c-2.5-2.7-3.8-5.7-3.8-9S9.5 5.7 12 3z" />
                </svg>
              </SocialIcon>
            </div>
            <p className="text-xs text-slate-400 sm:text-sm">
              © {year} {t('rights')}
            </p>
          </div>
        </div>
      </div>
    </footer>
  );
}
