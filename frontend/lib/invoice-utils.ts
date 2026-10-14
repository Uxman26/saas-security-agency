import { formatDateUK, localDateKey } from './date-format';
import type { Invoice } from './types';

export function isInvoicePastDue(inv: Invoice): boolean {
  if (!inv.due_date || ['paid', 'cancelled'].includes(inv.status)) return false;
  return inv.due_date.slice(0, 10) < localDateKey();
}

export function formatDueDate(due?: string | null): string {
  if (!due) return '—';
  return formatDateUK(due) || '—';
}
