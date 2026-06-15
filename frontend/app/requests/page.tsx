'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage, ModuleTabs } from '@/components/module-layout';
import { StatusPieChart } from '@/components/charts/status-chart';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import type { StaffRequest } from '@/lib/types';
import { toast } from '@/lib/toast';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

type Tab = 'pending' | 'approved' | 'rejected' | 'all';

function statusBadge(status: string) {
  const s = status.toLowerCase();
  const cls =
    s === 'approved'
      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
      : s === 'rejected'
        ? 'bg-red-500/15 text-red-700 dark:text-red-400'
        : 'bg-amber-500/15 text-amber-800 dark:text-amber-400';
  return <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium capitalize', cls)}>{status}</span>;
}

export default function StaffRequestsReviewPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('pending');
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [allRequests, setAllRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.staffRequests
      .list(tab === 'all' ? undefined : tab)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [tab]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.staffRequests.list().then(setAllRequests).catch(() => setAllRequests([]));
  }, []);

  const chartData = useMemo(() => {
    const pending = allRequests.filter((r) => r.status === 'pending').length;
    const approved = allRequests.filter((r) => r.status === 'approved').length;
    const rejected = allRequests.filter((r) => r.status === 'rejected').length;
    return [
      { name: 'Pending', value: pending },
      { name: 'Approved', value: approved },
      { name: 'Rejected', value: rejected },
    ];
  }, [allRequests]);

  const openAction = (id: number, type: 'approve' | 'reject') => {
    setActionId(id);
    setActionType(type);
    setComment('');
  };

  const runAction = async () => {
    if (!actionId || !actionType) return;
    setActing(true);
    try {
      if (actionType === 'approve') {
        await api.staffRequests.approve(actionId, comment.trim() || undefined);
        toast.success('Request approved and added to rota');
      } else {
        await api.staffRequests.reject(actionId, comment.trim() || undefined);
        toast.success('Request rejected');
      }
      setActionId(null);
      setActionType(null);
      load();
      api.staffRequests.list().then(setAllRequests).catch(() => {});
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Action failed');
    } finally {
      setActing(false);
    }
  };

  if (!can(user, 'staff_req.review') && !can(user, 'staff_req.read')) {
    return (
      <ProtectedRoute>
        <AppShell>
          <ModulePage>
            <p className="text-center text-muted-foreground py-12">You do not have permission to view staff requests.</p>
          </ModulePage>
        </AppShell>
      </ProtectedRoute>
    );
  }

  const canReview = can(user, 'staff_req.review');

  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Staff requests"
            description={
              canReview
                ? 'Review client shift requests. Approved shifts are added to the rota under Open shifts.'
                : 'View staff request status.'
            }
          />

          {allRequests.length > 0 && (
            <div className="grid gap-4 lg:grid-cols-3">
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Total</p><p className="text-2xl font-bold">{allRequests.length}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Pending</p><p className="text-2xl font-bold text-amber-600">{chartData[0].value}</p></CardContent></Card>
              <Card><CardContent className="pt-6"><p className="text-xs text-muted-foreground">Approved</p><p className="text-2xl font-bold text-emerald-600">{chartData[1].value}</p></CardContent></Card>
              <div className="lg:col-span-3">
                <StatusPieChart data={chartData} title="Request status breakdown" />
              </div>
            </div>
          )}

          <ModuleTabs
            tabs={[
              { id: 'pending', label: 'Pending' },
              { id: 'approved', label: 'Approved' },
              { id: 'rejected', label: 'Rejected' },
              { id: 'all', label: 'All' },
            ]}
            value={tab}
            onChange={setTab}
          />

          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground gap-2">
              <Loader2 className="size-5 animate-spin" />
              Loading…
            </div>
          ) : requests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-sm text-muted-foreground">No requests found.</CardContent>
            </Card>
          ) : (
            <div className="grid gap-3 lg:grid-cols-2">
              {requests.map((r) => (
                <Card key={r.id}>
                  <CardHeader className="pb-2 flex flex-row items-start justify-between gap-2">
                    <div>
                      <CardTitle className="text-base">{r.client_name} · {r.site_name}</CardTitle>
                      <p className="text-sm text-muted-foreground mt-0.5">
                        {r.shift_date} · {r.shift_start} – {r.shift_end}
                        {r.staff_count > 1 ? ` · ${r.staff_count} staff` : ''}
                      </p>
                      <p className="text-xs text-muted-foreground mt-1">
                        Requested by {r.requested_by_name} · {new Date(r.created_at).toLocaleString('en-GB')}
                      </p>
                    </div>
                    {statusBadge(r.status)}
                  </CardHeader>
                  <CardContent className="space-y-3">
                    {r.client_notes ? <p className="text-sm text-muted-foreground">{r.client_notes}</p> : null}
                    {r.reviewer_comment ? (
                      <p className="text-sm rounded-md bg-muted/50 p-2">
                        <span className="font-medium">Remarks: </span>
                        {r.reviewer_comment}
                        {r.reviewer_name ? ` — ${r.reviewer_name}` : ''}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {r.status === 'pending' && canReview && (
                        <>
                          <Button size="sm" className="bg-emerald-600 hover:bg-emerald-700" onClick={() => openAction(r.id, 'approve')}>
                            <Check className="size-4 mr-1" />
                            Approve
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => openAction(r.id, 'reject')}>
                            <X className="size-4 mr-1" />
                            Reject
                          </Button>
                        </>
                      )}
                      {r.status === 'approved' && r.rota_plan_id ? (
                        <Button size="sm" variant="outline" asChild>
                          <Link href={`/rota/calendar?id=${r.rota_plan_id}`}>View on rota</Link>
                        </Button>
                      ) : null}
                    </div>
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </ModulePage>

        <Dialog open={!!actionId} onOpenChange={(o) => !o && setActionId(null)}>
          <DialogContent showCloseButton className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{actionType === 'approve' ? 'Approve request' : 'Reject request'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-1.5">
              <Label>Comments / remarks</Label>
              <textarea
                className="w-full min-h-[96px] rounded-md border border-input bg-background px-3 py-2 text-sm"
                placeholder={actionType === 'approve' ? 'Optional note for the client' : 'Reason for rejection'}
                value={comment}
                onChange={(e) => setComment(e.target.value)}
              />
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setActionId(null)}>Cancel</Button>
              <Button
                className={actionType === 'approve' ? 'bg-emerald-600 hover:bg-emerald-700' : ''}
                variant={actionType === 'reject' ? 'destructive' : 'default'}
                disabled={acting}
                onClick={() => void runAction()}
              >
                {acting ? <Loader2 className="size-4 animate-spin" /> : actionType === 'approve' ? 'Approve' : 'Reject'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
