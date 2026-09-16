'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { WebhookLogItem } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminWebhooksPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<WebhookLogItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .webhooks()
      .then((data) => setRows(data))
      .catch(() => toast.error('Failed to load webhooks'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <div>
              <h1 className="text-3xl font-bold">Webhooks</h1>
              <p className="text-sm text-muted-foreground mt-1">Inbound Stripe and platform webhook events</p>
            </div>
            <Button variant="outline" size="sm" onClick={load}>
              Refresh
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Recent events</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <p className="text-muted-foreground">Loading...</p>
              ) : rows.length === 0 ? (
                <p className="text-sm text-muted-foreground">No webhook events logged yet.</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Provider</TableHead>
                      <TableHead>Event</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>HTTP</TableHead>
                      <TableHead>Error</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rows.map((r) => (
                      <TableRow key={r.id}>
                        <TableCell>{r.id}</TableCell>
                        <TableCell>{r.provider || '—'}</TableCell>
                        <TableCell className="font-mono text-xs">{r.event_type || '—'}</TableCell>
                        <TableCell className="capitalize">{r.status || '—'}</TableCell>
                        <TableCell>{r.http_status ?? '—'}</TableCell>
                        <TableCell className="max-w-xs truncate text-sm text-destructive">
                          {r.error_message || '—'}
                        </TableCell>
                        <TableCell className="text-sm whitespace-nowrap">
                          {r.created_at ? new Date(r.created_at).toLocaleString() : '—'}
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
