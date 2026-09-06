'use client';
import { InlineTableSkeleton } from '@/components/skeletons';

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
import Link from 'next/link';
import { api } from '@/lib/api';
import type { GuardDocument, Guard } from '@/lib/types';
import { SortableHead, TablePaginationBar } from '@/components/table-controls';
import { DEFAULT_TABLE_PAGE_SIZE, useTableList, useTableSort } from '@/lib/use-table-list';
import { FolderOpen, Plus, Trash2, AlertTriangle, Upload, Download, X, FileText } from 'lucide-react';
import { toast } from '@/lib/toast';
import { useAuth } from '@/contexts/auth-context';
import { canModule } from '@/lib/permissions';

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

const ACCEPT = '.pdf,.avif,image/avif,image/*,.doc,.docx';
const MAX_TOTAL_BYTES = 5 * 1024 * 1024;

function getExpiryStatus(date?: string): 'expired' | 'critical' | 'warning' | 'ok' | null {
  if (!date) return null;
  const daysLeft = Math.ceil((new Date(date).getTime() - Date.now()) / 86400000);
  if (daysLeft < 0) return 'expired';
  if (daysLeft <= 30) return 'critical';
  if (daysLeft <= 90) return 'warning';
  return 'ok';
}

function fmtSize(n: number) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

function displayName(doc: GuardDocument) {
  return doc.file_name || doc.file_path?.split('/').pop() || '—';
}

async function downloadDoc(doc: GuardDocument) {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token')?.trim() : null;
  const res = await fetch(api.documents.downloadUrl(doc.id), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error('Download failed');
  const blob = await res.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = displayName(doc);
  a.click();
  URL.revokeObjectURL(url);
}

export default function DocumentsPage() {
  // The API is the real boundary; these stop the UI offering actions it
  // already knows the role will be refused.
  const { user: permUser } = useAuth();
  const canCreateMod = canModule(permUser, 'documents', 'create');
  const canEditMod = canModule(permUser, 'documents', 'edit');
  const canDeleteMod = canModule(permUser, 'documents', 'delete');
  const [documents, setDocuments] = useState<GuardDocument[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [filterGuardId, setFilterGuardId] = useState('');
  const [search, setSearch] = useState('');
  const { sortKey, sortDir, toggleSort } = useTableSort();
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(DEFAULT_TABLE_PAGE_SIZE);

  const [formGuardId, setFormGuardId] = useState('');
  const [formDocType, setFormDocType] = useState('');
  const [formCustomDocType, setFormCustomDocType] = useState('');
  const [formExpiry, setFormExpiry] = useState('');
  const [formFiles, setFormFiles] = useState<File[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const totalFileBytes = useMemo(() => formFiles.reduce((n, f) => n + f.size, 0), [formFiles]);

  const guardMap = useMemo(() => new Map(guards.map((g) => [g.id, g.full_name])), [guards]);
  const guardDocCounts = useMemo(() => {
    const m = new Map<number, number>();
    documents.forEach((d) => m.set(d.guard_id, (m.get(d.guard_id) ?? 0) + 1));
    return m;
  }, [documents]);

  const loadDocuments = (guardId?: number) => {
    setLoading(true);
    api.documents.list(guardId).then(setDocuments).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDocuments();
    api.guards.list().then(setGuards).catch(() => {});
  }, []);

  const resetForm = () => {
    setFormGuardId('');
    setFormDocType('');
    setFormCustomDocType('');
    setFormExpiry('');
    setFormFiles([]);
  };

  const onFilesPicked = (list: FileList | null) => {
    if (!list?.length) return;
    const incoming = Array.from(list);
    const merged = [...formFiles];
    const keys = new Set(merged.map((f) => `${f.name}-${f.size}`));
    for (const f of incoming) {
      const key = `${f.name}-${f.size}`;
      if (keys.has(key)) continue;
      merged.push(f);
      keys.add(key);
    }
    const total = merged.reduce((n, f) => n + f.size, 0);
    if (total > MAX_TOTAL_BYTES) {
      toast.error('Total upload size must be 5 MB or less for all files combined');
      return;
    }
    setFormFiles(merged);
  };

  const handleAdd = async () => {
    if (!formGuardId || !formDocType) return;
    const docType = formDocType === 'Other' ? (formCustomDocType || 'Other') : formDocType;
    if (!formFiles.length) {
      toast.error('Select at least one file');
      return;
    }
    if (totalFileBytes > MAX_TOTAL_BYTES) {
      toast.error('Total upload size must be 5 MB or less');
      return;
    }
    setSubmitting(true);
    try {
      const guardId = parseInt(formGuardId);
      await api.documents.upload(guardId, docType, formFiles, formExpiry || undefined);
      setAddOpen(false);
      resetForm();
      loadDocuments(filterGuardId ? parseInt(filterGuardId) : undefined);
      toast.success(formFiles.length > 1 ? 'Documents uploaded as a bundle' : 'Document added');
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Upload failed');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = (id: number) => {
    toast.confirm('Delete this document?', async () => {
      try {
        await api.documents.delete(id);
        loadDocuments(filterGuardId ? parseInt(filterGuardId) : undefined);
        toast.success('Document deleted');
      } catch (e) {
        toast.error(e instanceof Error ? e.message : 'Delete failed');
      }
    }, { label: 'Delete', description: 'This cannot be undone.' });
  };

  const handleFilterGuard = (guardId: string) => {
    setFilterGuardId(guardId);
    loadDocuments(guardId && guardId !== 'all' ? parseInt(guardId) : undefined);
  };

  const getSearchText = useCallback(
    (d: GuardDocument) =>
      [guardMap.get(d.guard_id), d.document_type, d.expiry_date, d.file_path, d.file_name, d.created_at].filter(Boolean).join(' '),
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

  const expiringCount = documents.filter((d) => {
    const s = getExpiryStatus(d.expiry_date);
    return s === 'expired' || s === 'critical';
  }).length;

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><FolderOpen className="size-7" /> Documents</h1>
              <p className="text-muted-foreground mt-1">
                {documents.length} document{documents.length !== 1 ? 's' : ''} across {guardDocCounts.size} staff member{guardDocCounts.size !== 1 ? 's' : ''}
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadDocuments(filterGuardId ? parseInt(filterGuardId) : undefined)} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Dialog open={addOpen} onOpenChange={(o) => { setAddOpen(o); if (!o) resetForm(); }}>
                {canCreateMod ? (
                  <DialogTrigger asChild>
                    <Button>
                      <Plus className="size-4 mr-2" />
                      Add Documents
                    </Button>
                  </DialogTrigger>
                ) : null}
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Add guard documents</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <div className="space-y-1">
                      <Label>Guard <span className="text-destructive">*</span></Label>
                      <Select value={formGuardId} onValueChange={setFormGuardId}>
                        <SelectTrigger><SelectValue placeholder="Select guard" /></SelectTrigger>
                        <SelectContent>
                          {guards.map((g) => (
                            <SelectItem key={g.id} value={g.id.toString()}>{g.full_name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="space-y-1">
                      <Label>Document type <span className="text-destructive">*</span></Label>
                      <Select value={formDocType} onValueChange={setFormDocType}>
                        <SelectTrigger><SelectValue placeholder="Select document type" /></SelectTrigger>
                        <SelectContent>
                          {DOCUMENT_TYPES.map((t) => (
                            <SelectItem key={t} value={t}>{t}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    {formDocType === 'Other' && (
                      <div className="space-y-1">
                        <Label>Custom document type</Label>
                        <Input value={formCustomDocType} onChange={(e) => setFormCustomDocType(e.target.value)} placeholder="Specify document type" />
                      </div>
                    )}
                    <div className="space-y-1">
                      <Label>Expiry date</Label>
                      <Input type="date" value={formExpiry} onChange={(e) => setFormExpiry(e.target.value)} />
                      <p className="text-xs text-muted-foreground">Applied to all files in this upload</p>
                    </div>

                    <div className="space-y-2">
                      <Label>Files</Label>
                      <label className="flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-muted-foreground/30 bg-muted/20 px-4 py-8 cursor-pointer hover:border-primary/40 hover:bg-muted/40 transition-colors">
                        <Upload className="size-8 text-muted-foreground" />
                        <span className="text-sm font-medium">Click to select files</span>
                        <span className="text-xs text-muted-foreground text-center">PDF, images, Word — up to 5 MB total for all files. Select multiple files at once.</span>
                        <input type="file" multiple accept={ACCEPT} className="hidden" onChange={(e) => onFilesPicked(e.target.files)} />
                      </label>
                      {formFiles.length > 0 && (
                        <ul className="rounded-md border divide-y max-h-40 overflow-y-auto">
                          {formFiles.map((f, i) => (
                            <li key={`${f.name}-${i}`} className="flex items-center gap-2 px-3 py-2 text-sm">
                              <FileText className="size-4 shrink-0 text-muted-foreground" />
                              <span className="flex-1 truncate">{f.name}</span>
                              <span className="text-xs text-muted-foreground shrink-0">{fmtSize(f.size)}</span>
                              <button type="button" onClick={() => setFormFiles((prev) => prev.filter((_, j) => j !== i))} className="text-muted-foreground hover:text-destructive">
                                <X className="size-4" />
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                      {formFiles.length > 0 && (
                        <p className={`text-xs ${totalFileBytes > MAX_TOTAL_BYTES ? 'text-destructive' : 'text-muted-foreground'}`}>
                          Total: {fmtSize(totalFileBytes)} / 5 MB
                        </p>
                      )}
                    </div>

                    <Button
                      className="w-full"
                      onClick={handleAdd}
                      disabled={submitting || !formGuardId || !formDocType || !formFiles.length || totalFileBytes > MAX_TOTAL_BYTES}
                    >
                      {submitting ? 'Uploading…' : formFiles.length > 1 ? `Upload ${formFiles.length} files as bundle` : 'Add document'}
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

          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              placeholder="Search by guard or document type..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select value={filterGuardId || 'all'} onValueChange={handleFilterGuard}>
              <SelectTrigger className="w-[200px]"><SelectValue placeholder="All Guards" /></SelectTrigger>
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
              <CardTitle>Document records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <InlineTableSkeleton />
              ) : total === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No documents match your search.' : 'No documents on record. Click "Add Documents" to get started.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <SortableHead label="Guard" colKey="guard" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Document type" colKey="type" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Expiry date" colKey="expiry" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Status" colKey="status" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <SortableHead label="Added" colKey="added" sortKey={sortKey} sortDir={sortDir} onSort={toggleSort} />
                        <TableHead className="whitespace-nowrap">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {pageRows.map((doc) => {
                        const status = getExpiryStatus(doc.expiry_date);
                        const isStored = doc.file_path && !doc.file_path.startsWith('http');
                        const isBundle = (doc.file_name || '').endsWith('.zip');
                        return (
                          <TableRow key={doc.id}>
                            <TableCell className="font-medium whitespace-nowrap">
                              <div>{guardMap.get(doc.guard_id) ?? `Guard #${doc.guard_id}`}</div>
                              {(guardDocCounts.get(doc.guard_id) ?? 0) > 1 && (
                                <span className="text-xs text-muted-foreground">{guardDocCounts.get(doc.guard_id)} docs</span>
                              )}
                            </TableCell>
                            <TableCell>
                              <Link href={`/documents/${doc.id}`} className="text-primary hover:underline">
                                {doc.document_type}
                              </Link>
                              {doc.file_name ? (
                                <span className="block truncate text-xs text-muted-foreground">{doc.file_name}</span>
                              ) : null}
                            </TableCell>
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
                            <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                              {doc.created_at ? new Date(doc.created_at).toLocaleDateString() : '—'}
                            </TableCell>
                            <TableCell>
                              <div className="flex items-center gap-0.5">
                                {isStored && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-8 p-0"
                                    title={isBundle ? 'Download bundle' : 'Download'}
                                    onClick={() => {
                                      downloadDoc(doc).catch(() => toast.error('Download failed'));
                                    }}
                                  >
                                    <Download className="size-4" />
                                  </Button>
                                )}
                                {doc.file_path?.startsWith('http') && (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-8 p-0"
                                    title="Open link"
                                    onClick={() => window.open(doc.file_path!, '_blank')}
                                  >
                                    <Download className="size-4" />
                                  </Button>
                                )}
                                {canDeleteMod ? (
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    className="size-8 p-0 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={() => handleDelete(doc.id)}
                                    title="Delete document"
                                  >
                                    <Trash2 className="size-4" />
                                  </Button>
                                ) : null}
                              </div>
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
      </AppShell>
    </ProtectedRoute>
  );
}
