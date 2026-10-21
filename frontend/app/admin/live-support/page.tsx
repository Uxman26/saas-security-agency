'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { TimeHmField } from '@/components/ui/time-hm-field';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { cn } from '@/lib/utils';
import {
  LIVE_CHAT_DAYS,
  LIVE_CHAT_TIMEZONES,
  daysFromAvailability,
  formatChatStamp,
  type DayHours,
} from '@/lib/live-support';
import type { AdminUserListItem } from '@/lib/types';

type Conv = Record<string, unknown>;

export default function AdminLiveSupportPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const canWrite = can('support.write');
  const [availability, setAvailability] = useState<Record<string, unknown> | null>(null);
  const [days, setDays] = useState<Record<string, DayHours>>(daysFromAvailability(null));
  const [agents, setAgents] = useState<Conv[]>([]);
  const [inbox, setInbox] = useState<Conv[]>([]);
  const [history, setHistory] = useState<Conv[]>([]);
  const [historyTotal, setHistoryTotal] = useState(0);
  const [historyQ, setHistoryQ] = useState('');
  const [historyStatus, setHistoryStatus] = useState('all');
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Conv | null>(null);
  const [reply, setReply] = useState('');
  const [agentUserId, setAgentUserId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [admins, setAdmins] = useState<AdminUserListItem[]>([]);
  const [saving, setSaving] = useState(false);
  const [pane, setPane] = useState<'inbox' | 'history'>('inbox');
  const scheduleDirtyRef = useRef(false);

  const load = useCallback(async (quiet = false, opts?: { reloadSchedule?: boolean }) => {
    try {
      const [a, ag, inboxRes, histRes, rep] = await Promise.all([
        api.admin.liveSupportAvailability(),
        api.admin.liveSupportAgents(),
        api.admin.liveSupportConversations({ status: 'inbox' }),
        api.admin.liveSupportConversations({ status: historyStatus, q: historyQ.trim() || undefined, limit: 100 }),
        api.admin.liveSupportReport(),
      ]);
      if (opts?.reloadSchedule || (!quiet && !scheduleDirtyRef.current)) {
        setAvailability(a);
        setDays(daysFromAvailability(a));
      }
      setAgents(ag);
      const inboxItems = inboxRes.items || [];
      setInbox((prev) => {
        if (quiet && prev.length && inboxItems.length > prev.length) {
          toast.success('New live chat waiting');
        }
        return inboxItems;
      });
      setHistory(histRes.items || []);
      setHistoryTotal(histRes.total ?? histRes.items?.length ?? 0);
      setReport(rep);
    } catch {
      if (!quiet) toast.error('Failed to load live support settings');
    }
  }, [historyQ, historyStatus]);

  useEffect(() => {
    if (!user) return;
    void load();
    const t = setInterval(() => void load(true), 5000);
    return () => clearInterval(t);
  }, [user, load]);

  useEffect(() => {
    api.admin
      .users()
      .then((rows) => setAdmins(rows.filter((u) => u.role === 'super_admin' && u.is_active)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelected(null);
      return;
    }
    api.admin
      .liveSupportConversation(selectedId)
      .then(setSelected)
      .catch(() => toast.error('Failed to load conversation'));
    const t = setInterval(() => {
      api.admin.liveSupportConversation(selectedId).then(setSelected).catch(() => {});
    }, 4000);
    return () => clearInterval(t);
  }, [selectedId]);

  const saveAvailability = async () => {
    if (!availability) return;
    setSaving(true);
    try {
      const updated = await api.admin.patchLiveSupportAvailability({
        ...availability,
        days,
      });
      scheduleDirtyRef.current = false;
      setAvailability(updated);
      setDays(daysFromAvailability(updated));
      toast.success('Schedule saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const setDay = (key: string, patch: Partial<DayHours>) => {
    setDays((prev) => ({ ...prev, [key]: { ...prev[key], ...patch } }));
  };

  const addAgent = async () => {
    const uid = parseInt(agentUserId, 10);
    if (!uid || !agentName.trim()) {
      toast.error('Choose a platform admin and display name');
      return;
    }
    try {
      await api.admin.upsertLiveSupportAgent({ user_id: uid, display_name: agentName.trim(), is_available: true });
      setAgentUserId('');
      setAgentName('');
      await load();
      toast.success('Agent saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save agent');
    }
  };

  const sendReply = async () => {
    if (!selectedId || !reply.trim()) return;
    try {
      const updated = await api.admin.liveSupportReply(selectedId, reply.trim());
      setSelected(updated);
      setReply('');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Send failed');
    }
  };

  const counts = (report?.counts as Record<string, number> | undefined) || {};
  const list = pane === 'inbox' ? inbox : history;
  const tzOptions = useMemo(() => {
    const current = String(availability?.timezone || 'Europe/London');
    return LIVE_CHAT_TIMEZONES.includes(current) ? LIVE_CHAT_TIMEZONES : [current, ...LIVE_CHAT_TIMEZONES];
  }, [availability?.timezone]);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h1 className="text-3xl font-bold">Live support</h1>
              <p className="text-sm text-muted-foreground">
                Super Admin hours, agent availability, visitor chats, and conversation history.
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                scheduleDirtyRef.current = false;
                void load(false, { reloadSchedule: true });
              }}
            >
              Refresh
            </Button>
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Stat label="Open" value={counts.open ?? 0} />
            <Stat label="In progress" value={counts.in_progress ?? 0} />
            <Stat label="Closed" value={counts.closed ?? 0} />
            <Stat
              label="Started (7 days)"
              value={Number(report?.started_last_7_days ?? 0)}
              hint={report?.within_hours ? 'Within hours' : 'Outside hours'}
            />
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Live chat schedule</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {availability && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!availability.enabled}
                        disabled={!canWrite}
                        onChange={(e) => {
                          scheduleDirtyRef.current = true;
                          setAvailability({ ...availability, enabled: e.target.checked });
                        }}
                      />
                      Live chat enabled
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Timezone</Label>
                        <select
                          className="mt-1 h-9 w-full rounded-md border border-input bg-background px-2 text-sm"
                          value={String(availability.timezone || 'Europe/London')}
                          disabled={!canWrite}
                          onChange={(e) => {
                            scheduleDirtyRef.current = true;
                            setAvailability({ ...availability, timezone: e.target.value });
                          }}
                        >
                          {tzOptions.map((tz) => (
                            <option key={tz} value={tz}>
                              {tz}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <Label>Contact email (offline)</Label>
                        <Input
                          className="mt-1"
                          type="email"
                          value={String(availability.contact_email || '')}
                          disabled={!canWrite}
                          onChange={(e) => {
                            scheduleDirtyRef.current = true;
                            setAvailability({ ...availability, contact_email: e.target.value });
                          }}
                        />
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Days and hours</Label>
                      <p className="text-xs text-muted-foreground">
                        Uncheck a day to mark it unavailable. Overnight hours (for example 22:00–06:00) are supported.
                      </p>
                      <div className="space-y-2">
                        {LIVE_CHAT_DAYS.map((d) => {
                          const row = days[String(d.v)];
                          return (
                            <div
                              key={d.v}
                              className="grid grid-cols-[7.5rem_1fr_auto_1fr] items-center gap-2 rounded-md border px-2 py-1.5"
                            >
                              <label className="flex items-center gap-2 text-sm">
                                <input
                                  type="checkbox"
                                  checked={!!row?.enabled}
                                  disabled={!canWrite}
                                  onChange={(e) => {
                                    scheduleDirtyRef.current = true;
                                    setDay(String(d.v), { enabled: e.target.checked });
                                  }}
                                />
                                {d.label}
                              </label>
                              <TimeHmField
                                value={row?.start || '09:00'}
                                disabled={!canWrite || !row?.enabled}
                                aria-label={`${d.label} opening time`}
                                onChange={(v) => {
                                  scheduleDirtyRef.current = true;
                                  setDay(String(d.v), { start: v });
                                }}
                              />
                              <span className="text-xs text-muted-foreground">to</span>
                              <TimeHmField
                                value={row?.end || '17:30'}
                                disabled={!canWrite || !row?.enabled}
                                aria-label={`${d.label} closing time`}
                                onChange={(v) => {
                                  scheduleDirtyRef.current = true;
                                  setDay(String(d.v), { end: v });
                                }}
                              />
                            </div>
                          );
                        })}
                      </div>
                    </div>
                    <div>
                      <Label>Outside-hours message</Label>
                      <Input
                        className="mt-1"
                        value={String(availability.offline_message || '')}
                        disabled={!canWrite}
                        onChange={(e) => {
                          scheduleDirtyRef.current = true;
                          setAvailability({ ...availability, offline_message: e.target.value });
                        }}
                      />
                    </div>
                    <div>
                      <Label>No-agent message</Label>
                      <Input
                        className="mt-1"
                        value={String(availability.no_agent_message || '')}
                        disabled={!canWrite}
                        onChange={(e) => {
                          scheduleDirtyRef.current = true;
                          setAvailability({ ...availability, no_agent_message: e.target.value });
                        }}
                      />
                    </div>
                    {canWrite && (
                      <Button onClick={() => void saveAvailability()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save schedule'}
                      </Button>
                    )}
                  </>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Agents</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  {agents.map((a) => (
                    <div key={String(a.id)} className="flex items-center justify-between gap-2 rounded-md border p-2 text-sm">
                      <div>
                        <p className="font-medium">{String(a.display_name)}</p>
                        <p className="text-xs text-muted-foreground">
                          {String(a.email || '')} · {a.is_available ? 'Available' : 'Offline'}
                        </p>
                      </div>
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void api.admin
                              .patchLiveSupportAgent(Number(a.id), !a.is_available)
                              .then(() => load())
                              .catch((e) => toast.error(e instanceof Error ? e.message : 'Update failed'))
                          }
                        >
                          {a.is_available ? 'Set offline' : 'Set available'}
                        </Button>
                      )}
                    </div>
                  ))}
                  {agents.length === 0 && <p className="text-sm text-muted-foreground">No agents configured yet.</p>}
                </div>
                {canWrite && (
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={agentUserId}
                      onChange={(e) => {
                        setAgentUserId(e.target.value);
                        const match = admins.find((u) => String(u.id) === e.target.value);
                        if (match && !agentName) setAgentName(match.full_name);
                      }}
                    >
                      <option value="">Platform admin…</option>
                      {admins.map((u) => (
                        <option key={u.id} value={u.id}>
                          {u.full_name} ({u.email})
                        </option>
                      ))}
                    </select>
                    <Input placeholder="Display name" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                    <Button onClick={() => void addAgent()}>Add</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[22rem_1fr]">
            <Card>
              <CardHeader className="space-y-3">
                <div className="flex gap-2">
                  <Button size="sm" variant={pane === 'inbox' ? 'default' : 'outline'} onClick={() => setPane('inbox')}>
                    Inbox ({inbox.length})
                  </Button>
                  <Button size="sm" variant={pane === 'history' ? 'default' : 'outline'} onClick={() => setPane('history')}>
                    History ({historyTotal})
                  </Button>
                </div>
                {pane === 'history' ? (
                  <div className="grid gap-2">
                    <Input
                      placeholder="Search name, email, company, city, chat ID"
                      value={historyQ}
                      onChange={(e) => setHistoryQ(e.target.value)}
                    />
                    <select
                      className="h-9 rounded-md border border-input bg-background px-2 text-sm"
                      value={historyStatus}
                      onChange={(e) => setHistoryStatus(e.target.value)}
                    >
                      <option value="all">All statuses</option>
                      <option value="open">Open</option>
                      <option value="in_progress">In progress</option>
                      <option value="closed">Closed</option>
                    </select>
                  </div>
                ) : (
                  <CardTitle className="text-base">Open conversations</CardTitle>
                )}
              </CardHeader>
              <CardContent className="max-h-[28rem] space-y-2 overflow-y-auto">
                {list.map((c) => (
                  <button
                    key={String(c.id)}
                    type="button"
                    onClick={() => setSelectedId(Number(c.id))}
                    className={cn(
                      'w-full rounded-md border p-2 text-left text-sm',
                      selectedId === Number(c.id) && 'border-primary bg-muted/50'
                    )}
                  >
                    <p className="font-medium">{String(c.visitor_name)}</p>
                    <p className="text-xs text-muted-foreground">
                      {String(c.public_id)} · {String(c.status_label || c.status)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {String(c.visitor_company)} · {String(c.visitor_city)}
                    </p>
                  </button>
                ))}
                {list.length === 0 && (
                  <p className="text-sm text-muted-foreground">
                    {pane === 'inbox' ? 'No open chats.' : 'No conversations match these filters.'}
                  </p>
                )}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selected ? String(selected.public_id) : 'Conversation'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selected ? (
                  <p className="text-sm text-muted-foreground">Select a conversation to review visitor details and reply.</p>
                ) : (
                  <>
                    <div className="grid gap-1 rounded-md border bg-muted/30 p-3 text-sm">
                      <p>
                        <span className="text-muted-foreground">Visitor:</span> {String(selected.visitor_name)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Email:</span> {String(selected.visitor_email)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Company:</span> {String(selected.visitor_company)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">City:</span> {String(selected.visitor_city)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Status:</span> {String(selected.status_label || selected.status)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Agent:</span> {String(selected.agent_name || 'Unassigned')}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Started:</span> {formatChatStamp(selected.started_at || selected.created_at)}
                      </p>
                      <p>
                        <span className="text-muted-foreground">Ended:</span> {formatChatStamp(selected.ended_at || selected.closed_at)}
                      </p>
                    </div>
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-3">
                      {Array.isArray(selected.messages) &&
                        (selected.messages as Conv[]).map((m) => (
                          <div key={String(m.id)} className="text-sm">
                            <span className="font-medium">{String(m.sender_name || m.sender_type)}: </span>
                            <span className="whitespace-pre-wrap">{String(m.body)}</span>
                            <span className="ml-2 text-[11px] text-muted-foreground">{formatChatStamp(m.created_at)}</span>
                          </div>
                        ))}
                      {Array.isArray(selected.events) && (selected.events as Conv[]).length > 0 ? (
                        <div className="border-t pt-2 text-xs text-muted-foreground">
                          {(selected.events as Conv[])
                            .filter((ev) => String(ev.event_type || '').startsWith('conversation.'))
                            .map((ev) => (
                              <p key={String(ev.id)}>
                                {String(ev.event_type).replace('conversation.', '')} · {formatChatStamp(ev.created_at)}
                              </p>
                            ))}
                        </div>
                      ) : null}
                    </div>
                    {canWrite && (
                      <div className="flex flex-wrap gap-2">
                        {String(selected.status) !== 'closed' && String(selected.status) !== 'resolved' ? (
                          <>
                            <Input
                              className="flex-1"
                              value={reply}
                              onChange={(e) => setReply(e.target.value)}
                              placeholder="Reply as agent"
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') void sendReply();
                              }}
                            />
                            <Button onClick={() => void sendReply()}>Send</Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                void api.admin
                                  .liveSupportReassign(Number(selected.id))
                                  .then(setSelected)
                                  .catch((e) => toast.error(e instanceof Error ? e.message : 'Reassign failed'))
                              }
                            >
                              Reassign
                            </Button>
                            <Button
                              variant="outline"
                              onClick={() =>
                                void api.admin.liveSupportClose(Number(selected.id)).then((c) => {
                                  setSelected(c);
                                  void load();
                                })
                              }
                            >
                              Close
                            </Button>
                          </>
                        ) : (
                          <Button
                            onClick={() =>
                              void api.admin.liveSupportReopen(Number(selected.id)).then((c) => {
                                setSelected(c);
                                void load();
                              })
                            }
                          >
                            Reopen
                          </Button>
                        )}
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
          </div>
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}

function Stat({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <Card>
      <CardContent className="pt-4">
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-2xl font-semibold tabular-nums">{value}</p>
        {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
      </CardContent>
    </Card>
  );
}
