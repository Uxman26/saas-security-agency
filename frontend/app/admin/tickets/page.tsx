'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { SupportTicket } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { toast } from '@/lib/toast';

const STATUSES = ['open', 'in_progress', 'escalated', 'resolved', 'closed'];
const PRIORITIES = ['low', 'medium', 'high', 'critical'];

export default function AdminTicketsPage() {
  const { user } = useAuth();
  const [rows, setRows] = useState<SupportTicket[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [subject, setSubject] = useState('');
  const [body, setBody] = useState('');
  const [priority, setPriority] = useState('medium');
  const [companyId, setCompanyId] = useState('');
  const [saving, setSaving] = useState(false);
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .tickets(statusFilter !== 'all' ? { status: statusFilter } : undefined)
      .then(setRows)
      .catch(() => toast.error('Failed to load tickets'))
      .finally(() => setLoading(false));
  }, [statusFilter]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  const getSearchText = useCallback(
    (t: SupportTicket) =>
      [t.ticket_number, t.subject, t.company_name, t.status, t.priority, t.assigned_to_name]
        .filter(Boolean)
        .join(' '),
    []
  );
  const getSortValue = useCallback((t: SupportTicket, key: string) => {
    switch (key) {
      case 'number':
        return t.ticket_number;
      case 'subject':
        return t.subject;
      case 'company':
        return t.company_name || '';
      case 'priority':
        return t.priority || '';
      case 'status':
        return t.status || '';
      case 'created':
        return t.created_at;
      default:
        return '';
    }
  }, []);

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    rows,
    search,
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  const create = async () => {
    if (!subject.trim()) {
      toast.error('Subject required');
      return;
    }
    setSaving(true);
    try {
      await api.admin.createTicket({
        subject: subject.trim(),
        body: body.trim() || undefined,
        priority,
        company_id: companyId ? parseInt(companyId, 10) : undefined,
      });
      toast.success('Ticket created');
      setCreateOpen(false);
      setSubject('');
      setBody('');
      setCompanyId('');
      setPriority('medium');
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Create failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-wrap justify-between items-center gap-3 mb-6">
            <h1 className="text-3xl font-bold">Support tickets</h1>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
              <Button size="sm" onClick={() => setCreateOpen(true)}>New ticket</Button>
            </div>
          </div>
          <div className="flex flex-wrap gap-3 mb-4">
            <Input placeholder="Search tickets..." value={search} onChange={(e) => setSearch(e.target.value)} className="max-w-md" />
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40 capitalize"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                {STATUSES.map((s) => (
                  <SelectItem key={s} value={s} className="capitalize">{s.replace('_', ' ')}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Card>
            <CardHeader><CardTitle>Tickets</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-8 text-muted-foreground">No tickets.</div>
              ) : (
                <>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="#" colKey="number" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Subject" colKey="subject" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Company" colKey="company" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Priority" colKey="priority" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Created" colKey="created" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableCell />
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((t) => (
                        <TableRow key={t.id}>
                          <TableCell className="font-mono text-xs">{t.ticket_number}</TableCell>
                          <TableCell className="font-medium">
                            <Link href={`/admin/tickets/${t.id}`} className="hover:underline text-primary">
                              {t.subject}
                            </Link>
                            {t.sla_breached && <span className="ml-2 text-xs text-destructive">SLA</span>}
                          </TableCell>
                          <TableCell>{t.company_name ?? '—'}</TableCell>
                          <TableCell className="capitalize">{t.priority ?? '—'}</TableCell>
                          <TableCell className="capitalize">{(t.status || '').replace('_', ' ') || '—'}</TableCell>
                          <TableCell>{new Date(t.created_at).toLocaleDateString()}</TableCell>
                          <TableCell>
                            <Button size="sm" variant="outline" asChild>
                              <Link href={`/admin/tickets/${t.id}`}>Open</Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                  <TablePaginationBar safePage={safePage} pageCount={pageCount} total={total} pageSize={pageSize} rangeStart={rangeStart} rangeEnd={rangeEnd} onPageChange={setPage} onPageSizeChange={(n) => { setPageSize(n); setPage(1); }} />
                </>
              )}
            </CardContent>
          </Card>
        </div>

        <Dialog open={createOpen} onOpenChange={setCreateOpen}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>New ticket</DialogTitle></DialogHeader>
            <div className="space-y-3">
              <div>
                <Label>Subject</Label>
                <Input value={subject} onChange={(e) => setSubject(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Company ID (optional)</Label>
                <Input type="number" value={companyId} onChange={(e) => setCompanyId(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Priority</Label>
                <Select value={priority} onValueChange={setPriority}>
                  <SelectTrigger className="mt-1 capitalize"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {PRIORITIES.map((p) => (
                      <SelectItem key={p} value={p} className="capitalize">{p}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Message</Label>
                <Textarea value={body} onChange={(e) => setBody(e.target.value)} className="mt-1" rows={4} />
              </div>
              <Button onClick={create} disabled={saving}>{saving ? 'Creating...' : 'Create'}</Button>
            </div>
          </DialogContent>
        </Dialog>
      </AppShell>
    </ProtectedRoute>
  );
}
