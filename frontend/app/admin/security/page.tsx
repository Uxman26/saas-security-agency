'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { MaintenanceConfig, MfaStatus, PasswordPolicy, SuspiciousEvent } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminSecurityPage() {
  const { user } = useAuth();
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [setupSecret, setSetupSecret] = useState('');
  const [otpauthUri, setOtpauthUri] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [policy, setPolicy] = useState<PasswordPolicy>({
    min_length: 9,
    require_upper: true,
    require_lower: true,
    require_digit: true,
    require_special: true,
    max_age_days: null,
  });
  const [maintenance, setMaintenance] = useState<MaintenanceConfig>({ enabled: false, message: '' });
  const [events, setEvents] = useState<SuspiciousEvent[]>([]);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const [status, pol, maint, sus] = await Promise.all([
        api.auth.mfaStatus(),
        api.admin.passwordPolicy(),
        api.admin.maintenance(),
        api.admin.suspicious(),
      ]);
      setMfaStatus(status);
      setPolicy({
        min_length: pol.min_length ?? 9,
        require_upper: !!pol.require_upper,
        require_lower: !!pol.require_lower,
        require_digit: !!pol.require_digit,
        require_special: !!pol.require_special,
        max_age_days: pol.max_age_days ?? null,
      });
      setMaintenance({ enabled: !!maint.enabled, message: maint.message || '' });
      setEvents(sus);
    } catch {
      toast.error('Failed to load security settings');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

  const startMfaSetup = async () => {
    setBusy(true);
    try {
      const res = await api.auth.mfaSetup();
      setSetupSecret(res.secret);
      setOtpauthUri(res.otpauth_uri);
      setBackupCodes([]);
      setMfaCode('');
      toast.success('Scan the QR / secret, then confirm with a code');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Setup failed');
    } finally {
      setBusy(false);
    }
  };

  const confirmMfa = async () => {
    if (mfaCode.trim().length < 6) {
      toast.error('Enter a 6-digit code');
      return;
    }
    setBusy(true);
    try {
      const res = await api.auth.mfaConfirm(mfaCode.trim());
      setBackupCodes(res.backup_codes || []);
      setSetupSecret('');
      setOtpauthUri('');
      setMfaCode('');
      setMfaStatus({ enabled: true, required_for_role: mfaStatus?.required_for_role });
      toast.success('MFA enabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Confirm failed');
    } finally {
      setBusy(false);
    }
  };

  const disableMfa = async () => {
    if (mfaCode.trim().length < 6) {
      toast.error('Enter a code to disable MFA');
      return;
    }
    setBusy(true);
    try {
      await api.auth.mfaDisable(mfaCode.trim());
      setMfaStatus({ enabled: false, required_for_role: mfaStatus?.required_for_role });
      setMfaCode('');
      setBackupCodes([]);
      toast.success('MFA disabled');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Disable failed');
    } finally {
      setBusy(false);
    }
  };

  const savePolicy = async () => {
    setBusy(true);
    try {
      const updated = await api.admin.putPasswordPolicy({
        ...policy,
        max_age_days: policy.max_age_days || null,
      });
      setPolicy({
        min_length: updated.min_length ?? 9,
        require_upper: !!updated.require_upper,
        require_lower: !!updated.require_lower,
        require_digit: !!updated.require_digit,
        require_special: !!updated.require_special,
        max_age_days: updated.max_age_days ?? null,
      });
      toast.success('Password policy saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const saveMaintenance = async () => {
    setBusy(true);
    try {
      const updated = await api.admin.putMaintenance({
        enabled: maintenance.enabled,
        message: maintenance.message || null,
      });
      setMaintenance({ enabled: !!updated.enabled, message: updated.message || '' });
      toast.success('Maintenance mode updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const scan = async () => {
    setBusy(true);
    try {
      const res = await api.admin.scanSuspicious();
      toast.success(`Scan complete (${res.findings?.length ?? 0} findings)`);
      setEvents(await api.admin.suspicious());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Scan failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Security</h1>
            <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Multi-factor authentication</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Status: {mfaStatus?.enabled ? 'Enabled' : 'Disabled'}
                {mfaStatus?.required_for_role ? ' · required for your role' : ''}
              </p>
              {setupSecret && (
                <div className="rounded-md border p-3 text-sm space-y-1">
                  <p className="font-medium">Secret</p>
                  <code className="break-all text-xs">{setupSecret}</code>
                  {otpauthUri && <p className="text-xs text-muted-foreground break-all">{otpauthUri}</p>}
                </div>
              )}
              {backupCodes.length > 0 && (
                <div className="rounded-md border border-amber-200 bg-amber-50 dark:bg-amber-950/30 p-3 text-sm">
                  <p className="font-medium mb-1">Backup codes (save these)</p>
                  <ul className="grid sm:grid-cols-2 gap-1 font-mono text-xs">
                    {backupCodes.map((c) => <li key={c}>{c}</li>)}
                  </ul>
                </div>
              )}
              <div className="flex flex-wrap gap-2 items-end">
                <div>
                  <Label>Code</Label>
                  <Input
                    value={mfaCode}
                    onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    className="mt-1 w-40"
                    placeholder="000000"
                  />
                </div>
                {!mfaStatus?.enabled ? (
                  <>
                    <Button size="sm" disabled={busy} onClick={() => void startMfaSetup()}>Setup MFA</Button>
                    {setupSecret && (
                      <Button size="sm" disabled={busy} onClick={() => void confirmMfa()}>Confirm</Button>
                    )}
                  </>
                ) : (
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => void disableMfa()}>
                    Disable MFA
                  </Button>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Password policy</CardTitle></CardHeader>
            <CardContent className="space-y-4">
              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <Label>Min length</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={policy.min_length}
                    onChange={(e) => setPolicy((p) => ({ ...p, min_length: parseInt(e.target.value, 10) || 9 }))}
                  />
                </div>
                <div>
                  <Label>Max age (days)</Label>
                  <Input
                    type="number"
                    className="mt-1"
                    value={policy.max_age_days ?? ''}
                    onChange={(e) =>
                      setPolicy((p) => ({
                        ...p,
                        max_age_days: e.target.value ? parseInt(e.target.value, 10) : null,
                      }))
                    }
                    placeholder="Optional"
                  />
                </div>
              </div>
              <div className="flex flex-wrap gap-4 text-sm">
                {(
                  [
                    ['require_upper', 'Uppercase'],
                    ['require_lower', 'Lowercase'],
                    ['require_digit', 'Digit'],
                    ['require_special', 'Special'],
                  ] as const
                ).map(([key, label]) => (
                  <label key={key} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!policy[key]}
                      onChange={(e) => setPolicy((p) => ({ ...p, [key]: e.target.checked }))}
                      className="rounded border"
                    />
                    {label}
                  </label>
                ))}
              </div>
              <Button size="sm" disabled={busy} onClick={() => void savePolicy()}>Save policy</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Maintenance mode</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={maintenance.enabled}
                  onChange={(e) => setMaintenance((m) => ({ ...m, enabled: e.target.checked }))}
                  className="rounded border"
                />
                Platform under maintenance
              </label>
              <div>
                <Label>Message</Label>
                <Input
                  className="mt-1"
                  value={maintenance.message || ''}
                  onChange={(e) => setMaintenance((m) => ({ ...m, message: e.target.value }))}
                  placeholder="Shown to non-admin users"
                />
              </div>
              <Button size="sm" disabled={busy} onClick={() => void saveMaintenance()}>Save maintenance</Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Suspicious activity</CardTitle>
              <Button size="sm" disabled={busy} onClick={() => void scan()}>Scan</Button>
            </CardHeader>
            <CardContent>
              {events.length === 0 ? (
                <p className="text-sm text-muted-foreground">No suspicious events.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Type</TableHead>
                      <TableHead>Severity</TableHead>
                      <TableHead>Message</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {events.map((e) => (
                      <TableRow key={e.id}>
                        <TableCell className="text-sm">{e.event_type || '—'}</TableCell>
                        <TableCell className="capitalize text-sm">{e.severity || '—'}</TableCell>
                        <TableCell className="text-sm max-w-md truncate">{e.message || '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {e.created_at ? new Date(e.created_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
