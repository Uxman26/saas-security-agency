'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import { usePlatformPermissions } from '@/hooks/use-platform-permissions';
import { cn } from '@/lib/utils';

const DAYS = [
  { v: 0, label: 'Mon' },
  { v: 1, label: 'Tue' },
  { v: 2, label: 'Wed' },
  { v: 3, label: 'Thu' },
  { v: 4, label: 'Fri' },
  { v: 5, label: 'Sat' },
  { v: 6, label: 'Sun' },
];

export default function AdminLiveSupportPage() {
  const { user } = useAuth();
  const { can } = usePlatformPermissions();
  const canWrite = can('support.write');
  const [availability, setAvailability] = useState<Record<string, unknown> | null>(null);
  const [agents, setAgents] = useState<Record<string, unknown>[]>([]);
  const [conversations, setConversations] = useState<Record<string, unknown>[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [selected, setSelected] = useState<Record<string, unknown> | null>(null);
  const [reply, setReply] = useState('');
  const [agentUserId, setAgentUserId] = useState('');
  const [agentName, setAgentName] = useState('');
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    try {
      const [a, ag, c] = await Promise.all([
        api.admin.liveSupportAvailability(),
        api.admin.liveSupportAgents(),
        api.admin.liveSupportConversations(),
      ]);
      setAvailability(a);
      setAgents(ag);
      setConversations(c);
    } catch {
      toast.error('Failed to load live support settings');
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    void load();
  }, [user, load]);

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
      const updated = await api.admin.patchLiveSupportAvailability(availability);
      setAvailability(updated);
      toast.success('Availability saved');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const toggleDay = (day: number) => {
    if (!availability) return;
    const current = Array.isArray(availability.working_days) ? (availability.working_days as number[]) : [];
    const next = current.includes(day) ? current.filter((d) => d !== day) : [...current, day].sort();
    setAvailability({ ...availability, working_days: next });
  };

  const addAgent = async () => {
    const uid = parseInt(agentUserId, 10);
    if (!uid || !agentName.trim()) {
      toast.error('User ID and display name are required');
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

  const days = Array.isArray(availability?.working_days) ? (availability!.working_days as number[]) : [];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h1 className="text-3xl font-bold">Live support</h1>
              <p className="text-sm text-muted-foreground">Agent hours, availability, and live chat conversations.</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => void load()}>Refresh</Button>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card>
              <CardHeader>
                <CardTitle>Working hours</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {availability && (
                  <>
                    <label className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={!!availability.enabled}
                        disabled={!canWrite}
                        onChange={(e) => setAvailability({ ...availability, enabled: e.target.checked })}
                      />
                      Live support enabled
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div>
                        <Label>Timezone</Label>
                        <Input
                          className="mt-1"
                          value={String(availability.timezone || '')}
                          disabled={!canWrite}
                          onChange={(e) => setAvailability({ ...availability, timezone: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Contact email (offline)</Label>
                        <Input
                          className="mt-1"
                          value={String(availability.contact_email || '')}
                          disabled={!canWrite}
                          onChange={(e) => setAvailability({ ...availability, contact_email: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>Start time</Label>
                        <Input
                          className="mt-1"
                          value={String(availability.start_time || '')}
                          disabled={!canWrite}
                          onChange={(e) => setAvailability({ ...availability, start_time: e.target.value })}
                        />
                      </div>
                      <div>
                        <Label>End time</Label>
                        <Input
                          className="mt-1"
                          value={String(availability.end_time || '')}
                          disabled={!canWrite}
                          onChange={(e) => setAvailability({ ...availability, end_time: e.target.value })}
                        />
                      </div>
                    </div>
                    <div>
                      <Label>Working days</Label>
                      <div className="mt-2 flex flex-wrap gap-2">
                        {DAYS.map((d) => (
                          <button
                            key={d.v}
                            type="button"
                            disabled={!canWrite}
                            onClick={() => toggleDay(d.v)}
                            className={cn(
                              'rounded-full border px-3 py-1 text-xs font-medium',
                              days.includes(d.v) ? 'bg-primary text-primary-foreground' : 'bg-background text-muted-foreground'
                            )}
                          >
                            {d.label}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <Label>Offline message</Label>
                      <Input
                        className="mt-1"
                        value={String(availability.offline_message || '')}
                        disabled={!canWrite}
                        onChange={(e) => setAvailability({ ...availability, offline_message: e.target.value })}
                      />
                    </div>
                    {canWrite && (
                      <Button onClick={() => void saveAvailability()} disabled={saving}>
                        {saving ? 'Saving…' : 'Save availability'}
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
                        <p className="text-xs text-muted-foreground">{String(a.email || '')} · user #{String(a.user_id)}</p>
                      </div>
                      {canWrite && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() =>
                            void api.admin
                              .patchLiveSupportAgent(Number(a.id), !a.is_available)
                              .then(load)
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
                    <Input placeholder="Platform user ID" value={agentUserId} onChange={(e) => setAgentUserId(e.target.value)} />
                    <Input placeholder="Display name" value={agentName} onChange={(e) => setAgentName(e.target.value)} />
                    <Button onClick={() => void addAgent()}>Add</Button>
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-[20rem_1fr]">
            <Card>
              <CardHeader>
                <CardTitle>Open conversations</CardTitle>
              </CardHeader>
              <CardContent className="space-y-2">
                {conversations.map((c) => (
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
                    <p className="text-xs text-muted-foreground">{String(c.visitor_company)} · {String(c.status)}</p>
                  </button>
                ))}
                {conversations.length === 0 && <p className="text-sm text-muted-foreground">No open chats.</p>}
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>{selected ? String(selected.public_id) : 'Conversation'}</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                {!selected ? (
                  <p className="text-sm text-muted-foreground">Select a conversation to reply.</p>
                ) : (
                  <>
                    <p className="text-sm text-muted-foreground">
                      {String(selected.visitor_name)} · {String(selected.visitor_email)} · {String(selected.visitor_company)} ·{' '}
                      {String(selected.visitor_city)}
                    </p>
                    <div className="max-h-80 space-y-2 overflow-y-auto rounded-md border p-3">
                      {Array.isArray(selected.messages) &&
                        (selected.messages as Record<string, unknown>[]).map((m) => (
                          <div key={String(m.id)} className="text-sm">
                            <span className="font-medium">{String(m.sender_name || m.sender_type)}: </span>
                            <span className="whitespace-pre-wrap">{String(m.body)}</span>
                          </div>
                        ))}
                    </div>
                    {canWrite && (
                      <div className="flex flex-wrap gap-2">
                        <Input className="flex-1" value={reply} onChange={(e) => setReply(e.target.value)} placeholder="Reply as agent" />
                        <Button onClick={() => void sendReply()}>Send</Button>
                        <Button variant="outline" onClick={() => void api.admin.liveSupportReassign(Number(selected.id)).then(setSelected)}>
                          Reassign
                        </Button>
                        <Button variant="outline" onClick={() => void api.admin.liveSupportClose(Number(selected.id)).then((c) => { setSelected(c); void load(); })}>
                          Close
                        </Button>
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
