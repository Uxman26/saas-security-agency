'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineDetailSkeleton } from '@/components/skeletons';
import { useAuth } from '@/contexts/auth-context';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { api } from '@/lib/api';
import type { SubscriptionInvoice } from '@/lib/types';
import { ArrowLeft, Mail } from 'lucide-react';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

const fmt = (n: number) => `£${n.toFixed(2)}`;

const STATUS_STYLES: Record<string, string> = {
  paid: 'text-green-600',
  unpaid: 'text-blue-600',
  overdue: 'text-red-600',
  partial: 'text-amber-600',
  cancelled: 'text-gray-500',
};

export default function AdminSubscriptionInvoicePage() {
  const { user } = useAuth();
  const params = useParams();
  const id = Number(params.id);
  const [inv, setInv] = useState<SubscriptionInvoice | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    api.admin
      .invoice(id)
      .then(setInv)
      .catch(() => toast.error('Invoice not found'))
      .finally(() => setLoading(false));
  }, [user, id]);

  const markPaid = async () => {
    try {
      const updated = await api.admin.patchInvoiceStatus(id, 'paid');
      setInv(updated);
      toast.success('Marked as paid');
    } catch {
      toast.error('Update failed');
    }
  };

  const sendEmail = async () => {
    try {
      const updated = await api.admin.sendInvoiceEmail(id);
      setInv(updated);
      toast.success('Invoice emailed to tenant');
    } catch {
      toast.error('Email failed — check SMTP settings');
    }
  };

  if (loading || !inv) {
    return (
      <ProtectedRoute>
        <AppShell>
          <div className="container mx-auto px-4 py-8">
            {loading ? <InlineDetailSkeleton /> : <p className="text-muted-foreground">Invoice not found</p>}
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <div className="flex items-center justify-between mb-6">
            <Link href="/admin/invoices">
              <Button variant="outline" size="sm"><ArrowLeft className="size-4 mr-1" />Back</Button>
            </Link>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={sendEmail}><Mail className="size-4 mr-1" />Send email</Button>
              {inv.status !== 'paid' && <Button size="sm" onClick={markPaid}>Mark paid</Button>}
            </div>
          </div>

          <Card className="overflow-hidden shadow-lg border-0">
            <div className="bg-gradient-to-r from-slate-900 to-slate-800 text-white px-8 py-6">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-xs uppercase tracking-widest text-slate-400">ControlOps</p>
                  <h1 className="text-2xl font-bold mt-1">Subscription Invoice</h1>
                </div>
                <div className="text-right">
                  <p className="font-mono text-sm">{inv.invoice_number}</p>
                  <p className={cn('text-sm capitalize font-medium mt-1', STATUS_STYLES[inv.status])}>{inv.status}</p>
                </div>
              </div>
            </div>
            <CardContent className="p-8 space-y-6">
              <div className="grid sm:grid-cols-2 gap-6">
                <div>
                  <p className="text-xs uppercase text-muted-foreground mb-1">Bill to</p>
                  <p className="font-semibold text-lg">{inv.company_name}</p>
                  <p className="text-sm text-muted-foreground">{inv.tenant_email}</p>
                </div>
                <div className="sm:text-right">
                  <p className="text-xs uppercase text-muted-foreground mb-1">Invoice date</p>
                  <p>{new Date(inv.created_at).toLocaleDateString('en-GB')}</p>
                  <p className="text-xs uppercase text-muted-foreground mt-3 mb-1">Due date</p>
                  <p className="font-semibold">{new Date(inv.due_date).toLocaleDateString('en-GB')}</p>
                </div>
              </div>

              <div className="rounded-lg border overflow-hidden">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50">
                    <tr>
                      <th className="text-left p-3">Description</th>
                      <th className="text-left p-3">Period</th>
                      <th className="text-right p-3">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    <tr className="border-t">
                      <td className="p-3">
                        <p className="font-medium capitalize">{inv.subscription_tier} plan</p>
                        <p className="text-muted-foreground capitalize">{inv.billing_cycle} billing</p>
                      </td>
                      <td className="p-3 text-muted-foreground">
                        {inv.period_start ? new Date(inv.period_start).toLocaleDateString('en-GB') : '—'}
                        {' — '}
                        {inv.period_end ? new Date(inv.period_end).toLocaleDateString('en-GB') : '—'}
                      </td>
                      <td className="p-3 text-right">{fmt(inv.amount_ex_vat)}</td>
                    </tr>
                  </tbody>
                </table>
              </div>

              <div className="flex justify-end">
                <div className="w-64 space-y-2 text-sm">
                  <div className="flex justify-between"><span className="text-muted-foreground">Subtotal (ex VAT)</span><span>{fmt(inv.amount_ex_vat)}</span></div>
                  <div className="flex justify-between"><span className="text-muted-foreground">VAT (20%)</span><span>{fmt(inv.vat_amount)}</span></div>
                  <div className="flex justify-between border-t pt-2 font-bold text-base"><span>Total payable</span><span>{fmt(inv.total_amount)}</span></div>
                  {inv.amount_paid > 0 && (
                    <div className="flex justify-between text-green-600"><span>Paid</span><span>{fmt(inv.amount_paid)}</span></div>
                  )}
                </div>
              </div>

              <p className="text-xs text-muted-foreground text-center pt-4 border-t">
                Thank you for your subscription. Payment is due by the date shown above.
              </p>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
