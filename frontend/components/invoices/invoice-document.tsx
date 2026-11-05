'use client';

import { useEffect, useState } from 'react';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import type { Invoice } from '@/lib/types';
import { formatDateUK } from '@/lib/date-format';
import { hasInvoiceAccountDetails } from '@/lib/invoice-account';
import { groupInvoiceLines } from '@/lib/invoice-lines';
import { storageGet } from '@/lib/safe-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
const ACCENT = '#D7141A';
const DARK = '#1F1F1F';
const SOFT = '#FDECEC';
const PANEL = '#F4F4F5';

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

/** "07 September 2026". Date-only values are read as calendar days, so no timezone shift. */
function fmtLongDate(value?: string | null) {
  if (!value) return '—';
  const iso = value.slice(0, 10);
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return formatDateUK(value) || '—';
  return d.toLocaleDateString('en-GB', { timeZone: 'UTC', day: '2-digit', month: 'long', year: 'numeric' });
}

function fmtHours(n: number) {
  return Number(n.toFixed(2)).toString();
}

const DEFAULT_DESCRIPTION = 'security services';

/** Slanted red-on-charcoal strip used as the top and bottom edge of the page. */
function EdgeBand({ side }: { side: 'top' | 'bottom' }) {
  return (
    <div className="relative h-4 w-full" style={{ backgroundColor: DARK }}>
      <div
        className={`absolute inset-y-0 w-[28%] ${side === 'top' ? 'left-0' : 'right-0'}`}
        style={{
          backgroundColor: ACCENT,
          clipPath: side === 'top' ? 'polygon(0 0, 100% 0, 88% 100%, 0 100%)' : 'polygon(12% 0, 100% 0, 100% 100%, 0 100%)',
        }}
      />
    </div>
  );
}

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-muted text-muted-foreground print:bg-slate-200 print:text-slate-700',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-950/40 dark:text-blue-300 print:bg-blue-100 print:text-blue-800',
  paid: 'bg-green-100 text-green-800 dark:bg-green-950/40 dark:text-green-300 print:bg-green-100 print:text-green-800',
  partial: 'bg-amber-100 text-amber-800 dark:bg-amber-950/40 dark:text-amber-300 print:bg-amber-100 print:text-amber-800',
  unpaid: 'bg-orange-100 text-orange-800 dark:bg-orange-950/40 dark:text-orange-300 print:bg-orange-100 print:text-orange-800',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-950/40 dark:text-red-300 print:bg-red-100 print:text-red-800',
  cancelled: 'bg-muted text-muted-foreground print:bg-gray-100 print:text-gray-600',
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
    const token = typeof window !== 'undefined' ? storageGet('token')?.trim() : null;
    void fetch(`${API_URL}${invoice.company_logo_url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      cache: 'no-store',
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
  const statusStyle = STATUS_STYLES[invoice.status] || 'bg-muted text-muted-foreground print:bg-slate-200 print:text-slate-700';
  const invoiceDate = invoice.invoice_date || invoice.created_at;
  // Site names only say something when the bill covers more than one site.
  const multiSite = new Set(dayRows.flatMap((r) => r.siteNames)).size > 1;

  const meta: { label: string; value: string }[] = [
    { label: 'Invoice Number', value: `#${invoice.id}` },
    { label: 'Invoice Date', value: fmtLongDate(invoiceDate) },
    { label: 'Payment Due', value: fmtLongDate(invoice.due_date) },
    { label: 'Purchase Order', value: invoice.po_number || '' },
  ];

  const columns = [
    ['date', headers.date, 'text-left'],
    ['operatives', headers.operatives, 'text-center'],
    ['hours', headers.hours, 'text-center'],
    ['rate', headers.rate, 'text-center'],
    ['amount', headers.amount, 'text-right'],
  ] as const;

  const hasNotes = !!(invoice.notes?.trim() || invoice.rota_review?.trim());

  return (
    <div
      id={printId}
      className="mx-auto max-w-4xl overflow-hidden rounded-lg border bg-white text-slate-900 shadow-sm print:max-w-none print:rounded-none print:border-0 print:shadow-none [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
    >
      <EdgeBand side="top" />

      {/* Header: logo and company details, a divider, then the word INVOICE. */}
      <div className="flex flex-col gap-6 px-8 pb-6 pt-8 sm:flex-row sm:items-stretch sm:justify-between sm:px-10">
        <div className="flex min-w-0 items-start gap-5">
          {logoSrc ? <img src={logoSrc} alt="" className="h-24 w-28 shrink-0 object-contain object-left" /> : null}
          <div className="min-w-0 space-y-1.5">
            <h2 className="text-xl font-extrabold uppercase tracking-tight" style={{ color: DARK }}>
              {invoice.company_name ?? 'Company'}
            </h2>
            {invoice.company_address ? (
              <p className="flex items-start gap-2 text-sm text-slate-600">
                <MapPin className="mt-0.5 size-3.5 shrink-0" style={{ color: DARK }} />
                <span className="whitespace-pre-line">{invoice.company_address}</span>
              </p>
            ) : null}
            {invoice.company_phone ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Phone className="size-3.5 shrink-0" style={{ color: DARK }} />
                {invoice.company_phone}
              </p>
            ) : null}
            {invoice.company_email ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Mail className="size-3.5 shrink-0" style={{ color: DARK }} />
                {invoice.company_email}
              </p>
            ) : null}
            {invoice.company_website ? (
              <p className="flex items-center gap-2 text-sm text-slate-600">
                <Globe className="size-3.5 shrink-0" style={{ color: DARK }} />
                {invoice.company_website}
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-start gap-6 sm:border-l sm:border-slate-200 sm:pl-8">
          <div>
            <p className="text-4xl font-black tracking-tight sm:text-5xl" style={{ color: DARK }}>
              INVOICE
            </p>
            <div className="mt-2 h-1.5 w-3/4 rounded-full" style={{ backgroundColor: ACCENT }} />
            <span className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide print:hidden ${statusStyle}`}>
              {invoice.status}
            </span>
          </div>
        </div>
      </div>

      {/* Bill to and the invoice facts. */}
      <div className="grid gap-5 px-8 pb-8 sm:grid-cols-2 sm:px-10">
        <div className="rounded-xl p-5" style={{ backgroundColor: PANEL }}>
          <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            Bill to
          </p>
          <p className="text-base font-extrabold uppercase" style={{ color: DARK }}>
            {invoice.client_name ?? `Client #${invoice.client_id}`}
          </p>
          {invoice.client_contact_person ? <p className="mt-1 text-sm text-slate-600">{invoice.client_contact_person}</p> : null}
          {invoice.client_address ? <p className="mt-1 whitespace-pre-line text-sm text-slate-600">{invoice.client_address}</p> : null}
          {invoice.client_phone || invoice.client_email ? (
            <div className="mt-5 space-y-1.5">
              {invoice.client_phone ? (
                <p className="flex items-center gap-2.5 text-sm text-slate-700">
                  <Phone className="size-3.5 shrink-0" style={{ color: DARK }} />
                  {invoice.client_phone}
                </p>
              ) : null}
              {invoice.client_email ? (
                <p className="flex items-center gap-2.5 text-sm text-slate-700">
                  <Mail className="size-3.5 shrink-0" style={{ color: DARK }} />
                  {invoice.client_email}
                </p>
              ) : null}
            </div>
          ) : null}
        </div>

        <div className="rounded-xl border border-slate-200 p-5">
          <dl>
            {meta.map((m) => (
              <div key={m.label} className="flex items-baseline justify-between gap-4 border-b border-slate-200 py-2">
                <dt className="text-sm font-semibold text-slate-800">{m.label}:</dt>
                <dd className="text-right text-sm text-slate-700">{m.value || ' '}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-4 flex items-center justify-between gap-4 rounded-lg px-3 py-3" style={{ backgroundColor: SOFT }}>
            <span className="text-sm font-bold" style={{ color: ACCENT }}>
              {paid > 0 || credited > 0 ? 'Balance Due (GBP):' : 'Amount Due (GBP):'}
            </span>
            <span className="text-2xl font-extrabold tabular-nums" style={{ color: DARK }}>
              {fmtMoney(amountDue)}
            </span>
          </div>
        </div>
      </div>

      {/* Lines: one row per kind of shift per day. */}
      <div className="px-8 sm:px-10">
        <div className="overflow-x-auto rounded-t-lg">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: ACCENT }}>
                {columns.map(([key, label, align]) => (
                  <th key={key} className={`px-4 py-3 text-xs font-bold uppercase tracking-wider text-white ${align}`}>
                    {editableHeaders && onHeadersChange ? (
                      <input
                        className={`w-full bg-transparent uppercase outline-none placeholder:text-white/70 ${align}`}
                        value={label}
                        onChange={(e) => setHeaders({ ...headers, [key]: e.target.value })}
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
                  <td colSpan={columns.length} className="border-b border-slate-200 p-6 text-center text-slate-500">
                    No line items
                  </td>
                </tr>
              ) : (
                dayRows.map((row, idx) => {
                  const desc = row.description && row.description.trim().toLowerCase() !== DEFAULT_DESCRIPTION ? row.description : '';
                  const detail = [
                    row.shiftDate ? desc : '',
                    row.timings.join(', '),
                    multiSite ? row.siteNames.join(', ') : '',
                  ].filter(Boolean);
                  return (
                    <tr key={row.key} className="border-b border-slate-200" style={{ backgroundColor: idx % 2 ? PANEL : '#fff' }}>
                      <td className="px-4 py-3.5 text-slate-800">
                        <span className={row.shiftDate ? 'whitespace-nowrap' : 'font-semibold'}>
                          {row.shiftDate ? fmtLongDate(row.shiftDate) : row.description || row.label}
                        </span>
                        {detail.length ? <span className="mt-0.5 block text-xs text-slate-500">{detail.join(' · ')}</span> : null}
                      </td>
                      <td className="px-4 py-3.5 text-center tabular-nums text-slate-800">
                        {row.operatives != null && row.operatives > 0 ? row.operatives : '—'}
                      </td>
                      <td className="px-4 py-3.5 text-center tabular-nums text-slate-800">{row.hours > 0 ? fmtHours(row.hours) : '—'}</td>
                      <td className="px-4 py-3.5 text-center tabular-nums text-slate-800">{row.rate != null ? fmtMoney(row.rate) : '—'}</td>
                      <td className="px-4 py-3.5 text-right tabular-nums text-slate-800">{fmtMoney(row.amount)}</td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Notes (only when there are some) and the totals panel. */}
      <div className="grid gap-5 px-8 py-6 sm:grid-cols-2 sm:px-10">
        {hasNotes ? (
          <div className="rounded-xl p-4" style={{ backgroundColor: PANEL }}>
            {invoice.notes?.trim() ? (
              <>
                <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
                  Notes
                </p>
                <p className="whitespace-pre-line text-sm text-slate-700">{invoice.notes}</p>
              </>
            ) : null}
            {invoice.rota_review?.trim() ? (
              <div className={invoice.notes?.trim() ? 'mt-3 border-t border-slate-200 pt-3' : ''}>
                <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Rota Review</p>
                <p className="whitespace-pre-line text-sm text-slate-600">{invoice.rota_review}</p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="hidden sm:block" />
        )}

        <div className="w-full rounded-xl p-4 text-sm sm:justify-self-end sm:max-w-sm" style={{ backgroundColor: PANEL }}>
          <div className="flex justify-between py-1.5">
            <span className="text-slate-700">Subtotal:</span>
            <span className="font-bold tabular-nums">{fmtMoney(invoice.subtotal)}</span>
          </div>
          <div className="flex justify-between border-b border-slate-200 py-1.5 pb-3">
            <span className="text-slate-700">VAT {invoice.tax_rate}%:</span>
            <span className="font-bold tabular-nums">{fmtMoney(invoice.tax_amount)}</span>
          </div>
          <div className="mt-3 flex items-center justify-between rounded-lg px-3 py-3" style={{ backgroundColor: SOFT }}>
            <span className="font-bold" style={{ color: ACCENT }}>
              TOTAL DUE (GBP):
            </span>
            <span className="text-2xl font-extrabold tabular-nums" style={{ color: DARK }}>
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

      {showAccountFooter ? (
        <div className="px-8 pb-6 sm:px-10">
          <div className="flex flex-col gap-4 rounded-xl p-5 text-white sm:flex-row sm:items-center sm:justify-between" style={{ backgroundColor: DARK }}>
            <div className="border-l-4 pl-4" style={{ borderColor: ACCENT }}>
              <p className="text-sm font-bold uppercase tracking-wider">Payment details</p>
              {invoice.bank_name ? <p className="mt-1.5 text-sm font-semibold">{invoice.bank_name}</p> : null}
              {invoice.account_name ? <p className="text-sm text-slate-300">Account Name: {invoice.account_name}</p> : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {invoice.account_number ? (
                <div className="min-w-[150px] rounded-lg bg-white/10 px-4 py-2.5">
                  <p className="text-xs text-slate-300">Account No.</p>
                  <p className="text-lg font-bold tabular-nums">{invoice.account_number}</p>
                </div>
              ) : null}
              {invoice.sort_code ? (
                <div className="min-w-[130px] rounded-lg bg-white/10 px-4 py-2.5">
                  <p className="text-xs text-slate-300">Sort Code</p>
                  <p className="text-lg font-bold tabular-nums">{invoice.sort_code}</p>
                </div>
              ) : null}
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
                    <td className="border border-slate-200 p-2">{c.credit_date ? formatDateUK(c.credit_date) : '—'}</td>
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

      <div className="mx-8 flex flex-col gap-2 border-t border-slate-200 py-5 text-xs text-slate-600 sm:mx-10 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-0.5">
          {invoice.company_vat_number ? <p>VAT Registration Number: {invoice.company_vat_number}</p> : null}
          {invoice.company_registration_number ? <p>Company Registration Number: {invoice.company_registration_number}</p> : null}
        </div>
        <p className="border-slate-300 sm:border-l sm:pl-4">
          Invoice #{invoice.id} <span className="mx-1.5 text-slate-300">|</span> Page 1 of 1
        </p>
      </div>

      <EdgeBand side="bottom" />
    </div>
  );
}
