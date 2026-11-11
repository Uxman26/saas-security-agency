import { localDateKey, localDateOffset } from '@/lib/date-format';

export type RangePreset = 'today' | '7d' | '30d' | '90d' | 'custom';
export type DashRange = { preset: RangePreset; start: string; end: string };

export function presetRange(preset: Exclude<RangePreset, 'custom'>): DashRange {
  const end = localDateKey();
  const back = { today: 0, '7d': 6, '30d': 29, '90d': 89 }[preset];
  return { preset, start: localDateOffset(-back), end };
}

export const rangeDays = (r: DashRange) =>
  Math.round((new Date(r.end).getTime() - new Date(r.start).getTime()) / 86400000) + 1;
