'use client';

import { useParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Invoice, InvoiceAuditEntry } from '@/lib/types';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { ArrowLeft, Download, History, Pencil, Printer, Settings } from 'lucide-react';
import { can } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';
import { toast } from '@/lib/toast';

export default function InvoiceViewPage() {
  const params = useParams();
  const { user } = useAuth();
  const rawId = params.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<InvoiceAuditEntry[]>([]);
  const [err, setErr] = useState('');
  const [downloading, setDownloading] = useState(false);

  useEffect(() => {
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

  const canEdit = user && can(user, 'inv.write');

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

  const printInvoice = () => {
    window.print();
  };

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
                    <Button variant="outline" size="sm" onClick={printInvoice}>
                      <Printer className="size-4 mr-1" /> Print
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => void downloadPdf()} disabled={downloading}>
                      <Download className="size-4 mr-1" /> {downloading ? 'Downloading…' : 'Download PDF'}
                    </Button>
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

            {inv && <InvoiceDocument invoice={inv} printId="invoice-print" />}

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
      </AppShell>
    </ProtectedRoute>
  );
}
