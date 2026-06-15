'use client';

import { useEffect, useState } from 'react';
import type { Invoice } from '@/lib/types';
import { hasInvoiceAccountDetails, invoiceAccountLines } from '@/lib/invoice-account';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function fmtMoney(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

type Props = {
  invoice: Invoice;
  printId?: string;
};

export function InvoiceDocument({ invoice, printId = 'invoice-print' }: Props) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!invoice.company_logo_url) {
      setLogoSrc(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    const token = typeof window !== 'undefined' ? localStorage.getItem('token')?.trim() : null;
    void fetch(`${API_URL}${invoice.company_logo_url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        blobUrl = URL.createObjectURL(blob);
        setLogoSrc(blobUrl);
      })
      .catch(() => setLogoSrc(null));
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [invoice.company_logo_url]);

  const lines = invoice.lines ?? [];
  const accountLines = invoiceAccountLines(invoice);
  const showAccountFooter = hasInvoiceAccountDetails(invoice);

  return (
    <div
      id={printId}
      className="bg-white text-slate-900 rounded-lg border shadow-sm p-8 sm:p-10 max-w-4xl mx-auto print:shadow-none print:border-0 print:rounded-none print:max-w-none print:p-0"
    >
      <div className="flex flex-col sm:flex-row sm:justify-between gap-6 border-b border-slate-200 pb-6 mb-6">
        <div className="space-y-2 min-w-0">
          {logoSrc ? (
            <img src={logoSrc} alt="" className="h-14 max-w-[200px] object-contain object-left mb-2" />
          ) : null}
          <h2 className="text-xl font-bold text-slate-900">{invoice.company_name ?? 'Company'}</h2>
          {invoice.company_email ? <p className="text-sm text-slate-600">{invoice.company_email}</p> : null}
          {invoice.company_phone ? <p className="text-sm text-slate-600">{invoice.company_phone}</p> : null}
          {invoice.company_address ? <p className="text-sm text-slate-600 whitespace-pre-line">{invoice.company_address}</p> : null}
        </div>
        <div className="text-left sm:text-right shrink-0">
          <p className="text-2xl font-bold tracking-tight text-slate-900">INVOICE</p>
          <p className="text-sm text-slate-500 mt-1">#{invoice.id}</p>
          <p className="text-sm text-slate-600 mt-2 capitalize">Status: {invoice.status}</p>
          {invoice.due_date ? <p className="text-sm text-slate-600">Due: {invoice.due_date}</p> : null}
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-6 mb-8">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Bill to</p>
          <p className="font-semibold text-slate-900">{invoice.client_name ?? `Client #${invoice.client_id}`}</p>
          {invoice.client_contact_person ? <p className="text-sm text-slate-600">{invoice.client_contact_person}</p> : null}
          {invoice.client_address ? <p className="text-sm text-slate-600 whitespace-pre-line">{invoice.client_address}</p> : null}
          {invoice.client_email ? <p className="text-sm text-slate-600">{invoice.client_email}</p> : null}
          {invoice.client_phone ? <p className="text-sm text-slate-600">{invoice.client_phone}</p> : null}
        </div>
        <div className="sm:text-right">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-2">Invoice period</p>
          <p className="text-sm text-slate-700">
            {invoice.period_start} – {invoice.period_end}
          </p>
          <p className="text-xs text-slate-500 mt-3">Issued {new Date(invoice.created_at).toLocaleDateString('en-GB')}</p>
        </div>
      </div>

      <div className="overflow-x-auto mb-6">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="bg-slate-100 text-left">
              <th className="p-2.5 font-semibold border border-slate-200">Site</th>
              <th className="p-2.5 font-semibold border border-slate-200">Guard</th>
              <th className="p-2.5 font-semibold border border-slate-200 text-right">Hours</th>
              <th className="p-2.5 font-semibold border border-slate-200 text-right">Rate</th>
              <th className="p-2.5 font-semibold border border-slate-200 text-right">Amount</th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <td colSpan={5} className="p-4 text-center text-slate-500 border border-slate-200">
                  No line items
                </td>
              </tr>
            ) : (
              lines.map((ln) => (
                <tr key={ln.id} className="border-b border-slate-200">
                  <td className="p-2.5 border border-slate-200">{ln.site_name ?? `Site #${ln.site_id}`}</td>
                  <td className="p-2.5 border border-slate-200">{ln.guard_name ?? '—'}</td>
                  <td className="p-2.5 border border-slate-200 text-right tabular-nums">{ln.hours.toFixed(2)}</td>
                  <td className="p-2.5 border border-slate-200 text-right tabular-nums">{fmtMoney(ln.rate)}</td>
                  <td className="p-2.5 border border-slate-200 text-right tabular-nums font-medium">{fmtMoney(ln.amount)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex justify-end">
        <div className="w-full sm:w-72 space-y-1.5 text-sm">
          <div className="flex justify-between">
            <span className="text-slate-600">Subtotal</span>
            <span className="tabular-nums">{fmtMoney(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-600">Tax ({invoice.tax_rate}%)</span>
            <span className="tabular-nums">{fmtMoney(invoice.tax_amount)}</span>
          </div>
          <div className="flex justify-between border-t border-slate-300 pt-2 font-bold text-base">
            <span>Total</span>
            <span className="tabular-nums">{fmtMoney(invoice.total)}</span>
          </div>
        </div>
      </div>

      {invoice.notes ? (
        <div className="mt-8 pt-6 border-t border-slate-200">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-1">Notes</p>
          <p className="text-sm text-slate-700 whitespace-pre-line">{invoice.notes}</p>
        </div>
      ) : null}

      {showAccountFooter ? (
        <div className="mt-8 pt-6 border-t-2 border-slate-300">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 mb-3">Account details — please pay to</p>
          <dl className="grid gap-2 text-sm max-w-md">
            {accountLines.map(({ label, value }) => (
              <div key={label} className="grid grid-cols-[7.5rem_1fr] gap-2">
                <dt className="text-slate-500 font-medium">{label}</dt>
                <dd className="text-slate-900 font-mono break-all">{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      ) : null}
    </div>
  );
}
