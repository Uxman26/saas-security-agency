'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { api } from '@/lib/api';
import type { CreditNote, Invoice, Site } from '@/lib/types';
import { toast } from '@/lib/toast';
import { formatMoney } from '@/lib/rota-shifts-utils';

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  invoice: Invoice;
  editing?: CreditNote | null;
  onSaved: () => void;
};

export function CreditNoteDialog({ open, onOpenChange, invoice, editing, onSaved }: Props) {
  const [sites, setSites] = useState<Site[]>([]);
  const [creditDate, setCreditDate] = useState('');
  const [siteId, setSiteId] = useState('');
  const [reason, setReason] = useState('');
  const [description, setDescription] = useState('');
  const [subtotal, setSubtotal] = useState('');
  const [taxRate, setTaxRate] = useState(String(invoice.tax_rate ?? 20));
  const [status, setStatus] = useState<'draft' | 'issued'>('issued');
  const [saving, setSaving] = useState(false);

  const siteOptions = useMemo(() => {
    const ids = new Set((invoice.lines || []).map((l) => l.site_id).filter(Boolean));
    return sites
      .filter((s) => ids.size === 0 || ids.has(s.id))
      .map((s) => ({ value: String(s.id), label: s.name }));
  }, [sites, invoice.lines]);

  useEffect(() => {
    if (!open) return;
    api.sites.list().then(setSites).catch(() => setSites([]));
    if (editing) {
      setCreditDate(String(editing.credit_date).slice(0, 10));
      setSiteId(editing.site_id != null ? String(editing.site_id) : '');
      setReason(editing.reason || '');
      setDescription(editing.description || '');
      setSubtotal(String(editing.subtotal ?? ''));
      setTaxRate(String(editing.tax_rate ?? invoice.tax_rate ?? 0));
      setStatus(editing.status === 'draft' ? 'draft' : 'issued');
    } else {
      setCreditDate(new Date().toISOString().slice(0, 10));
      setSiteId('');
      setReason('');
      setDescription('');
      setSubtotal('');
      setTaxRate(String(invoice.tax_rate ?? 20));
      setStatus('issued');
    }
  }, [open, editing, invoice.tax_rate]);

  const net = parseFloat(subtotal) || 0;
  const rate = parseFloat(taxRate) || 0;
  const tax = Math.round(net * rate) / 100;
  const total = Math.round((net + tax) * 100) / 100;
  const remaining = Math.max(
    0,
    (invoice.total || 0) - (invoice.amount_paid || 0) - (invoice.credit_applied || 0) + (editing?.status === 'issued' ? editing.total : 0)
  );

  const submit = async () => {
    if (!net || net <= 0) {
      toast.error('Enter a credited amount greater than zero');
      return;
    }
    setSaving(true);
    try {
      if (editing) {
        await api.creditNotes.update(editing.id, {
          site_id: siteId ? parseInt(siteId, 10) : null,
          credit_date: creditDate || undefined,
          reason: reason.trim() || undefined,
          description: description.trim() || undefined,
          subtotal: net,
          tax_rate: rate,
          status: editing.status === 'draft' ? status : undefined,
        });
        toast.success('Credit note updated');
      } else {
        await api.creditNotes.create({
          invoice_id: invoice.id,
          client_id: invoice.client_id,
          site_id: siteId ? parseInt(siteId, 10) : null,
          credit_date: creditDate || undefined,
          reason: reason.trim() || undefined,
          description: description.trim() || undefined,
          subtotal: net,
          tax_rate: rate,
          status,
        });
        toast.success('Credit note created');
      }
      onOpenChange(false);
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${editing.number}` : `Credit note for Invoice #${invoice.id}`}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-1">
          <p className="text-sm text-muted-foreground">
            Remaining balance available to credit: {formatMoney(remaining)}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Credit date</Label>
              <Input type="date" value={creditDate} onChange={(e) => setCreditDate(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Site (optional)</Label>
              <SearchableSelect
                value={siteId}
                onChange={setSiteId}
                options={siteOptions}
                placeholder="All / invoice sites"
                noneOption={{ value: '', label: 'No specific site' }}
              />
            </div>
          </div>
          <div className="space-y-1">
            <Label>Reason</Label>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Overcharge adjustment" />
          </div>
          <div className="space-y-1">
            <Label>Description</Label>
            <textarea
              className="w-full min-h-[72px] rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Optional details"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label>Net amount (ex VAT)</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={subtotal}
                onChange={(e) => setSubtotal(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label>VAT %</Label>
              <Input type="number" min="0" max="100" step="0.01" value={taxRate} onChange={(e) => setTaxRate(e.target.value)} />
            </div>
          </div>
          <div className="rounded-md border bg-muted/40 px-3 py-2 text-sm space-y-1">
            <div className="flex justify-between"><span>VAT</span><span>{formatMoney(tax)}</span></div>
            <div className="flex justify-between font-semibold"><span>Total credit</span><span>{formatMoney(total)}</span></div>
          </div>
          {(!editing || editing.status === 'draft') && (
            <div className="space-y-1">
              <Label>Status</Label>
              <SearchableSelect
                value={status}
                onChange={(v) => setStatus(v as 'draft' | 'issued')}
                options={[
                  { value: 'issued', label: 'Issued (apply to balance)' },
                  { value: 'draft', label: 'Draft (not applied yet)' },
                ]}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
              Cancel
            </Button>
            <Button onClick={() => void submit()} disabled={saving || !net}>
              {saving ? 'Saving…' : editing ? 'Save' : 'Create credit note'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
