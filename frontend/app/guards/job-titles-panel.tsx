'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { InlineTableSkeleton } from '@/components/skeletons';
import { api } from '@/lib/api';
import { toast, toastMutationError } from '@/lib/toast';
import type { JobTitle } from '@/lib/types';
import { Pencil, Plus, Trash2 } from 'lucide-react';

export function JobTitlesPanel({
  titles,
  loading,
  onChanged,
  canCreate,
  canEdit,
  canDelete,
}: {
  titles: JobTitle[];
  loading: boolean;
  /** Reloads the list on the Staff page so the add/edit staff forms pick the change up. */
  onChanged: () => void | Promise<void>;
  canCreate: boolean;
  canEdit: boolean;
  canDelete: boolean;
}) {
  const [newName, setNewName] = useState('');
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState<JobTitle | null>(null);
  const [editName, setEditName] = useState('');

  const handleCreate = async () => {
    const name = newName.trim();
    if (!name) return;
    setSaving(true);
    try {
      await api.jobTitles.create(name);
      setNewName('');
      await onChanged();
      toast.success('Job title added');
    } catch (err) {
      toastMutationError(err, 'Could not add job title');
    } finally {
      setSaving(false);
    }
  };

  const handleSaveEdit = async () => {
    if (!editing) return;
    const name = editName.trim();
    if (!name || name === editing.name) {
      setEditing(null);
      return;
    }
    setSaving(true);
    try {
      await api.jobTitles.update(editing.id, name);
      setEditing(null);
      await onChanged();
      toast.success(
        editing.staff_count
          ? `Renamed, and ${editing.staff_count} staff record${editing.staff_count === 1 ? '' : 's'} updated`
          : 'Job title renamed'
      );
    } catch (err) {
      toastMutationError(err, 'Could not rename job title');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = (row: JobTitle) => {
    toast.confirm(
      `Delete the job title “${row.name}”?`,
      async () => {
        try {
          await api.jobTitles.delete(row.id);
          await onChanged();
          toast.success('Job title deleted');
        } catch (err) {
          toastMutationError(err, 'Could not delete job title');
        }
      },
      {
        label: 'Delete',
        description: row.staff_count
          ? `It is removed from the list only — the ${row.staff_count} staff member${row.staff_count === 1 ? '' : 's'} on it keep the title on their record.`
          : 'It will no longer be offered when adding or editing staff.',
      }
    );
  };

  return (
    <>
      <Card>
        <CardHeader>
          <CardTitle>Job titles</CardTitle>
          <p className="text-sm text-muted-foreground">
            The list offered when adding or editing a staff member. Renaming one also updates every
            staff record that carries it.
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          {canCreate && (
            <div className="flex flex-wrap gap-2">
              <Input
                placeholder="New job title (e.g. Site Supervisor)"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') void handleCreate();
                }}
                className="max-w-xs"
              />
              <Button onClick={() => void handleCreate()} disabled={saving || !newName.trim()}>
                <Plus className="size-4 mr-2" />
                Add job title
              </Button>
            </div>
          )}

          {loading ? (
            <InlineTableSkeleton />
          ) : titles.length === 0 ? (
            <p className="text-muted-foreground py-8 text-center">
              No job titles yet{canCreate ? ' — add the first one above.' : '.'}
            </p>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Job title</TableHead>
                    <TableHead>Staff using it</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {titles.map((t) => (
                    <TableRow key={t.id}>
                      <TableCell className="font-medium">{t.name}</TableCell>
                      <TableCell className="text-muted-foreground">{t.staff_count}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-0.5">
                          {canEdit && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setEditing(t);
                                setEditName(t.name);
                              }}
                              title="Rename job title"
                            >
                              <Pencil className="size-4" />
                            </Button>
                          )}
                          {canDelete && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(t)}
                              title="Delete job title"
                            >
                              <Trash2 className="size-4" />
                            </Button>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Rename job title</DialogTitle>
          </DialogHeader>
          <div className="space-y-2">
            <Label>Job title</Label>
            <Input
              value={editName}
              onChange={(e) => setEditName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void handleSaveEdit();
              }}
            />
            {editing && editing.staff_count > 0 && (
              <p className="text-xs text-muted-foreground">
                {editing.staff_count} staff member{editing.staff_count === 1 ? '' : 's'} will be moved to the
                new name.
              </p>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancel
            </Button>
            <Button onClick={() => void handleSaveEdit()} disabled={saving || !editName.trim()}>
              {saving ? 'Saving…' : 'Save'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
