'use client';

import { useParams } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { Invoice, InvoiceAuditEntry } from '@/lib/types';
import { ArrowLeft, Pencil, FileText, History } from 'lucide-react';
import { can } from '@/lib/permissions';
import { useAuth } from '@/contexts/auth-context';

export default function InvoiceViewPage() {
  const params = useParams();
  const { user } = useAuth();
  const rawId = params.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [audit, setAudit] = useState<InvoiceAuditEntry[]>([]);
  const [pdfUrl, setPdfUrl] = useState<string | null>(null);
  const [err, setErr] = useState('');
  const pdfRef = useRef<string | null>(null);

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

  useEffect(() => {
    if (!id || Number.isNaN(id)) return;
    api.invoices
      .pdf(id)
      .then((blob) => {
        const u = URL.createObjectURL(blob);
        pdfRef.current = u;
        setPdfUrl(u);
      })
      .catch(() => {});
    return () => {
      if (pdfRef.current) {
        URL.revokeObjectURL(pdfRef.current);
        pdfRef.current = null;
      }
      setPdfUrl(null);
    };
  }, [id]);

  const canEdit = user && can(user, 'inv.write');

  return (
    <ProtectedRoute>
      <AppShell>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex flex-wrap items-center gap-3 mb-6">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/invoices">
                <ArrowLeft className="size-4 mr-1" /> Back
              </Link>
            </Button>
            {inv && (
              <>
                <h1 className="text-2xl font-bold flex items-center gap-2">
                  <FileText className="size-7" /> Invoice #{inv.id}
                </h1>
                {canEdit && (
                  <Button size="sm" asChild>
                    <Link href={`/invoices/${inv.id}/edit`}>
                      <Pencil className="size-4 mr-1" /> Edit
                    </Link>
                  </Button>
                )}
              </>
            )}
          </div>

          {err && <p className="text-destructive mb-4">{err}</p>}

          {inv && (
            <Card className="mb-6 border-border/60">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">Summary</CardTitle>
              </CardHeader>
              <CardContent className="grid sm:grid-cols-2 gap-2 text-sm">
                <div>
                  <span className="text-muted-foreground">Company</span>
                  <p className="font-medium">{inv.company_name ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Client</span>
                  <p className="font-medium">{inv.client_name ?? `Client #${inv.client_id}`}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Period</span>
                  <p>
                    {inv.period_start} – {inv.period_end}
                  </p>
                </div>
                <div>
                  <span className="text-muted-foreground">Due</span>
                  <p>{inv.due_date ?? '—'}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Status</span>
                  <p className="capitalize">{inv.status}</p>
                </div>
                <div>
                  <span className="text-muted-foreground">Total</span>
                  <p className="font-bold">£{inv.total.toFixed(2)}</p>
                </div>
              </CardContent>
            </Card>
          )}

          {pdfUrl && (
            <div className="rounded-lg border bg-card overflow-hidden mb-8 min-h-[70vh]">
              <iframe title="Invoice PDF" src={pdfUrl} className="w-full min-h-[70vh] border-0" />
            </div>
          )}

          {!pdfUrl && inv && (
            <p className="text-muted-foreground text-sm mb-8">PDF preview unavailable.</p>
          )}

          <Card className="border-border/60">
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
                        <span className="text-foreground font-medium capitalize">
                          {a.action.replace(/_/g, ' ')}
                        </span>
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
