import { Skeleton } from '@/components/ui/skeleton';
import { cn } from '@/lib/utils';

/** Sidebar + header chrome matching AppShell (see 21st/shadcn skeleton mock). */
export function ShellChromeSkeleton({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex h-dvh overflow-hidden bg-background', className)}>
      {/* Sidebar */}
      <aside className="hidden w-56 shrink-0 flex-col border-e border-border bg-card p-3 md:flex dark:bg-[#0B0F14]">
        <div className="mb-4 flex items-center gap-2 px-1">
          <Skeleton className="size-8 rounded-lg" />
          <Skeleton className="h-4 w-24" />
        </div>
        <div className="space-y-2">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-2">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 w-[70%]" />
            </div>
          ))}
        </div>
        <div className="my-3 border-t border-border" />
        <div className="mt-auto space-y-2 pb-2">
          {Array.from({ length: 2 }).map((_, i) => (
            <div key={i} className="flex items-center gap-2 rounded-lg px-2 py-2">
              <Skeleton className="size-4 shrink-0 rounded-full" />
              <Skeleton className="h-3.5 w-20" />
            </div>
          ))}
          <div className="flex items-center gap-2 rounded-lg px-2 py-2">
            <Skeleton className="size-8 shrink-0 rounded-full" />
            <Skeleton className="h-3.5 w-24" />
          </div>
        </div>
      </aside>

      <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
        {/* Top bar */}
        <header className="flex h-12 shrink-0 items-center justify-between gap-3 border-b border-border bg-card px-4">
          <Skeleton className="h-8 w-full max-w-xs rounded-lg" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-16 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
            <Skeleton className="size-8 rounded-lg" />
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto">
          <div className="container mx-auto space-y-6 px-4 py-6">{children}</div>
        </main>
      </div>
    </div>
  );
}

export function PageHeaderSkeleton({
  withActions = true,
}: {
  withActions?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-64 max-w-full" />
      </div>
      {withActions ? (
        <div className="flex gap-2">
          <Skeleton className="h-9 w-24 rounded-lg" />
          <Skeleton className="h-9 w-28 rounded-lg" />
        </div>
      ) : null}
    </div>
  );
}

export function FilterRowSkeleton({ count = 3 }: { count?: number }) {
  return (
    <div className="flex flex-wrap gap-2">
      {Array.from({ length: count }).map((_, i) => (
        <Skeleton key={i} className="h-9 w-36 rounded-lg" />
      ))}
    </div>
  );
}

export function KpiCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div
      className={cn(
        'grid gap-3',
        count >= 4 ? 'sm:grid-cols-2 lg:grid-cols-4' : 'sm:grid-cols-2 lg:grid-cols-3'
      )}
    >
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-4">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-8 w-24" />
          <Skeleton className="h-3 w-28" />
        </div>
      ))}
    </div>
  );
}

export function TableRowsSkeleton({
  rows = 6,
  cols = 5,
}: {
  rows?: number;
  cols?: number;
}) {
  return (
    <div className="overflow-hidden rounded-xl border border-border bg-card">
      <div className="flex gap-4 border-b border-border px-4 py-3">
        {Array.from({ length: cols }).map((_, i) => (
          <Skeleton key={i} className="h-3 flex-1" />
        ))}
      </div>
      <div className="divide-y divide-border">
        {Array.from({ length: rows }).map((_, r) => (
          <div key={r} className="flex items-center gap-4 px-4 py-3.5">
            <Skeleton className="size-9 shrink-0 rounded-lg" />
            <div className="min-w-0 flex-1 space-y-2">
              <Skeleton className="h-3.5 w-[55%]" />
              <Skeleton className="h-3 w-[35%]" />
            </div>
            <Skeleton className="hidden h-8 w-16 rounded-full sm:block" />
          </div>
        ))}
      </div>
    </div>
  );
}

export function ChartCardsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="space-y-3 rounded-2xl border border-border bg-card p-5">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-48" />
          <Skeleton className="h-[220px] w-full rounded-xl" />
        </div>
      ))}
    </div>
  );
}

export function FormCardsSkeleton({ cards = 2 }: { cards?: number }) {
  return (
    <div className="space-y-4">
      <div className="flex gap-2 border-b border-border pb-2">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-8 w-24 rounded-lg" />
        ))}
      </div>
      {Array.from({ length: cards }).map((_, c) => (
        <div key={c} className="space-y-4 rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-40" />
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-2">
                <Skeleton className="h-3 w-20" />
                <Skeleton className="h-9 w-full rounded-lg" />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/** Dashboard — hero + KPI grid + charts (matches /dashboard). */
export function DashboardPageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="space-y-2">
        <Skeleton className="h-3 w-40" />
        <div className="grid grid-cols-12 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="col-span-6 sm:col-span-4 lg:col-span-2">
              <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
                <div className="flex justify-between">
                  <Skeleton className="h-3 w-14" />
                  <Skeleton className="size-7 rounded-xl" />
                </div>
                <Skeleton className="h-7 w-12" />
                <Skeleton className="h-3 w-20" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <KpiCardsSkeleton count={4} />
      <ChartCardsSkeleton count={4} />
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-2xl border border-border bg-card p-4">
            <Skeleton className="size-9 rounded-xl" />
            <div className="flex-1 space-y-2">
              <Skeleton className="h-3.5 w-24" />
              <Skeleton className="h-3 w-full" />
            </div>
          </div>
        ))}
      </div>
    </ShellChromeSkeleton>
  );
}

/** Standard list/table module page. */
export function TablePageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <PageHeaderSkeleton />
      <FilterRowSkeleton />
      <TableRowsSkeleton />
    </ShellChromeSkeleton>
  );
}

/** KPI strip + table (payroll, invoices, attendance…). */
export function KpiTablePageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <PageHeaderSkeleton />
      <KpiCardsSkeleton count={4} />
      <FilterRowSkeleton />
      <TableRowsSkeleton rows={7} />
    </ShellChromeSkeleton>
  );
}

/** Settings / forms with tabs. */
export function FormPageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <PageHeaderSkeleton />
      <FormCardsSkeleton />
    </ShellChromeSkeleton>
  );
}

/** Detail / profile pages. */
export function DetailPageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <div className="flex items-center gap-3">
        <Skeleton className="h-8 w-16 rounded-lg" />
        <Skeleton className="h-7 w-56" />
      </div>
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 5 }).map((_, j) => (
              <div key={j} className="flex justify-between gap-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </ShellChromeSkeleton>
  );
}

/** Calendar modules. */
export function CalendarPageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <PageHeaderSkeleton />
      <div className="flex gap-2">
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
        <Skeleton className="h-9 w-28 rounded-lg" />
      </div>
      <div className="grid grid-cols-7 gap-2 rounded-xl border border-border bg-card p-4">
        {Array.from({ length: 35 }).map((_, i) => (
          <Skeleton key={i} className="aspect-square w-full rounded-lg" />
        ))}
      </div>
    </ShellChromeSkeleton>
  );
}

/** Reports hub. */
export function ReportsPageSkeleton() {
  return (
    <ShellChromeSkeleton>
      <PageHeaderSkeleton />
      <FilterRowSkeleton count={4} />
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-border bg-card p-5">
            <Skeleton className="size-10 rounded-xl" />
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-3 w-full" />
            <Skeleton className="h-3 w-[66%]" />
          </div>
        ))}
      </div>
      <ChartCardsSkeleton count={2} />
    </ShellChromeSkeleton>
  );
}

/** Content-only skeletons for client-side data loading (inside AppShell). */
export function InlineTableSkeleton({ rows = 6 }: { rows?: number }) {
  return (
    <div className="space-y-4">
      <FilterRowSkeleton />
      <TableRowsSkeleton rows={rows} />
    </div>
  );
}

export function InlineKpiTableSkeleton() {
  return (
    <div className="space-y-4">
      <KpiCardsSkeleton count={4} />
      <FilterRowSkeleton />
      <TableRowsSkeleton />
    </div>
  );
}

export function InlineDashboardSkeleton() {
  return (
    <div className="space-y-6">
      <Skeleton className="h-36 w-full rounded-2xl" />
      <div className="grid grid-cols-12 gap-3">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="col-span-6 sm:col-span-4 lg:col-span-2">
            <div className="space-y-3 rounded-2xl border border-border bg-card p-4">
              <Skeleton className="h-3 w-14" />
              <Skeleton className="h-7 w-12" />
              <Skeleton className="h-3 w-20" />
            </div>
          </div>
        ))}
      </div>
      <KpiCardsSkeleton count={4} />
      <ChartCardsSkeleton count={2} />
    </div>
  );
}

export function InlineFormSkeleton() {
  return <FormCardsSkeleton />;
}

export function InlineDetailSkeleton() {
  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-2xl" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-48" />
          <Skeleton className="h-4 w-32" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-2">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-4 rounded-xl border border-border bg-card p-6">
            <Skeleton className="h-5 w-36" />
            {Array.from({ length: 4 }).map((_, j) => (
              <div key={j} className="flex justify-between gap-4">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-3 w-40" />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
