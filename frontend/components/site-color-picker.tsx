'use client';

import { SHIFT_COLOR_OPTS } from '@/lib/rota-shifts-types';
import { cn } from '@/lib/utils';

type Props = {
  value: string;
  onChange: (color: string) => void;
};

export function SiteColorPicker({ value, onChange }: Props) {
  return (
    <div className="flex flex-wrap gap-2">
      {SHIFT_COLOR_OPTS.map((c) => (
        <button
          key={c}
          type="button"
          className={cn(
            'size-8 rounded-full border-2 shadow-sm',
            value === c ? 'border-foreground scale-110' : 'border-transparent'
          )}
          style={{ backgroundColor: c }}
          onClick={() => onChange(c)}
        />
      ))}
    </div>
  );
}

export const DEFAULT_SITE_COLOR = SHIFT_COLOR_OPTS[0];
