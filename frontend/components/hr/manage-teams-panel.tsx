'use client';

/**
 * Manage teams: create a team, rename it, choose who is in it, delete it.
 *
 * Deleting a team never touches the people in it — they fall back to the hub's "No team"
 * group. That is the whole reason "No team" is a real group rather than a gap.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Loader2, Pencil, Plus, Trash2, Users } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import { toast } from '@/lib/toast';
import type { Guard, Team } from '@/lib/types';
import { cn } from '@/lib/utils';

export function ManageTeamsPanel({
  guards,
  canManage,
  onChanged,
}: {
  guards: Guard[];
  canManage: boolean;
  onChanged?: () => void;
}) {
  const [teams, setTeams] = useState<Team[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const [busy, setBusy] = useState(false);
  const [editing, setEditing] = useState<Team | null>(null);
  const [editName, setEditName] = useState('');
  const [members, setMembers] = useState<Set<number>>(() => new Set());
  const [memberSearch, setMemberSearch] = useState('');

  const load = useCallback(() => {
    setLoading(true);
    api.teams
      .list()
      .then(setTeams)
      .catch(() => setTeams([]))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const create = async () => {
    const name = newName.trim();
    if (!name) return;
    setBusy(true);
    try {
      await api.teams.create({ name });
      setNewName('');
      load();
      onChanged?.();
      toast.success('Team created');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the team');
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (team: Team) => {
    setEditing(team);
    setEditName(team.name);
    setMembers(new Set(team.member_ids));
    setMemberSearch('');
  };

  const save = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      if (editName.trim() && editName.trim() !== editing.name) {
        await api.teams.update(editing.id, { name: editName.trim() });
      }
      await api.teams.setMembers(editing.id, [...members]);
      setEditing(null);
      load();
      onChanged?.();
      toast.success('Team updated');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the team');
    } finally {
      setBusy(false);
    }
  };

  const remove = (team: Team) => {
    toast.confirm(
      `Delete team "${team.name}"?`,
      async () => {
        try {
          await api.teams.delete(team.id);
          load();
          onChanged?.();
          toast.success('Team deleted');
        } catch (e) {
          toast.error(e instanceof Error ? e.message : 'Delete failed');
        }
      },
      { label: 'Delete', description: 'The staff in it keep their records and move to “No team”.' }
    );
  };

  const pickable = useMemo(() => {
    const q = memberSearch.trim().toLowerCase();
    const list = guards.filter((g) => g.deleted_at == null);
    if (!q) return list;
    return list.filter(
      (g) =>
        g.full_name.toLowerCase().includes(q) || (g.job_title || '').toLowerCase().includes(q)
    );
  }, [guards, memberSearch]);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="size-4" /> Manage teams
        </CardTitle>
        <p className="text-sm text-muted-foreground">
          Teams group the Employee Hub. Anyone in no team is listed under “No team”, so nobody
          is ever hidden by the grouping.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {canManage ? (
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="New team name"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void create();
              }}
              className="max-w-xs"
            />
            <Button onClick={() => void create()} disabled={busy || !newName.trim()}>
              <Plus className="mr-1.5 size-4" />
              Add team
            </Button>
          </div>
        ) : null}

        {loading ? (
          <p className="flex items-center gap-2 py-6 text-sm text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Loading teams…
          </p>
        ) : teams.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No teams yet. Everyone appears under “No team” in the hub until you add one.
          </p>
        ) : (
          <div className="divide-y rounded-lg border">
            {teams.map((t) => (
              <div key={t.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{t.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.member_count} {t.member_count === 1 ? 'member' : 'members'}
                    {t.description ? ` · ${t.description}` : ''}
                  </p>
                </div>
                {canManage ? (
                  <>
                    <Button variant="outline" size="sm" onClick={() => openEdit(t)}>
                      <Pencil className="mr-1.5 size-3.5" />
                      Edit
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="size-8 text-destructive hover:text-destructive"
                      onClick={() => remove(t)}
                      title="Delete team"
                    >
                      <Trash2 className="size-4" />
                    </Button>
                  </>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </CardContent>

      <Dialog open={editing != null} onOpenChange={(v) => (!v ? setEditing(null) : undefined)}>
        <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit team</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1">
              <Label>Team name</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} />
            </div>
            <div className="space-y-1">
              <Label>Members ({members.size})</Label>
              <Input
                placeholder="Search staff…"
                value={memberSearch}
                onChange={(e) => setMemberSearch(e.target.value)}
              />
              <div className="mt-2 max-h-64 overflow-y-auto rounded-md border">
                {pickable.length === 0 ? (
                  <p className="p-4 text-center text-sm text-muted-foreground">No staff match.</p>
                ) : (
                  pickable.map((g) => (
                    <label
                      key={g.id}
                      className={cn(
                        'flex cursor-pointer items-center gap-2 border-b px-3 py-2 text-sm last:border-b-0',
                        members.has(g.id) && 'bg-muted/40'
                      )}
                    >
                      <input
                        type="checkbox"
                        className="size-4 rounded border-input"
                        checked={members.has(g.id)}
                        onChange={(e) =>
                          setMembers((prev) => {
                            const next = new Set(prev);
                            if (e.target.checked) next.add(g.id);
                            else next.delete(g.id);
                            return next;
                          })
                        }
                      />
                      <span className="min-w-0 flex-1 truncate">{g.full_name}</span>
                      <span className="truncate text-xs text-muted-foreground">{g.job_title || '—'}</span>
                    </label>
                  ))
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2 border-t pt-4">
            <Button variant="outline" onClick={() => setEditing(null)} disabled={busy}>
              Cancel
            </Button>
            <Button onClick={() => void save()} disabled={busy}>
              {busy ? <Loader2 className="mr-1.5 size-4 animate-spin" /> : null}
              Save team
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
