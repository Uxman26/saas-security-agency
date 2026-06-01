'use client';

import { useTheme } from 'next-themes';
import { useEffect, useState } from 'react';

export type ChartThemeColors = {
  axis: string;
  foreground: string;
  grid: string;
  card: string;
  border: string;
  primary: string;
  accent: string;
  warn: string;
  danger: string;
  muted: string;
};

const FALLBACK_LIGHT: ChartThemeColors = {
  axis: 'oklch(0.48 0.02 264)',
  foreground: 'oklch(0.21 0.02 264)',
  grid: 'oklch(0.91 0.01 264)',
  card: 'oklch(1 0 0)',
  border: 'oklch(0.91 0.01 264)',
  primary: 'oklch(0.55 0.2 264)',
  accent: 'oklch(0.65 0.15 200)',
  warn: 'oklch(0.75 0.15 85)',
  danger: 'oklch(0.55 0.22 25)',
  muted: 'oklch(0.55 0.02 264)',
};

const FALLBACK_DARK: ChartThemeColors = {
  axis: 'oklch(0.72 0.02 264)',
  foreground: 'oklch(0.95 0.01 264)',
  grid: 'oklch(0.32 0.02 264)',
  card: 'oklch(0.22 0.02 264)',
  border: 'oklch(0.32 0.02 264)',
  primary: 'oklch(0.65 0.18 264)',
  accent: 'oklch(0.72 0.14 200)',
  warn: 'oklch(0.78 0.14 85)',
  danger: 'oklch(0.62 0.2 25)',
  muted: 'oklch(0.55 0.02 264)',
};

function readColors(): ChartThemeColors {
  if (typeof window === 'undefined') {
    return FALLBACK_LIGHT;
  }
  const s = getComputedStyle(document.documentElement);
  const v = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  const dark = document.documentElement.classList.contains('dark');
  const fb = dark ? FALLBACK_DARK : FALLBACK_LIGHT;
  return {
    axis: v('--muted-foreground', fb.axis),
    foreground: v('--foreground', fb.foreground),
    grid: v('--border', fb.grid),
    card: v('--card', fb.card),
    border: v('--border', fb.border),
    primary: v('--chart-1', fb.primary),
    accent: v('--chart-2', fb.accent),
    warn: v('--chart-4', fb.warn),
    danger: v('--chart-5', fb.danger),
    muted: v('--chart-3', fb.muted),
  };
}

export function useChartTheme(): ChartThemeColors {
  const { resolvedTheme } = useTheme();
  const [colors, setColors] = useState<ChartThemeColors>(FALLBACK_LIGHT);

  useEffect(() => {
    setColors(readColors());
    const obs = new MutationObserver(() => setColors(readColors()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
    return () => obs.disconnect();
  }, [resolvedTheme]);

  return colors;
}

export function chartTooltipStyle(c: ChartThemeColors) {
  return {
    background: c.card,
    border: `1px solid ${c.border}`,
    borderRadius: 8,
    fontSize: 12,
    color: c.foreground,
  };
}

export const tickProps = (c: ChartThemeColors, size = 10) => ({
  fontSize: size,
  fill: c.axis,
});

export const axisLineProps = (c: ChartThemeColors) => ({
  stroke: c.grid,
});
