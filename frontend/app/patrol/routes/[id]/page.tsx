'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { InlineDetailSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import { TEXT_LIMITS } from '@/lib/text-limits';
import type { PatrolRoute } from '@/lib/types';
import { toast } from '@/lib/toast';
import { ArrowLeft, Download, Plus, QrCode } from 'lucide-react';

export default function PatrolRouteDetailPage() {
  const params = useParams();
  const routeId = Number(params.id);
  const [route, setRoute] = useState<PatrolRoute | null>(null);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: '',
    floor: '',
    description: '',
    latitude: '',
    longitude: '',
    radius_m: '20',
    sort_order: '0',
  });

  const load = useCallback(async () => {
    if (!routeId) return;
    try {
      setRoute(await api.patrol.getRoute(routeId));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to load route');
    }
  }, [routeId]);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    if (!form.name.trim() || !form.latitude || !form.longitude) {
      toast.warning('Name, latitude and longitude are required');
      return;
    }
    try {
      await api.patrol.createCheckpoint({
        route_id: routeId,
        name: form.name.trim(),
        floor: form.floor || null,
        description: form.description || null,
        latitude: Number(form.latitude),
        longitude: Number(form.longitude),
        radius_m: Number(form.radius_m) || 20,
        sort_order: Number(form.sort_order) || 0,
      });
      toast.success('Checkpoint created');
      setOpen(false);
      setForm({ name: '', floor: '', description: '', latitude: '', longitude: '', radius_m: '20', sort_order: '0' });
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    }
  };

  const downloadQr = async (checkpointId: number, kind: 'png' | 'pdf') => {
    try {
      const blob = await api.patrol.downloadQr(checkpointId, kind);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checkpoint-${checkpointId}-qr.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Download failed');
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          {!route ? (
            <InlineDetailSkeleton />
          ) : (
            <>
          <ModuleHeader
            title={
              <span className="flex items-center gap-2">
                <QrCode className="size-7 text-primary" />
                {route.name}
              </span>
            }
            description={`${route.site_name || 'Site'} · ${route.start_time}–${route.end_time} · every ${route.frequency_minutes} mins`}
            actions={
              <div className="flex gap-2">
                <Button variant="outline" asChild>
                  <Link href="/patrol">
                    <ArrowLeft className="size-4 mr-1" />
                    Back
                  </Link>
                </Button>
                <Button onClick={() => setOpen(true)}>
                  <Plus className="size-4 mr-1" />
                  Add checkpoint
                </Button>
              </div>
            }
          />

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Checkpoints</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Code</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Floor</TableHead>
                    <TableHead>GPS</TableHead>
                    <TableHead>Radius</TableHead>
                    <TableHead>QR</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(route.checkpoints || []).map((cp) => (
                    <TableRow key={cp.id}>
                      <TableCell className="font-mono text-xs">{cp.code}</TableCell>
                      <TableCell className="font-medium">{cp.name}</TableCell>
                      <TableCell>{cp.floor || '—'}</TableCell>
                      <TableCell className="text-xs tabular-nums">
                        {cp.latitude.toFixed(5)}, {cp.longitude.toFixed(5)}
                      </TableCell>
                      <TableCell>{cp.radius_m}m</TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" onClick={() => downloadQr(cp.id, 'png')}>
                            <Download className="size-3 mr-1" />
                            PNG
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => downloadQr(cp.id, 'pdf')}>
                            PDF
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!route.checkpoints?.length ? (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                        No checkpoints yet. Add one with GPS coordinates for scan validation.
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
                <DialogTitle>Add checkpoint</DialogTitle>
              </DialogHeader>
              <div className="grid gap-3">
                <div className="space-y-1">
                  <Label>Name</Label>
                  <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Main entrance" />
                </div>
                <div className="grid grid-cols-2 gap-2">
                  <div className="space-y-1">
                    <Label>Floor</Label>
                    <Input value={form.floor} onChange={(e) => setForm((f) => ({ ...f, floor: e.target.value }))} />
                  </div>
                  <div className="space-y-1">
                    <Label>Sort order</Label>
                    <Input value={form.sort_order} onChange={(e) => setForm((f) => ({ ...f, sort_order: e.target.value }))} />
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <div className="space-y-1">
                    <Label>Latitude</Label>
                    <Input value={form.latitude} onChange={(e) => setForm((f) => ({ ...f, latitude: e.target.value }))} placeholder="51.5074" />
                  </div>
                  <div className="space-y-1">
                    <Label>Longitude</Label>
                    <Input value={form.longitude} onChange={(e) => setForm((f) => ({ ...f, longitude: e.target.value }))} placeholder="-0.1278" />
                  </div>
                  <div className="space-y-1">
                    <Label>Radius (m)</Label>
                    <Input value={form.radius_m} onChange={(e) => setForm((f) => ({ ...f, radius_m: e.target.value }))} />
                  </div>
                </div>
                <div className="space-y-1">
                  <Label>Description</Label>
                  <Input
                    maxLength={TEXT_LIMITS.note}
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setOpen(false)}>
                  Cancel
                </Button>
                <Button onClick={create}>
                  Create
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
            </>
          )}
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
