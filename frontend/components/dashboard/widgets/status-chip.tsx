import { useTranslations } from 'next-intl';
import { cn } from '@/lib/utils';
import type { TodayShiftStatus } from '@/lib/types';

export const STATUS_BAR: Record<TodayShiftStatus, string> = {
  on_duty: 'bg-viz-ontime',
  completed: 'bg-viz-2',
  late: 'bg-viz-late',
  absent: 'bg-viz-absent',
  scheduled: 'bg-viz-faint',
  cancelled: 'bg-viz-neutral',
};

const CHIP: Record<TodayShiftStatus, string> = {
  on_duty: 'bg-info-soft text-info',
  completed: 'bg-success-soft text-success',
  late: 'bg-warning-soft text-warning',
  absent: 'bg-danger-soft text-danger',
  scheduled: 'bg-muted text-muted-foreground',
  cancelled: 'bg-muted text-muted-foreground line-through decoration-1',
};

export function StatusChip({ status }: { status: TodayShiftStatus }) {
  const t = useTranslations('dashboard.shiftStatus');
  return (
    <span className={cn('inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold', CHIP[status])}>
      <span className={cn('size-1.5 rounded-full', STATUS_BAR[status], status === 'scheduled' && 'bg-viz-neutral')} aria-hidden />
      {t(status)}
    </span>
  );
}
