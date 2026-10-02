'use client';

import { useEffect, useState } from 'react';
import { Building2, Globe, Mail, MapPin, Phone } from 'lucide-react';
import type { Invoice } from '@/lib/types';
import { hasInvoiceAccountDetails } from '@/lib/invoice-account';
import { groupInvoiceLines } from '@/lib/invoice-lines';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const ACCENT = '#F45100';
const NAVY = '#0F172A';
const SOFT = '#FFF4ED';
const PANEL = '#F1F5F9';

const DEFAULT_HEADERS = {
  date: 'Date',
  description: 'Description',
  shift_timing: 'Shift Timing',
  operatives: 'Operatives',
  hours: 'Hours',
  rate: 'Rate',
  amount: 'Amount',
};

function fmtMoney(n: number) {
  return `£${n.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function fmtLongDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(value.length <= 10 ? `${value}T12:00:00` : value);
  return Number.isNaN(d.getTime())
    ? value
    : d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

function shiftTiming(ln: { shift_timing?: string | null; shift_start?: string | null; shift_end?: string | null }) {
  if (ln.shift_timing) return ln.shift_timing;
  const s = (ln.shift_start || '').trim();
  const e = (ln.shift_end || '').trim();
  if (s && e) return `${s} - ${e}`;
  return s || e || '—';
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-slate-200 text-slate-700',
  sent: 'bg-blue-100 text-blue-800',
  paid: 'bg-green-100 text-green-800',
  partial: 'bg-amber-100 text-amber-800',
  unpaid: 'bg-orange-100 text-orange-800',
  overdue: 'bg-red-100 text-red-800',
  cancelled: 'bg-gray-100 text-gray-600',
};

type Props = {
  invoice: Invoice;
  printId?: string;
  editableHeaders?: boolean;
  onHeadersChange?: (headers: typeof DEFAULT_HEADERS) => void;
};

export function InvoiceDocument({ invoice, printId = 'invoice-print', editableHeaders, onHeadersChange }: Props) {
  const [logoSrc, setLogoSrc] = useState<string | null>(null);
  const [headers, setHeaders] = useState({ ...DEFAULT_HEADERS, ...(invoice.column_headers || {}) });

  useEffect(() => {
    setHeaders({ ...DEFAULT_HEADERS, ...(invoice.column_headers || {}) });
  }, [invoice.column_headers]);

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

  const dayRows = groupInvoiceLines(invoice.lines ?? []);
  const showAccountFooter = hasInvoiceAccountDetails(invoice);
  const paid = invoice.amount_paid ?? 0;
  const credited = invoice.credit_applied ?? 0;
  const balance = invoice.balance_due ?? Math.max(0, invoice.total - paid - credited);
  const amountDue = paid > 0 || credited > 0 ? balance : invoice.total;
  const statusStyle = STATUS_STYLES[invoice.status] || 'bg-slate-200 text-slate-700';
  const invoiceDate = invoice.invoice_date || invoice.created_at;

  const meta: { label: string; value: string }[] = [
    { label: 'Invoice Number', value: `#${invoice.id}` },
    { label: 'Invoice Date', value: fmtLongDate(invoiceDate) },
    { label: 'Payment Due', value: fmtLongDate(invoice.due_date) },
    { label: 'Invoice Period', value: `${fmtLongDate(invoice.period_start)} – ${fmtLongDate(invoice.period_end)}` },
  ];
  if (invoice.po_number) meta.push({ label: 'PO Number', value: invoice.po_number });

  return (
    <div
      id={printId}
      className="mx-auto max-w-4xl overflow-hidden rounded-lg border bg-white text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
    >
      <div className="flex flex-col gap-6 p-8 sm:flex-row sm:items-start sm:justify-between sm:p-10">
        <div className="flex min-w-0 gap-4">
          {logoSrc ? <img src={logoSrc} alt="" className="h-20 w-20 shrink-0 object-contain object-left" /> : null}
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-lg font-bold uppercase tracking-tight text-slate-900 sm:text-xl">
              {invoice.company_name ?? 'Company'}
            </h2>
            {invoice.company_address ? (
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: ACCENT }} />
                <span className="whitespace-pre-line">{invoice.company_address}</span>
              </p>
            ) : null}
            {invoice.company_phone ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="size-3.5 shrink-0" style={{ color: ACCENT }} />
                {invoice.company_phone}
              </p>
            ) : null}
            {invoice.company_email ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="size-3.5 shrink-0" style={{ color: ACCENT }} />
                {invoice.company_email}
              </p>
            ) : null}
            {invoice.company_website ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Globe className="size-3.5 shrink-0" style={{ color: ACCENT }} />
                {invoice.company_website}
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-3xl font-extrabold tracking-tight sm:text-4xl" style={{ color: NAVY }}>
            INVOICE
          </p>
          <div className="mt-1.5 h-1 w-full rounded-full sm:ml-auto" style={{ backgroundColor: ACCENT }} />
          <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusStyle}`}>
            {invoice.status}
          </span>
        </div>
      </div>

      <div className="grid gap-5 px-8 pb-8 sm:grid-cols-2 sm:px-10">
        <div className="relative rounded-lg p-5" style={{ backgroundColor: PANEL }}>
          <Building2 className="absolute right-4 top-4 size-5 text-slate-300" />
          <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            Bill to
          </p>
          <p className="text-base font-bold uppercase" style={{ color: NAVY }}>
            {invoice.client_name ?? `Client #${invoice.client_id}`}
          </p>
          {invoice.client_contact_person ? (
            <p className="mt-1 text-sm text-slate-600">{invoice.client_contact_person}</p>
          ) : null}
          {invoice.client_address ? (
            <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{invoice.client_address}</p>
          ) : null}
          {invoice.client_phone ? (
            <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
              <Phone className="size-3.5 shrink-0" style={{ color: ACCENT }} />
              {invoice.client_phone}
            </p>
          ) : null}
          {invoice.client_email ? (
            <p className="mt-1 flex items-center gap-2 text-sm text-slate-600">
              <Mail className="size-3.5 shrink-0" style={{ color: ACCENT }} />
              {invoice.client_email}
            </p>
          ) : null}
        </div>

        <div className="rounded-lg border border-slate-200 p-5">
          <dl className="space-y-0">
            {meta.map((m) => (
              <div key={m.label} className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0">
                <dt className="text-sm font-semibold text-slate-700">{m.label}:</dt>
                <dd className="text-right text-sm text-slate-600">{m.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-md p-3" style={{ backgroundColor: SOFT }}>
            <span className="text-sm font-bold" style={{ color: ACCENT }}>
              Amount Due (GBP):
            </span>
            <span className="text-xl font-extrabold tabular-nums" style={{ color: NAVY }}>
              {fmtMoney(amountDue)}
            </span>
          </div>
        </div>
      </div>

      <div className="px-8 sm:px-10">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: ACCENT }}>
                {(
                  [
                    ['date', headers.date],
                    ['description', headers.description],
                    ['shift_timing', headers.shift_timing],
                    ['operatives', headers.operatives],
                    ['hours', headers.hours],
                    ['rate', headers.rate],
                    ['amount', headers.amount],
                  ] as const
                ).map(([key, label]) => (
                  <th
                    key={key}
                    className={`p-3 text-xs font-bold uppercase tracking-wider text-white ${
                      key === 'operatives' ? 'text-center' : key === 'hours' || key === 'rate' || key === 'amount' ? 'text-right' : 'text-left'
                    }`}
                  >
                    {editableHeaders && onHeadersChange ? (
                      <input
                        className="w-full bg-transparent text-center uppercase outline-none placeholder:text-white/70"
                        value={label}
                        onChange={(e) => {
                          const next = { ...headers, [key]: e.target.value };
                          setHeaders(next);
                        }}
                        onBlur={(e) => onHeadersChange({ ...headers, [key]: e.target.value })}
                      />
                    ) : (
                      label
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {dayRows.length === 0 ? (
                <tr>
                  <td colSpan={7} className="border-b border-slate-200 p-6 text-center text-slate-500">
                    No line items
                  </td>
                </tr>
              ) : (
                dayRows.map((row, idx) => (
                  <tr key={row.key} className="border-b border-slate-200" style={{ backgroundColor: idx % 2 ? PANEL : '#fff' }}>
                    <td className="p-3 whitespace-nowrap text-slate-800">{row.shiftDate ? row.label : '—'}</td>
                    <td className="p-3 text-slate-800">
                      <span className="font-semibold">{row.shiftDate ? 'Security services' : row.label}</span>
                      {row.siteNames.length ? (
                        <span className="mt-0.5 block text-xs text-slate-500">{row.siteNames.join(', ')}</span>
                      ) : null}
                      {row.rateIsBlended ? (
                        <span className="mt-0.5 block text-xs text-slate-400">Blended rate</span>
                      ) : null}
                    </td>
                    <td className="p-3 whitespace-nowrap tabular-nums text-slate-800">—</td>
                    <td className="p-3 text-center tabular-nums text-slate-800">
                      {row.operatives != null && row.operatives > 0 ? row.operatives : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-800">
                      {row.hours > 0 ? Number(row.hours).toFixed(2) : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-800">
                      {row.rate != null ? fmtMoney(row.rate) : '—'}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums text-slate-900">{fmtMoney(row.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="grid gap-5 px-8 py-6 sm:grid-cols-2 sm:px-10">
        <div className="rounded-lg p-4" style={{ backgroundColor: PANEL }}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            Notes / Terms
          </p>
          <p className="whitespace-pre-line text-sm text-slate-700">
            {invoice.notes || 'Payment is due within 30 days of the invoice date.\nPlease quote the invoice number as your payment reference.\nThank you for your business.'}
          </p>
          {invoice.rota_review ? (
            <div className="mt-3 border-t border-slate-200 pt-3">
              <p className="mb-1 text-[11px] font-bold uppercase tracking-wider text-slate-500">Rota Review</p>
              <p className="whitespace-pre-line text-sm text-slate-600">{invoice.rota_review}</p>
            </div>
          ) : null}
        </div>

        <div className="w-full sm:justify-self-end sm:max-w-sm">
          <div className="rounded-lg bg-white p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-semibold tabular-nums">{fmtMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1 pb-2">
              <span className="text-slate-600">VAT {invoice.tax_rate}%:</span>
              <span className="font-semibold tabular-nums">{fmtMoney(invoice.tax_amount)}</span>
            </div>
            <div className="mt-2 flex items-center justify-between rounded-md p-3" style={{ backgroundColor: SOFT }}>
              <span className="font-bold" style={{ color: ACCENT }}>
                Total Due (GBP):
              </span>
              <span className="text-xl font-extrabold tabular-nums" style={{ color: NAVY }}>
                {fmtMoney(invoice.total)}
              </span>
            </div>
            {paid > 0 || credited > 0 ? (
              <div className="mt-2 space-y-1">
                {paid > 0 ? (
                  <div className="flex justify-between text-green-700">
                    <span>Amount paid</span>
                    <span className="tabular-nums">{fmtMoney(paid)}</span>
                  </div>
                ) : null}
                {credited > 0 ? (
                  <div className="flex justify-between text-sky-700">
                    <span>Credits applied</span>
                    <span className="tabular-nums">{fmtMoney(credited)}</span>
                  </div>
                ) : null}
                <div className="flex justify-between font-semibold" style={{ color: ACCENT }}>
                  <span>Balance due</span>
                  <span className="tabular-nums">{fmtMoney(balance)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {showAccountFooter ? (
        <div className="px-8 pb-6 sm:px-10">
          <div className="grid gap-4 rounded-lg p-5 text-white sm:grid-cols-4" style={{ backgroundColor: NAVY }}>
            <div className="border-l-4 pl-3 sm:col-span-1" style={{ borderColor: ACCENT }}>
              <p className="text-xs font-bold uppercase tracking-wider text-slate-300">Payment details</p>
              {invoice.bank_name ? <p className="mt-1 text-sm font-semibold">{invoice.bank_name}</p> : null}
              {invoice.account_name ? <p className="text-sm text-slate-300">Account Name: {invoice.account_name}</p> : null}
            </div>
            {invoice.account_number ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Account Number</p>
                <p className="text-base font-bold tabular-nums">{invoice.account_number}</p>
              </div>
            ) : null}
            {invoice.sort_code ? (
              <div>
                <p className="text-[11px] uppercase tracking-wide text-slate-400">Sort Code</p>
                <p className="text-base font-bold tabular-nums">{invoice.sort_code}</p>
              </div>
            ) : null}
            <div>
              <p className="text-[11px] uppercase tracking-wide text-slate-400">Payment Reference</p>
              <p className="text-base font-bold">INV-{invoice.id}</p>
            </div>
          </div>
        </div>
      ) : null}

      {(invoice.credit_notes?.filter((c) => c.status !== 'cancelled').length ?? 0) > 0 ? (
        <div className="px-8 pb-8 sm:px-10">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Credit notes</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 p-2 text-left">Date</th>
                <th className="border border-slate-200 p-2 text-left">Number</th>
                <th className="border border-slate-200 p-2 text-left">Reason</th>
                <th className="border border-slate-200 p-2 text-left">Status</th>
                <th className="border border-slate-200 p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.credit_notes!
                .filter((c) => c.status !== 'cancelled')
                .map((c) => (
                  <tr key={c.id}>
                    <td className="border border-slate-200 p-2">
                      {c.credit_date ? new Date(`${c.credit_date}T12:00:00`).toLocaleDateString('en-GB') : '—'}
                    </td>
                    <td className="border border-slate-200 p-2">{c.number}</td>
                    <td className="border border-slate-200 p-2">{c.reason || '—'}</td>
                    <td className="border border-slate-200 p-2 capitalize">{c.status}</td>
                    <td className="border border-slate-200 p-2 text-right tabular-nums">{fmtMoney(c.total)}</td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="relative flex flex-col gap-2 border-t border-slate-200 px-8 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="space-y-0.5">
          {invoice.company_vat_number ? <p>VAT Registration Number: {invoice.company_vat_number}</p> : null}
          {invoice.company_registration_number ? (
            <p>Company Registration Number: {invoice.company_registration_number}</p>
          ) : null}
        </div>
        <p className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 text-sm font-bold tracking-wide text-slate-700">
          ControlOps
        </p>
        <p>Invoice #{invoice.id}</p>
      </div>
    </div>
  );
}
