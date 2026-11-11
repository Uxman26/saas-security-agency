import { cn } from '@/lib/utils';

const HUES = ['bg-brand-100 text-brand-700', 'bg-info-soft text-info', 'bg-success-soft text-success', 'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300', 'bg-warning-soft text-warning'];

export function Avatar({ name, className }: { name: string; className?: string }) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const initials = ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '?';
  const hue = HUES[[...name].reduce((a, ch) => a + ch.charCodeAt(0), 0) % HUES.length];
  return (
    <span aria-hidden className={cn('flex size-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold', hue, className)}>
      {initials}
    </span>
  );
}
