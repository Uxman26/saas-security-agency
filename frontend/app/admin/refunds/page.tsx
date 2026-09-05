'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PaymentRefund } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminRefundsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<PaymentRefund[]>([]);
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [amount, setAmount] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .refunds()
      .then(setRows)
      .catch(() => toast.error('Failed to load refunds'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const create = async () => {
    const cid = parseInt(companyId, 10);
    const amt = parseFloat(amount);
    if (!cid || !amt || amt <= 0) {
      toast.error('Company ID and amount required');
      return;
    }
    setSaving(true);
    try {
      await api.admin.createRefund({
        company_id: cid,
        amount: amt,
        invoice_id: invoiceId ? parseInt(invoiceId, 10) : undefined,
        reason: reason.trim() || undefined,
      });
      toast.success('Refund created');
      setOpen(false);
      setCompanyId('');
      setAmount('');
      setInvoiceId('');
      setReason('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold">Refunds</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
              <Button size="sm" onClick={() => setOpen(true)}>Create refund</Button>
            </div>
          </div>
          <Card>
            <CardHeader><CardTitle>All refunds</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No refunds.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Company</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Reason</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.id}</TableCell>
                        <TableCell>
                          <Link href={`/admin/companies/${r.company_id}`} className="text-primary hover:underline">
                            #{r.company_id}
                          </Link>
                        </TableCell>
                        <TableCell>
                          {r.subscription_invoice_id != null ? (
                            <Link
                              href={`/admin/invoices/${r.subscription_invoice_id}`}
                              className="text-primary hover:underline"
                            >
                              #{r.subscription_invoice_id}
                            </Link>
                          ) : (
                            '—'
                          )}
                        </TableCell>
                        <TableCell className="tabular-nums">
                          {r.currency || 'GBP'} {Number(r.amount).toFixed(2)}
                        </TableCell>
                        <TableCell className="capitalize">{r.status || '—'}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm">{r.reason || '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Create refund</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Company ID</Label>
                <Input className="mt-1" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
              </div>
              <div>
                <Label>Amount</Label>
                <Input className="mt-1" type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)} />
              </div>
              <div>
                <Label>Invoice ID (optional)</Label>
                <Input className="mt-1" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
              </div>
              <div>
                <Label>Reason</Label>
                <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <Button disabled={saving} onClick={() => void create()}>
                {saving ? 'Creating...' : 'Create'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
