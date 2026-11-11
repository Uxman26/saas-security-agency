import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';
import { SectionHeader } from './section-header';

type Props = {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  bodyClassName?: string;
};

export function WidgetCard({ title, subtitle, actions, children, className, bodyClassName }: Props) {
  const id = `w-${title.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={id} className={cn('dash-card flex h-full min-w-0 flex-col p-5 sm:p-6', className)}>
      <SectionHeader id={id} title={title} subtitle={subtitle} actions={actions} />
      <div className={cn('mt-4 min-h-0 flex-1', bodyClassName)}>{children}</div>
    </section>
  );
}
