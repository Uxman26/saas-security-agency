import type { Invoice } from './types';

export type AccountBankLine = { label: string; value: string };

export function invoiceAccountLines(inv: Invoice): AccountBankLine[] {
  const rows: AccountBankLine[] = [];
  const account_name = (inv.account_name || '').trim();
  const bank_name = (inv.bank_name || '').trim();
  const sort_code = (inv.sort_code || '').trim();
  const account_number = (inv.account_number || '').trim();
  const iban = (inv.iban || '').trim();
  const swift_code = (inv.swift_code || '').trim();
  if (account_name) rows.push({ label: 'Account name', value: account_name });
  if (bank_name) rows.push({ label: 'Bank', value: bank_name });
  if (sort_code) rows.push({ label: 'Sort code', value: sort_code });
  if (account_number) rows.push({ label: 'Account number', value: account_number });
  if (iban) rows.push({ label: 'IBAN', value: iban });
  if (swift_code) rows.push({ label: 'SWIFT / BIC', value: swift_code });
  return rows;
}

export function hasInvoiceAccountDetails(inv: Invoice): boolean {
  return invoiceAccountLines(inv).length > 0;
}
