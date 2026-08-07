'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { InlineTableSkeleton } from '@/components/skeletons';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { can, PERMS } from '@/lib/permissions';
import type { DirectoryContractorList } from '@/lib/types';
import { ContractorForm } from './contractor-form';
import { AssignmentModal } from './assignment-modal';
import { Link2, Plus } from 'lucide-react';

export default function ContractorsDirectoryPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<DirectoryContractorList[]>([]);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState<'all' | 'main' | 'sub'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [assignOpen, setAssignOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const allowSub = true; // user?.plan?.features?.sub_contractors === true;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.directoryContractors.getContractors({
        ...(typeFilter !== 'all' ? { type: typeFilter } : {}),
        ...(statusFilter === 'all' ? {} : { is_active: statusFilter === 'active' }),
      });
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, [typeFilter, statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q) || (r.contact_email || '').toLowerCase().includes(q));
  }, [rows, search]);

  const canManage = can(user, PERMS.contractorManage);
  const canAssign = can(user, PERMS.contractorAssign);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">Contractors</h1>
              <p className="text-muted-foreground mt-1">
                Main and sub-contractors for your company (directory).
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {canManage && (
                <Dialog open={addOpen} onOpenChange={setAddOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 mr-2" />
                      Add contractor
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-hidden flex flex-col">
                    <DialogHeader className="shrink-0">
                      <DialogTitle>New contractor</DialogTitle>
                    </DialogHeader>
                    <div className="min-w-0 flex-1 overflow-y-auto overflow-x-hidden pr-1">
                      <ContractorForm
                      allowSubContractors={allowSub}
                      loading={saving}
                      submitLabel="Create"
                      onSubmit={async (v) => {
                        setSaving(true);
                        try {
                          await api.directoryContractors.createContractor({
                            name: v.name,
                            type: v.type,
                            ...(v.contact_email ? { contact_email: v.contact_email } : {}),
                            ...(v.contact_phone ? { contact_phone: v.contact_phone } : {}),
                            ...(v.address ? { address: v.address } : {}),
                            ...(v.postcode ? { postcode: v.postcode } : {}),
                          });
                          setAddOpen(false);
                          await load();
                        } finally {
                          setSaving(false);
                        }
                      }}
                    />
                    </div>
                  </DialogContent>
                </Dialog>
              )}
              {canAssign && (
                <Button variant="secondary" onClick={() => setAssignOpen(true)}>
                  <Link2 className="size-4 mr-2" />
                  Assignment
                </Button>
              )}
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <Input
              placeholder="Search…"
              className="max-w-xs"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <Select value={typeFilter} onValueChange={(v) => setTypeFilter(v as typeof typeFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All types</SelectItem>
                <SelectItem value="main">Main</SelectItem>
                <SelectItem value="sub">Sub</SelectItem>
              </SelectContent>
            </Select>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as typeof statusFilter)}>
              <SelectTrigger className="w-[140px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All status</SelectItem>
                <SelectItem value="active">Active</SelectItem>
                <SelectItem value="inactive">Inactive</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <Card className="min-w-0 overflow-hidden">
            <CardHeader>
              <CardTitle>Directory ({filtered.length})</CardTitle>
            </CardHeader>
            <CardContent className="min-w-0">
              {loading ? (
                <InlineTableSkeleton />
              ) : filtered.length === 0 ? (
                <p className="text-muted-foreground py-8 text-center">No contractors yet.</p>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Name</TableHead>
                        <TableHead>Type</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Email</TableHead>
                        <TableHead />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-medium max-w-[220px]">
                            <Link href={`/contractors/${r.id}`} className="hover:underline block truncate" title={r.name}>
                              {r.name}
                            </Link>
                          </TableCell>
                          <TableCell className="whitespace-nowrap">{r.type}</TableCell>
                          <TableCell className="whitespace-nowrap">{r.is_active ? 'active' : 'inactive'}</TableCell>
                          <TableCell className="max-w-[200px] truncate" title={r.contact_email || undefined}>
                            {r.contact_email || '—'}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" asChild>
                              <Link href={`/contractors/${r.id}`}>View</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          <AssignmentModal
            open={assignOpen}
            onOpenChange={setAssignOpen}
            contractors={rows}
            onSaved={() => void load()}
          />
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
