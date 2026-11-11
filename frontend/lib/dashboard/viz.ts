'use client';

import { useMemo, useSyncExternalStore } from 'react';

const KEYS = ['viz-1', 'viz-2', 'viz-3', 'viz-ontime', 'viz-late', 'viz-absent', 'viz-neutral', 'viz-faint', 'muted-foreground', 'foreground', 'hairline', 'surface'] as const;
export type VizColors = Record<(typeof KEYS)[number], string>;

const LIGHT: VizColors = {
  'viz-1': '#F45100',
  'viz-2': '#0E9F9A',
  'viz-3': '#6366F1',
  'viz-ontime': '#2A78D6',
  'viz-late': '#D98A00',
  'viz-absent': '#D6336C',
  'viz-neutral': '#94A3B8',
  'viz-faint': '#E2E8F0',
  'muted-foreground': '#475569',
  foreground: '#172033',
  hairline: 'rgba(15,23,42,0.08)',
  surface: '#FFFFFF',
};

const snapshot = () => {
  const s = getComputedStyle(document.documentElement);
  return KEYS.map((k) => s.getPropertyValue(`--${k}`).trim() || LIGHT[k]).join('|');
};

const subscribe = (cb: () => void) => {
  const obs = new MutationObserver(cb);
  obs.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });
  return () => obs.disconnect();
};

const SERVER = KEYS.map((k) => LIGHT[k]).join('|');

export function useVizColors() {
  const snap = useSyncExternalStore(subscribe, snapshot, () => SERVER);
  return useMemo(() => {
    const vals = snap.split('|');
    return Object.fromEntries(KEYS.map((k, i) => [k, vals[i]])) as VizColors;
  }, [snap]);
}
