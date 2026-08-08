'use client';

import { useTheme } from 'next-themes';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { cn } from '@/lib/utils';

type NavActive = 'home' | 'about' | 'pricing' | 'platform' | 'industries' | 'help';

type ShellProps = {
  active: NavActive;
  children: React.ReactNode;
  className?: string;
};

/** Shared ambient 3D field for marketing pages (21st.dev). */
export function Marketing3DShell({ active, children, className }: ShellProps) {
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  return (
    <div className={cn('relative flex min-h-screen flex-col overflow-x-hidden bg-background', className)}>
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(224,78,0,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 40%, rgba(253,128,24,0.06), transparent 50%), #0B0F14'
            : 'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(224,78,0,0.08), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 40%, rgba(253,128,24,0.04), transparent 50%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden opacity-60 dark:opacity-40"
      >
        <FlickeringGrid
          className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]"
          squareSize={3}
          gridGap={5}
          color={isDark ? 'rgb(253, 128, 24)' : 'rgb(224, 78, 0)'}
          maxOpacity={0.22}
          flickerChance={0.18}
        />
      </div>

      <MarketingNav active={active} />
      <div className="relative z-10 flex-1">{children}</div>
      <MarketingFooter />
    </div>
  );
}

type HeroProps = {
  eyebrow?: React.ReactNode;
  title: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  delay?: number;
};

/** Border-beam hero panel used on About / Industries. */
export function Marketing3DHero({ eyebrow, title, children, className, delay = 0.04 }: HeroProps) {
  return (
    <BlurFade delay={delay} inView>
      <div
        className={cn(
          'relative overflow-hidden rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm backdrop-blur-md md:p-10',
          'dark:border-white/10 dark:bg-[#11161D]/75',
          className
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0"
          style={{
            background:
              'radial-gradient(ellipse 60% 80% at 0% 0%, rgba(224,78,0,0.14), transparent 55%), radial-gradient(ellipse 40% 50% at 100% 100%, oklch(0.55 0.12 66 / 0.08), transparent 50%)',
          }}
        />
        <BorderBeam size={140} duration={12} colorFrom="#E04E00" colorTo="#FD8018" borderWidth={1.5} />
        <div className="relative max-w-3xl">
          {eyebrow ? <div className="mb-3">{eyebrow}</div> : null}
          <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-5xl md:leading-tight">
            {title}
          </h1>
          {children ? <div className="mt-5 space-y-4">{children}</div> : null}
        </div>
      </div>
    </BlurFade>
  );
}
