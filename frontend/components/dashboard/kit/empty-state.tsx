import Link from 'next/link';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

type Props = {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: { label: string; href: string };
  tone?: 'neutral' | 'success';
  className?: string;
};

export function EmptyState({ icon: Icon, title, hint, action, tone = 'neutral', className }: Props) {
  return (
    <div className={cn('flex h-full min-h-40 flex-col items-center justify-center gap-2 px-4 py-8 text-center', className)}>
      <div
        className={cn(
          'relative mb-1 flex size-12 items-center justify-center rounded-2xl ring-1',
          tone === 'success'
            ? 'bg-success-soft text-success ring-success/20'
            : 'bg-muted text-muted-foreground ring-hairline'
        )}
      >
        <Icon className="size-5" aria-hidden />
      </div>
      <p className="text-sm font-semibold text-foreground">{title}</p>
      {hint ? <p className="max-w-xs text-xs text-muted-foreground">{hint}</p> : null}
      {action ? (
        <Link
          href={action.href}
          className="mt-1 rounded-md text-xs font-semibold text-primary underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {action.label}
        </Link>
      ) : null}
    </div>
  );
}
