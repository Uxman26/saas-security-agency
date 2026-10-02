'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { CreditNote, Invoice, InvoiceAuditEntry } from '@/lib/types';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { CreditNoteDialog } from '@/components/invoices/credit-note-dialog';
import { ArrowLeft, Download, FileMinus2, History, Pencil, Printer, Settings } from 'lucide-react';
import { canModule } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';
import { formatMoney } from '@/lib/rota-shifts-utils';
import { Pill } from '@/components/module-dashboard';

export default function InvoiceViewPage() {
  const params = useParams();
  const { user } = useAuth();
  const rawId = params.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<InvoiceAuditEntry[]>([]);
  const [err, setErr] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [cnOpen, setCnOpen] = useState(false);
  const [editingCn, setEditingCn] = useState<CreditNote | null>(null);

  const canEdit = !!user && canModule(user, 'invoices', 'edit');
  const canCreateCn = !!user && canModule(user, 'invoices', 'credit_note_create');
  const canEditCn = !!user && canModule(user, 'invoices', 'credit_note_edit');
  const canCancelCn = !!user && canModule(user, 'invoices', 'credit_note_cancel');
  const canViewCn = !!user && canModule(user, 'invoices', 'credit_note_view');

  const reload = useCallback(() => {
    if (!id || Number.isNaN(id)) return;
    api.invoices
      .get(id)
      .then(setInv)
      .catch(() => setErr('Failed to load invoice'));
    api.invoices
      .audit(id)
      .then(setAudit)
      .catch(() => {});
  }, [id]);

  useEffect(() => {
    reload();
  }, [reload]);

  const downloadPdf = async () => {
    if (!id || Number.isNaN(id)) return;
    setDownloading(true);
    try {
      const blob = await api.invoices.pdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    } finally {
      setDownloading(false);
    }
  };

  const cancelCn = (cn: CreditNote) => {
    toast.confirm(`Cancel credit note ${cn.number}?`, async () => {
      try {
        await api.creditNotes.cancel(cn.id);
        toast.success('Credit note cancelled');
        reload();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Cancel failed');
      }
    }, { label: 'Cancel note' });
  };

  const issueCn = async (cn: CreditNote) => {
    try {
      await api.creditNotes.issue(cn.id);
      toast.success('Credit note issued');
      reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Issue failed');
    }
  };

  const notes = inv?.credit_notes || [];

  return (
    <ProtectedRoute>
      <AppShell>
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #invoice-print, #invoice-print * { visibility: visible !important; }
            #invoice-print {
              position: absolute;
              left: 0;
              top: 0;
              width: 100%;
            }
          }
        `}</style>
        <div className="min-h-screen bg-gradient-to-b from-background to-muted/30 print:bg-white">
          <div className="container mx-auto px-4 py-8 max-w-5xl print:py-0 print:px-0">
            <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
              <Button variant="ghost" size="sm" asChild>
                <Link href="/invoices">
                  <ArrowLeft className="size-4 mr-1" /> Back
                </Link>
              </Button>
              {inv && (
                <>
                  <h1 className="text-2xl font-bold">Invoice #{inv.id}</h1>
                  <div className="flex flex-wrap gap-2 ml-auto">
                    <Button variant="outline" size="sm" onClick={() => window.print()}>
                      <Printer className="size-4 mr-1" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void downloadPdf()} disabled={downloading}>
                      <Download className="size-4 mr-1" /> {downloading ? 'Downloading…' : 'Download PDF'}
                    </Button>
                    {canCreateCn && inv.status !== 'draft' && inv.status !== 'cancelled' ? (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          setEditingCn(null);
                          setCnOpen(true);
                        }}
                      >
                        <FileMinus2 className="size-4 mr-1" /> Credit note
                      </Button>
                    ) : null}
                    {canEdit && (
                      <>
                        <Button size="sm" variant="outline" asChild>
                          <Link href="/settings/company">
                            <Settings className="size-4 mr-1" /> Company details
                          </Link>
                        </Button>
                        <Button size="sm" asChild>
                          <Link href={`/invoices/${inv.id}/edit`}>
                            <Pencil className="size-4 mr-1" /> Edit
                          </Link>
                        </Button>
                      </>
                    )}
                  </div>
                </>
              )}
            </div>

            {err && <p className="text-destructive mb-4 print:hidden">{err}</p>}

            {inv && (
              <InvoiceDocument
                invoice={inv}
                printId="invoice-print"
                editableHeaders={canEdit}
                onHeadersChange={async (headers) => {
                  try {
                    const updated = await api.invoices.patch(inv.id, { column_headers: headers });
                    setInv(updated);
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Failed to save column headers');
                    reload();
                  }
                }}
              />
            )}

            {inv && canViewCn ? (
              <Card className="border-border/60 mt-8 print:hidden">
                <CardHeader className="flex flex-row items-center justify-between gap-2">
                  <CardTitle className="text-base flex items-center gap-2">
                    <FileMinus2 className="size-4" /> Credit notes
                  </CardTitle>
                  {canCreateCn && inv.status !== 'draft' && inv.status !== 'cancelled' ? (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingCn(null);
                        setCnOpen(true);
                      }}
                    >
                      Create
                    </Button>
                  ) : null}
                </CardHeader>
                <CardContent>
                  {notes.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No credit notes for this invoice.</p>
                  ) : (
                    <ul className="space-y-3">
                      {notes.map((cn) => (
                        <li key={cn.id} className="rounded-md border p-3 text-sm space-y-2">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <div className="flex items-center gap-2 min-w-0">
                              <span className="font-medium">{cn.number}</span>
                              <Pill
                                tone={
                                  cn.status === 'issued'
                                    ? 'positive'
                                    : cn.status === 'cancelled'
                                      ? 'danger'
                                      : 'neutral'
                                }
                              >
                                {cn.status}
                              </Pill>
                            </div>
                            <span className="font-semibold tabular-nums">{formatMoney(cn.total)}</span>
                          </div>
                          <div className="text-xs text-muted-foreground space-y-0.5">
                            <p>Date: {String(cn.credit_date).slice(0, 10)}</p>
                            {cn.reason ? <p>Reason: {cn.reason}</p> : null}
                            {cn.site_name ? <p>Site: {cn.site_name}</p> : null}
                            <p>
                              Net {formatMoney(cn.subtotal)} · VAT {cn.tax_rate}% ({formatMoney(cn.tax_amount)})
                            </p>
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {canEditCn && cn.status !== 'cancelled' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setEditingCn(cn);
                                  setCnOpen(true);
                                }}
                              >
                                Edit
                              </Button>
                            ) : null}
                            {canEditCn && cn.status === 'draft' ? (
                              <Button size="sm" variant="outline" onClick={() => void issueCn(cn)}>
                                Issue
                              </Button>
                            ) : null}
                            {canCancelCn && cn.status === 'issued' ? (
                              <Button size="sm" variant="outline" className="text-destructive" onClick={() => cancelCn(cn)}>
                                Cancel
                              </Button>
                            ) : null}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>
            ) : null}

            <Card className="border-border/60 mt-8 print:hidden">
              <CardHeader>
                <CardTitle className="text-base flex items-center gap-2">
                  <History className="size-4" /> Audit trail
                </CardTitle>
              </CardHeader>
              <CardContent>
                {audit.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No changes recorded yet.</p>
                ) : (
                  <ul className="space-y-3 text-sm">
                    {audit.map((a) => (
                      <li key={a.id} className="border-b border-border/60 pb-3 last:border-0">
                        <div className="flex flex-wrap gap-x-3 gap-y-1 text-muted-foreground">
                          <span>{new Date(a.created_at).toLocaleString()}</span>
                          {a.user_name && <span>{a.user_name}</span>}
                          <span className="text-foreground font-medium capitalize">{a.action.replace(/_/g, ' ')}</span>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </CardContent>
            </Card>
          </div>
        </div>

        {inv ? (
          <CreditNoteDialog
            open={cnOpen}
            onOpenChange={setCnOpen}
            invoice={inv}
            editing={editingCn}
            onSaved={reload}
          />
        ) : null}
      </AppShell>
    </ProtectedRoute>
  );
}
