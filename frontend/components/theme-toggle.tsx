'use client';

import { useTheme } from 'next-themes';
import { useEffect, useId, useState } from 'react';
import { motion } from 'motion/react';
import { MonitorCog, MoonStar, Sun } from 'lucide-react';
import { cn } from '@/lib/utils';

const OPTIONS = [
  { value: 'system', label: 'System', Icon: MonitorCog },
  { value: 'light', label: 'Light', Icon: Sun },
  { value: 'dark', label: 'Dark', Icon: MoonStar },
] as const;

type ThemeValue = (typeof OPTIONS)[number]['value'];

/**
 * Segmented system / light / dark theme switch (21st.dev-style pill).
 */
export function ThemeToggle({ className }: { className?: string }) {
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  const layoutId = useId();

  useEffect(() => setMounted(true), []);

  const active: ThemeValue =
    theme === 'light' || theme === 'dark' || theme === 'system' ? theme : 'system';

  if (!mounted) {
    return (
      <div
        className={cn(
          'inline-flex h-9 items-center gap-0.5 rounded-full border border-border/70 bg-muted/50 p-1 dark:border-white/10 dark:bg-white/5',
          className
        )}
        aria-hidden
      >
        {OPTIONS.map(({ value }) => (
          <span key={value} className="size-7 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Color theme"
      className={cn(
        'inline-flex h-9 items-center gap-0.5 rounded-full border border-border/80 bg-muted/60 p-1 shadow-sm backdrop-blur-md',
        'dark:border-white/12 dark:bg-[#151A22]/90 dark:shadow-[inset_0_0_0_1px_rgba(255,255,255,0.04)]',
        className
      )}
    >
      {OPTIONS.map(({ value, label, Icon }) => {
        const selected = active === value;
        return (
          <button
            key={value}
            type="button"
            role="radio"
            aria-checked={selected}
            aria-label={label}
            title={label}
            onClick={() => setTheme(value)}
            className={cn(
              'relative flex size-7 items-center justify-center rounded-lg transition-colors',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/50',
              selected
                ? 'text-foreground'
                : 'text-muted-foreground hover:text-foreground/80'
            )}
          >
            {selected ? (
              <motion.span
                layoutId={`theme-toggle-pill-${layoutId}`}
                className={cn(
                  'absolute inset-0 rounded-lg border border-border/80 bg-background shadow-sm',
                  'dark:border-white/15 dark:bg-white/10'
                )}
                transition={{ type: 'spring', stiffness: 420, damping: 32 }}
              />
            ) : null}
            <Icon className="relative z-10 size-3.5" strokeWidth={selected ? 2.25 : 2} />
          </button>
        );
      })}
    </div>
  );
}
