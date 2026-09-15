'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { NotificationLogItem, NotificationTemplate } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminTemplatesPage() {
  const { user } = useAuth();
  const [templates, setTemplates] = useState<NotificationTemplate[]>([]);
  const [logs, setLogs] = useState<NotificationLogItem[]>([]);
  const [edit, setEdit] = useState<NotificationTemplate | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    Promise.all([api.admin.notificationTemplates(), api.admin.notificationLogs()])
      .then(([t, l]) => {
        setTemplates(t);
        setLogs(l);
      })
      .catch(() => toast.error('Failed to load templates'));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const save = async () => {
    if (!edit) return;
    setSaving(true);
    try {
      const updated = await api.admin.putNotificationTemplate(edit.key, {
        name: edit.name || undefined,
        channel: edit.channel || undefined,
        subject: edit.subject || undefined,
        body: edit.body || undefined,
        is_active: edit.is_active,
      });
      setTemplates((prev) => prev.map((t) => (t.key === updated.key ? updated : t)));
      setEdit(null);
      toast.success('Template saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex justify-between items-center">
            <h1 className="text-3xl font-bold">Notification templates</h1>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>

          <Card>
            <CardHeader><CardTitle>Templates</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Key</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Channel</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {templates.map((t) => (
                    <TableRow key={t.key}>
                      <TableCell className="font-mono text-xs">{t.key}</TableCell>
                      <TableCell>{t.name || '—'}</TableCell>
                      <TableCell className="capitalize">{t.channel || '—'}</TableCell>
                      <TableCell>{t.is_active ? 'Yes' : 'No'}</TableCell>
                      <TableCell>
                        <Button size="sm" variant="outline" onClick={() => setEdit({ ...t })}>Edit</Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Card>
            <CardHeader><CardTitle>Notification logs</CardTitle></CardHeader>
            <CardContent>
              {logs.length === 0 ? (
                <p className="text-sm text-muted-foreground">No logs.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Channel</TableHead>
                      <TableHead>Template</TableHead>
                      <TableHead>Subject</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>When</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.slice(0, 100).map((l) => (
                      <TableRow key={l.id}>
                        <TableCell className="capitalize text-sm">{l.channel || '—'}</TableCell>
                        <TableCell className="text-sm">{l.template_key || (l.user_id != null ? `#${l.user_id}` : '—')}</TableCell>
                        <TableCell className="text-sm max-w-xs truncate">{l.subject || '—'}</TableCell>
                        <TableCell className="capitalize text-sm">{l.status || '—'}</TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {l.created_at ? new Date(l.created_at).toLocaleString() : '—'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Edit {edit?.key}</DialogTitle></DialogHeader>
            {edit && (
              <div className="space-y-3">
                <div>
                  <Label>Name</Label>
                  <Input
                    className="mt-1"
                    value={edit.name || ''}
                    onChange={(e) => setEdit({ ...edit, name: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Channel</Label>
                  <Input
                    className="mt-1"
                    value={edit.channel || ''}
                    onChange={(e) => setEdit({ ...edit, channel: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Subject</Label>
                  <Input
                    className="mt-1"
                    value={edit.subject || ''}
                    onChange={(e) => setEdit({ ...edit, subject: e.target.value })}
                  />
                </div>
                <div>
                  <Label>Body</Label>
                  <Textarea
                    className="mt-1"
                    rows={6}
                    value={edit.body || ''}
                    onChange={(e) => setEdit({ ...edit, body: e.target.value })}
                  />
                </div>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!edit.is_active}
                    onChange={(e) => setEdit({ ...edit, is_active: e.target.checked })}
                    className="rounded border"
                  />
                  Active
                </label>
                <Button disabled={saving} onClick={() => void save()}>
                  {saving ? 'Saving...' : 'Save'}
                </Button>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
