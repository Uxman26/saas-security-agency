'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { api } from '@/lib/api';
import type { Incident, Site } from '@/lib/types';
import { toast } from '@/lib/toast';
import { openAuthFile } from '@/lib/use-auth-blob-url';
import { AlertTriangle, BarChart3, Plus } from 'lucide-react';

/** Attachments are served from an authenticated endpoint, so a plain link cannot load them. */
async function openAttachment(url: string) {
  if (!(await openAuthFile(url))) toast.error('Could not open attachment');
}

export default function IncidentsPage() {
  const [items, setItems] = useState<Incident[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState<Incident | null>(null);
  const [form, setForm] = useState({ notes: '', site_id: '', latitude: '', longitude: '' });

  const load = useCallback(async () => {
    try {
      const [list, s] = await Promise.all([
        api.incidents.list(statusFilter === 'all' ? undefined : { status: statusFilter }),
        api.sites.list(),
      ]);
      setItems(list);
      setSites(s);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load incidents');
    }
  }, [statusFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.notes.trim()) {
      toast.warning('Notes are required');
      return;
    }
    try {
      await api.incidents.create({
        notes: form.notes.trim(),
        site_id: form.site_id ? Number(form.site_id) : undefined,
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
      });
      toast.success('Incident raised');
      setOpen(false);
      setForm({ notes: '', site_id: '', latitude: '', longitude: '' });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const setStatus = async (id: number, status: string) => {
    try {
      await api.incidents.update(id, { status });
      toast.success('Status updated');
      setDetail(null);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Update failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <AlertTriangle className="size-7 text-primary" />
                Incidents
              </span>
            }
            description="Raise, review, and close incident reports."
            actions={
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/incidents/reports">
                    <BarChart3 className="size-4 mr-1" />
                    Summary
                  </Link>
                </Button>
                <Button className="bg-pink-600 hover:bg-pink-700" onClick={() => setOpen(true)}>
                  <Plus className="size-4 mr-1" />
                  Raise incident
                </Button>
              </div>
            }
          />

          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-2">
              <CardTitle className="text-base">All incidents</CardTitle>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="reviewing">Reviewing</SelectItem>
                  <SelectItem value="closed">Closed</SelectItem>
                </SelectContent>
              </Select>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>When</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Reporter</TableHead>
                    <TableHead>Notes</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((inc) => (
                    <TableRow key={inc.id}>
                      <TableCell className="text-xs tabular-nums whitespace-nowrap">
                        {new Date(inc.occurred_at).toLocaleString()}
                      </TableCell>
                      <TableCell>{inc.site_name || '—'}</TableCell>
                      <TableCell>{inc.reported_by_name || inc.reported_by_user_id}</TableCell>
                      <TableCell className="max-w-xs truncate">{inc.notes}</TableCell>
                      <TableCell className="capitalize text-xs">{inc.status}</TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={async () => {
                            try {
                              setDetail(await api.incidents.get(inc.id));
                            } catch (e) {
                              toast.error(e instanceof Error ? e.message : 'Load failed');
                            }
                          }}
                        >
                          View
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No incidents found.
                      </TableCell>
                    </TableRow>
                  ) : null}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          <Dialog open={open} onOpenChange={setOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Raise incident</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Notes</Label>
                  <Textarea rows={4} value={form.notes} onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))} />
                </div>
                <div className="space-y-1">
                  <Label>Site (optional)</Label>
                  <Select value={form.site_id || undefined} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v }))}>
                    <SelectTrigger>
                      <SelectValue placeholder="Select site" />
                    </SelectTrigger>
                    <SelectContent>
                      {sites.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button className="bg-pink-600 hover:bg-pink-700" onClick={create}>
                  Submit
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>Incident #{detail?.id}</DialogTitle>
              </DialogHeader>
              {detail ? (
                <div className="space-y-3 text-sm">
                  <p>
                    <span className="text-muted-foreground">Status:</span>{' '}
                    <span className="capitalize font-medium">{detail.status}</span>
                  </p>
                  <p>
                    <span className="text-muted-foreground">Occurred:</span>{' '}
                    {new Date(detail.occurred_at).toLocaleString()}
                  </p>
                  <p>
                    <span className="text-muted-foreground">Site:</span> {detail.site_name || '—'}
                  </p>
                  <p className="whitespace-pre-wrap border rounded-md p-3 bg-muted/30">{detail.notes}</p>
                  {(detail.attachments || []).length > 0 ? (
                    <div className="space-y-1">
                      <p className="text-muted-foreground">Attachments</p>
                      <ul className="list-disc pl-5">
                        {detail.attachments!.map((a) => (
                          <li key={a.id}>
                            {a.url ? (
                              <button
                                type="button"
                                onClick={() => void openAttachment(a.url!)}
                                className="text-primary underline"
                              >
                                View file
                              </button>
                            ) : (
                              a.file_path
                            )}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                  <div className="flex flex-wrap gap-2 pt-2">
                    {detail.status !== 'reviewing' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(detail.id, 'reviewing')}>
                        Mark reviewing
                      </Button>
                    ) : null}
                    {detail.status !== 'closed' ? (
                      <Button size="sm" className="bg-pink-600 hover:bg-pink-700" onClick={() => setStatus(detail.id, 'closed')}>
                        Close
                      </Button>
                    ) : null}
                    {detail.status === 'closed' ? (
                      <Button size="sm" variant="outline" onClick={() => setStatus(detail.id, 'open')}>
                        Reopen
                      </Button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </DialogContent>
          </Dialog>
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
