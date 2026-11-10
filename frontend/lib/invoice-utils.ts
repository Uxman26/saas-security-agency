import { formatDateUK, localDateKey, localDateOffset } from './date-format';
import type { Invoice } from './types';

export function isInvoicePastDue(inv: Invoice): boolean {
  if (!inv.due_date || ['paid', 'cancelled'].includes(inv.status)) return false;
  return inv.due_date.slice(0, 10) < localDateKey();
}

/** Issued to the client and still awaiting payment. */
export function isInvoiceOpen(inv: Invoice): boolean {
  return ['sent', 'unpaid', 'overdue', 'partial'].includes(inv.status);
}

export function canSendInvoiceReminder(inv: Invoice): boolean {
  return inv.status === 'overdue' || (isInvoiceOpen(inv) && isInvoicePastDue(inv));
}

export type InvoiceNextAction = 'send' | 'record_payment' | 'send_reminder' | 'paid' | 'view';

/** The step an invoice is waiting on, which the Actions column offers as its main button. */
export function nextInvoiceAction(inv: Invoice): InvoiceNextAction {
  if (inv.status === 'draft') return 'send';
  if (inv.status === 'paid') return 'paid';
  if (canSendInvoiceReminder(inv)) return 'send_reminder';
  if (isInvoiceOpen(inv)) return 'record_payment';
  return 'view';
}

/** "Due in 10 Days" / "2 Days Overdue" for open invoices; other statuses keep the date. */
export function formatDueCountdown(inv: Invoice): string {
  if (!inv.due_date) return '—';
  if (!isInvoiceOpen(inv)) return formatDueDate(inv.due_date);
  const due = new Date(`${inv.due_date.slice(0, 10)}T12:00:00`);
  const today = new Date();
  today.setHours(12, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86400000);
  if (days === 0) return 'Due Today';
  const count = `${Math.abs(days)} ${Math.abs(days) === 1 ? 'Day' : 'Days'}`;
  return days < 0 ? `${count} Overdue` : `Due in ${count}`;
}

/** The date `days` after an invoice date, as YYYY-MM-DD. */
export function paymentTermDate(invoiceDate: string, days: number): string {
  return localDateOffset(days, new Date(`${invoiceDate.slice(0, 10)}T12:00:00`));
}

/** Keeps the generated "due within N days" sentence in the notes true to the chosen due date. */
export function syncPaymentTermsNote(notes: string, invoiceDate: string, dueDate: string): string {
  if (!invoiceDate || !dueDate) return notes;
  const days = Math.round(
    (new Date(`${dueDate.slice(0, 10)}T12:00:00`).getTime() - new Date(`${invoiceDate.slice(0, 10)}T12:00:00`).getTime()) /
      86400000
  );
  if (days < 1) return notes;
  return notes.replace(
    /Payment is due within \d+ days? of the invoice date\./,
    `Payment is due within ${days} day${days === 1 ? '' : 's'} of the invoice date.`
  );
}

export function formatDueDate(due?: string | null): string {
  if (!due) return '—';
  return formatDateUK(due) || '—';
}
