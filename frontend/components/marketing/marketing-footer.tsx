'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Mail, MapPin, MessageCircle } from 'lucide-react';
import { MarketingBrand } from '@/components/marketing/marketing-brand';
import { BlurFade } from '@/components/ui/blur-fade';
import { BorderBeam } from '@/components/ui/border-beam';
import { cn } from '@/lib/utils';

const ACCENT = '#E8590C';
const ACCENT_SOLID = '#E04E00';

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
      className="flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/5 hover:text-foreground dark:text-stone-300 dark:hover:bg-white/10 dark:hover:text-white"
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
    <footer
      className={cn(
        'relative overflow-hidden border-t border-border/60',
        'bg-[#F7F6F4] text-foreground',
        'dark:border-transparent dark:bg-[#0B0F14] dark:text-white'
      )}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 70% 50% at 50% 100%, rgba(224,78,0,0.08), transparent 55%)',
        }}
      />

      <div className="container relative mx-auto px-4 pb-10 pt-16 md:pb-12 md:pt-20">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4 lg:gap-12">
          <BlurFade delay={0.05} inView className="max-w-sm">
            <MarketingBrand linked size="default" />
            <p className="mt-4 text-sm leading-relaxed text-muted-foreground dark:text-stone-400">
              {t('desc')}
            </p>
            <p className="mt-3 text-xs font-medium tracking-wide" style={{ color: ACCENT }}>
              {t('tagline')}
            </p>
          </BlurFade>

          <BlurFade delay={0.12} inView>
            <p className="mb-4 text-sm font-semibold text-foreground dark:text-white">{t('aboutUs')}</p>
            <ul className="space-y-3 text-sm text-muted-foreground dark:text-stone-400">
              {aboutLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="transition-colors hover:text-foreground dark:hover:text-white"
                  >
                    {l.key === 'securityIndustry' ? tn('security') : t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </BlurFade>

          <BlurFade delay={0.2} inView>
            <p className="mb-4 text-sm font-semibold text-foreground dark:text-white">
              {t('helpfulLinks')}
            </p>
            <ul className="space-y-3 text-sm text-muted-foreground dark:text-stone-400">
              {helpfulLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="inline-flex items-center gap-2 transition-colors hover:text-foreground dark:hover:text-white"
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
            <p className="mb-3 mt-8 text-sm font-semibold text-foreground dark:text-white">
              {t('legal')}
            </p>
            <ul className="space-y-2.5 text-sm text-muted-foreground dark:text-stone-400">
              {legalLinks.map((l) => (
                <li key={l.href}>
                  <Link
                    href={l.href}
                    className="transition-colors hover:text-foreground dark:hover:text-white"
                  >
                    {t(l.key)}
                  </Link>
                </li>
              ))}
            </ul>
          </BlurFade>

          <BlurFade delay={0.28} inView>
            <p className="mb-4 text-sm font-semibold text-foreground dark:text-white">
              {t('contactUs')}
            </p>
            <ul className="space-y-4 text-sm text-muted-foreground dark:text-stone-400">
              <li>
                <a
                  href={`mailto:${t('email')}`}
                  className="inline-flex items-start gap-3 transition-colors hover:text-foreground dark:hover:text-white"
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
                  className="inline-flex items-start gap-3 transition-colors hover:text-foreground dark:hover:text-white"
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
          </BlurFade>
        </div>

        <BlurFade
          delay={0.35}
          inView
          className="relative mt-14 overflow-hidden border-t border-border/70 pt-10 md:mt-16 md:pt-12 dark:border-white/10"
        >
          <BorderBeam size={160} duration={12} colorFrom="#E04E00" colorTo="#FDBA74" borderWidth={1} />
          <div
            aria-hidden
            className={cn(
              'pointer-events-none select-none overflow-hidden',
              'text-center font-bold uppercase leading-none tracking-[-0.04em]',
              'text-[clamp(3.5rem,18vw,11rem)] text-transparent'
            )}
          >
            <span className="block dark:hidden" style={{ WebkitTextStroke: '1px rgba(22, 30, 44, 0.14)' }}>
              CONTROLOPS
            </span>
            <span
              className="hidden dark:block"
              style={{ WebkitTextStroke: '1px rgba(224, 78, 0, 0.35)' }}
            >
              CONTROLOPS
            </span>
          </div>

          <div className="absolute inset-x-0 bottom-0 flex flex-col items-center justify-between gap-4 px-1 sm:flex-row sm:items-end">
            <div className="flex items-center gap-1">
              <SocialIcon label="LinkedIn" href="https://www.linkedin.com/showcase/control-operations">
                <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                  <path d="M20.45 20.45h-3.55v-5.57c0-1.33-.02-3.04-1.85-3.04-1.85 0-2.14 1.45-2.14 2.94v5.67H9.35V9h3.41v1.56h.05c.48-.9 1.64-1.85 3.37-1.85 3.6 0 4.27 2.37 4.27 5.46v6.28zM5.34 7.43a2.06 2.06 0 110-4.12 2.06 2.06 0 010 4.12zM7.12 20.45H3.56V9h3.56v11.45zM22.22 0H1.77C.8 0 0 .77 0 1.73v20.54C0 23.22.8 24 1.77 24h20.45c.98 0 1.78-.78 1.78-1.73V1.73C24 .77 23.2 0 22.22 0z" />
                </svg>
              </SocialIcon>
              <SocialIcon
                label="Facebook"
                href="https://www.facebook.com/people/Control-Operations/61591486731565/"
              >
                <svg viewBox="0 0 24 24" className="size-4 fill-current" aria-hidden>
                  <path d="M22 12.07C22 6.48 17.52 2 11.93 2S1.86 6.48 1.86 12.07c0 5.02 3.66 9.18 8.44 9.93v-7.03H7.9v-2.9h2.4V9.85c0-2.37 1.41-3.68 3.56-3.68 1.03 0 2.12.18 2.12.18v2.33h-1.2c-1.18 0-1.55.73-1.55 1.48v1.78h2.64l-.42 2.9h-2.22V22c4.78-.75 8.44-4.91 8.44-9.93z" />
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
            <p className="text-xs text-muted-foreground sm:text-sm dark:text-stone-400">
              © {year} {t('rights')}
            </p>
          </div>
        </BlurFade>
      </div>
    </footer>
  );
}
