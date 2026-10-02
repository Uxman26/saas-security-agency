'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth-context';
import { api, ApiError } from '@/lib/api';
import type { SmtpConfig } from '@/lib/types';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

function smtpErrorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    const d = e.detail;
    if (d && typeof d === 'object' && d !== null && 'message' in d) {
      return String((d as { message?: string }).message || e.message);
    }
    return e.message;
  }
  return e instanceof Error ? e.message : 'Request failed';
}

export default function AdminEmailPage() {
  const { user } = useAuth();
  const [config, setConfig] = useState<SmtpConfig | null>(null);
  const [server, setServer] = useState('');
  const [port, setPort] = useState('587');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [from, setFrom] = useState('');
  const [fromName, setFromName] = useState('');
  const [saving, setSaving] = useState(false);
  const [testTo, setTestTo] = useState('');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<{ ok: boolean; message: string } | null>(null);

  const load = useCallback(() => {
    api.admin.smtp().then((c) => {
      setConfig(c);
      setServer(c.mail_server);
      setPort(String(c.mail_port));
      setFrom(c.mail_from);
      setFromName(c.mail_from_name);
      if (!testTo && user?.email) setTestTo(user.email);
    }).catch(() => toast.error('Failed to load SMTP settings'));
  }, [testTo, user?.email]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const save = async () => {
    setSaving(true);
    setTestResult(null);
    try {
      const updated = await api.admin.patchSmtp({
        mail_server: server || undefined,
        mail_port: port ? parseInt(port, 10) : undefined,
        mail_username: username || undefined,
        mail_password: password || undefined,
        mail_from: from || undefined,
        mail_from_name: fromName || undefined,
      });
      setConfig(updated);
      setUsername('');
      setPassword('');
      toast.success('SMTP settings saved');
    } catch (e) {
      toast.error(smtpErrorMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    if (!testTo.trim()) {
      toast.error('Enter a recipient email for the test message');
      return;
    }
    setTesting(true);
    setTestResult(null);
    try {
      const res = await api.admin.testSmtp(testTo.trim());
      setTestResult({ ok: true, message: res.message });
      toast.success(res.message);
    } catch (e) {
      const msg = smtpErrorMessage(e);
      setTestResult({ ok: false, message: msg });
      toast.error(msg);
    } finally {
      setTesting(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-2xl">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">SMTP email</h1>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Platform mail server</CardTitle>
              <p className="text-sm text-muted-foreground">
                Used for system emails: password resets, account verification, lockout alerts, trial/billing notices, and tenant notifications.
                Manage message content under{' '}
                <a href="/admin/templates" className="text-primary underline">
                  Notification templates
                </a>
                .
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {config && (
                <div className={cn('rounded-lg border p-3 text-sm', config.configured ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300' : 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-300')}>
                  {config.configured ? 'SMTP is configured and ready to send.' : 'SMTP credentials are missing — emails will not send until configured.'}
                </div>
              )}
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>SMTP server</Label>
                  <Input value={server} onChange={(e) => setServer(e.target.value)} placeholder="smtp.gmail.com" />
                </div>
                <div className="space-y-1">
                  <Label>Port</Label>
                  <Input type="number" value={port} onChange={(e) => setPort(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>Username</Label>
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={config?.username_set ? '•••••••• (configured)' : ''} autoComplete="off" />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder={config?.password_set ? '•••••••• (configured)' : ''} autoComplete="new-password" />
                </div>
                <div className="space-y-1">
                  <Label>From email</Label>
                  <Input type="email" value={from} onChange={(e) => setFrom(e.target.value)} />
                </div>
                <div className="space-y-1">
                  <Label>From name</Label>
                  <Input value={fromName} onChange={(e) => setFromName(e.target.value)} />
                </div>
              </div>
              <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save SMTP settings'}</Button>
            </CardContent>
          </Card>

          <Card className="mt-6">
            <CardHeader>
              <CardTitle>Test SMTP / Send test email</CardTitle>
              <p className="text-sm text-muted-foreground">
                Validates the SMTP connection and authentication, then sends a test message using the saved platform configuration.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <Label htmlFor="test-to">Recipient email</Label>
                <Input
                  id="test-to"
                  type="email"
                  value={testTo}
                  onChange={(e) => setTestTo(e.target.value)}
                  placeholder="you@company.com"
                />
              </div>
              {testResult && (
                <div
                  className={cn(
                    'rounded-lg border p-3 text-sm',
                    testResult.ok
                      ? 'border-green-200 bg-green-50 text-green-800 dark:border-green-900 dark:bg-green-950/40 dark:text-green-300'
                      : 'border-red-200 bg-red-50 text-red-800 dark:border-red-900 dark:bg-red-950/40 dark:text-red-300'
                  )}
                >
                  {testResult.message}
                </div>
              )}
              <Button onClick={() => void sendTest()} disabled={testing || !config?.configured}>
                {testing ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                {testing ? 'Testing…' : 'Send test email'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
