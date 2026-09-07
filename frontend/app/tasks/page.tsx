'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleGuard } from '@/components/module-guard';
import { ModulePage } from '@/components/module-layout';
import {
  DashboardHeader,
  FilterBar,
  FilterField,
  Pill,
  QuickLinks,
  ResultsCard,
  ShowingCount,
  StatCards,
  type StatCardSpec,
} from '@/components/module-dashboard';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Guard, Site, Task, TaskCounts } from '@/lib/types';
import { AlertTriangle, CheckCircle2, Clock, ListChecks, Plus, Trash2, Pencil, Users } from 'lucide-react';
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

  /** The cards along the top, in the shape every module dashboard uses. */
  const statCards: StatCardSpec[] = counts
    ? [
        {
          key: 'todo',
          label: 'To do',
          value: counts.todo,
          icon: ListChecks,
          tone: 'neutral',
          action: counts.todo ? { label: 'View', onClick: () => setStatusFilter('todo') } : undefined,
        },
        {
          key: 'in_progress',
          label: 'In progress',
          value: counts.in_progress,
          icon: Clock,
          tone: 'info',
          action: counts.in_progress ? { label: 'View', onClick: () => setStatusFilter('in_progress') } : undefined,
        },
        {
          key: 'done',
          label: 'Done',
          value: counts.done,
          icon: CheckCircle2,
          tone: 'positive',
          action: counts.done ? { label: 'View', onClick: () => setStatusFilter('done') } : undefined,
        },
        {
          key: 'overdue',
          label: 'Overdue',
          value: counts.overdue,
          icon: AlertTriangle,
          tone: counts.overdue > 0 ? 'danger' : 'muted',
          caption: 'past their due date',
        },
      ]
    : [];

  return (
    <ProtectedRoute>
      <AppShell>
        <ModuleGuard moduleKey="tasks">
          <ModulePage>
            <DashboardHeader
              title="Tasks"
              hint="Everyone sees their own list; managers see everyone's. Overdue counts anything past its due date that is not done."
              description="Jobs assigned to your team, with due dates and status."
              actions={
                canCreate ? (
                  <Button onClick={openNew}>
                    <Plus className="size-4 mr-1.5" />
                    New task
                  </Button>
                ) : undefined
              }
            />

            <StatCards cards={statCards} />

            <FilterBar
              onClear={() => {
                setStatusFilter('all');
                setGuardFilter('all');
              }}
            >
              <FilterField label="Status">
                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All statuses</SelectItem>
                    {STATUSES.map((s) => <SelectItem key={s.key} value={s.key}>{s.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </FilterField>
              {guards.length > 0 ? (
                <FilterField label="Assigned to" className="min-w-[200px]">
                  <Select value={guardFilter} onValueChange={setGuardFilter}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="all">Everyone</SelectItem>
                      {guards.map((g) => <SelectItem key={g.id} value={String(g.id)}>{g.full_name}</SelectItem>)}
                    </SelectContent>
                  </Select>
                </FilterField>
              ) : null}
            </FilterBar>

            <ResultsCard title="Tasks" count={loading ? undefined : rows.length}>
              <div className="p-4">
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
                            <Pill
                              tone={
                                t.priority === 'high' ? 'danger' : t.priority === 'medium' ? 'warning' : 'muted'
                              }
                            >
                              {PRIORITIES.find((p) => p.key === t.priority)?.label ?? t.priority}
                            </Pill>
                          </TableCell>
                          <TableCell className="text-xs">
                            <Pill
                              dot
                              tone={
                                t.status === 'done' ? 'positive' : t.status === 'in_progress' ? 'info' : 'muted'
                              }
                            >
                              {STATUSES.find((s) => s.key === t.status)?.label ?? t.status}
                            </Pill>
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
                {rows.length > 0 ? (
                  <div className="mt-3 border-t pt-3">
                    <ShowingCount rangeStart={1} rangeEnd={rows.length} total={rows.length} noun="tasks" />
                  </div>
                ) : null}
              </div>
            </ResultsCard>

            <QuickLinks
              links={[
                {
                  key: 'staff',
                  title: 'Employee hub',
                  description: 'Who tasks can be assigned to, and their current shifts.',
                  icon: Users,
                  tone: 'neutral',
                  action: { label: 'Open employees', href: '/guards' },
                },
                {
                  key: 'rota',
                  title: 'Rotas & shifts',
                  description: 'Check someone is on shift before assigning them work.',
                  icon: Clock,
                  tone: 'info',
                  action: { label: 'Open rotas', href: '/rota' },
                },
                {
                  key: 'incidents',
                  title: 'Incidents',
                  description: 'Tasks raised off the back of something that went wrong.',
                  icon: AlertTriangle,
                  tone: 'warning',
                  action: { label: 'View incidents', href: '/incidents' },
                },
              ]}
            />

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
