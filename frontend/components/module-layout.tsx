'use client';

import { cn } from '@/lib/utils';

export function ModulePage({ children, className }: { children: React.ReactNode; className?: string }) {
  return <div className={cn('container mx-auto px-4 py-8 space-y-6', className)}>{children}</div>;
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
        <h1 className="text-2xl font-bold">{title}</h1>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
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
            'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            value === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
          )}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
