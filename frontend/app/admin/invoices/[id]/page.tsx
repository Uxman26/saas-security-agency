'use client';

import { useParams, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Invoice } from '@/lib/types';
import { InvoiceDocument } from '@/components/invoices/invoice-document';
import { ArrowLeft, Download, Printer } from 'lucide-react';
import { toast } from '@/lib/toast';

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function AdminInvoiceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const { user } = useAuth();
  const rawId = params.id;
  const id = Number(Array.isArray(rawId) ? rawId[0] : rawId);
  const [inv, setInv] = useState<Invoice | null>(null);
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [taxRate, setTaxRate] = useState('');
  const [status, setStatus] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      router.replace('/dashboard');
      return;
    }
    if (!id || Number.isNaN(id)) return;
    api.admin
      .invoice(id)
      .then((data) => {
        setInv(data);
        setDueDate(data.due_date?.slice(0, 10) ?? '');
        setNotes(data.notes ?? '');
        setTaxRate(String(data.tax_rate ?? 0));
        setStatus(data.status);
      })
      .catch(() => toast.error('Failed to load invoice'));
  }, [user, router, id]);

  const save = async () => {
    if (!id) return;
    setSaving(true);
    try {
      const updated = await api.admin.patchInvoice(id, {
        due_date: dueDate || null,
        notes: notes || null,
        tax_rate: parseFloat(taxRate) || 0,
        status,
      });
      setInv(updated);
      toast.success('Invoice updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const markPaid = async () => {
    if (!id) return;
    try {
      const updated = await api.admin.patchInvoiceStatus(id, 'paid');
      setInv(updated);
      setStatus('paid');
      toast.success('Marked as paid');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  const downloadPdf = async () => {
    if (!id) return;
    try {
      const blob = await api.admin.invoicePdf(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `invoice-${id}.pdf`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <style>{`
          @media print {
            body * { visibility: hidden !important; }
            #invoice-print, #invoice-print * { visibility: visible !important; }
            #invoice-print { position: absolute; left: 0; top: 0; width: 100%; }
          }
        `}</style>
        <div className="container mx-auto px-4 py-8 max-w-5xl">
          <div className="flex flex-wrap items-center gap-3 mb-6 print:hidden">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/admin/invoices">
                <ArrowLeft className="size-4 mr-1" />
                Back
              </Link>
            </Button>
            <h1 className="text-2xl font-bold flex-1">Invoice #{id}</h1>
            <Button variant="outline" size="sm" onClick={() => window.print()}>
              <Printer className="size-4 mr-1" />
              Print
            </Button>
            <Button variant="outline" size="sm" onClick={downloadPdf}>
              <Download className="size-4 mr-1" />
              PDF
            </Button>
            {status !== 'paid' && (
              <Button size="sm" onClick={markPaid}>
                Mark paid
              </Button>
            )}
          </div>

          <div className="grid gap-6 lg:grid-cols-3 print:block">
            <Card className="lg:col-span-1 print:hidden">
              <CardHeader>
                <CardTitle>Edit invoice</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label>Status</Label>
                  <Select value={status} onValueChange={setStatus}>
                    <SelectTrigger className="mt-1 capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_OPTIONS.map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label htmlFor="due">Due date</Label>
                  <Input id="due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="tax">Tax rate (%)</Label>
                  <Input id="tax" type="number" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} className="mt-1" />
                </div>
                <div>
                  <Label htmlFor="notes">Notes</Label>
                  <Input id="notes" value={notes} onChange={(e) => setNotes(e.target.value)} className="mt-1" />
                </div>
                <Button onClick={save} disabled={saving}>
                  {saving ? 'Saving...' : 'Save changes'}
                </Button>
              </CardContent>
            </Card>

            <div className="lg:col-span-2" id="invoice-print">
              {inv ? <InvoiceDocument invoice={inv} /> : <div className="text-muted-foreground">Loading...</div>}
            </div>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
