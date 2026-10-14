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

/** Hex fallbacks for Safari < 15.4 / canvas where oklch may be unavailable. */
const FALLBACK_LIGHT: ChartThemeColors = {
  axis: '#64748B',
  foreground: '#172033',
  grid: '#E2E8F0',
  card: '#FFFFFF',
  border: '#E2E8F0',
  primary: '#F45100',
  accent: '#06B6D4',
  warn: '#F59E0B',
  danger: '#EF4444',
  muted: '#64748B',
};

const FALLBACK_DARK: ChartThemeColors = {
  axis: '#94A3B8',
  foreground: '#F1F5F9',
  grid: '#334155',
  card: '#1E293B',
  border: '#334155',
  primary: '#FF6A1F',
  accent: '#22D3EE',
  warn: '#FBBF24',
  danger: '#F87171',
  muted: '#94A3B8',
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
    danger: v('--chart-5', fb.danger),
    muted: v('--chart-4', fb.muted),
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
    fontSize: 13,
    color: c.foreground,
  };
}

export const tickProps = (c: ChartThemeColors, size = 12) => ({
  fontSize: size,
  fill: c.axis,
});

export const axisLineProps = (c: ChartThemeColors) => ({
  stroke: c.grid,
});
