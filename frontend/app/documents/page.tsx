'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { GuardDocument, Guard } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { FolderOpen, Plus, Trash2, AlertTriangle } from 'lucide-react';

const DOCUMENT_TYPES = [
  'SIA Licence',
  'Right to Work',
  'Passport',
  'Driving Licence',
  'DBS Certificate',
  'First Aid Certificate',
  'Health & Safety Certificate',
  'CCTV Licence',
  'Door Supervisor Licence',
  'Security Guard Licence',
  'Employment Contract',
  'Other',
];

function getExpiryStatus(date?: string): 'expired' | 'critical' | 'warning' | 'ok' | null {
  if (!date) return null;
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  return 'ok';
}

export default function DocumentsPage() {
  const [documents, setDocuments] = useState<GuardDocument[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filterGuardId, setFilterGuardId] = useState('');
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  // Form state
  const [formGuardId, setFormGuardId] = useState('');
  const [formDocType, setFormDocType] = useState('');
  const [formCustomDocType, setFormCustomDocType] = useState('');
  const [formExpiry, setFormExpiry] = useState('');
  const [formFilePath, setFormFilePath] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);

  const loadDocuments = (guardId?: number) => {
    setLoading(true);
    api.documents.list(guardId).then(setDocuments).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDocuments();
    api.guards.list().then(setGuards).catch(() => {});
  }, []);

  const handleAdd = async () => {
    if (!formGuardId || !formDocType) return;
    setSubmitting(true);
    try {
      const docType = formDocType === 'Other' ? (formCustomDocType || 'Other') : formDocType;
      await api.documents.create({
        guard_id: parseInt(formGuardId),
        document_type: docType,
        expiry_date: formExpiry || undefined,
        file_path: formFilePath || undefined,
      });
      setAddOpen(false);
      setFormGuardId('');
      setFormDocType('');
      setFormCustomDocType('');
      setFormExpiry('');
      setFormFilePath('');
      loadDocuments(filterGuardId ? parseInt(filterGuardId) : undefined);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this document record? This cannot be undone.')) return;
    try {
      await api.documents.delete(id);
      loadDocuments(filterGuardId ? parseInt(filterGuardId) : undefined);
    } catch (err) { console.error(err); }
  };

  const handleFilterGuard = (guardId: string) => {
    setFilterGuardId(guardId);
    loadDocuments(guardId && guardId !== 'all' ? parseInt(guardId) : undefined);
  };

  const getSearchText = useCallback(
    (d: GuardDocument) =>
      [guardMap.get(d.guard_id), d.document_type, d.expiry_date, d.file_path, d.created_at].filter(Boolean).join(' '),
    [guardMap]
  );
  const getSortValue = useCallback(
    (d: GuardDocument, key: string) => {
      switch (key) {
        case 'guard':
          return guardMap.get(d.guard_id) ?? '';
        case 'type':
          return d.document_type;
        case 'expiry':
          return d.expiry_date || '';
        case 'status':
          return getExpiryStatus(d.expiry_date) || '';
        case 'file':
          return d.file_path || '';
        case 'added':
          return d.created_at || '';
        default:
          return '';
      }
    },
    [guardMap]
  );

  const { pageRows, total, pageCount, safePage, rangeStart, rangeEnd } = useTableList(
    documents,
    search,
    sortKey,
    sortDir,
    page,
    pageSize,
    getSearchText,
    getSortValue
  );

  useEffect(() => {
    setPage(1);
  }, [search, filterGuardId]);
  useEffect(() => {
    setPage((x) => Math.min(x, pageCount));
  }, [pageCount]);

  const expiringCount = documents.filter(d => {
    const s = getExpiryStatus(d.expiry_date);
    return s === 'expired' || s === 'critical';
  }).length;

  return (
    <ProtectedRoute>
      <AppShell>
      <div>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><FolderOpen className="size-7" /> Documents</h1>
              <p className="text-muted-foreground mt-1">{documents.length} document{documents.length !== 1 ? 's' : ''} on record</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadDocuments(filterGuardId ? parseInt(filterGuardId) : undefined)} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={setAddOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="size-4 mr-2" />
                    Add Document
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add Guard Document</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1">
                      <Label>Guard <span className="text-destructive">*</span></Label>
                      <Select value={formGuardId} onValueChange={setFormGuardId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select guard" />
                        </SelectTrigger>
                        <SelectContent>
                          {guards.map((g) => (
                            <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Document Type <span className="text-destructive">*</span></Label>
                      <Select value={formDocType} onValueChange={setFormDocType}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select document type" />
                        </SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formDocType === 'Other' && (
                      <div className="space-y-1">
                        <Label>Custom Document Type</Label>
                        <Input value={formCustomDocType} onChange={(e) => setFormCustomDocType(e.target.value)} placeholder="Specify document type" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Expiry Date</Label>
                      <Input type="date" value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} />
                    </div>
                    <div className="space-y-1">
                      <Label>File Path / Reference</Label>
                      <Input value={formFilePath} onChange={(e) => setFormFilePath(e.target.value)} placeholder="/docs/guard123/sia-cert.pdf" />
                      <p className="text-xs text-muted-foreground">Document storage path or external reference URL</p>
                    </div>
                    <Button className="w-full" onClick={handleAdd} disabled={submitting || !formGuardId || !formDocType}>
                      {submitting ? 'Adding...' : 'Add Document'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {expiringCount > 0 && (
            <div className="mb-4 flex items-center gap-2 p-3 rounded-md bg-amber-50 dark:bg-amber-950/20 border border-amber-200 dark:border-amber-800">
              <AlertTriangle className="size-4 text-amber-600 shrink-0" />
              <span className="text-sm text-amber-800 dark:text-amber-400 font-medium">
                {expiringCount} document{expiringCount !== 1 ? 's' : ''} expired or expiring within 30 days
              </span>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              placeholder="Search by guard or document type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterGuardId || 'all'} onValueChange={handleFilterGuard}>
              <SelectTrigger className="w-[200px]">
                <SelectValue placeholder="All Guards" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Guards</SelectItem>
                {guards.map((g) => (
                  <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>Document Records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading documents...</div>
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No documents match your search.' : 'No documents on record. Click "Add Document" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Guard" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Document Type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Expiry Date" colKey="expiry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="File Reference" colKey="file" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Added" colKey="added" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((doc) => {
                        const status = getExpiryStatus(doc.expiry_date);
                        return (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              {guardMap.get(doc.guard_id) ?? `Guard #${doc.guard_id}`}
                            </TableCell>
                            <TableCell>{doc.document_type}</TableCell>
                            <TableCell className="whitespace-nowrap">
                              {doc.expiry_date ? (
                                <span className={
                                  status === 'expired' ? 'text-destructive font-semibold' :
                                  status === 'critical' ? 'text-orange-600 font-semibold' :
                                  status === 'warning' ? 'text-amber-600 font-medium' : ''
                                }>
                                  {doc.expiry_date}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              {doc.expiry_date ? (
                                <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                                  status === 'expired' ? 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' :
                                  status === 'critical' ? 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' :
                                  status === 'warning' ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' :
                                  'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400'
                                }`}>
                                  {status === 'expired' ? 'Expired' :
                                   status === 'critical' ? 'Expiring Soon' :
                                   status === 'warning' ? 'Due Soon' : 'Valid'}
                                </span>
                              ) : (
                                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-secondary text-secondary-foreground">
                                  No Expiry
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="max-w-[180px] truncate text-sm text-muted-foreground">
                              {doc.file_path || '—'}
                            </TableCell>
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="text-destructive hover:text-destructive hover:bg-destructive/10"
                                onClick={() => handleDelete(doc.id)}
                                title="Delete document"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                  <TablePaginationBar
                    safePage={safePage}
                    pageCount={pageCount}
                    total={total}
                    pageSize={pageSize}
                    rangeStart={rangeStart}
                    rangeEnd={rangeEnd}
                    onPageChange={setPage}
                    onPageSizeChange={(n) => {
                      setPageSize(n);
                      setPage(1);
                    }}
                  />
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </AppShell>
    </ProtectedRoute>
  );
}
