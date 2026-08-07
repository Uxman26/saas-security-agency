'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineDetailSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can, PERMS } from '@/lib/permissions';
import type { DirectoryContractor, DirectoryContractorAssignment } from '@/lib/types';
import { ContractorForm } from '../contractor-form';
import { ArrowLeft, Trash2 } from 'lucide-react';
import { toast } from '@/lib/toast';

export default function ContractorDetailPage() {
  const params = useParams();
  const id = typeof params?.id === 'string' ? params.id : '';
  const { user } = useAuth();
  const [row, setRow] = useState<DirectoryContractor | null>(null);
  const [assignments, setAssignments] = useState<DirectoryContractorAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [editOpen, setEditOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const allowSub = true; // user?.plan?.features?.sub_contractors === true;
  const canManage = can(user, PERMS.contractorManage);
  const canAssign = can(user, PERMS.contractorAssign);

  const load = useCallback(async () => {
    if (!id) return;
    setLoading(true);
    try {
      const c = await api.directoryContractors.getContractor(id);
      setRow(c);
      const q =
        c.type === 'main'
          ? { main_contractor_id: id }
          : { sub_contractor_id: id };
      const a = await api.directoryContractors.getAssignments(q);
      setAssignments(a);
    } catch {
      setRow(null);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  if (!id) return null;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6 min-w-0 max-w-full overflow-x-hidden">
          <div className="flex flex-wrap gap-4 items-center min-w-0">
            <Button variant="ghost" size="sm" asChild>
              <Link href="/contractors">
                <ArrowLeft className="size-4 mr-2" />
                Back
              </Link>
            </Button>
            {row && canManage && (
              <>
                <Dialog open={editOpen} onOpenChange={setEditOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">Edit</Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0">
                      <DialogTitle>Edit contractor</DialogTitle>
                    </DialogHeader>
                    <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                    <ContractorForm
                      allowSubContractors={allowSub}
                      loading={saving}
                      submitLabel="Save"
                      initial={{
                        name: row.name,
                        type: row.type,
                        contact_email: row.contact_email || '',
                        contact_phone: row.contact_phone || '',
                        address: row.address || '',
                        postcode: row.postcode || '',
                      }}
                      onSubmit={async (v) => {
                        setSaving(true);
                        try {
                          await api.directoryContractors.updateContractor(id, {
                            name: v.name,
                            type: v.type,
                            contact_email: v.contact_email || undefined,
                            contact_phone: v.contact_phone || undefined,
                            address: v.address || undefined,
                            postcode: v.postcode || undefined,
                          });
                          setEditOpen(false);
                          await load();
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                    </div>
                  </DialogContent>
                </Dialog>
                <Button
                  variant="destructive"
                  disabled={!row.is_active}
                  onClick={() => {
                    toast.confirm('Deactivate this contractor?', async () => {
                      await api.directoryContractors.deactivateContractor(id);
                      await load();
                      toast.success('Contractor deactivated');
                    }, { label: 'Deactivate' });
                  }}
                >
                  Deactivate
                </Button>
              </>
            )}
          </div>

          {loading || !row ? (
            loading ? <InlineDetailSkeleton /> : <p className="text-muted-foreground">Not found.</p>
          ) : (
            <>
              <div className="min-w-0">
                <h1 className="text-3xl font-bold break-words">{row.name}</h1>
                <p className="text-muted-foreground mt-1">
                  {row.type} · {row.is_active ? 'active' : 'inactive'}
                </p>
              </div>

              <Card className="min-w-0 overflow-hidden">
                <CardHeader>
                  <CardTitle>Contact</CardTitle>
                </CardHeader>
                <CardContent className="space-y-1 text-sm break-words">
                  <p>Email: {row.contact_email || '—'}</p>
                  <p>Phone: {row.contact_phone || '—'}</p>
                  <p>Address: {row.address || '—'}</p>
                  <p>Postcode: {row.postcode || '—'}</p>
                </CardContent>
              </Card>

              <Card className="min-w-0 overflow-hidden">
                <CardHeader>
                  <CardTitle>Assignments</CardTitle>
                </CardHeader>
                <CardContent>
                  {assignments.length === 0 ? (
                    <p className="text-muted-foreground text-sm">No assignments linked to this contractor.</p>
                  ) : (
                    <div className="overflow-x-auto">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Main</TableHead>
                            <TableHead>Sub</TableHead>
                            <TableHead>Site</TableHead>
                            <TableHead>Dates</TableHead>
                            {canAssign && <TableHead />}
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {assignments.map((a) => (
                            <TableRow key={a.id}>
                              <TableCell className="max-w-[160px] truncate" title={a.main_contractor.name}>
                                {a.main_contractor.name}
                              </TableCell>
                              <TableCell className="max-w-[160px] truncate" title={a.sub_contractor.name}>
                                {a.sub_contractor.name}
                              </TableCell>
                              <TableCell>{a.site_id ?? '—'}</TableCell>
                              <TableCell className="text-xs whitespace-nowrap">
                                {a.start_date || '—'} → {a.end_date || '—'}
                              </TableCell>
                              {canAssign && (
                                <TableCell className="text-right">
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="text-destructive"
                                    onClick={() => {
                                      toast.confirm('Remove assignment?', async () => {
                                        await api.directoryContractors.deleteAssignment(a.id);
                                        await load();
                                        toast.success('Assignment removed');
                                      }, { label: 'Remove' });
                                    }}
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                </TableCell>
                              )}
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  )}
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
