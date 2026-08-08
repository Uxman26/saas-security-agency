'use client';

import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { ArrowRight } from 'lucide-react';
import { cn } from '@/lib/utils';

export type SkewCardItem = {
  id?: string;
  title: string;
  desc: string;
  href?: string;
  cta?: string;
  icon?: LucideIcon;
  gradientFrom: string;
  gradientTo: string;
};

type Props = {
  cards: SkewCardItem[];
  className?: string;
};

/** 21st.dev SkewCards — gradient glass panels with hover skew / blob motion (light + dark). */
export default function SkewCards({ cards, className }: Props) {
  return (
    <>
      <div
        className={cn(
          'flex flex-wrap items-stretch justify-center gap-x-6 gap-y-10 py-6 md:py-10',
          className
        )}
      >
        {cards.map(({ id, title, desc, href, cta, icon: Icon, gradientFrom, gradientTo }, idx) => (
          <div
            key={id || title || idx}
            id={id}
            className="group relative mx-2 h-[380px] w-[min(100%,300px)] scroll-mt-24 transition-all duration-500 sm:mx-4 sm:h-[400px] sm:w-[320px]"
          >
            {/* Skewed gradient panels */}
            <span
              className="absolute top-0 left-[40px] h-full w-1/2 rounded-lg opacity-90 transition-all duration-500 [transform:skewX(15deg)] group-hover:left-[16px] group-hover:w-[calc(100%-72px)] group-hover:[transform:skewX(0deg)] dark:opacity-100 sm:left-[50px] sm:group-hover:left-[20px] sm:group-hover:w-[calc(100%-90px)]"
              style={{
                background: `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`,
              }}
            />
            <span
              className="absolute top-0 left-[40px] h-full w-1/2 rounded-lg opacity-50 blur-[28px] transition-all duration-500 [transform:skewX(15deg)] group-hover:left-[16px] group-hover:w-[calc(100%-72px)] group-hover:[transform:skewX(0deg)] dark:opacity-100 dark:blur-[30px] sm:left-[50px] sm:group-hover:left-[20px] sm:group-hover:w-[calc(100%-90px)]"
              style={{
                background: `linear-gradient(315deg, ${gradientFrom}, ${gradientTo})`,
              }}
            />

            {/* Animated blurs */}
            <span className="pointer-events-none absolute inset-0 z-10">
              <span className="skew-blob absolute top-0 left-0 h-0 w-0 rounded-lg bg-white/40 opacity-0 shadow-[0_5px_15px_rgba(0,0,0,0.08)] backdrop-blur-[10px] transition-all duration-500 group-hover:top-[-40px] group-hover:left-[40px] group-hover:h-[90px] group-hover:w-[90px] group-hover:opacity-100 dark:bg-white/12 sm:group-hover:top-[-50px] sm:group-hover:left-[50px] sm:group-hover:h-[100px] sm:group-hover:w-[100px]" />
              <span className="skew-blob skew-blob-delay absolute right-0 bottom-0 h-0 w-0 rounded-lg bg-white/40 opacity-0 shadow-[0_5px_15px_rgba(0,0,0,0.08)] backdrop-blur-[10px] transition-all duration-500 group-hover:right-[40px] group-hover:bottom-[-40px] group-hover:h-[90px] group-hover:w-[90px] group-hover:opacity-100 dark:bg-white/12 sm:group-hover:right-[50px] sm:group-hover:bottom-[-50px] sm:group-hover:h-[100px] sm:group-hover:w-[100px]" />
            </span>

            {/* Content — frosted panel readable on light + dark */}
            <div
              className={cn(
                'relative z-20 left-0 flex h-full flex-col rounded-lg p-5 shadow-lg backdrop-blur-[12px] transition-all duration-500',
                'bg-white/85 ring-1 ring-black/5',
                'dark:bg-white/6 dark:ring-white/10 dark:shadow-black/40',
                'group-hover:left-[-16px] group-hover:p-8 sm:p-[20px_36px] sm:group-hover:left-[-25px] sm:group-hover:p-[48px_40px]'
              )}
            >
              {Icon ? (
                <div
                  className={cn(
                    'mb-3 flex size-11 items-center justify-center rounded-xl ring-1',
                    'bg-orange-500/10 text-orange-700 ring-orange-500/25',
                    'dark:bg-white/10 dark:text-white dark:ring-white/20'
                  )}
                >
                  <Icon className="size-5" aria-hidden />
                </div>
              ) : null}
              <h2 className="mb-2 text-xl font-semibold tracking-tight text-foreground sm:text-2xl dark:text-white">
                {title}
              </h2>
              <p className="mb-4 flex-1 text-sm leading-relaxed text-muted-foreground sm:text-base dark:text-white/80">
                {desc}
              </p>
              {href ? (
                <Link
                  href={href}
                  className={cn(
                    'inline-flex items-center gap-1.5 self-start rounded-md px-3 py-2 text-sm font-bold transition-colors hover:shadow-md',
                    'bg-[#E04E00] text-white hover:bg-[#FD8018]',
                    'dark:bg-white dark:text-[#0B0F14] dark:hover:bg-[#FD8018] dark:hover:text-white'
                  )}
                >
                  {cta || 'Explore'}
                  <ArrowRight className="size-3.5" aria-hidden />
                </Link>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      <style>{`
        @keyframes skew-blob-float {
          0%, 100% { transform: translateY(10px); }
          50% { transform: translate(-10px, -4px); }
        }
        .skew-blob { animation: skew-blob-float 2s ease-in-out infinite; }
        .skew-blob-delay { animation-delay: -1s; }
      `}</style>
    </>
  );
}
