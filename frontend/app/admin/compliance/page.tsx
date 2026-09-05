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
import { api } from '@/lib/api';
import type { RetentionPolicy } from '@/lib/types';
import { toast } from '@/lib/toast';

const FIELDS: { key: keyof RetentionPolicy; label: string }[] = [
  { key: 'login_logs_days', label: 'Login logs (days)' },
  { key: 'audit_logs_days', label: 'Audit logs (days)' },
  { key: 'api_usage_days', label: 'API usage (days)' },
  { key: 'email_logs_days', label: 'Email logs (days)' },
  { key: 'error_logs_days', label: 'Error logs (days)' },
  { key: 'security_events_days', label: 'Security events (days)' },
];

export default function AdminCompliancePage() {
  const { user } = useAuth();
  const [policy, setPolicy] = useState<RetentionPolicy | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(() => {
    api.admin
      .retention()
      .then(setPolicy)
      .catch(() => toast.error('Failed to load retention policy'));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const save = async () => {
    if (!policy) return;
    setBusy(true);
    try {
      setPolicy(await api.admin.putRetention(policy));
      toast.success('Retention policy saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const purge = async () => {
    if (!confirm('Purge logs older than retention windows?')) return;
    setBusy(true);
    try {
      const res = await api.admin.purgeLogs();
      toast.success(`Purge complete: ${JSON.stringify(res)}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Purge failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6 max-w-3xl">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Compliance</h1>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Data retention</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              {!policy ? (
                <p className="text-sm text-muted-foreground">Loading...</p>
              ) : (
                <>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {FIELDS.map(({ key, label }) => (
                      <div key={key}>
                        <Label>{label}</Label>
                        <Input
                          type="number"
                          className="mt-1"
                          value={policy[key]}
                          onChange={(e) =>
                            setPolicy((p) =>
                              p ? { ...p, [key]: parseInt(e.target.value, 10) || 0 } : p
                            )
                          }
                        />
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" disabled={busy} onClick={() => void save()}>Save</Button>
                    <Button size="sm" variant="destructive" disabled={busy} onClick={() => void purge()}>
                      Purge expired logs
                    </Button>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>GDPR export & delete</CardTitle></CardHeader>
            <CardContent className="text-sm space-y-2">
              <p>
                Open a company support view to export tenant data (JSON/CSV) or run a GDPR delete
                with name confirmation.
              </p>
              <Link href="/admin/companies" className="text-primary hover:underline">
                Go to companies →
              </Link>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
