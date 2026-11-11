'use client';

import { useRef, type KeyboardEvent } from 'react';
import { cn } from '@/lib/utils';

type Props<T extends string> = {
  value: T;
  options: { value: T; label: string; badge?: number }[];
  onChange: (v: T) => void;
  label: string;
  size?: 'sm' | 'md';
};

export function Segmented<T extends string>({ value, options, onChange, label, size = 'sm' }: Props<T>) {
  const refs = useRef<(HTMLButtonElement | null)[]>([]);
  const onKey = (e: KeyboardEvent, i: number) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const dir = document.documentElement.dir === 'rtl' ? -step : step;
    const n = (i + dir + options.length) % options.length;
    onChange(options[n].value);
    refs.current[n]?.focus();
  };
  return (
    <div role="radiogroup" aria-label={label} className="inline-flex items-center gap-0.5 rounded-lg bg-muted/80 p-0.5 ring-1 ring-hairline dark:bg-white/5">
      {options.map((o, i) => {
        const on = o.value === value;
        return (
          <button
            key={o.value}
            ref={(el) => {
              refs.current[i] = el;
            }}
            type="button"
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onKeyDown={(e) => onKey(e, i)}
            onClick={() => onChange(o.value)}
            className={cn(
              'inline-flex items-center gap-1.5 rounded-md font-medium whitespace-nowrap transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              size === 'sm' ? 'h-7 px-2.5 text-xs' : 'h-8 px-3 text-[13px]',
              on
                ? 'bg-surface-raised text-foreground shadow-sm ring-1 ring-hairline'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            {o.label}
            {o.badge ? (
              <span className={cn('rounded-full px-1.5 text-[10px] font-semibold tabular-nums', on ? 'bg-primary/15 text-primary' : 'bg-foreground/10')}>
                {o.badge}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}
