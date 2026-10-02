'use client';

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

function fmtDate(iso?: string | null) {
  if (!iso) return '—';
  try {
    return new Date(`${iso.slice(0, 10)}T12:00:00`).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return iso;
  }
}

function moneyParen(n: number) {
  if (n < 0) return `(${formatMoney(Math.abs(n))})`;
  return formatMoney(n);
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

  useEffect(() => {
    api.clients.list().then(setClients).catch(() => setClients([]));
    api.sites.list().then(setSites).catch(() => setSites([]));
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    setDateFrom(start.toISOString().slice(0, 10));
    setDateTo(now.toISOString().slice(0, 10));
  }, []);

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
              <div id="statement-print" className="rounded-lg border bg-white text-slate-800 shadow-sm overflow-hidden">
                <div className="h-1 bg-[#F45100]" />
                <div className="p-6 sm:p-8 space-y-8">
                  <div className="flex flex-wrap justify-between gap-6">
                    <div className="max-w-md space-y-1">
                      <p className="text-sm font-bold uppercase tracking-wide text-slate-900">
                        {statement.company.name}
                      </p>
                      <p className="text-xs text-slate-600 whitespace-pre-line">
                        {[statement.company.address, statement.company.postcode].filter(Boolean).join(', ') || '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <h2 className="text-2xl font-bold text-slate-900">Statement of Account</h2>
                      <p className="text-sm text-slate-500">
                        {statement.statement_type === 'outstanding' ? 'Outstanding balances' : 'Account activity'}
                      </p>
                      {statement.site ? (
                        <p className="text-xs text-slate-500 mt-1">Site: {statement.site.name}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap justify-between gap-8">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold uppercase text-slate-500">Bill to</p>
                      <p className="font-semibold uppercase text-slate-900">{statement.client.name}</p>
                      {statement.client.contact_name ? (
                        <p className="text-sm text-slate-600">{statement.client.contact_name}</p>
                      ) : null}
                      <p className="text-sm text-slate-600 whitespace-pre-line">
                        {[statement.client.address, statement.client.postcode].filter(Boolean).join(', ')}
                      </p>
                    </div>
                    <div className="min-w-[240px] text-sm space-y-1">
                      <div className="flex justify-between gap-6">
                        <span className="text-slate-500">From</span>
                        <span>{fmtDate(statement.date_from)}</span>
                      </div>
                      <div className="flex justify-between gap-6">
                        <span className="text-slate-500">To</span>
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
                      <div className="flex justify-between gap-6 bg-slate-100 px-2 py-1.5 rounded mt-1 font-semibold">
                        <span>Closing Balance on {fmtDate(statement.date_to)} (GBP)</span>
                        <span>{formatMoney(statement.summary.closing_balance)}</span>
                      </div>
                    </div>
                  </div>

                  <div>
                    <h3 className="font-semibold mb-3">Account activity</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="bg-slate-100 text-left">
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
                                      ? 'bg-[#FFF4ED] font-semibold'
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
                                      <p className="text-xs text-slate-500">Due {fmtDate(ln.due_date)}</p>
                                    ) : null}
                                    {ln.period_start && ln.period_end ? (
                                      <p className="text-xs text-slate-500">
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
                    <div className="bg-slate-100 rounded px-4 py-3 text-sm font-semibold flex gap-8 min-w-[280px] justify-between">
                      <span>Closing balance on {fmtDate(statement.date_to)} (GBP)</span>
                      <span>{formatMoney(statement.summary.closing_balance)}</span>
                    </div>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
