'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleGuard } from '@/components/module-guard';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Guard, Site, Task, TaskCounts } from '@/lib/types';
import { ListChecks, Plus, Trash2, Pencil } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';
import { cn } from '@/lib/utils';

const PRIORITIES = [
  { key: 'low', label: 'Low' },
  { key: 'normal', label: 'Normal' },
  { key: 'high', label: 'High' },
  { key: 'urgent', label: 'Urgent' },
];

const STATUSES = [
  { key: 'todo', label: 'To do' },
  { key: 'in_progress', label: 'In progress' },
  { key: 'done', label: 'Done' },
  { key: 'cancelled', label: 'Cancelled' },
];

const PRIORITY_STYLE: Record<string, string> = {
  low: 'bg-muted text-muted-foreground',
  normal: 'bg-sky-100 text-sky-900 dark:bg-sky-950/50 dark:text-sky-100',
  high: 'bg-amber-100 text-amber-900 dark:bg-amber-950/50 dark:text-amber-100',
  urgent: 'bg-destructive/15 text-destructive',
};

const EMPTY = { title: '', description: '', guard_id: '', site_id: '', due_date: '', priority: 'normal' };

export default function TasksPage() {
  const { user } = useAuth();
  const canCreate = canModule(user, 'tasks', 'create');
  const canEdit = canModule(user, 'tasks', 'edit');
  const canDelete = canModule(user, 'tasks', 'delete');
  const canComplete = canModule(user, 'tasks', 'complete');

  const [rows, setRows] = useState<Task[]>([]);
  const [counts, setCounts] = useState<TaskCounts | null>(null);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('todo');
  const [guardFilter, setGuardFilter] = useState('all');

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Task | null>(null);
  const [form, setForm] = useState({ ...EMPTY });
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([
      api.tasks.list({
        status: statusFilter === 'all' ? undefined : statusFilter,
        guard_id: guardFilter === 'all' ? undefined : guardFilter,
      }),
      api.tasks.counts(),
    ])
      .then(([list, c]) => {
        setRows(list);
        setCounts(c);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [statusFilter, guardFilter]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    api.guards.list().then(setGuards).catch(() => {});
    api.sites.list().then(setSites).catch(() => {});
  }, []);

  const openNew = () => {
    setEditing(null);
    setForm({ ...EMPTY });
    setOpen(true);
  };

  const openEdit = (t: Task) => {
    setEditing(t);
    setForm({
      title: t.title,
      description: t.description ?? '',
      guard_id: t.guard_id ? String(t.guard_id) : '',
      site_id: t.site_id ? String(t.site_id) : '',
      due_date: t.due_date ?? '',
      priority: t.priority,
    });
    setOpen(true);
  };

  const save = async () => {
    if (!form.title.trim()) {
      toast.error('A task needs a title');
      return;
    }
    setSaving(true);
    const payload = {
      title: form.title.trim(),
      description: form.description.trim() || null,
      guard_id: form.guard_id ? parseInt(form.guard_id, 10) : null,
      site_id: form.site_id ? parseInt(form.site_id, 10) : null,
      due_date: form.due_date || null,
      priority: form.priority,
    };
    try {
      if (editing) await api.tasks.update(editing.id, payload);
      else await api.tasks.create(payload);
      toast.success(editing ? 'Task updated' : 'Task assigned');
      setOpen(false);
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save the task');
    } finally {
      setSaving(false);
    }
  };

  const toggle = async (t: Task) => {
    try {
      await api.tasks.complete(t.id, t.status !== 'done');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not update the task');
    }
  };

  const remove = (t: Task) => {
    toast.confirm(`Delete “${t.title}”?`, async () => {
      try {
        await api.tasks.remove(t.id);
        toast.snack('Task deleted');
        load();
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Could not delete');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const tiles = counts
    ? [
        { label: 'To do', value: counts.todo },
        { label: 'In progress', value: counts.in_progress },
        { label: 'Done', value: counts.done },
        { label: 'Overdue', value: counts.overdue, alert: counts.overdue > 0 },
      ]
    : [];

  return (
    <ProtectedRoute>
      <AppShell>
        <ModuleGuard moduleKey="tasks">
          <ModulePage>
            <ModuleHeader
              title={<span className="flex items-center gap-2"><ListChecks className="size-7" /> Tasks</span>}
              description="Jobs assigned to your team. Everyone sees their own list; managers see everyone's."
              actions={
                canCreate ? (
                  <Button onClick={openNew}>
                    <Plus className="size-4 mr-1.5" />
                    New task
                  </Button>
                ) : undefined
              }
            />

            {counts ? (
              <div className="grid gap-3 grid-cols-2 lg:grid-cols-4">
                {tiles.map((t) => (
                  <Card key={t.label} className={cn(t.alert && 'border-destructive/40 bg-destructive/5')}>
                    <CardHeader className="pb-2">
                      <CardTitle className="text-sm font-medium text-muted-foreground">{t.label}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <span className={cn('text-2xl font-bold tabular-nums', t.alert && 'text-destructive')}>
                        {t.value}
                      </span>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ) : null}

            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1 min-w-44">
                <Label>Status</Label>
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              {guards.length > 0 ? (
                <div className="space-y-1 min-w-52">
                  <Label>Assigned to</Label>
                  <Select value={guardFilter} onValueChange={setGuardFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      {guards.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </div>
              ) : null}
            </div>

            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base">
                  {loading ? 'Loading…' : `${rows.length} task${rows.length === 1 ? '' : 's'}`}
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10" />
                        <TableHead>Task</TableHead>
                        <TableHead>Assigned to</TableHead>
                        <TableHead>Site</TableHead>
                        <TableHead>Due</TableHead>
                        <TableHead>Priority</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {rows.length === 0 && !loading ? (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-8">
                            Nothing here. {canCreate ? 'Use New task to assign one.' : 'You have no tasks for this filter.'}
                          </TableCell>
                        </TableRow>
                      ) : null}
                      {rows.map((t) => (
                        <TableRow key={t.id} className={cn(t.status === 'done' && 'opacity-60')}>
                          <TableCell>
                            <input
                              type="checkbox"
                              className="rounded border size-4"
                              checked={t.status === 'done'}
                              disabled={!canComplete}
                              onChange={() => void toggle(t)}
                              aria-label={t.status === 'done' ? `Reopen ${t.title}` : `Mark ${t.title} done`}
                            />
                          </TableCell>
                          <TableCell>
                            <div className={cn('font-medium', t.status === 'done' && 'line-through')}>{t.title}</div>
                            {t.description ? (
                              <div className="text-xs text-muted-foreground max-w-md truncate">{t.description}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>{t.guard_name ?? <span className="text-muted-foreground">Unassigned</span>}</TableCell>
                          <TableCell>{t.site_name ?? '—'}</TableCell>
                          <TableCell className="whitespace-nowrap">
                            {t.due_date ? (
                              <span className={cn(t.is_overdue && 'text-destructive font-medium')}>
                                {t.due_date}{t.is_overdue ? ' · overdue' : ''}
                              </span>
                            ) : '—'}
                          </TableCell>
                          <TableCell>
                            <span className={cn('inline-flex rounded-full px-2 py-0.5 text-xs font-medium', PRIORITY_STYLE[t.priority] ?? '')}>
                              {PRIORITIES.find((p) => p.key === t.priority)?.label ?? t.priority}
                            </span>
                          </TableCell>
                          <TableCell className="text-xs">
                            {STATUSES.find((s) => s.key === t.status)?.label ?? t.status}
                            {t.status === 'done' && t.completed_by_name ? (
                              <div className="text-muted-foreground">by {t.completed_by_name}</div>
                            ) : null}
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center justify-end gap-1">
                              {canEdit ? (
                                <Button variant="ghost" size="sm" onClick={() => openEdit(t)} title="Edit task">
                                  <Pencil className="size-4" />
                                </Button>
                              ) : null}
                              {canDelete ? (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                  onClick={() => remove(t)}
                                  title="Delete task"
                                >
                                  <Trash2 className="size-4" />
                                </Button>
                              ) : null}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            <Dialog open={open} onOpenChange={setOpen}>
              <DialogContent className="sm:max-w-lg">
                <DialogHeader>
                  <DialogTitle>{editing ? 'Edit task' : 'New task'}</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 py-2">
                  <div className="space-y-1">
                    <Label>Task <span className="text-destructive">*</span></Label>
                    <Input
                      value={form.title}
                      onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                      maxLength={100}
                      placeholder="What needs doing?"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label>Details</Label>
                    <Textarea
                      rows={3}
                      value={form.description}
                      onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                      maxLength={5000}
                    />
                  </div>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div className="space-y-1">
                      <Label>Assign to</Label>
                      <Select value={form.guard_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, guard_id: v === 'none' ? '' : v }))}>
                        <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">Unassigned</SelectItem>
                          {guards.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.full_name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Site</Label>
                      <Select value={form.site_id || 'none'} onValueChange={(v) => setForm((f) => ({ ...f, site_id: v === 'none' ? '' : v }))}>
                        <SelectTrigger><SelectValue placeholder="Select site" /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="none">No site</SelectItem>
                          {sites.map((s) => <SelectItem key={s.id} value={String(s.id)}>{s.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Due date</Label>
                      <Input type="date" value={form.due_date} onChange={(e) => setForm((f) => ({ ...f, due_date: e.target.value }))} />
                    </div>
                    <div className="space-y-1">
                      <Label>Priority</Label>
                      <Select value={form.priority} onValueChange={(v) => setForm((f) => ({ ...f, priority: v }))}>
                        <SelectTrigger><SelectValue /></SelectTrigger>
                        <SelectContent>
                          {PRIORITIES.map((p) => <SelectItem key={p.key} value={p.key}>{p.label}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </div>
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
                  <Button onClick={() => void save()} disabled={saving}>
                    {saving ? 'Saving…' : editing ? 'Save changes' : 'Assign task'}
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </ModulePage>
        </ModuleGuard>
      </AppShell>
    </ProtectedRoute>
  );
}
