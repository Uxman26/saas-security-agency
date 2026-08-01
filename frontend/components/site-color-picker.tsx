'use client';

import { useEffect, useState } from 'react';
import { SHIFT_COLOR_OPTS } from '@/lib/rota-shifts-types';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export const DEFAULT_SITE_COLOR = '#3b82f6';

/** Accepts "abc", "#abc", "aabbcc" or "#AABBCC" and returns "#aabbcc". */
export function normalizeHexColor(input: string): string | null {
  let v = input.trim().replace(/^#/, '');
  if (/^[0-9a-fA-F]{3}$/.test(v)) {
    v = v[0] + v[0] + v[1] + v[1] + v[2] + v[2];
  }
  if (!/^[0-9a-fA-F]{6}$/.test(v)) return null;
  return `#${v.toLowerCase()}`;
}

type Props = {
  value: string;
  onChange: (color: string) => void;
  presets?: readonly string[];
};

export function SiteColorPicker({ value, onChange, presets = SHIFT_COLOR_OPTS }: Props) {
  const current = normalizeHexColor(value) ?? DEFAULT_SITE_COLOR;
  const [draft, setDraft] = useState(current.slice(1));

  useEffect(() => {
    setDraft(current.slice(1));
  }, [current]);

  const commitDraft = () => {
    const next = normalizeHexColor(draft);
    if (next) onChange(next);
    else setDraft(current.slice(1));
  };

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <label
          className="relative size-10 shrink-0 cursor-pointer rounded-md border shadow-sm"
          style={{ backgroundColor: current }}
          title="Pick any colour"
        >
          <span className="sr-only">Pick any colour</span>
          <input
            type="color"
            value={current}
            onChange={(e) => onChange(e.target.value.toLowerCase())}
            className="absolute inset-0 size-full cursor-pointer opacity-0"
          />
        </label>
        <div className="relative w-32">
          <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground">
            #
          </span>
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value.replace(/[^0-9a-fA-F]/g, '').slice(0, 6))}
            onBlur={commitDraft}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                commitDraft();
              }
            }}
            maxLength={6}
            spellCheck={false}
            aria-label="Hex colour code"
            className="pl-6 font-mono uppercase"
          />
        </div>
      </div>
      <div className="flex flex-wrap gap-1.5">
        {presets.map((c) => (
          <button
            key={c}
            type="button"
            title={c}
            aria-label={`Use ${c}`}
            className={cn(
              'size-6 rounded-full border-2 shadow-sm transition-transform',
              current === c.toLowerCase() ? 'border-foreground scale-110' : 'border-transparent hover:scale-105'
            )}
            style={{ backgroundColor: c }}
            onClick={() => onChange(c.toLowerCase())}
          />
        ))}
      </div>
    </div>
  );
}
