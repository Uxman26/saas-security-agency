'use client';

import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useAssignments, useCreateAssignment, useDeleteAssignment } from '@/hooks/use-assignments';
import { useGuards } from '@/hooks/use-guards';
import { useSites } from '@/hooks/use-sites';
import { assignmentSchema } from '@/lib/validation';
import type { Assignment } from '@/lib/types';

export default function AssignmentsPage() {
  const [open, setOpen] = useState(false);
  const { data: assignments = [], isLoading, refetch, isRefetching } = useAssignments();
  const { data: guards = [] } = useGuards();
  const { data: sites = [] } = useSites();
  const createAssignment = useCreateAssignment();
  const deleteAssignment = useDeleteAssignment();

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<Omit<Assignment, 'id' | 'created_at'>>({
    resolver: zodResolver(assignmentSchema),
  });

  const guardId = watch('guard_id');
  const siteId = watch('site_id');

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);
  const siteMap = useMemo(() => new Map(sites.map((s) => [s.id, s.name])), [sites]);

  const handleCreate = async (data: Omit<Assignment, 'id' | 'created_at'>) => {
    try {
      await createAssignment.mutateAsync(data);
      setOpen(false);
      reset();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure?')) return;
    try {
      await deleteAssignment.mutateAsync(id);
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Assignments</h1>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
                {isRefetching ? 'Refreshing...' : 'Refresh'}
              </Button>
              <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Add Assignment</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Assignment</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(handleCreate)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Guard</Label>
                    <Select value={guardId?.toString() || ''} onValueChange={(v) => setValue('guard_id', parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select guard" />
                      </SelectTrigger>
                      <SelectContent>
                        {guards.map((guard) => (
                          <SelectItem key={guard.id} value={guard.id.toString()}>
                            {guard.full_name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.guard_id && <p className="text-sm text-destructive">{errors.guard_id.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Site</Label>
                    <Select value={siteId?.toString() || ''} onValueChange={(v) => setValue('site_id', parseInt(v))}>
                      <SelectTrigger>
                        <SelectValue placeholder="Select site" />
                      </SelectTrigger>
                      <SelectContent>
                        {sites.map((site) => (
                          <SelectItem key={site.id} value={site.id.toString()}>
                            {site.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    {errors.site_id && <p className="text-sm text-destructive">{errors.site_id.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Date</Label>
                    <Input type="date" {...register('date')} />
                    {errors.date && <p className="text-sm text-destructive">{errors.date.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Shift Start</Label>
                    <Input type="time" {...register('shift_start')} />
                    {errors.shift_start && <p className="text-sm text-destructive">{errors.shift_start.message}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label>Shift End</Label>
                    <Input type="time" {...register('shift_end')} />
                    {errors.shift_end && <p className="text-sm text-destructive">{errors.shift_end.message}</p>}
                  </div>
                  <Button type="submit" className="w-full" disabled={createAssignment.isPending}>
                    {createAssignment.isPending ? 'Creating...' : 'Create'}
                  </Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
        </div>
        <Card>
          <CardHeader>
            <CardTitle>All Assignments</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Loading...</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Guard</TableHead>
                    <TableHead>Site</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Shift</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {assignments.map((assignment) => (
                    <TableRow key={assignment.id}>
                      <TableCell>{guardMap.get(assignment.guard_id) || '-'}</TableCell>
                      <TableCell>{siteMap.get(assignment.site_id) || '-'}</TableCell>
                      <TableCell>{assignment.date}</TableCell>
                      <TableCell>
                        {assignment.shift_start && assignment.shift_end
                          ? `${assignment.shift_start} - ${assignment.shift_end}`
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <Button
                          variant="destructive"
                          size="sm"
                          onClick={() => handleDelete(assignment.id)}
                          disabled={deleteAssignment.isPending}
                        >
                          Delete
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
