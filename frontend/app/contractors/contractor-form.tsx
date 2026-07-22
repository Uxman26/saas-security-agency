'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PhoneInput } from '@/components/ui/phone-input';

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
  const [phoneError, setPhoneError] = useState('');

  useEffect(() => {
    setForm({ ...empty, ...initial });
    setPhoneError('');
  }, [initial]);

  const set = (k: keyof ContractorFormValues, v: string) =>
    setForm((f) => ({ ...f, [k]: v }));

  return (
    <form
      className="min-w-0 max-w-full space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const name = form.name.trim().replace(/[<>]/g, '');
        if (!name) return;
        const phone = form.contact_phone.trim();
        if (phone && !/^\+[0-9]{7,15}$/.test(phone)) {
          setPhoneError('Enter a valid phone number (digits only)');
          return;
        }
        setPhoneError('');
        void onSubmit({
          ...form,
          name,
          contact_email: form.contact_email.trim().replace(/[<>]/g, ''),
          contact_phone: phone,
          address: form.address.trim().replace(/[<>]/g, ''),
          postcode: form.postcode.trim().replace(/[<>]/g, ''),
        });
      }}
    >
      <div className="grid min-w-0 gap-4 sm:grid-cols-2">
        <div className="space-y-1 min-w-0 sm:col-span-2">
          <Label>Name</Label>
          <Input
            className="min-w-0"
            value={form.name}
            onChange={(e) => set('name', e.target.value)}
            required
            maxLength={120}
          />
        </div>
        <div className="space-y-1 min-w-0 sm:col-span-2">
          <Label>Type</Label>
          <Select
            value={form.type}
            onValueChange={(v) => set('type', v as 'main' | 'sub')}
          >
            <SelectTrigger className="min-w-0">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="main">Main contractor</SelectItem>
              <SelectItem value="sub">Sub-contractor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1 min-w-0">
          <Label>Contact email</Label>
          <Input
            className="min-w-0"
            type="email"
            value={form.contact_email}
            onChange={(e) => set('contact_email', e.target.value)}
            maxLength={254}
          />
        </div>
        <div className="space-y-1 min-w-0">
          <Label>Phone</Label>
          <PhoneInput
            value={form.contact_phone}
            onChange={(v) => {
              set('contact_phone', v);
              if (phoneError) setPhoneError('');
            }}
          />
          {phoneError ? <p className="text-xs text-destructive">{phoneError}</p> : null}
        </div>
        <div className="space-y-1 min-w-0 sm:col-span-2">
          <Label>Address</Label>
          <Input
            className="min-w-0"
            value={form.address}
            onChange={(e) => set('address', e.target.value)}
            maxLength={500}
          />
        </div>
        <div className="space-y-1 min-w-0 sm:col-span-2">
          <Label>Postcode</Label>
          <Input
            className="min-w-0"
            value={form.postcode}
            onChange={(e) => set('postcode', e.target.value)}
            placeholder="e.g. E15 2AB"
            maxLength={20}
          />
        </div>
      </div>
      <Button type="submit" disabled={loading} className="w-full">
        {loading ? 'Saving…' : submitLabel}
      </Button>
    </form>
  );
}
