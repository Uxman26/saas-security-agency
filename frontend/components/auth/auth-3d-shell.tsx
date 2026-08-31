'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { InteractiveRobotSpline } from '@/components/marketing/interactive-3d-robot';
import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { LanguageSwitcher } from '@/components/language-switcher';
import { BlurFade } from '@/components/ui/blur-fade';
import { cn } from '@/lib/utils';

const ROBOT_SCENE_URL = 'https://prod.spline.design/PyzDhpQ9E5f1E3MT/scene.splinecode';

type Props = {
  title: string;
  subtitle: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  topLink?: { href: string; label: string };
  className?: string;
  /** Longer forms (signup) — top-align and allow scroll. */
  compact?: boolean;
};

/** Dark split-screen auth shell — 21st.dev Auth Page pattern + ControlOps Spline 3D panel. */
export function Auth3DShell({
  title,
  subtitle,
  children,
  footer,
  topLink,
  className,
  compact = false,
}: Props) {
  const t = useTranslations('auth');

  return (
    <div className={cn('dark relative min-h-svh bg-[#05070a] text-white', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          background:
            'radial-gradient(ellipse 55% 45% at 15% 20%, rgba(224,78,0,0.14), transparent 55%), radial-gradient(ellipse 40% 35% at 85% 80%, rgba(253,128,24,0.08), transparent 50%)',
        }}
      />

      <div className="relative z-10 mx-auto flex min-h-svh max-w-[1400px] flex-col gap-6 px-4 py-4 sm:px-6 lg:flex-row lg:items-stretch lg:gap-8 lg:px-8 lg:py-6">
        {/* Form column */}
        <div className="flex w-full flex-1 flex-col lg:max-w-[480px] xl:max-w-[520px]">
          <div className={cn('mb-6 flex items-center justify-between gap-3', compact ? 'lg:mb-6' : 'lg:mb-10')}>
            <Link href="/" className="shrink-0">
              <Image
                src="/ControlOps-Logos/controlOps-horizontal-logo-dark.png"
                alt="ControlOps"
                width={280}
                height={76}
                className="h-12 w-auto object-contain sm:h-14"
                priority
              />
            </Link>
            <div className="flex items-center gap-2">
              <LanguageSwitcher variant="dark" />
              {topLink ? (
                <Link
                  href={topLink.href}
                  className="hidden text-sm text-white/55 transition-colors hover:text-white sm:inline"
                >
                  {topLink.label}
                </Link>
              ) : null}
            </div>
          </div>

          <div
            className={cn(
              'flex flex-1 flex-col pb-8',
              compact ? 'justify-start' : 'justify-center'
            )}
          >
            <BlurFade delay={0.05} inView>
              <h1
                className={cn(
                  'font-bold tracking-tight text-white',
                  compact ? 'text-2xl sm:text-3xl' : 'text-3xl sm:text-4xl'
                )}
              >
                {title}
              </h1>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-white/55 sm:text-base">
                {subtitle}
              </p>
            </BlurFade>

            <BlurFade delay={0.12} inView className={cn(compact ? 'mt-6' : 'mt-8')}>
              {children}
            </BlurFade>

            {footer ? (
              <BlurFade delay={0.2} inView>
                <p className="mt-8 text-center text-sm text-white/50 lg:text-start">{footer}</p>
              </BlurFade>
            ) : null}
          </div>

          <p className="pb-2 text-center text-xs text-white/35 lg:text-start">{t('footerNote')}</p>
        </div>

        {/* 3D panel */}
        <BlurFade
          delay={0.15}
          direction="right"
          offset={24}
          inView
          className="relative hidden min-h-[420px] flex-1 overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0f172a] lg:block lg:min-h-0"
        >
          <FlickeringGrid
            className="absolute inset-0 z-0 opacity-40"
            squareSize={3}
            gridGap={7}
            flickerChance={0.22}
            color="rgb(224, 78, 0)"
            maxOpacity={0.28}
          />
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 z-[1]"
            style={{
              background:
                'radial-gradient(ellipse 70% 55% at 60% 40%, rgba(224,78,0,0.22), transparent 60%), linear-gradient(180deg, transparent 40%, rgba(5,7,10,0.55) 100%)',
            }}
          />

          <div className="absolute inset-0 z-[2]">
            <InteractiveRobotSpline
              scene={ROBOT_SCENE_URL}
              className="h-full w-full translate-x-[4%] scale-[1.1] bg-transparent"
            />
          </div>

          {/* Glass quote card — 21st.dev auth testimonial pattern */}
          <div className="absolute inset-x-5 bottom-5 z-20 sm:inset-x-7 sm:bottom-7">
            <div className="rounded-2xl border border-white/15 bg-white/10 p-4 shadow-2xl shadow-black/40 backdrop-blur-xl sm:p-5">
              <div className="mb-3 flex items-center gap-3">
                <div
                  className="flex size-10 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ background: 'linear-gradient(145deg, #FF6A1F, #F45100)' }}
                >
                  CO
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-white">ControlOps</p>
                  <p className="truncate text-xs text-white/55">{t('tagline')}</p>
                </div>
              </div>
              <p className="text-sm leading-relaxed text-white/85">
                &ldquo;{t('brandSubtitle')}&rdquo;
              </p>
            </div>
          </div>
        </BlurFade>
      </div>
    </div>
  );
}
