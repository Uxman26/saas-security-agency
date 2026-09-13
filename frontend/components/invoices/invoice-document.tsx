'use client';

import { useEffect, useState } from 'react';
import { Globe, Mail, MapPin, Phone } from 'lucide-react';
import type { Invoice } from '@/lib/types';
import { hasInvoiceAccountDetails } from '@/lib/invoice-account';
import { groupInvoiceLines } from '@/lib/invoice-lines';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

/**
 * The one accent colour the document is built from — the table header, the rules and the
 * amount-due panel all take it. Kept in a single constant so a tenant's brand colour can
 * be swapped here (or driven from company settings) without hunting through the layout.
 */
const ACCENT = '#c8102e';

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

  const rows = groupInvoiceLines(invoice.lines ?? []);
  const multiSite = new Set(rows.flatMap((r) => r.siteNames)).size > 1;
  const showAccountFooter = hasInvoiceAccountDetails(invoice);
  const paid = invoice.amount_paid ?? 0;
  const balance = invoice.balance_due ?? Math.max(0, invoice.total - paid);
  const amountDue = paid > 0 ? balance : invoice.total;
  const statusStyle = STATUS_STYLES[invoice.status] || 'bg-slate-200 text-slate-700';

  const meta: { label: string; value: string }[] = [
    { label: 'Invoice Number', value: `#${invoice.id}` },
    { label: 'Invoice Date', value: fmtLongDate(invoice.created_at) },
    { label: 'Payment Due', value: fmtLongDate(invoice.due_date) },
    { label: 'Invoice Period', value: `${fmtLongDate(invoice.period_start)} – ${fmtLongDate(invoice.period_end)}` },
  ];

  return (
    <div
      id={printId}
      // print-color-adjust keeps the accent bands and the dark payment panel from being
      // dropped to white by the browser's default ink saving.
      className="bg-white text-slate-900 rounded-lg border shadow-sm max-w-4xl mx-auto overflow-hidden print:shadow-none print:border-0 print:rounded-none print:max-w-none [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
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
                <Globe className="size-3.5 shrink-0" style={{ color: ACCENT }} />
                {invoice.company_email}
              </p>
            ) : null}
          </div>
        </div>
        <div className="shrink-0 sm:text-right">
          <p className="text-3xl font-extrabold tracking-tight text-slate-900 sm:text-4xl">INVOICE</p>
          <div className="mt-1.5 h-1 w-full rounded-full sm:ml-auto" style={{ backgroundColor: ACCENT }} />
          <span
            className={`mt-3 inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${statusStyle}`}
          >
            {invoice.status}
          </span>
        </div>
      </div>

      {/* ── Bill to / meta ───────────────────────────────────────────────── */}
      <div className="grid gap-5 px-8 pb-8 sm:grid-cols-2 sm:px-10">
        <div className="rounded-lg bg-slate-50 p-5">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider" style={{ color: ACCENT }}>
            Bill to
          </p>
          <p className="text-base font-bold uppercase text-slate-900">
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
              <div
                key={m.label}
                className="flex items-baseline justify-between gap-4 border-b border-slate-100 py-2 last:border-b-0"
              >
                <dt className="text-sm font-semibold text-slate-700">{m.label}:</dt>
                <dd className="text-right text-sm text-slate-600">{m.value}</dd>
              </div>
            ))}
          </dl>
          <div className="mt-3 flex items-center justify-between gap-4 rounded-md p-3" style={{ backgroundColor: '#fdf0f2' }}>
            <span className="text-sm font-bold" style={{ color: ACCENT }}>
              Amount Due (GBP):
            </span>
            <span className="text-xl font-extrabold tabular-nums text-slate-900">{fmtMoney(amountDue)}</span>
          </div>
        </div>
      </div>

      {/* ── Lines ────────────────────────────────────────────────────────── */}
      <div className="px-8 sm:px-10">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr style={{ backgroundColor: ACCENT }}>
                <th className="p-3 text-left text-xs font-bold uppercase tracking-wider text-white">Date</th>
                <th className="p-3 text-center text-xs font-bold uppercase tracking-wider text-white">Operatives</th>
                <th className="p-3 text-right text-xs font-bold uppercase tracking-wider text-white">Hours</th>
                <th className="p-3 text-right text-xs font-bold uppercase tracking-wider text-white">Rate</th>
                <th className="p-3 text-right text-xs font-bold uppercase tracking-wider text-white">Amount</th>
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td colSpan={5} className="border-b border-slate-200 p-6 text-center text-slate-500">
                    No line items
                  </td>
                </tr>
              ) : (
                rows.map((r) => (
                  <tr key={r.key} className="border-b border-slate-200">
                    <td className="p-3 text-slate-800">
                      {r.label}
                      {/* Only worth the ink when the bill actually spans more than one site. */}
                      {multiSite && r.siteNames.length ? (
                        <span className="block text-xs text-slate-500">{r.siteNames.join(', ')}</span>
                      ) : null}
                    </td>
                    <td className="p-3 text-center tabular-nums text-slate-800">{r.operatives ?? '—'}</td>
                    <td className="p-3 text-right tabular-nums text-slate-800">
                      {r.hours > 0 ? r.hours.toFixed(2).replace(/\.00$/, '') : '—'}
                    </td>
                    <td className="p-3 text-right tabular-nums text-slate-800">
                      {r.rate == null ? '—' : fmtMoney(r.rate)}
                      {r.rateIsBlended ? <span className="ml-1 text-xs text-slate-400">avg</span> : null}
                    </td>
                    <td className="p-3 text-right font-semibold tabular-nums text-slate-900">{fmtMoney(r.amount)}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Totals ───────────────────────────────────────────────────────── */}
      <div className="flex justify-end px-8 py-6 sm:px-10">
        <div className="w-full sm:w-80">
          <div className="rounded-lg bg-slate-50 p-4 text-sm">
            <div className="flex justify-between py-1">
              <span className="text-slate-600">Subtotal:</span>
              <span className="font-semibold tabular-nums">{fmtMoney(invoice.subtotal)}</span>
            </div>
            <div className="flex justify-between border-b border-slate-200 py-1 pb-2">
              <span className="text-slate-600">VAT {invoice.tax_rate}%:</span>
              <span className="font-semibold tabular-nums">{fmtMoney(invoice.tax_amount)}</span>
            </div>
            <div
              className="mt-2 flex items-center justify-between rounded-md p-3"
              style={{ backgroundColor: '#fdf0f2' }}
            >
              <span className="font-bold" style={{ color: ACCENT }}>
                Total Due (GBP):
              </span>
              <span className="text-xl font-extrabold tabular-nums text-slate-900">{fmtMoney(invoice.total)}</span>
            </div>
            {paid > 0 ? (
              <div className="mt-2 space-y-1">
                <div className="flex justify-between text-green-700">
                  <span>Amount paid</span>
                  <span className="tabular-nums">{fmtMoney(paid)}</span>
                </div>
                <div className="flex justify-between font-semibold" style={{ color: ACCENT }}>
                  <span>Balance due</span>
                  <span className="tabular-nums">{fmtMoney(balance)}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* ── Payment details ──────────────────────────────────────────────── */}
      {showAccountFooter ? (
        <div className="px-8 pb-6 sm:px-10">
          <div className="flex flex-col gap-4 rounded-lg bg-slate-900 p-5 text-white sm:flex-row sm:items-center sm:justify-between">
            <div className="border-l-4 pl-3" style={{ borderColor: ACCENT }}>
              <p className="text-sm font-bold uppercase tracking-wider">Payment details</p>
              {invoice.bank_name ? <p className="mt-1 text-sm font-semibold text-slate-100">{invoice.bank_name}</p> : null}
              {invoice.account_name ? (
                <p className="text-sm text-slate-300">Account Name: {invoice.account_name}</p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-3">
              {invoice.account_number ? (
                <div className="rounded-md bg-slate-800 px-4 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Account No.</p>
                  <p className="text-base font-bold tabular-nums">{invoice.account_number}</p>
                </div>
              ) : null}
              {invoice.sort_code ? (
                <div className="rounded-md bg-slate-800 px-4 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">Sort Code</p>
                  <p className="text-base font-bold tabular-nums">{invoice.sort_code}</p>
                </div>
              ) : null}
              {invoice.iban ? (
                <div className="rounded-md bg-slate-800 px-4 py-2">
                  <p className="text-[11px] uppercase tracking-wide text-slate-400">IBAN</p>
                  <p className="text-base font-bold tabular-nums">{invoice.iban}</p>
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      {/* ── Payments taken / notes ───────────────────────────────────────── */}
      {(invoice.payments?.length ?? 0) > 0 ? (
        <div className="px-8 pb-6 sm:px-10">
          <p className="mb-2 text-xs font-bold uppercase tracking-wider text-slate-500">Payment history</p>
          <table className="w-full border-collapse text-sm">
            <thead>
              <tr className="bg-slate-50">
                <th className="border border-slate-200 p-2 text-left">Date</th>
                <th className="border border-slate-200 p-2 text-left">Method</th>
                <th className="border border-slate-200 p-2 text-right">Amount</th>
              </tr>
            </thead>
            <tbody>
              {invoice.payments!.map((p) => (
                <tr key={p.id}>
                  <td className="border border-slate-200 p-2">
                    {p.paid_at ? new Date(p.paid_at).toLocaleDateString('en-GB') : '—'}
                  </td>
                  <td className="border border-slate-200 p-2 capitalize">{p.method || '—'}</td>
                  <td className="border border-slate-200 p-2 text-right tabular-nums">{fmtMoney(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      {invoice.notes ? (
        <div className="px-8 pb-6 sm:px-10">
          <p className="mb-1 text-xs font-bold uppercase tracking-wider text-slate-500">Notes</p>
          <p className="whitespace-pre-line text-sm text-slate-700">{invoice.notes}</p>
        </div>
      ) : null}

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2 border-t border-slate-200 px-8 py-5 text-xs text-slate-500 sm:flex-row sm:items-center sm:justify-between sm:px-10">
        <div className="space-y-0.5">
          {invoice.company_vat_number ? <p>VAT Registration Number: {invoice.company_vat_number}</p> : null}
          {invoice.company_registration_number ? (
            <p>Company Registration Number: {invoice.company_registration_number}</p>
          ) : null}
        </div>
        <p className="border-slate-200 sm:border-l sm:pl-4">Invoice #{invoice.id}</p>
      </div>
    </div>
  );
}
