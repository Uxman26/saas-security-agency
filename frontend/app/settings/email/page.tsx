'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { PasswordInput } from '@/components/ui/password-input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { EmailConfig, EmailLog } from '@/lib/types';
import { toast } from '@/lib/toast';
import { cn } from '@/lib/utils';

type Tab = 'config' | 'templates' | 'triggers' | 'test' | 'logs';

const TEMPLATE_LABELS: Record<string, string> = {
  shift_reminder: 'Shift reminder',
  invoice_sent: 'Invoice sent',
  payment_reminder: 'Payment reminder',
  appointment: 'Appointment reminder',
  alert: 'System alert',
};

const TEMPLATE_VARS: Record<string, string> = {
  shift_reminder: '{date}, {site}, {shift}',
  invoice_sent: '{invoice_id}, {amount}, {due_date}',
  payment_reminder: '{invoice_id}, {amount}',
  appointment: '{date}, {time}',
  alert: '{message}',
};

export default function EmailSettingsPage() {
  const [tab, setTab] = useState<Tab>('config');
  const [config, setConfig] = useState<EmailConfig | null>(null);
  const [logs, setLogs] = useState<EmailLog[]>([]);
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState('');
  const [testSubject, setTestSubject] = useState('Test email');
  const [testBody, setTestBody] = useState('<p>This is a test email from ControlOps.</p>');
  const [saving, setSaving] = useState(false);
  const [smtpServer, setSmtpServer] = useState('');
  const [smtpUsername, setSmtpUsername] = useState('');
  const [smtpPassword, setSmtpPassword] = useState('');
  const [savingSmtp, setSavingSmtp] = useState(false);

  const load = () => {
    api.email.config().then((c) => {
      setConfig(c);
      setTemplates(c.templates || {});
      setSmtpServer(c.mail_server || '');
      setSmtpUsername(c.mail_username || '');
      setSmtpPassword('');
    }).catch(() => {});
    api.email.logs().then(setLogs).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const saveSmtp = async () => {
    if (!smtpServer.trim() || !smtpUsername.trim()) {
      toast.warning('SMTP host and username are required');
      return;
    }
    if (!config?.password_set && !smtpPassword.trim()) {
      toast.warning('SMTP password is required');
      return;
    }
    setSavingSmtp(true);
    try {
      const updated = await api.email.updateConfig({
        mail_server: smtpServer.trim(),
        mail_username: smtpUsername.trim(),
        ...(smtpPassword.trim() ? { mail_password: smtpPassword } : {}),
      });
      setConfig(updated);
      setSmtpServer(updated.mail_server || '');
      setSmtpUsername(updated.mail_username || '');
      setSmtpPassword('');
      toast.success('SMTP settings saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSavingSmtp(false);
    }
  };

  const saveTemplates = async () => {
    setSaving(true);
    try {
      const updated = await api.email.updateConfig({ templates });
      setConfig(updated);
      setTemplates(updated.templates || {});
      toast.success('Email templates saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    try {
      await api.email.test({ to_email: testTo, subject: testSubject, body: testBody });
      toast.success('Email sent');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Email (SMTP)"
            description={
              !config?.enabled
                ? 'Email module is disabled for your account. Contact your administrator.'
                : !config?.smtp_configured
                  ? 'Configure SMTP below to start sending emails from ControlOps.'
                  : undefined
            }
          />

          <ModuleTabs
            tabs={[
              { id: 'config', label: 'Configuration' },
              { id: 'templates', label: 'Templates' },
              { id: 'triggers', label: 'Triggers' },
              { id: 'test', label: 'Test send' },
              { id: 'logs', label: 'Logs' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {tab === 'config' && (
            <div className="grid gap-4">
              <Card>
                <CardHeader><CardTitle>SMTP status</CardTitle></CardHeader>
                <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">Status</p>
                    <p className={cn('font-medium mt-1', config?.smtp_configured ? 'text-green-600' : 'text-amber-600')}>
                      {config?.smtp_configured ? 'Configured' : 'Not configured'}
                    </p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">From address</p>
                    <p className="font-medium mt-1 text-sm">{config?.mail_from || '—'}</p>
                  </div>
                  <div className="rounded-lg border p-4">
                    <p className="text-xs text-muted-foreground">From name</p>
                    <p className="font-medium mt-1 text-sm">{config?.mail_from_name || '—'}</p>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>SMTP configuration</CardTitle>
                  <p className="text-sm text-muted-foreground">
                    Enter your outgoing mail server details. Defaults show environment values until you save your own settings.
                  </p>
                </CardHeader>
                <CardContent className="space-y-4 max-w-xl">
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp_server">SMTP Host / Server</Label>
                    <Input
                      id="smtp_server"
                      value={smtpServer}
                      onChange={(e) => setSmtpServer(e.target.value)}
                      placeholder="mail.example.com"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp_username">SMTP Username</Label>
                    <Input
                      id="smtp_username"
                      value={smtpUsername}
                      onChange={(e) => setSmtpUsername(e.target.value)}
                      placeholder="noreply@example.com"
                      autoComplete="off"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="smtp_password">SMTP Password</Label>
                    <PasswordInput
                      id="smtp_password"
                      value={smtpPassword}
                      onChange={(e) => setSmtpPassword(e.target.value)}
                      placeholder={config?.password_set ? '•••••••• (leave blank to keep current)' : 'Enter password'}
                      autoComplete="new-password"
                    />
                  </div>
                  <Button
                    className="bg-[#FD6203] hover:bg-[#DF3C01] text-white"
                    onClick={() => void saveSmtp()}
                    disabled={savingSmtp || !config?.enabled}
                  >
                    {savingSmtp ? 'Saving…' : 'Save SMTP settings'}
                  </Button>
                </CardContent>
              </Card>
            </div>
          )}

          {tab === 'templates' && (
            <Card>
              <CardHeader>
                <CardTitle>Email templates</CardTitle>
                <p className="text-sm text-muted-foreground">HTML templates for automatic system emails.</p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {Object.keys(TEMPLATE_LABELS).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label>{TEMPLATE_LABELS[key]}</Label>
                    <p className="text-xs text-muted-foreground">Variables: {TEMPLATE_VARS[key]}</p>
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                      value={templates[key] ?? ''}
                      onChange={(e) => setTemplates((t) => ({ ...t, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <Button variant="outline" onClick={saveTemplates} disabled={saving}>Save templates</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'triggers' && (
            <Card>
              <CardHeader><CardTitle>Automatic triggers</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="rounded-lg border p-4">
                  <p className="font-medium text-sm">Shift reminder</p>
                  <p className="text-sm text-muted-foreground mt-1">Email to staff when a shift is created for today or tomorrow.</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium text-sm">Invoice sent</p>
                  <p className="text-sm text-muted-foreground mt-1">Email to client when an invoice is marked Sent.</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium text-sm">Payment reminder</p>
                  <p className="text-sm text-muted-foreground mt-1">Email when an invoice becomes overdue.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'test' && (
            <Card>
              <CardHeader><CardTitle>Send test email</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label>Recipient</Label>
                  <Input type="email" value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="you@company.com" />
                </div>
                <div className="space-y-1">
                  <Label>Subject</Label>
                  <Input value={testSubject} onChange={(e) => setTestSubject(e.target.value)} />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Body (HTML)</Label>
                  <textarea
                    className="flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    value={testBody}
                    onChange={(e) => setTestBody(e.target.value)}
                  />
                </div>
                <div>
                  <Button variant="outline" onClick={sendTest} disabled={!config?.smtp_configured || !config?.enabled}>Send test</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'logs' && (
            <Card>
              <CardHeader><CardTitle>Delivery logs</CardTitle></CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No emails sent yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Subject</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="text-xs">{l.recipient}</TableCell>
                          <TableCell className="text-xs max-w-[160px] truncate">{l.subject || '—'}</TableCell>
                          <TableCell className="text-xs capitalize">{l.template_key?.replace(/_/g, ' ') || '—'}</TableCell>
                          <TableCell>
                            <span className={cn('text-xs capitalize', l.status === 'sent' ? 'text-green-600' : 'text-red-600')}>{l.status}</span>
                          </TableCell>
                          <TableCell className="text-xs text-muted-foreground">{new Date(l.sent_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
