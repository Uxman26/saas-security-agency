import type { Invoice } from './types';

export function isInvoicePastDue(inv: Invoice): boolean {
  if (!inv.due_date || ['paid', 'cancelled'].includes(inv.status)) return false;
  const today = new Date().toISOString().slice(0, 10);
  return inv.due_date.slice(0, 10) < today;
}

export function formatDueDate(due?: string | null): string {
  if (!due) return '—';
  return due.slice(0, 10);
}
