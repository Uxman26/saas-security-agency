'use client';

import { useCallback, useRef, type CSSProperties, type ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = {
  children: ReactNode;
  className?: string;
  /** Spotlight colour — CSS colour string */
  spotlightColor?: string;
  size?: number;
};

/**
 * Mouse-tracking spotlight card (21st.dev / EaseMize-style).
 * Radial glow follows the pointer across the card surface.
 */
export function SpotlightCard({
  children,
  className,
  spotlightColor = 'rgba(224, 78, 0, 0.18)',
  size = 320,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  const onMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    el.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    el.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
    el.style.setProperty('--spot-opacity', '1');
  }, []);

  const onLeave = useCallback(() => {
    ref.current?.style.setProperty('--spot-opacity', '0');
  }, []);

  return (
    <div
      ref={ref}
      onMouseMove={onMove}
      onMouseLeave={onLeave}
      className={cn(
        'group relative overflow-hidden rounded-2xl border border-border bg-muted/40',
        'dark:border-white/8 dark:bg-[#0B0F14]',
        'transition-[border-color,transform] duration-300 hover:border-foreground/20 dark:hover:border-white/15',
        className
      )}
      style={
        {
          '--spot-x': '50%',
          '--spot-y': '50%',
          '--spot-opacity': '0',
          '--spot-size': `${size}px`,
          '--spot-color': spotlightColor,
        } as CSSProperties
      }
    >
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 transition-opacity duration-300"
        style={{
          opacity: 'var(--spot-opacity)',
          background:
            'radial-gradient(var(--spot-size) circle at var(--spot-x) var(--spot-y), var(--spot-color), transparent 65%)',
        }}
      />
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100"
        style={{
          background:
            'radial-gradient(var(--spot-size) circle at var(--spot-x) var(--spot-y), transparent 40%, rgba(0,0,0,0.35) 100%)',
        }}
      />
      <div className="relative z-10 h-full">{children}</div>
    </div>
  );
}
