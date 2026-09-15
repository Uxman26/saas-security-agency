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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { PaymentRefund, RefundPolicy, RefundPreview } from '@/lib/types';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';

const STATUSES = [
  'all',
  'pending_approval',
  'approved',
  'processing',
  'completed',
  'failed',
  'rejected',
  'cancelled',
] as const;

const SCENARIOS = [
  'full',
  'partial',
  'fixed',
  'percentage',
  'cancellation',
  'no_show',
  'subscription_cancellation',
  'overpayment',
  'credit',
  'custom',
] as const;

export default function AdminRefundsPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const [tab, setTab] = useState<'refunds' | 'policies'>('refunds');
  const [rows, setRows] = useState<PaymentRefund[]>([]);
  const [policies, setPolicies] = useState<RefundPolicy[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState('all');

  const [open, setOpen] = useState(false);
  const [companyId, setCompanyId] = useState('');
  const [invoiceId, setInvoiceId] = useState('');
  const [billingReceiptId, setBillingReceiptId] = useState('');
  const [amount, setAmount] = useState('');
  const [policyId, setPolicyId] = useState('');
  const [scenario, setScenario] = useState('');
  const [method, setMethod] = useState('manual');
  const [reason, setReason] = useState('');
  const [override, setOverride] = useState(false);
  const [overrideReason, setOverrideReason] = useState('');
  const [autoProcess, setAutoProcess] = useState(false);
  const [preview, setPreview] = useState<RefundPreview | null>(null);
  const [previewing, setPreviewing] = useState(false);
  const [saving, setSaving] = useState(false);

  const [detail, setDetail] = useState<PaymentRefund | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [acting, setActing] = useState(false);

  const [policyOpen, setPolicyOpen] = useState(false);
  const [editingPolicy, setEditingPolicy] = useState<RefundPolicy | null>(null);
  const [policyForm, setPolicyForm] = useState({
    code: '',
    name: '',
    description: '',
    scenario_type: 'full',
    calculation_type: 'full',
    percentage: '',
    fixed_amount: '',
    requires_approval: true,
    auto_approve_below: '',
    max_refund_percent: '100',
    max_refund_amount: '',
    max_days_after_payment: '',
    default_refund_method: 'stripe',
    is_active: true,
  });
  const [savingPolicy, setSavingPolicy] = useState(false);

  const loadRefunds = useCallback(() => {
    setLoading(true);
    api.admin
      .refunds(status !== 'all' ? { status } : undefined)
      .then(setRows)
      .catch(() => toast.error('Failed to load refunds'))
      .finally(() => setLoading(false));
  }, [status]);

  const loadPolicies = useCallback(() => {
    api.admin
      .refundPolicies()
      .then(setPolicies)
      .catch(() => toast.error('Failed to load refund policies'));
  }, []);

  useEffect(() => {
    if (!user) return;
    loadRefunds();
    loadPolicies();
  }, [user, loadRefunds, loadPolicies]);

  const runPreview = async () => {
    const cid = parseInt(companyId, 10);
    if (!cid) {
      toast.error('Company ID required');
      return;
    }
    if (!invoiceId && !billingReceiptId) {
      toast.error('Invoice ID or billing receipt ID required');
      return;
    }
    setPreviewing(true);
    try {
      const res = await api.admin.previewRefund({
        company_id: cid,
        invoice_id: invoiceId ? parseInt(invoiceId, 10) : undefined,
        billing_receipt_id: billingReceiptId ? parseInt(billingReceiptId, 10) : undefined,
        policy_id: policyId ? parseInt(policyId, 10) : undefined,
        scenario_type: scenario || undefined,
        requested_amount: amount ? parseFloat(amount) : undefined,
        refund_method: method,
        override,
      });
      setPreview(res);
      if (!res.eligible) toast.error(res.errors.join('; ') || 'Not eligible');
    } catch (e) {
      setPreview(null);
      toast.error(e instanceof Error ? e.message : 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const create = async () => {
    const cid = parseInt(companyId, 10);
    if (!cid) {
      toast.error('Company ID required');
      return;
    }
    if (override && !overrideReason.trim()) {
      toast.error('Override reason required');
      return;
    }
    setSaving(true);
    try {
      await api.admin.createRefund({
        company_id: cid,
        amount: amount ? parseFloat(amount) : undefined,
        invoice_id: invoiceId ? parseInt(invoiceId, 10) : undefined,
        billing_receipt_id: billingReceiptId ? parseInt(billingReceiptId, 10) : undefined,
        policy_id: policyId ? parseInt(policyId, 10) : undefined,
        scenario_type: scenario || undefined,
        reason: reason.trim() || undefined,
        refund_method: method,
        override,
        override_reason: override ? overrideReason.trim() : undefined,
        auto_process: autoProcess,
      });
      toast.success('Refund request created');
      setOpen(false);
      setPreview(null);
      setCompanyId('');
      setInvoiceId('');
      setBillingReceiptId('');
      setAmount('');
      setReason('');
      setOverride(false);
      setOverrideReason('');
      loadRefunds();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  const openDetail = async (id: number) => {
    try {
      const r = await api.admin.getRefund(id);
      setDetail(r);
      setDetailOpen(true);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load refund');
    }
  };

  const act = async (fn: () => Promise<unknown>, ok: string) => {
    setActing(true);
    try {
      await fn();
      toast.success(ok);
      loadRefunds();
      if (detail) {
        const r = await api.admin.getRefund(detail.id);
        setDetail(r);
      }
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  const openNewPolicy = () => {
    setEditingPolicy(null);
    setPolicyForm({
      code: '',
      name: '',
      description: '',
      scenario_type: 'full',
      calculation_type: 'full',
      percentage: '',
      fixed_amount: '',
      requires_approval: true,
      auto_approve_below: '',
      max_refund_percent: '100',
      max_refund_amount: '',
      max_days_after_payment: '',
      default_refund_method: 'stripe',
      is_active: true,
    });
    setPolicyOpen(true);
  };

  const openEditPolicy = (p: RefundPolicy) => {
    setEditingPolicy(p);
    setPolicyForm({
      code: p.code,
      name: p.name,
      description: p.description || '',
      scenario_type: p.scenario_type,
      calculation_type: p.calculation_type,
      percentage: p.percentage != null ? String(p.percentage) : '',
      fixed_amount: p.fixed_amount != null ? String(p.fixed_amount) : '',
      requires_approval: !!p.requires_approval,
      auto_approve_below: p.auto_approve_below != null ? String(p.auto_approve_below) : '',
      max_refund_percent: p.max_refund_percent != null ? String(p.max_refund_percent) : '',
      max_refund_amount: p.max_refund_amount != null ? String(p.max_refund_amount) : '',
      max_days_after_payment: p.max_days_after_payment != null ? String(p.max_days_after_payment) : '',
      default_refund_method: p.default_refund_method || 'stripe',
      is_active: !!p.is_active,
    });
    setPolicyOpen(true);
  };

  const savePolicy = async () => {
    if (!policyForm.code.trim() || !policyForm.name.trim()) {
      toast.error('Code and name required');
      return;
    }
    setSavingPolicy(true);
    try {
      const payload = {
        code: policyForm.code.trim(),
        name: policyForm.name.trim(),
        description: policyForm.description || undefined,
        scenario_type: policyForm.scenario_type,
        calculation_type: policyForm.calculation_type,
        percentage: policyForm.percentage ? parseFloat(policyForm.percentage) : undefined,
        fixed_amount: policyForm.fixed_amount ? parseFloat(policyForm.fixed_amount) : undefined,
        requires_approval: policyForm.requires_approval,
        auto_approve_below: policyForm.auto_approve_below
          ? parseFloat(policyForm.auto_approve_below)
          : undefined,
        max_refund_percent: policyForm.max_refund_percent
          ? parseFloat(policyForm.max_refund_percent)
          : undefined,
        max_refund_amount: policyForm.max_refund_amount
          ? parseFloat(policyForm.max_refund_amount)
          : undefined,
        max_days_after_payment: policyForm.max_days_after_payment
          ? parseInt(policyForm.max_days_after_payment, 10)
          : undefined,
        default_refund_method: policyForm.default_refund_method,
        is_active: policyForm.is_active,
      };
      if (editingPolicy) {
        await api.admin.updateRefundPolicy(editingPolicy.id, payload);
        toast.success('Policy updated');
      } else {
        await api.admin.createRefundPolicy(payload);
        toast.success('Policy created');
      }
      setPolicyOpen(false);
      loadPolicies();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingPolicy(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold">Refunds</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => (tab === 'refunds' ? loadRefunds() : loadPolicies())}>
                Refresh
              </Button>
              {tab === 'refunds' ? (
                can('refunds.create', 'billing.write') ? (
                  <Button size="sm" onClick={() => { setOpen(true); setPreview(null); }}>
                    Create refund
                  </Button>
                ) : null
              ) : (
                can('refunds.policies', 'billing.write') ? (
                  <Button size="sm" onClick={openNewPolicy}>
                    New policy
                  </Button>
                ) : null
              )}
            </div>
          </div>

          <div className="flex gap-2 mb-4">
            <Button variant={tab === 'refunds' ? 'default' : 'outline'} size="sm" onClick={() => setTab('refunds')}>
              Refunds
            </Button>
            <Button variant={tab === 'policies' ? 'default' : 'outline'} size="sm" onClick={() => setTab('policies')}>
              Policies
            </Button>
          </div>

          {tab === 'refunds' && (
            <Card>
              <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-3">
                <CardTitle>All refunds</CardTitle>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger className="w-[200px]">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    {STATUSES.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s === 'all' ? 'All statuses' : s.replace(/_/g, ' ')}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </CardHeader>
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
                        <TableHead>Amount</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Policy</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Source</TableHead>
                        <TableHead>Created</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell>{r.id}</TableCell>
                          <TableCell>
                            <Link href={`/admin/companies/${r.company_id}`} className="text-primary hover:underline">
                              {r.company_name || `#${r.company_id}`}
                            </Link>
                          </TableCell>
                          <TableCell className="tabular-nums">
                            {(r.currency || 'GBP').toUpperCase()} {Number(r.amount).toFixed(2)}
                          </TableCell>
                          <TableCell className="capitalize">{(r.status || '—').replace(/_/g, ' ')}</TableCell>
                          <TableCell className="text-sm">{r.policy_code || '—'}</TableCell>
                          <TableCell className="capitalize text-sm">{r.refund_method || '—'}</TableCell>
                          <TableCell className="text-sm">
                            {r.subscription_invoice_id != null ? (
                              <Link href={`/admin/invoices/${r.subscription_invoice_id}`} className="text-primary hover:underline">
                                Inv #{r.subscription_invoice_id}
                              </Link>
                            ) : r.billing_receipt_id != null ? (
                              `Rcpt #${r.billing_receipt_id}`
                            ) : (
                              '—'
                            )}
                          </TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
                          </TableCell>
                          <TableCell>
                            <Button variant="outline" size="sm" onClick={() => void openDetail(r.id)}>
                              Open
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}

          {tab === 'policies' && (
            <Card>
              <CardHeader>
                <CardTitle>Refund policies</CardTitle>
              </CardHeader>
              <CardContent>
                {policies.length === 0 ? (
                  <p className="text-sm text-muted-foreground">No policies.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Code</TableHead>
                        <TableHead>Name</TableHead>
                        <TableHead>Scenario</TableHead>
                        <TableHead>Calc</TableHead>
                        <TableHead>Approval</TableHead>
                        <TableHead>Method</TableHead>
                        <TableHead>Active</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {policies.map((p) => (
                        <TableRow key={p.id}>
                          <TableCell className="font-mono text-sm">{p.code}</TableCell>
                          <TableCell>{p.name}</TableCell>
                          <TableCell className="text-sm">{p.scenario_type}</TableCell>
                          <TableCell className="text-sm">
                            {p.calculation_type}
                            {p.percentage != null ? ` (${p.percentage}%)` : ''}
                            {p.fixed_amount != null && p.calculation_type === 'fixed'
                              ? ` (£${p.fixed_amount})`
                              : ''}
                          </TableCell>
                          <TableCell className="text-sm">
                            {p.requires_approval
                              ? p.auto_approve_below != null
                                ? `Yes (auto < £${p.auto_approve_below})`
                                : 'Yes'
                              : 'No'}
                          </TableCell>
                          <TableCell className="text-sm capitalize">{p.default_refund_method || '—'}</TableCell>
                          <TableCell>{p.is_active ? 'Yes' : 'No'}</TableCell>
                          <TableCell>
                            {can('refunds.policies', 'billing.write') ? (
                              <Button variant="outline" size="sm" onClick={() => openEditPolicy(p)}>
                                Edit
                              </Button>
                            ) : null}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>

        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Create refund</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Company ID</Label>
                <Input className="mt-1" value={companyId} onChange={(e) => setCompanyId(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Invoice ID</Label>
                  <Input className="mt-1" value={invoiceId} onChange={(e) => setInvoiceId(e.target.value)} />
                </div>
                <div>
                  <Label>Billing receipt ID</Label>
                  <Input
                    className="mt-1"
                    value={billingReceiptId}
                    onChange={(e) => setBillingReceiptId(e.target.value)}
                  />
                </div>
              </div>
              <div>
                <Label>Policy</Label>
                <Select value={policyId || 'none'} onValueChange={(v) => setPolicyId(v === 'none' ? '' : v)}>
                  <SelectTrigger className="mt-1">
                    <SelectValue placeholder="Select policy" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">Default by scenario</SelectItem>
                    {policies.filter((p) => p.is_active).map((p) => (
                      <SelectItem key={p.id} value={String(p.id)}>
                        {p.code} — {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Scenario</Label>
                  <Select value={scenario || 'none'} onValueChange={(v) => setScenario(v === 'none' ? '' : v)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue placeholder="Optional" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="none">—</SelectItem>
                      {SCENARIOS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Method</Label>
                  <Select value={method} onValueChange={setMethod}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">Stripe</SelectItem>
                      <SelectItem value="credit">Account credit</SelectItem>
                      <SelectItem value="manual">Manual / ledger</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div>
                <Label>Requested amount (optional)</Label>
                <Input
                  className="mt-1"
                  type="number"
                  step="0.01"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                />
              </div>
              <div>
                <Label>Reason</Label>
                <Input className="mt-1" value={reason} onChange={(e) => setReason(e.target.value)} />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} disabled={!can('refunds.override')} />
                Override policy limits (requires refunds.override)
              </label>
              {override && (
                <div>
                  <Label>Override reason</Label>
                  <Input
                    className="mt-1"
                    value={overrideReason}
                    onChange={(e) => setOverrideReason(e.target.value)}
                  />
                </div>
              )}
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoProcess}
                  onChange={(e) => setAutoProcess(e.target.checked)}
                />
                Auto-process if approved
              </label>

              {preview && (
                <div
                  className={`rounded-md border p-3 text-sm space-y-1 ${
                    preview.eligible ? 'border-green-600/40 bg-green-50 dark:bg-green-950/20' : 'border-destructive/40'
                  }`}
                >
                  <p className="font-medium">{preview.eligible ? 'Eligible' : 'Not eligible'}</p>
                  {!preview.eligible && preview.errors.map((err) => <p key={err}>{err}</p>)}
                  <p>
                    Paid: {(preview.currency || 'gbp').toUpperCase()} {preview.original_paid_amount.toFixed(2)} · Already
                    refunded: {preview.previously_refunded_amount.toFixed(2)} · Remaining:{' '}
                    {preview.remaining_refundable.toFixed(2)}
                  </p>
                  <p>
                    Calculated: <strong>{preview.calculated_amount.toFixed(2)}</strong> · Approval:{' '}
                    {preview.requires_approval ? 'required' : 'not required'} · Method: {preview.refund_method}
                  </p>
                  <p>
                    Policy: {preview.policy.code} ({preview.policy.name}) · Payment: {preview.payment_status} · Sub:{' '}
                    {preview.subscription_status}
                  </p>
                </div>
              )}

              <div className="flex gap-2">
                <Button variant="outline" disabled={previewing} onClick={() => void runPreview()}>
                  {previewing ? 'Previewing...' : 'Preview eligibility'}
                </Button>
                <Button disabled={saving || (preview != null && !preview.eligible)} onClick={() => void create()}>
                  {saving ? 'Creating...' : 'Create'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Refund #{detail?.id}</DialogTitle>
            </DialogHeader>
            {detail && (
              <div className="space-y-3 text-sm">
                <p>
                  <span className="text-muted-foreground">Company:</span>{' '}
                  <Link href={`/admin/companies/${detail.company_id}`} className="text-primary hover:underline">
                    {detail.company_name || `#${detail.company_id}`}
                  </Link>
                </p>
                <p>
                  <span className="text-muted-foreground">Status:</span>{' '}
                  <span className="capitalize">{(detail.status || '').replace(/_/g, ' ')}</span>
                </p>
                <p>
                  <span className="text-muted-foreground">Amount:</span>{' '}
                  {(detail.currency || 'GBP').toUpperCase()} {Number(detail.amount).toFixed(2)}
                </p>
                <p>
                  <span className="text-muted-foreground">Policy:</span> {detail.policy_code || '—'} · Method:{' '}
                  {detail.refund_method}
                </p>
                <p>
                  <span className="text-muted-foreground">Original paid:</span> {detail.original_paid_amount ?? '—'} ·
                  Prior refunds: {detail.previously_refunded_amount ?? '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Reason:</span> {detail.reason || '—'}
                </p>
                {detail.error_message && (
                  <p className="text-destructive">
                    <span className="text-muted-foreground">Error:</span> {detail.error_message}
                  </p>
                )}
                {detail.stripe_refund_id && (
                  <p>
                    <span className="text-muted-foreground">Stripe refund:</span> {detail.stripe_refund_id}
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-2">
                  {detail.status === 'pending_approval' && can('refunds.approve', 'billing.write') && (
                    <>
                      <Button
                        size="sm"
                        disabled={acting}
                        onClick={() => void act(() => api.admin.approveRefund(detail.id), 'Approved')}
                      >
                        Approve
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() => {
                          const reasonText = window.prompt('Rejection reason');
                          if (!reasonText) return;
                          void act(() => api.admin.rejectRefund(detail.id, reasonText), 'Rejected');
                        }}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {detail.status === 'approved' && can('refunds.process', 'billing.write') && (
                    <Button
                      size="sm"
                      disabled={acting}
                      onClick={() => void act(() => api.admin.processRefund(detail.id), 'Processed')}
                    >
                      Process
                    </Button>
                  )}
                  {detail.status &&
                    !['completed', 'processing', 'cancelled'].includes(detail.status) &&
                    can('refunds.cancel', 'billing.write') && (
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={acting}
                        onClick={() => void act(() => api.admin.cancelRefund(detail.id), 'Cancelled')}
                      >
                        Cancel
                      </Button>
                    )}
                </div>
                {detail.events && detail.events.length > 0 && (
                  <div className="border-t pt-3">
                    <p className="font-medium mb-2">History</p>
                    <ul className="space-y-2">
                      {detail.events.map((e) => (
                        <li key={e.id} className="text-xs">
                          <span className="font-medium">{e.action}</span>
                          {e.from_status || e.to_status
                            ? ` (${e.from_status || '—'} → ${e.to_status || '—'})`
                            : ''}
                          {e.amount != null ? ` · ${e.amount}` : ''}
                          {e.note ? ` — ${e.note}` : ''}
                          <div className="text-muted-foreground">
                            {e.created_at ? new Date(e.created_at).toLocaleString() : ''} · user #{e.actor_user_id ?? '—'}
                          </div>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
          <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>{editingPolicy ? 'Edit policy' : 'New policy'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Code</Label>
                  <Input
                    className="mt-1"
                    disabled={!!editingPolicy}
                    value={policyForm.code}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, code: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Name</Label>
                  <Input
                    className="mt-1"
                    value={policyForm.name}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, name: e.target.value }))}
                  />
                </div>
              </div>
              <div>
                <Label>Description</Label>
                <Input
                  className="mt-1"
                  value={policyForm.description}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, description: e.target.value }))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Scenario</Label>
                  <Select
                    value={policyForm.scenario_type}
                    onValueChange={(v) => setPolicyForm((f) => ({ ...f, scenario_type: v }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {SCENARIOS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Calculation</Label>
                  <Select
                    value={policyForm.calculation_type}
                    onValueChange={(v) => setPolicyForm((f) => ({ ...f, calculation_type: v }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="full">full</SelectItem>
                      <SelectItem value="percentage">percentage</SelectItem>
                      <SelectItem value="fixed">fixed</SelectItem>
                      <SelectItem value="remaining">remaining</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Percentage</Label>
                  <Input
                    className="mt-1"
                    value={policyForm.percentage}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, percentage: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Fixed amount</Label>
                  <Input
                    className="mt-1"
                    value={policyForm.fixed_amount}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, fixed_amount: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Auto-approve below</Label>
                  <Input
                    className="mt-1"
                    value={policyForm.auto_approve_below}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, auto_approve_below: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Max days after payment</Label>
                  <Input
                    className="mt-1"
                    value={policyForm.max_days_after_payment}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, max_days_after_payment: e.target.value }))}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Max refund %</Label>
                  <Input
                    className="mt-1"
                    value={policyForm.max_refund_percent}
                    onChange={(e) => setPolicyForm((f) => ({ ...f, max_refund_percent: e.target.value }))}
                  />
                </div>
                <div>
                  <Label>Default method</Label>
                  <Select
                    value={policyForm.default_refund_method}
                    onValueChange={(v) => setPolicyForm((f) => ({ ...f, default_refund_method: v }))}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="stripe">stripe</SelectItem>
                      <SelectItem value="credit">credit</SelectItem>
                      <SelectItem value="manual">manual</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policyForm.requires_approval}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, requires_approval: e.target.checked }))}
                />
                Requires approval
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={policyForm.is_active}
                  onChange={(e) => setPolicyForm((f) => ({ ...f, is_active: e.target.checked }))}
                />
                Active
              </label>
              <Button disabled={savingPolicy} onClick={() => void savePolicy()}>
                {savingPolicy ? 'Saving...' : 'Save policy'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
