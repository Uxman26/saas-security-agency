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
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description && <p className="mt-1.5 text-base text-muted-foreground">{description}</p>}
      </div>
      {actions}
    </div>
  );
}

type TabItem<T extends string> = { id: T; label: string };

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
    <div className="flex flex-wrap gap-1 border-b">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'px-4 py-2.5 text-sm font-medium border-b-2 -mb-px transition-colors',
            value === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
