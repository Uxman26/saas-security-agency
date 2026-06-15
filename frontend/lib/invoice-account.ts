import type { Invoice } from './types';

export type AccountBankLine = { label: string; value: string };

export function invoiceAccountLines(inv: Invoice): AccountBankLine[] {
  const rows: AccountBankLine[] = [];
  if (inv.account_name?.trim()) rows.push({ label: 'Account name', value: inv.account_name.trim() });
  if (inv.bank_name?.trim()) rows.push({ label: 'Bank', value: inv.bank_name.trim() });
  if (inv.sort_code?.trim()) rows.push({ label: 'Sort code', value: inv.sort_code.trim() });
  if (inv.account_number?.trim()) rows.push({ label: 'Account number', value: inv.account_number.trim() });
  if (inv.iban?.trim()) rows.push({ label: 'IBAN', value: inv.iban.trim() });
  if (inv.swift_code?.trim()) rows.push({ label: 'SWIFT / BIC', value: inv.swift_code.trim() });
  return rows;
}

export function hasInvoiceAccountDetails(inv: Invoice): boolean {
  return invoiceAccountLines(inv).length > 0;
}
