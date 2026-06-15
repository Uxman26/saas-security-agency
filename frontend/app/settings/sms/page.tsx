'use client';

import { useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { SmsConfig, SmsLog } from '@/lib/types';
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

export default function SmsSettingsPage() {
  const [tab, setTab] = useState<Tab>('config');
  const [config, setConfig] = useState<SmsConfig | null>(null);
  const [logs, setLogs] = useState<SmsLog[]>([]);
  const [sid, setSid] = useState('');
  const [token, setToken] = useState('');
  const [phone, setPhone] = useState('');
  const [templates, setTemplates] = useState<Record<string, string>>({});
  const [testTo, setTestTo] = useState('');
  const [testBody, setTestBody] = useState('Test message from SecureForce Manager');
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.sms.config().then((c) => {
      setConfig(c);
      setPhone(c.phone_number || '');
      setTemplates(c.templates || {});
    }).catch(() => {});
    api.sms.logs().then(setLogs).catch(() => {});
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const updated = await api.sms.updateConfig({
        twilio_account_sid: sid || undefined,
        twilio_auth_token: token || undefined,
        twilio_phone_number: phone || undefined,
        templates,
      });
      setConfig(updated);
      setTemplates(updated.templates || {});
      setSid('');
      setToken('');
      toast.success('SMS configuration saved');
    } catch {
      toast.error('Save failed');
    } finally {
      setSaving(false);
    }
  };

  const sendTest = async () => {
    try {
      await api.sms.send(testTo, testBody, 'alert');
      toast.success('SMS sent');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div>
            <h1 className="text-2xl font-bold">SMS (Twilio)</h1>
            {!config?.enabled && (
              <p className="text-sm text-amber-600 mt-1">SMS module is disabled for your account. Contact your administrator.</p>
            )}
          </div>

          <div className="flex flex-wrap gap-1 border-b">
            {([
              ['config', 'Configuration'],
              ['templates', 'Templates'],
              ['triggers', 'Triggers'],
              ['test', 'Test send'],
              ['logs', 'Logs'],
            ] as const).map(([id, label]) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={cn(
                  'px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
                  tab === id ? 'border-primary text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'
                )}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === 'config' && (
            <Card>
              <CardHeader><CardTitle>Twilio configuration</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                <div>
                  <Label>Twilio Account SID</Label>
                  <Input value={sid} onChange={(e) => setSid(e.target.value)} placeholder={config?.account_sid_set ? '•••••••• (configured)' : 'AC...'} className="mt-1" />
                </div>
                <div>
                  <Label>Auth Token</Label>
                  <Input type="password" value={token} onChange={(e) => setToken(e.target.value)} placeholder={config?.auth_token_set ? '•••••••• (configured)' : ''} className="mt-1" />
                </div>
                <div>
                  <Label>Twilio phone number</Label>
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+44..." className="mt-1" />
                </div>
                <div className="sm:col-span-2 lg:col-span-3">
                  <Button onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save configuration'}</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'templates' && (
            <Card>
              <CardHeader>
                <CardTitle>Message templates</CardTitle>
                <p className="text-sm text-muted-foreground">Used for shift reminders, invoice notifications, and payment reminders.</p>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2">
                {Object.keys(TEMPLATE_LABELS).map((key) => (
                  <div key={key} className="space-y-1">
                    <Label>{TEMPLATE_LABELS[key]}</Label>
                    <p className="text-xs text-muted-foreground">Variables: {TEMPLATE_VARS[key]}</p>
                    <textarea
                      className="flex min-h-[72px] w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                      value={templates[key] ?? ''}
                      onChange={(e) => setTemplates((t) => ({ ...t, [key]: e.target.value }))}
                    />
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <Button variant="outline" onClick={save} disabled={saving}>Save templates</Button>
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
                  <p className="text-sm text-muted-foreground mt-1">Sent when a shift is created for today or tomorrow.</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium text-sm">Invoice sent</p>
                  <p className="text-sm text-muted-foreground mt-1">Sent when an invoice status changes to Sent.</p>
                </div>
                <div className="rounded-lg border p-4">
                  <p className="font-medium text-sm">Payment reminder</p>
                  <p className="text-sm text-muted-foreground mt-1">Sent when an invoice becomes overdue.</p>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'test' && (
            <Card>
              <CardHeader><CardTitle>Send test SMS</CardTitle></CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-2 max-w-2xl">
                <div className="space-y-1">
                  <Label>Recipient</Label>
                  <Input value={testTo} onChange={(e) => setTestTo(e.target.value)} placeholder="+44..." />
                </div>
                <div className="space-y-1 sm:col-span-2">
                  <Label>Message</Label>
                  <Input value={testBody} onChange={(e) => setTestBody(e.target.value)} />
                </div>
                <div>
                  <Button variant="outline" onClick={sendTest}>Send test</Button>
                </div>
              </CardContent>
            </Card>
          )}

          {tab === 'logs' && (
            <Card>
              <CardHeader><CardTitle>Delivery logs</CardTitle></CardHeader>
              <CardContent>
                {logs.length === 0 ? (
                  <p className="text-muted-foreground text-sm">No SMS sent yet.</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Recipient</TableHead>
                        <TableHead>Template</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Sent</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {logs.map((l) => (
                        <TableRow key={l.id}>
                          <TableCell className="font-mono text-xs">{l.recipient}</TableCell>
                          <TableCell className="text-xs capitalize">{l.template_key?.replace(/_/g, ' ') || '—'}</TableCell>
                          <TableCell>
                            <span className={cn('text-xs capitalize', l.status === 'sent' ? 'text-green-600' : 'text-red-600')}>{l.status}</span>
                          </TableCell>
                          <TableCell className="text-xs">{new Date(l.sent_at).toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
