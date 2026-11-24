import type { SendDocumentRequest } from '@/components/finance/send-document-dialog';
import { api } from './api';
import { formatInvoiceMoney } from './invoice-currency';
import { invoiceFilename, invoiceLabel } from './invoice-utils';
import type { Invoice } from './types';

/**
 * The "send invoice" confirmation: the invoice PDF, the address it goes to and which
 * invoice it is, with Send / Cancel. `onDone` runs after it is sent (or marked sent).
 */
export function invoiceSendRequest(inv: Invoice, onDone: () => void): SendDocumentRequest {
  const label = `Invoice ${invoiceLabel(inv)}`;
  const isDraft = inv.status === 'draft';
  return {
    title: `Send ${label}`,
    description: `Check the invoice and the email address, then send. ${inv.bill_to_name || inv.client_name ? `Billed to ${inv.bill_to_name || inv.client_name}.` : ''}`.trim(),
    email: inv.client_email,
    documentLabel: `${label} (${formatInvoiceMoney(inv.total ?? 0, inv.currency || 'GBP')})`,
    sendLabel: 'Send',
    pdf: { load: () => api.invoices.pdf(inv.id), filename: invoiceFilename(inv) },
    send: async (to) => {
      const res = await api.invoices.send(inv.id, to);
      onDone();
      return res;
    },
    // Sent by post or by hand: mark it sent without emailing anything.
    secondary: isDraft
      ? {
          label: 'Mark sent, no email',
          run: async () => {
            await api.invoices.updateStatus(inv.id, 'sent', false);
            onDone();
            return { message: `${label} marked as sent` };
          },
        }
      : undefined,
  };
}
