import { cn } from '@/lib/utils';

export function Shimmer({ className }: { className?: string }) {
  return <div className={cn('animate-pulse rounded-md bg-slate-200/70 dark:bg-slate-700/40', className)} />;
}

export function SkeletonCard({ className, rows = 3 }: { className?: string; rows?: number }) {
  return (
    <div className={cn('dash-card flex flex-col gap-3 p-6', className)} aria-hidden>
      <Shimmer className="h-4 w-1/3" />
      <Shimmer className="h-8 w-1/2" />
      {Array.from({ length: rows }, (_, i) => (
        <Shimmer key={i} className="h-3" />
      ))}
    </div>
  );
}
