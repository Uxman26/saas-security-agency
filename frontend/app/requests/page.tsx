'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/auth-context';
import { can } from '@/lib/permissions';
import type { StaffRequest } from '@/lib/types';
import { toast } from '@/lib/toast';
import { Check, Loader2, X } from 'lucide-react';
import { cn } from '@/lib/utils';

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
  const [requests, setRequests] = useState<StaffRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<string>('pending');
  const [actionId, setActionId] = useState<number | null>(null);
  const [actionType, setActionType] = useState<'approve' | 'reject' | null>(null);
  const [comment, setComment] = useState('');
  const [acting, setActing] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    api.staffRequests
      .list(filter === 'all' ? undefined : filter)
      .then(setRequests)
      .catch(() => setRequests([]))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

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
          <div className="container mx-auto px-4 py-12 text-center text-muted-foreground">
            You do not have permission to view staff requests.
          </div>
        </AppShell>
      </ProtectedRoute>
    );
  }

  const canReview = can(user, 'staff_req.review');

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-4xl space-y-6">
          <div>
            <h1 className="text-2xl font-bold">Staff requests</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {canReview
                ? 'Review client shift requests. Approved shifts are added to the rota under Open shifts.'
                : 'View staff request status.'}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 items-center">
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" className="z-[200]">
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="approved">Approved</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
                <SelectItem value="all">All</SelectItem>
              </SelectContent>
            </Select>
          </div>

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
            <div className="space-y-3">
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
        </div>

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
              <Button variant="outline" onClick={() => setActionId(null)}>
                Cancel
              </Button>
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
