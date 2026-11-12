'use client';

import { cn } from '@/lib/utils';

export function ModulePage({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div
      className={cn(
        'mx-auto w-full max-w-none space-y-6 px-4 py-6 sm:px-6 sm:py-8 lg:px-8 xl:px-10',
        className,
      )}
    >
      {children}
    </div>
  );
}

export function ModuleHeader({
  title,
  description,
  actions,
}: {
  title: React.ReactNode;
  description?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] sm:text-[1.875rem]">{title}</h1>
        {description && <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

type TabItem<T extends string> = {
  id: T;
  label: string;
  /** Small red count beside the label, for something on that tab needing attention. */
  badge?: number;
  badgeTitle?: string;
};

export function ModuleTabs<T extends string>({
  tabs,
  value,
  onChange,
}: {
  tabs: readonly TabItem<T>[] | TabItem<T>[];
  value: T;
  onChange: (v: T) => void;
}) {
  return (
    <div className="dash-scroll-x flex gap-1 overflow-x-auto border-b border-hairline">
      {tabs.map(({ id, label, badge, badgeTitle }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            '-mb-px inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-t-md border-b-2 px-4 py-2.5 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === id
              ? 'border-primary text-foreground'
              : 'border-transparent text-muted-foreground hover:border-foreground/15 hover:text-foreground'
          )}
        >
          {label}
          {badge ? (
            <span
              className="inline-flex min-w-5 items-center justify-center rounded-full bg-danger-soft px-1.5 text-[11px] font-semibold leading-5 text-danger"
              title={badgeTitle}
            >
              {badge}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}
