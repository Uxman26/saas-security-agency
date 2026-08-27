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
import { api } from '@/lib/api';
import type { SmtpConfig } from '@/lib/types';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

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

  const load = useCallback(() => {
    api.admin.smtp().then((c) => {
      setConfig(c);
      setServer(c.mail_server);
      setPort(String(c.mail_port));
      setFrom(c.mail_from);
      setFromName(c.mail_from_name);
    }).catch(() => toast.error('Failed to load SMTP settings'));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const save = async () => {
    setSaving(true);
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
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
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
                Used for system emails: password resets, invoice notifications, shift reminders, and tenant manual sends.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              {config && (
                <div className={cn('rounded-lg border p-3 text-sm', config.configured ? 'border-green-200 bg-green-50 text-green-800' : 'border-amber-200 bg-amber-50 text-amber-800')}>
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
                  <Input value={username} onChange={(e) => setUsername(e.target.value)} placeholder={config?.username_set ? '•••••••• (configured)' : ''} />
                </div>
                <div className="space-y-1">
                  <Label>Password</Label>
                  <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} placeholder={config?.password_set ? '•••••••• (configured)' : ''} />
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
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
