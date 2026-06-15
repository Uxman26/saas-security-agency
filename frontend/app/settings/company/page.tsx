'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { CompanyProfile } from '@/lib/types';
import { Building2, Upload, Wallet } from 'lucide-react';
import { toast } from '@/lib/toast';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

function useLogoUrl(url?: string | null) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (!url) {
      setSrc(null);
      return;
    }
    let cancelled = false;
    let blobUrl: string | null = null;
    const token = localStorage.getItem('token')?.trim();
    void fetch(`${API_URL}${url}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    })
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (cancelled || !blob) return;
        blobUrl = URL.createObjectURL(blob);
        setSrc(blobUrl);
      })
      .catch(() => setSrc(null));
    return () => {
      cancelled = true;
      if (blobUrl) URL.revokeObjectURL(blobUrl);
    };
  }, [url]);
  return src;
}

export default function CompanySettingsPage() {
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [accountName, setAccountName] = useState('');
  const [bankName, setBankName] = useState('');
  const [sortCode, setSortCode] = useState('');
  const [accountNumber, setAccountNumber] = useState('');
  const [iban, setIban] = useState('');
  const [swiftCode, setSwiftCode] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const logoSrc = useLogoUrl(profile?.logo_url);

  const load = () => {
    api.company
      .profile()
      .then((p) => {
        setProfile(p);
        setName(p.name);
        setEmail(p.email ?? '');
        setPhone(p.phone ?? '');
        setAddress(p.address ?? '');
        setAccountName(p.account_name ?? '');
        setBankName(p.bank_name ?? '');
        setSortCode(p.sort_code ?? '');
        setAccountNumber(p.account_number ?? '');
        setIban(p.iban ?? '');
        setSwiftCode(p.swift_code ?? '');
      })
      .catch(() => toast.error('Failed to load company profile'));
  };

  useEffect(() => {
    load();
  }, []);

  const save = async () => {
    setSaving(true);
    try {
      const p = await api.company.updateProfile({
        name: name.trim(),
        email: email.trim() || undefined,
        phone: phone.trim() || undefined,
        address: address.trim() || undefined,
        account_name: accountName.trim() || undefined,
        bank_name: bankName.trim() || undefined,
        sort_code: sortCode.trim() || undefined,
        account_number: accountNumber.trim() || undefined,
        iban: iban.trim() || undefined,
        swift_code: swiftCode.trim() || undefined,
      });
      setProfile(p);
      toast.success('Company details saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const onLogo = async (file: File | null) => {
    if (!file) return;
    setUploading(true);
    try {
      const p = await api.company.uploadLogo(file);
      setProfile(p);
      toast.success('Logo uploaded');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="mb-6">
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Building2 className="size-7" /> Company profile
            </h1>
            <p className="text-sm text-muted-foreground mt-1">Logo and contact details appear at the top of invoices. Bank account details appear at the bottom for payment.</p>
          </div>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Logo</CardTitle>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-4">
              {logoSrc ? (
                <img src={logoSrc} alt="" className="h-16 max-w-[180px] object-contain rounded border bg-white p-2" />
              ) : (
                <div className="h-16 w-32 rounded border border-dashed flex items-center justify-center text-xs text-muted-foreground">No logo</div>
              )}
              <label className="inline-flex">
                <input
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  className="hidden"
                  onChange={(e) => void onLogo(e.target.files?.[0] ?? null)}
                />
                <span className="inline-flex items-center justify-center rounded-md border border-input bg-background px-3 h-8 text-sm font-medium hover:bg-muted cursor-pointer">
                  <Upload className="size-4 mr-1" />
                  {uploading ? 'Uploading…' : 'Upload logo'}
                </span>
              </label>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base">Contact details</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4">
              <div className="space-y-1">
                <Label>Company name</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Email</Label>
                <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="billing@company.com" />
              </div>
              <div className="space-y-1">
                <Label>Phone</Label>
                <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44 20 0000 0000" />
              </div>
              <div className="space-y-1">
                <Label>Address</Label>
                <textarea
                  className="w-full min-h-[80px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, city, postcode"
                />
              </div>
            </CardContent>
          </Card>

          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Wallet className="size-4" /> Account details
              </CardTitle>
            </CardHeader>
            <CardContent className="grid gap-4 sm:grid-cols-2">
              <p className="text-sm text-muted-foreground -mt-2 sm:col-span-2">Bank details shown at the bottom of invoices so clients know where to pay.</p>
              <div className="space-y-1 sm:col-span-2">
                <Label>Account name</Label>
                <Input value={accountName} onChange={(e) => setAccountName(e.target.value)} placeholder="Name on the bank account" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>Bank name</Label>
                <Input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="e.g. Barclays, HSBC" />
              </div>
              <div className="space-y-1">
                <Label>Sort code</Label>
                <Input value={sortCode} onChange={(e) => setSortCode(e.target.value)} placeholder="00-00-00" />
              </div>
              <div className="space-y-1">
                <Label>Account number</Label>
                <Input value={accountNumber} onChange={(e) => setAccountNumber(e.target.value)} placeholder="12345678" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>IBAN</Label>
                <Input value={iban} onChange={(e) => setIban(e.target.value)} placeholder="GB00 XXXX 0000 0000 0000 00" className="font-mono" />
              </div>
              <div className="space-y-1 sm:col-span-2">
                <Label>SWIFT / BIC</Label>
                <Input value={swiftCode} onChange={(e) => setSwiftCode(e.target.value)} placeholder="BARCGB22" className="font-mono" />
              </div>
            </CardContent>
          </Card>

          <div className="flex gap-2">
            <Button onClick={() => void save()} disabled={saving || !name.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
            <Button variant="outline" asChild>
              <Link href="/invoices">Back to invoices</Link>
            </Button>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
