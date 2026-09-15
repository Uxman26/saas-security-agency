'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { CompanyTrialsResponse, TenantSupportView, TrialPeriod } from '@/lib/types';
import { TOKEN_KEY } from '@/lib/session-sync';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { PasswordInput } from '@/components/ui/password-input';
import { passwordFieldSchema, PASSWORD_REQUIREMENTS_MSG } from '@/lib/validation';

const ADMIN_TOKEN_BACKUP = 'admin_token_backup';

export default function AdminCompanySupportPage() {
  const { user, refreshUser } = useAuth();
  const params = useParams();
  const router = useRouter();
  const id = Number(params.id);
  const [view, setView] = useState<TenantSupportView | null>(null);
  const [loading, setLoading] = useState(true);
  const [reasonOpen, setReasonOpen] = useState<'temp' | 'impersonate' | 'status' | null>(null);
  const [pendingStatus, setPendingStatus] = useState('');
  const [reason, setReason] = useState('');
  const [impersonateTarget, setImpersonateTarget] = useState<{ id: number; name?: string; email?: string } | null>(null);
  const [confirmImpersonate, setConfirmImpersonate] = useState<{
    access_token: string;
    target_name?: string;
    target_email: string;
  } | null>(null);
  const [busy, setBusy] = useState(false);
  const [gdprOpen, setGdprOpen] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [hardDelete, setHardDelete] = useState(false);
  const [trialInfo, setTrialInfo] = useState<CompanyTrialsResponse | null>(null);
  const [startTrialOpen, setStartTrialOpen] = useState(false);
  const [startDays, setStartDays] = useState('14');
  const [startNotes, setStartNotes] = useState('');
  const [startForce, setStartForce] = useState(false);
  const [extendOpen, setExtendOpen] = useState(false);
  const [extensionDays, setExtensionDays] = useState('7');
  const [extendReason, setExtendReason] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<TrialPeriod[]>([]);
  const [pwUser, setPwUser] = useState<{ id: number; email: string; name?: string } | null>(null);
  const [pwValue, setPwValue] = useState('');
  const { can } = usePlatformPermissions();

  const load = useCallback(() => {
    if (!id) return;
    setLoading(true);
    Promise.all([
      api.admin.companySupportView(id),
      api.admin.companyTrials(id).catch(() => null),
    ])
      .then(([v, trials]) => {
        setView(v);
        setTrialInfo(trials);
      })
      .catch(() => toast.error('Failed to load support view'))
      .finally(() => setLoading(false));
  }, [id]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const setStatus = async (status: string, statusReason?: string) => {
    setBusy(true);
    try {
      await api.admin.setAccountStatus(id, { status, reason: statusReason });
      toast.success(`Account ${status}`);
      setReasonOpen(null);
      setReason('');
      load();
      return true;
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Status update failed');
      return false;
    } finally {
      setBusy(false);
    }
  };

  const openStatus = (status: string) => {
    if (status === 'locked' || status === 'suspended' || status === 'deactivated') {
      setPendingStatus(status);
      setReason('');
      setReasonOpen('status');
      return;
    }
    void setStatus(status);
  };

  const runTempAccess = async () => {
    if (reason.trim().length < 5) {
      toast.error('Reason required (min 5 chars)');
      return;
    }
    setBusy(true);
    try {
      await api.admin.grantTempAccess(id, reason.trim());
      toast.success('Temporary access granted');
      setReasonOpen(null);
      setReason('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Temp access failed');
    } finally {
      setBusy(false);
    }
  };

  const sendUserResetEmail = async (userId: number) => {
    setBusy(true);
    try {
      const res = await api.admin.sendResetEmail(userId);
      toast.success(`Reset email sent to ${res.email}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Failed to send reset email');
    } finally {
      setBusy(false);
    }
  };

  const saveUserPassword = async () => {
    if (!pwUser) return;
    const parsed = passwordFieldSchema.safeParse(pwValue);
    if (!parsed.success) {
      toast.error(parsed.error.issues[0]?.message ?? PASSWORD_REQUIREMENTS_MSG);
      return;
    }
    setBusy(true);
    try {
      await api.admin.setTenantPassword(pwUser.id, pwValue);
      toast.success(`Password reset for ${pwUser.email}`);
      setPwUser(null);
      setPwValue('');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Password reset failed');
    } finally {
      setBusy(false);
    }
  };

  const startImpersonate = async () => {
    if (!impersonateTarget || reason.trim().length < 5) {
      toast.error('Reason required (min 5 chars)');
      return;
    }
    setBusy(true);
    try {
      const res = await api.admin.impersonate({
        user_id: impersonateTarget.id,
        reason: reason.trim(),
        mode: 'support',
      });
      setReasonOpen(null);
      setReason('');
      setConfirmImpersonate({
        access_token: res.access_token,
        target_name: res.target_name,
        target_email: res.target_email,
      });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Impersonation failed');
    } finally {
      setBusy(false);
    }
  };

  const acceptImpersonate = async () => {
    if (!confirmImpersonate) return;
    const current = localStorage.getItem(TOKEN_KEY);
    if (current) localStorage.setItem(ADMIN_TOKEN_BACKUP, current);
    localStorage.setItem(TOKEN_KEY, confirmImpersonate.access_token.trim());
    setConfirmImpersonate(null);
    try {
      await refreshUser();
    } catch {
      /* me() will load on redirect */
    }
    router.push('/dashboard');
  };

  const downloadExport = async (format: 'json' | 'csv') => {
    setBusy(true);
    try {
      const data = await api.admin.exportCompany(id, format);
      if (format === 'csv') {
        const blob = data as Blob;
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tenant-${id}.csv`;
        a.click();
        URL.revokeObjectURL(url);
      } else {
        const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tenant-${id}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
      toast.success(`Exported ${format.toUpperCase()}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Export failed');
    } finally {
      setBusy(false);
    }
  };

  const runGdprDelete = async () => {
    if (!view || confirmName.trim() !== view.name) {
      toast.error('Type the exact company name to confirm');
      return;
    }
    setBusy(true);
    try {
      await api.admin.gdprDelete(id, { confirm_name: confirmName.trim(), hard_delete: hardDelete });
      toast.success(hardDelete ? 'Tenant hard-deleted' : 'Tenant anonymized');
      setGdprOpen(false);
      setConfirmName('');
      setHardDelete(false);
      if (hardDelete) router.push('/admin/companies');
      else load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'GDPR delete failed');
    } finally {
      setBusy(false);
    }
  };

  const primary = view?.primary_contact as { id?: number; email?: string; full_name?: string; is_active?: boolean } | null | undefined;
  const admins = (view?.administrators || []) as { id: number; email: string; full_name?: string; role?: string; is_active?: boolean }[];
  const tickets = view?.support_tickets || [];
  const logins = (view?.login_history || []) as { id: number; email?: string; login_at?: string; ip_address?: string; status?: string }[];
  const errors = (view?.recent_errors || []) as { id: number; severity?: string; message?: string; status?: string; last_seen_at?: string; occurrence_count?: number }[];
  const security = (view?.security_events || []) as { id: number; event_type?: string; severity?: string; message?: string; created_at?: string }[];
  const currentTrial = trialInfo?.current || view?.trial;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap justify-between items-start gap-3">
            <div>
              <Link href="/admin/companies" className="text-sm text-muted-foreground hover:underline">← Companies</Link>
              <h1 className="text-3xl font-bold mt-1">{loading ? 'Loading...' : view?.name ?? 'Tenant'}</h1>
              {view && (
                <p className="text-muted-foreground mt-1 capitalize">
                  {view.account_status || 'active'} · {view.subscription_tier || '—'} · {view.subscription_status || '—'}
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
          </div>

          {view && (
            <>
              <Card>
                <CardHeader><CardTitle>Actions</CardTitle></CardHeader>
                <CardContent className="flex flex-wrap gap-2">
                  <Button size="sm" variant="destructive" disabled={busy} onClick={() => openStatus('locked')}>Lock</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => openStatus('active')}>Unlock</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => openStatus('suspended')}>Suspend</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => openStatus('deactivated')}>Deactivate</Button>
                  <Button size="sm" disabled={busy} onClick={() => { setReason(''); setReasonOpen('temp'); }}>Temp access</Button>
                  {primary?.id && (
                    <Button
                      size="sm"
                      disabled={busy}
                      onClick={() => {
                        setImpersonateTarget({ id: primary.id!, name: primary.full_name, email: primary.email });
                        setReason('');
                        setReasonOpen('impersonate');
                      }}
                    >
                      Impersonate primary admin
                    </Button>
                  )}
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void downloadExport('json')}>Export JSON</Button>
                  <Button size="sm" variant="outline" disabled={busy} onClick={() => void downloadExport('csv')}>Export CSV</Button>
                  <Button size="sm" variant="outline" asChild>
                    <Link href="/admin/refunds">Refunds</Link>
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={busy}
                    onClick={() => {
                      setConfirmName('');
                      setHardDelete(false);
                      setGdprOpen(true);
                    }}
                  >
                    GDPR delete
                  </Button>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Company</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p><span className="text-muted-foreground">Email:</span> {view.email || '—'}</p>
                    <p><span className="text-muted-foreground">Phone:</span> {view.phone || '—'}</p>
                    <p><span className="text-muted-foreground">Address:</span> {[view.address, view.postcode].filter(Boolean).join(', ') || '—'}</p>
                    <p><span className="text-muted-foreground">Website:</span> {view.website || '—'}</p>
                    <p><span className="text-muted-foreground">Locked reason:</span> {view.locked_reason || '—'}</p>
                    {view.locked_at && <p><span className="text-muted-foreground">Locked at:</span> {new Date(String(view.locked_at)).toLocaleString()}</p>}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Primary contact</CardTitle></CardHeader>
                  <CardContent className="text-sm space-y-1">
                    <p className="font-medium">{primary?.full_name || '—'}</p>
                    <p>{primary?.email || '—'}</p>
                    <p className={primary?.is_active ? 'text-green-600' : 'text-red-600'}>
                      {primary?.is_active ? 'Active' : 'Inactive'}
                    </p>
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Administrators</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead>Role</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {admins.map((a) => (
                        <TableRow key={a.id}>
                          <TableCell>{a.full_name}</TableCell>
                          <TableCell>{a.email}</TableCell>
                          <TableCell className="capitalize">{a.role}</TableCell>
                          <TableCell>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={() => {
                                setImpersonateTarget({ id: a.id, name: a.full_name, email: a.email });
                                setReason('');
                                setReasonOpen('impersonate');
                              }}
                            >
                              Impersonate
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Tenant users & password reset</CardTitle>
                </CardHeader>
                <CardContent>
                  {(view.users || []).length === 0 ? (
                    <p className="text-sm text-muted-foreground">No users found.</p>
                  ) : (
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Name</TableHead>
                          <TableHead>Email</TableHead>
                          <TableHead>Role</TableHead>
                          <TableHead>Status</TableHead>
                          <TableHead />
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {(view.users || []).map((u) => {
                          const row = u as {
                            id: number;
                            full_name?: string;
                            email?: string;
                            role?: string;
                            is_active?: boolean;
                            must_reset_password?: boolean;
                          };
                          return (
                            <TableRow key={row.id}>
                              <TableCell>{row.full_name || '—'}</TableCell>
                              <TableCell>{row.email || '—'}</TableCell>
                              <TableCell className="capitalize">{row.role || '—'}</TableCell>
                              <TableCell className="text-xs">
                                {!row.is_active
                                  ? 'Inactive'
                                  : row.must_reset_password
                                    ? 'Reset required'
                                    : 'Active'}
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-wrap gap-2 justify-end">
                                  {can('security.write', 'tenants.write', 'support.write') && (
                                    <Button
                                      size="sm"
                                      variant="outline"
                                      disabled={busy}
                                      onClick={() => void sendUserResetEmail(row.id)}
                                    >
                                      Send reset email
                                    </Button>
                                  )}
                                  {can('security.write', 'tenants.write') && (
                                    <Button
                                      size="sm"
                                      variant="destructive"
                                      disabled={busy}
                                      onClick={() => {
                                        setPwUser({
                                          id: row.id,
                                          email: row.email || '',
                                          name: row.full_name,
                                        });
                                        setPwValue('');
                                      }}
                                    >
                                      Set password
                                    </Button>
                                  )}
                                </div>
                              </TableCell>
                            </TableRow>
                          );
                        })}
                      </TableBody>
                    </Table>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>Subscription</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="text-sm grid sm:grid-cols-2 gap-2">
                    <p><span className="text-muted-foreground">Tier:</span> <span className="capitalize">{view.subscription_tier || '—'}</span></p>
                    <p><span className="text-muted-foreground">Status:</span> <span className="capitalize">{view.subscription_status || '—'}</span></p>
                    <p><span className="text-muted-foreground">Billing:</span> <span className="capitalize">{view.billing_cycle || '—'}</span></p>
                    <p><span className="text-muted-foreground">Ends:</span> {view.subscription_end ? new Date(view.subscription_end).toLocaleDateString() : '—'}</p>
                    <p><span className="text-muted-foreground">Users:</span> {view.user_count ?? 0}{view.max_users != null ? ` / ${view.max_users}` : ''}</p>
                  </div>
                  {currentTrial && (
                      <div className="rounded-md border p-3 text-sm space-y-1">
                        <p className="font-medium">{currentTrial.label || 'Trial'}</p>
                        {currentTrial.trial_active && (
                          <>
                            <p>
                              <span className="text-muted-foreground">Days remaining:</span>{' '}
                              {currentTrial.days_remaining ?? '—'}
                            </p>
                            <p>
                              <span className="text-muted-foreground">Ends on:</span>{' '}
                              {currentTrial.trial_ends_on
                                ? new Date(currentTrial.trial_ends_on).toLocaleDateString()
                                : '—'}
                            </p>
                          </>
                        )}
                        {currentTrial.trial_expired && (
                          <p className="text-muted-foreground">Trial expired — subscription required</p>
                        )}
                      </div>
                  )}
                  <div className="flex flex-wrap gap-2">
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy}
                      onClick={() => {
                        setStartDays('14');
                        setStartNotes('');
                        setStartForce(false);
                        setStartTrialOpen(true);
                      }}
                    >
                      Start Trial
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={busy || !trialInfo?.current?.trial_id}
                      onClick={() => {
                        setExtensionDays('7');
                        setExtendReason('');
                        setExtendOpen(true);
                      }}
                    >
                      Extend Trial
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={busy}
                      onClick={() => {
                        setHistoryRows(trialInfo?.history || []);
                        setHistoryOpen(true);
                      }}
                    >
                      View Trial History
                    </Button>
                  </div>
                  {trialInfo && !trialInfo.eligible_for_new_trial && !trialInfo.current?.trial_active && (
                    <p className="text-xs text-muted-foreground">{trialInfo.eligibility_reason}</p>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader><CardTitle>Tickets</CardTitle></CardHeader>
                <CardContent>
                  {tickets.length === 0 ? (
                    <p className="text-sm text-muted-foreground">No tickets.</p>
                  ) : (
                    <ul className="space-y-2 text-sm">
                      {tickets.map((t) => (
                        <li key={t.id}>
                          <Link href={`/admin/tickets/${t.id}`} className="text-primary hover:underline">
                            {t.ticket_number} — {t.subject}
                          </Link>
                          <span className="text-muted-foreground capitalize"> · {t.status}</span>
                        </li>
                      ))}
                    </ul>
                  )}
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>Recent logins</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm max-h-64 overflow-y-auto">
                    {logins.length === 0 ? (
                      <p className="text-muted-foreground">No logins.</p>
                    ) : (
                      logins.map((l) => (
                        <div key={l.id} className="border-b pb-2 last:border-0">
                          <p className="font-medium">{l.email}</p>
                          <p className="text-xs text-muted-foreground">
                            {l.login_at ? new Date(l.login_at).toLocaleString() : '—'} · {l.ip_address || '—'} · {l.status}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>Recent errors</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm max-h-64 overflow-y-auto">
                    {errors.length === 0 ? (
                      <p className="text-muted-foreground">No errors.</p>
                    ) : (
                      errors.map((e) => (
                        <div key={e.id} className="border-b pb-2 last:border-0">
                          <p className="line-clamp-2">{e.message}</p>
                          <p className="text-xs text-muted-foreground capitalize">
                            {e.severity} · {e.status} · ×{e.occurrence_count ?? 1}
                          </p>
                        </div>
                      ))
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Security events</CardTitle></CardHeader>
                <CardContent className="space-y-2 text-sm max-h-64 overflow-y-auto">
                  {security.length === 0 ? (
                    <p className="text-muted-foreground">No security events.</p>
                  ) : (
                    security.map((s) => (
                      <div key={s.id} className="border-b pb-2 last:border-0">
                        <p className="font-medium capitalize">{s.event_type}</p>
                        <p className="line-clamp-2">{s.message}</p>
                        <p className="text-xs text-muted-foreground">
                          {s.created_at ? new Date(s.created_at).toLocaleString() : '—'} · {s.severity}
                        </p>
                      </div>
                    ))
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>

        <Dialog open={reasonOpen != null} onOpenChange={(o) => !o && setReasonOpen(null)}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {reasonOpen === 'temp'
                  ? 'Grant temporary access'
                  : reasonOpen === 'impersonate'
                    ? `Impersonate ${impersonateTarget?.name || impersonateTarget?.email || 'user'}`
                    : `Set status: ${pendingStatus}`}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Reason</Label>
                <Input value={reason} onChange={(e) => setReason(e.target.value)} className="mt-1" placeholder="Required reason..." />
              </div>
              <Button
                disabled={busy}
                onClick={() => {
                  if (reasonOpen === 'temp') void runTempAccess();
                  else if (reasonOpen === 'impersonate') void startImpersonate();
                  else if (reasonOpen === 'status') {
                    void setStatus(pendingStatus, reason.trim() || undefined);
                  }
                }}
              >
                {busy ? 'Working...' : 'Confirm'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={!!confirmImpersonate} onOpenChange={(o) => !o && setConfirmImpersonate(null)}>
          <DialogContent>
            <DialogHeader><DialogTitle>Start impersonation?</DialogTitle></DialogHeader>
            {confirmImpersonate && (
              <div className="space-y-3 text-sm">
                <p>
                  You will switch to <strong>{confirmImpersonate.target_name || confirmImpersonate.target_email}</strong>
                  {' '}({confirmImpersonate.target_email}) and be redirected to the tenant dashboard.
                </p>
                <p className="text-muted-foreground">Your admin token will be backed up locally so you can restore it later.</p>
                <div className="flex gap-2">
                  <Button onClick={() => void acceptImpersonate()}>Continue</Button>
                  <Button variant="outline" onClick={() => setConfirmImpersonate(null)}>Cancel</Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        <Dialog open={gdprOpen} onOpenChange={setGdprOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>GDPR delete tenant</DialogTitle></DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                Type <strong>{view?.name}</strong> to confirm. Soft delete anonymizes; hard delete removes the company.
              </p>
              <div>
                <Label>Confirm company name</Label>
                <Input className="mt-1" value={confirmName} onChange={(e) => setConfirmName(e.target.value)} />
              </div>
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={hardDelete}
                  onChange={(e) => setHardDelete(e.target.checked)}
                  className="rounded border"
                />
                Hard delete (irreversible)
              </label>
              <Button variant="destructive" disabled={busy} onClick={() => void runGdprDelete()}>
                {busy ? 'Working...' : 'Confirm delete'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={startTrialOpen} onOpenChange={setStartTrialOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Start trial</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="co_start_days">Duration (days)</Label>
                <Input
                  id="co_start_days"
                  type="number"
                  className="mt-1"
                  value={startDays}
                  onChange={(e) => setStartDays(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="co_start_notes">Notes</Label>
                <Input
                  id="co_start_notes"
                  className="mt-1"
                  value={startNotes}
                  onChange={(e) => setStartNotes(e.target.value)}
                />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={startForce}
                  onChange={(e) => setStartForce(e.target.checked)}
                />
                Force grant
              </label>
              <Button
                disabled={busy}
                onClick={async () => {
                  setBusy(true);
                  try {
                    await api.admin.startCompanyTrial(id, {
                      duration_days: parseInt(startDays, 10) || undefined,
                      notes: startNotes.trim() || undefined,
                      force: startForce,
                    });
                    toast.success('Trial started');
                    setStartTrialOpen(false);
                    load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Start trial failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Working...' : 'Start'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={extendOpen} onOpenChange={setExtendOpen}>
          <DialogContent>
            <DialogHeader><DialogTitle>Extend trial</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label htmlFor="co_ext_days">Extension days</Label>
                <Input
                  id="co_ext_days"
                  type="number"
                  className="mt-1"
                  value={extensionDays}
                  onChange={(e) => setExtensionDays(e.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="co_ext_reason">Reason</Label>
                <Input
                  id="co_ext_reason"
                  className="mt-1"
                  value={extendReason}
                  onChange={(e) => setExtendReason(e.target.value)}
                />
              </div>
              <Button
                disabled={busy}
                onClick={async () => {
                  const trialId = trialInfo?.current?.trial_id;
                  if (!trialId) {
                    toast.error('No active trial');
                    return;
                  }
                  const days = parseInt(extensionDays, 10);
                  if (!days || extendReason.trim().length < 3) {
                    toast.error('Days and reason required');
                    return;
                  }
                  setBusy(true);
                  try {
                    await api.admin.extendTrial(trialId, {
                      extension_days: days,
                      reason: extendReason.trim(),
                    });
                    toast.success('Trial extended');
                    setExtendOpen(false);
                    load();
                  } catch (e) {
                    toast.error(e instanceof Error ? e.message : 'Extend failed');
                  } finally {
                    setBusy(false);
                  }
                }}
              >
                {busy ? 'Working...' : 'Extend'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Trial history</DialogTitle></DialogHeader>
            {historyRows.length === 0 ? (
              <p className="text-sm text-muted-foreground">No trial history.</p>
            ) : (
              <ul className="space-y-3 text-sm max-h-80 overflow-y-auto">
                {historyRows.map((h) => (
                  <li key={h.id} className="border-b pb-2 last:border-0">
                    <p className="font-medium capitalize">
                      #{h.id} · {h.status} · {h.duration_days}d
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {h.started_at ? new Date(h.started_at).toLocaleDateString() : '—'} →{' '}
                      {h.ends_at ? new Date(h.ends_at).toLocaleDateString() : '—'}
                      {h.extensions?.length ? ` · ${h.extensions.length} extension(s)` : ''}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </DialogContent>
        </Dialog>

        <Dialog
          open={!!pwUser}
          onOpenChange={(o) => {
            if (!o) {
              setPwUser(null);
              setPwValue('');
            }
          }}
        >
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Set password — {pwUser?.name || pwUser?.email}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">{pwUser?.email}</p>
              <div>
                <Label htmlFor="tenant_pw">New password</Label>
                <PasswordInput
                  id="tenant_pw"
                  className="mt-1"
                  value={pwValue}
                  onChange={(e) => setPwValue(e.target.value)}
                />
              </div>
              <Button variant="destructive" disabled={busy} onClick={() => void saveUserPassword()}>
                {busy ? 'Saving…' : 'Reset password'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
