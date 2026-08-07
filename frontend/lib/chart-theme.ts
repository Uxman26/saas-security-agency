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

/** Amber Mono / ControlOps fallbacks when CSS vars are unavailable. */
const FALLBACK_LIGHT: ChartThemeColors = {
  axis: 'oklch(0.48 0.02 55)',
  foreground: 'oklch(0.22 0.02 55)',
  grid: 'oklch(0.91 0.01 75)',
  card: 'oklch(1 0 0)',
  border: 'oklch(0.91 0.01 75)',
  primary: 'oklch(0.65 0.18 48)',
  accent: 'oklch(0.72 0.16 70)',
  warn: 'oklch(0.55 0.12 66)',
  danger: 'oklch(0.5 0.18 27)',
  muted: 'oklch(0.58 0.14 38)',
};

const FALLBACK_DARK: ChartThemeColors = {
  axis: 'oklch(0.72 0.01 60)',
  foreground: 'oklch(0.985 0 0)',
  grid: 'oklch(0.374 0.01 67.558)',
  card: 'oklch(0.185 0.008 55)',
  border: 'oklch(0.374 0.01 67.558)',
  primary: 'oklch(0.556 0.163 48.998)',
  accent: 'oklch(0.563 0.195 38.402)',
  warn: 'oklch(0.554 0.115 66.442)',
  danger: 'oklch(0.506 0.213 27.518)',
  muted: 'oklch(0.525 0.223 3.958)',
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
    warn: v('--chart-3', fb.warn),
    danger: v('--chart-4', fb.danger),
    muted: v('--chart-5', fb.muted),
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
