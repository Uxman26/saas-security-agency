import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

type Props = { title: string; subtitle?: string; actions?: ReactNode; id?: string; className?: string };

export function SectionHeader({ title, subtitle, actions, id, className }: Props) {
  return (
    <div className={cn('flex flex-wrap items-start justify-between gap-3', className)}>
      <div className="min-w-0">
        <h2 id={id} className="text-[15px] font-semibold tracking-tight text-foreground">
          {title}
        </h2>
        {subtitle ? <p className="mt-0.5 text-xs text-muted-foreground">{subtitle}</p> : null}
      </div>
      {actions ? <div className="flex shrink-0 items-center gap-2">{actions}</div> : null}
    </div>
  );
}
