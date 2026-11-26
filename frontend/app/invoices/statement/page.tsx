'use client';

import { PoweredByControlOps } from '@/components/invoices/powered-by';
import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Client, InvoiceStatement, Site } from '@/lib/types';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { toast } from '@/lib/toast';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { formatMoney } from '@/lib/rota-shifts-utils';
import { formatDateUK, localDateKey } from '@/lib/date-format';
import { storageGet } from '@/lib/safe-storage';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
/** ControlOps brand orange — matches globals.css --primary (not invoice red). */
const BRAND_ORANGE = '#F45100';

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  return formatDateUK(iso) || '—';
}

function moneyParen(n: number) {
  if (n < 0) return `(${formatMoney(Math.abs(n))})`;
  return formatMoney(n);
}

function joinAddress(...parts: Array<string | null | undefined>) {
  return parts.map((p) => (p || '').trim()).filter(Boolean).join(', ');
}

export default function InvoiceStatementPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [clientId, setClientId] = useState('');
  const [siteId, setSiteId] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [statementType, setStatementType] = useState<'all' | 'outstanding'>('all');
  const [statement, setStatement] = useState<InvoiceStatement | null>(null);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState(false);
  const [logoSrc, setLogoSrc] = useState<string | null>(null);

  useEffect(() => {
    api.clients.list().then(setClients).catch(() => setClients([]));
    api.sites.list().then(setSites).catch(() => setSites([]));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setDateFrom(localDateKey(start));
    setDateTo(localDateKey(now));
  }, []);

  useEffect(() => {
    const logoUrl = statement?.company?.logo_url;
    if (!logoUrl) {
      setLogoSrc(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    const token = typeof window !== 'undefined' ? storageGet('token')?.trim() : null;
    void fetch(`${API_URL}${logoUrl}`, {
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
  }, [statement?.company?.logo_url]);

  const clientSites = useMemo(
    () => (clientId ? sites.filter((s) => String(s.client_id) === clientId) : sites),
    [sites, clientId]
  );

  const generate = async () => {
    if ((!clientId && !siteId) || !dateFrom || !dateTo) {
      toast.error('Select a client or site, and a date range');
      return;
    }
    if (dateFrom > dateTo) {
      toast.error('From date cannot be after To date');
      return;
    }
    setLoading(true);
    try {
      const data = await api.invoices.statement({
        client_id: clientId ? parseInt(clientId, 10) : undefined,
        site_id: siteId ? parseInt(siteId, 10) : undefined,
        date_from: dateFrom,
        date_to: dateTo,
        statement_type: statementType,
      });
      setStatement(data);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to generate statement');
      setStatement(null);
    } finally {
      setLoading(false);
    }
  };

  const downloadPdf = async () => {
    if ((!clientId && !siteId) || !dateFrom || !dateTo) return;
    setDownloading(true);
    try {
      const blob = await api.invoices.statementPdf({
        client_id: clientId ? parseInt(clientId, 10) : undefined,
        site_id: siteId ? parseInt(siteId, 10) : undefined,
        date_from: dateFrom,
        date_to: dateTo,
        statement_type: statementType,
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `statement-${statementType}-${siteId || clientId}-${dateFrom}-${dateTo}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #statement-print, #statement-print * { visibility: visible !important; }
            #statement-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
            .no-print { display: none !important; }
          }
        `}</style>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 print:bg-white">
          <div className="container mx-auto px-4 py-8 max-w-5xl print:py-0 print:px-0">
            <div className="no-print flex flex-wrap items-center justify-between gap-3 mb-6">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/statements">
                  <ArrowLeft className="size-4 mr-1" /> Back
                </Link>
              </Button>
              {statement ? (
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={() => window.print()}>
                    <Printer className="size-4 mr-1" /> Print
                  </Button>
                  <Button size="sm" onClick={() => void downloadPdf()} disabled={downloading}>
                    <Download className="size-4 mr-1" /> {downloading ? 'Downloading…' : 'Download PDF'}
                  </Button>
                </div>
              ) : null}
            </div>

            <div className="no-print rounded-lg border bg-card p-4 mb-6 space-y-4">
              <h1 className="text-lg font-semibold">Statement of Account</h1>
              <p className="text-sm text-muted-foreground">Generate by client, by site, or both.</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <div className="space-y-1">
                  <Label>Client (optional)</Label>
                  <SearchableSelect
                    value={clientId}
                    onChange={(v) => {
                      setClientId(v);
                      setStatement(null);
                    }}
                    options={clients.map((c) => ({ value: String(c.id), label: c.name }))}
                    placeholder="All clients"
                    searchPlaceholder="Search clients…"
                    noneOption={{ value: '', label: 'All clients' }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>Site (optional)</Label>
                  <SearchableSelect
                    value={siteId}
                    onChange={(v) => {
                      setSiteId(v);
                      setStatement(null);
                    }}
                    options={clientSites.map((s) => ({ value: String(s.id), label: s.name }))}
                    placeholder="All sites"
                    searchPlaceholder="Search sites…"
                    noneOption={{ value: '', label: 'All sites' }}
                  />
                </div>
                <div className="space-y-1">
                  <Label>From</Label>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>To</Label>
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Type</Label>
                  <Select
                    value={statementType}
                    onValueChange={(v) => {
                      setStatementType(v as 'all' | 'outstanding');
                      setStatement(null);
                    }}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">All</SelectItem>
                      <SelectItem value="outstanding">Outstanding</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <Button onClick={() => void generate()} disabled={loading || (!clientId && !siteId) || !dateFrom || !dateTo}>
                {loading ? 'Generating…' : 'Generate statement'}
              </Button>
            </div>

            {statement ? (
              <div
                id="statement-print"
                className="rounded-lg border bg-card text-card-foreground shadow-sm overflow-hidden print:bg-white print:text-slate-800 [print-color-adjust:exact] [-webkit-print-color-adjust:exact]"
              >
                <div className="h-1.5 w-full shrink-0" style={{ backgroundColor: BRAND_ORANGE }} />
                <div className="p-6 sm:p-8 space-y-8">
                  <div className="flex flex-col gap-6 sm:flex-row sm:justify-between sm:items-start">
                    <div className="flex min-w-0 max-w-md items-start gap-4">
                      {logoSrc ? (
                        <img
                          src={logoSrc}
                          alt=""
                          className="h-16 w-20 shrink-0 object-contain object-left sm:h-20 sm:w-24"
                        />
                      ) : null}
                      <div className="min-w-0 space-y-1">
                        <p className="text-sm font-bold uppercase tracking-wide text-foreground print:text-slate-900">
                          {statement.company.name}
                        </p>
                        <p className="text-xs text-muted-foreground print:text-slate-600 whitespace-pre-line">
                          {joinAddress(
                            statement.company.address,
                            statement.company.town_city,
                            statement.company.postcode
                          ) || '—'}
                        </p>
                      </div>
                    </div>
                    <div className="shrink-0 text-left sm:text-right sm:max-w-xs">
                      <h2 className="text-2xl font-bold leading-tight text-foreground print:text-slate-900">
                        Statement of Account
                      </h2>
                      <p className="mt-1 text-sm text-muted-foreground print:text-slate-500">
                        {statement.statement_type === 'outstanding' ? 'Outstanding balances' : 'Account activity'}
                      </p>
                      {statement.site ? (
                        <p className="mt-1 text-xs text-muted-foreground print:text-slate-500">
                          Site: {statement.site.name}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-col gap-8 sm:flex-row sm:justify-between">
                    <div className="space-y-1 min-w-0">
                      <p className="text-xs font-semibold uppercase text-muted-foreground print:text-slate-500">Bill to</p>
                      <p className="font-semibold uppercase text-foreground print:text-slate-900">{statement.client.name}</p>
                      {statement.client.contact_name ? (
                        <p className="text-sm text-muted-foreground print:text-slate-600">{statement.client.contact_name}</p>
                      ) : null}
                      <p className="text-sm text-muted-foreground print:text-slate-600 whitespace-pre-line">
                        {joinAddress(
                          statement.client.address,
                          statement.client.town_city,
                          statement.client.postcode
                        )}
                      </p>
                    </div>
                    <div className="min-w-[240px] shrink-0 text-sm space-y-1">
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground print:text-slate-500">From</span>
                        <span>{fmtDate(statement.date_from)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-muted-foreground print:text-slate-500">To</span>
                        <span>{fmtDate(statement.date_to)}</span>
                      </div>
                      <div className="border-t my-2" />
                      <div className="flex justify-between gap-6">
                        <span>Opening balance</span>
                        <span>{formatMoney(statement.summary.opening_balance)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span>Invoiced</span>
                        <span>{formatMoney(statement.summary.invoiced)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span>Credit balance</span>
                        <span>{formatMoney(statement.summary.credit_balance)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span>Paid</span>
                        <span>{formatMoney(statement.summary.paid)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span>Refunded</span>
                        <span>{formatMoney(statement.summary.refunded)}</span>
                      </div>
                      <div
                        className="flex justify-between gap-6 px-2 py-1.5 rounded mt-1 font-semibold bg-muted print:bg-slate-100"
                        style={{ boxShadow: `inset 0 0 0 1px ${BRAND_ORANGE}` }}
                      >
                        <span>Closing Balance on {fmtDate(statement.date_to)} (GBP)</span>
                        <span>{formatMoney(statement.summary.closing_balance)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3 text-foreground print:text-slate-900">Account activity</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="text-left text-white" style={{ backgroundColor: BRAND_ORANGE }}>
                            <th className="px-3 py-2 font-semibold">Date</th>
                            <th className="px-3 py-2 font-semibold">Item</th>
                            <th className="px-3 py-2 font-semibold text-right">Amount</th>
                            <th className="px-3 py-2 font-semibold text-right">Balance</th>
                          </tr>
                        </thead>
                        <tbody>
                          {statement.lines.map((ln, i) => {
                            const highlight = ln.kind === 'opening' || ln.kind === 'closing';
                            return (
                              <tr
                                key={`${ln.kind}-${ln.date}-${i}`}
                                className={
                                  highlight
                                    ? ln.kind === 'closing'
                                      ? 'bg-[#FFF4ED] font-semibold print:bg-[#FFF4ED]'
                                      : 'bg-slate-50 font-semibold'
                                    : 'border-b border-slate-100'
                                }
                              >
                                <td className="px-3 py-2.5 whitespace-nowrap align-top">{fmtDate(ln.date)}</td>
                                <td className="px-3 py-2.5 align-top">
                                  <div>
                                    {ln.kind === 'invoice' && ln.invoice_id ? (
                                      <Link
                                        href={`/invoices/${ln.invoice_id}/view`}
                                        className="text-sky-700 hover:underline no-print"
                                      >
                                        {ln.item}
                                      </Link>
                                    ) : (
                                      <span>{ln.item}</span>
                                    )}
                                    {ln.due_date ? (
                                      <p className="text-xs text-muted-foreground print:text-slate-500">Due {fmtDate(ln.due_date)}</p>
                                    ) : null}
                                    {ln.period_start && ln.period_end ? (
                                      <p className="text-xs text-muted-foreground print:text-slate-500">
                                        {fmtDate(ln.period_start)} – {fmtDate(ln.period_end)}
                                      </p>
                                    ) : null}
                                  </div>
                                </td>
                                <td className="px-3 py-2.5 text-right whitespace-nowrap align-top">
                                  {moneyParen(ln.amount)}
                                </td>
                                <td className="px-3 py-2.5 text-right whitespace-nowrap align-top">
                                  {formatMoney(ln.balance)}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>

                  <div className="flex justify-end">
                    <div
                      className="bg-muted print:bg-slate-100 rounded px-4 py-3 text-sm font-semibold flex gap-8 min-w-[280px] justify-between"
                      style={{ boxShadow: `inset 0 0 0 1px ${BRAND_ORANGE}` }}
                    >
                      <span>Closing balance on {fmtDate(statement.date_to)} (GBP)</span>
                      <span>{formatMoney(statement.summary.closing_balance)}</span>
                    </div>
                  </div>
                </div>
                <PoweredByControlOps />
              </div>
            ) : null}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
