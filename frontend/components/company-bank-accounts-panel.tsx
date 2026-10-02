'use client';

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { CompanyBankAccount } from '@/lib/types';
import { toast } from '@/lib/toast';
import { Pencil, Plus, Star, Trash2 } from 'lucide-react';
import { Pill } from '@/components/module-dashboard';

const emptyForm = {
  label: 'Primary',
  account_name: '',
  bank_name: '',
  sort_code: '',
  account_number: '',
  iban: '',
  swift_code: '',
  is_default: false,
};

export function CompanyBankAccountsPanel({ canEdit = true }: { canEdit?: boolean }) {
  const [accounts, setAccounts] = useState<CompanyBankAccount[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);

  const refresh = useCallback(() => {
    setLoading(true);
    api.company
      .bankAccounts()
      .then(setAccounts)
      .catch(() => setAccounts([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const openAdd = () => {
    setEditingId(null);
    setForm({ ...emptyForm, is_default: accounts.length === 0 });
    setFormOpen(true);
  };

  const openEdit = (a: CompanyBankAccount) => {
    setEditingId(a.id);
    setForm({
      label: a.label || 'Primary',
      account_name: a.account_name || '',
      bank_name: a.bank_name || '',
      sort_code: a.sort_code || '',
      account_number: a.account_number || '',
      iban: a.iban || '',
      swift_code: a.swift_code || '',
      is_default: a.is_default,
    });
    setFormOpen(true);
  };

  const submit = async () => {
    if (!form.label.trim()) {
      toast.error('Label is required');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        label: form.label.trim(),
        account_name: form.account_name.trim() || null,
        bank_name: form.bank_name.trim() || null,
        sort_code: form.sort_code.trim() || null,
        account_number: form.account_number.trim() || null,
        iban: form.iban.trim() || null,
        swift_code: form.swift_code.trim() || null,
        is_default: form.is_default,
      };
      if (editingId) {
        await api.company.updateBankAccount(editingId, payload);
        if (form.is_default) await api.company.setDefaultBankAccount(editingId);
        toast.success('Bank account updated');
      } else {
        await api.company.createBankAccount(payload);
        toast.success('Bank account added');
      }
      setFormOpen(false);
      setEditingId(null);
      setForm(emptyForm);
      refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setDefault = (accountId: number) => {
    toast.confirm('Set as default bank account?', async () => {
      setSaving(true);
      try {
        await api.company.setDefaultBankAccount(accountId);
        toast.success('Default updated');
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Failed');
      } finally {
        setSaving(false);
      }
    });
  };

  const remove = (accountId: number) => {
    toast.confirm('Delete this bank account?', async () => {
      setSaving(true);
      try {
        await api.company.deleteBankAccount(accountId);
        toast.success('Bank account deleted');
        refresh();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      } finally {
        setSaving(false);
      }
    }, { label: 'Delete' });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Bank details shown at the bottom of invoices so clients know where to pay. The default
          account is used when no client-specific account is selected.
        </p>
        {canEdit ? (
          <Button type="button" size="sm" variant="outline" onClick={openAdd} disabled={saving} className="shrink-0">
            <Plus className="size-3.5 mr-1" /> Add
          </Button>
        ) : null}
      </div>

      {loading ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : accounts.length === 0 ? (
        <p className="text-sm text-muted-foreground">No bank accounts yet.</p>
      ) : (
        <ul className="space-y-2">
          {accounts.map((a) => (
            <li key={a.id} className="rounded-md border border-border p-3 text-sm space-y-1">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-medium truncate">{a.label}</span>
                  {a.is_default ? <Pill tone="positive">Default</Pill> : null}
                </div>
                {canEdit ? (
                  <div className="flex items-center gap-1">
                    {!a.is_default ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="ghost"
                        title="Set default"
                        disabled={saving}
                        onClick={() => setDefault(a.id)}
                      >
                        <Star className="size-3.5" />
                      </Button>
                    ) : null}
                    <Button type="button" size="sm" variant="ghost" disabled={saving} onClick={() => openEdit(a)}>
                      <Pencil className="size-3.5" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      className="text-destructive"
                      disabled={saving}
                      onClick={() => remove(a.id)}
                    >
                      <Trash2 className="size-3.5" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="text-xs text-muted-foreground space-y-0.5">
                {a.account_name ? <p>Account: {a.account_name}</p> : null}
                {a.bank_name ? <p>Bank: {a.bank_name}</p> : null}
                {a.sort_code || a.account_number ? (
                  <p>{[a.sort_code, a.account_number].filter(Boolean).join(' · ')}</p>
                ) : null}
                {a.iban ? <p>IBAN: {a.iban}</p> : null}
                {a.swift_code ? <p>SWIFT: {a.swift_code}</p> : null}
              </div>
            </li>
          ))}
        </ul>
      )}

      {formOpen && canEdit ? (
        <div className="rounded-md border bg-muted/30 p-3 space-y-3">
          <p className="text-sm font-medium">{editingId ? 'Edit account' : 'New account'}</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1 sm:col-span-2">
              <Label>Label</Label>
              <Input
                value={form.label}
                onChange={(e) => setForm((p) => ({ ...p, label: e.target.value }))}
                placeholder="Primary"
              />
            </div>
            <div className="space-y-1">
              <Label>Account name</Label>
              <Input
                value={form.account_name}
                onChange={(e) => setForm((p) => ({ ...p, account_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Bank name</Label>
              <Input
                value={form.bank_name}
                onChange={(e) => setForm((p) => ({ ...p, bank_name: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Sort code</Label>
              <Input
                value={form.sort_code}
                onChange={(e) => setForm((p) => ({ ...p, sort_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>Account number</Label>
              <Input
                value={form.account_number}
                onChange={(e) => setForm((p) => ({ ...p, account_number: e.target.value }))}
              />
            </div>
            <div className="space-y-1">
              <Label>IBAN</Label>
              <Input value={form.iban} onChange={(e) => setForm((p) => ({ ...p, iban: e.target.value }))} />
            </div>
            <div className="space-y-1">
              <Label>SWIFT / BIC</Label>
              <Input
                value={form.swift_code}
                onChange={(e) => setForm((p) => ({ ...p, swift_code: e.target.value }))}
              />
            </div>
            <div className="space-y-1 sm:col-span-2 flex items-center gap-2 pt-1">
              <input
                type="checkbox"
                id="co-ba-default"
                className="size-4 accent-primary"
                checked={form.is_default}
                onChange={(e) => setForm((p) => ({ ...p, is_default: e.target.checked }))}
              />
              <Label htmlFor="co-ba-default" className="font-normal cursor-pointer">
                Set as default
              </Label>
            </div>
          </div>
          <div className="flex gap-2">
            <Button type="button" size="sm" onClick={submit} disabled={saving}>
              {saving ? 'Saving…' : editingId ? 'Save' : 'Add account'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={saving}
              onClick={() => {
                setFormOpen(false);
                setEditingId(null);
              }}
            >
              Cancel
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
