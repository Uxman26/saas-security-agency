'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

export type ContractorFormValues = {
  name: string;
  type: 'main' | 'sub';
  contact_email: string;
  contact_phone: string;
  address: string;
  postcode: string;
};

const empty: ContractorFormValues = {
  name: '',
  type: 'main',
  contact_email: '',
  contact_phone: '',
  address: '',
  postcode: '',
};

export function ContractorForm({
  initial,
  onSubmit,
  loading,
  allowSubContractors: _allowSubContractors,
  submitLabel,
}: {
  initial?: Partial<ContractorFormValues>;
  onSubmit: (v: ContractorFormValues) => void | Promise<void>;
  loading: boolean;
  allowSubContractors: boolean;
  submitLabel: string;
}) {
  const [form, setForm] = useState<ContractorFormValues>({ ...empty, ...initial });

  useEffect(() => {
    setForm({ ...empty, ...initial });
  }, [initial]);

  const set = (k: keyof ContractorFormValues, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = form.name.trim().replace(/[<>]/g, '');
        if (!name) return;
        void onSubmit({
          ...form,
          name,
          contact_email: form.contact_email.trim().replace(/[<>]/g, ''),
          contact_phone: form.contact_phone.trim().replace(/[<>]/g, ''),
          address: form.address.trim().replace(/[<>]/g, ''),
          postcode: form.postcode.trim().replace(/[<>]/g, ''),
        });
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-1 sm:col-span-2">
          <Label>Name</Label>
          <Input value={form.name} onChange={(e) => set('name', e.target.value)} required maxLength={120} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Type</Label>
          <Select
            value={form.type}
            onValueChange={(v) => set('type', v as 'main' | 'sub')}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="main">Main contractor</SelectItem>
              <SelectItem
                value="sub"
                disabled={false}
                // disabled={!allowSubContractors}
                // title={!allowSubContractors ? 'Upgrade plan' : undefined}
              >
                Sub-contractor
              </SelectItem>
            </SelectContent>
          </Select>
          {/* {!allowSubContractors && (
            <p className="text-xs text-muted-foreground">Sub-contractors require Enterprise.</p>
          )} */}
        </div>
        <div className="space-y-1">
          <Label>Contact email</Label>
          <Input type="email" value={form.contact_email} onChange={(e) => set('contact_email', e.target.value)} />
        </div>
        <div className="space-y-1">
          <Label>Phone</Label>
          <Input value={form.contact_phone} onChange={(e) => set('contact_phone', e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Address</Label>
          <Input value={form.address} onChange={(e) => set('address', e.target.value)} />
        </div>
        <div className="space-y-1 sm:col-span-2">
          <Label>Postcode</Label>
          <Input value={form.postcode} onChange={(e) => set('postcode', e.target.value)} placeholder="e.g. E15 2AB" />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
