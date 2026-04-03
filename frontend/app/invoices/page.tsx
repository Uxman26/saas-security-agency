'use client';

import { useState, useEffect, useMemo } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { api } from '@/lib/api';
import type { Invoice, Client } from '@/lib/types';
import { FileText, Zap, Trash2 } from 'lucide-react';

const STATUS_STYLES: Record<string, string> = {
  draft: 'bg-secondary text-secondary-foreground',
  sent: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400',
  paid: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400',
  overdue: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400',
  cancelled: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
};

const STATUS_OPTIONS = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

export default function InvoicesPage() {
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [genOpen, setGenOpen] = useState(false);
  const [genClientId, setGenClientId] = useState('');
  const [genStart, setGenStart] = useState('');
  const [genEnd, setGenEnd] = useState('');
  const [genLoading, setGenLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState('');
  const [search, setSearch] = useState('');

  const clientMap = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);

  const loadInvoices = (status?: string) => {
    setLoading(true);
    api.invoices.list(status ? { status } : {}).then(setInvoices).catch(() => {}).finally(() => setLoading(false));
  };

  useEffect(() => {
    loadInvoices();
    api.clients.list().then(setClients).catch(() => {});
  }, []);

  const handleGenerate = async () => {
    if (!genClientId || !genStart || !genEnd) return;
    setGenLoading(true);
    try {
      await api.invoices.generate(parseInt(genClientId), genStart, genEnd);
      setGenOpen(false);
      setGenClientId('');
      setGenStart('');
      setGenEnd('');
      loadInvoices();
    } catch (err) {
      console.error(err);
    } finally {
      setGenLoading(false);
    }
  };

  const handleStatusChange = async (id: number, newStatus: string) => {
    try {
      await api.invoices.updateStatus(id, newStatus);
      loadInvoices(statusFilter || undefined);
    } catch (err) { console.error(err); }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this invoice? This cannot be undone.')) return;
    try {
      await api.invoices.delete(id);
      loadInvoices(statusFilter || undefined);
    } catch (err) { console.error(err); }
  };

  const filtered = useMemo(() =>
    invoices.filter(inv =>
      (clientMap.get(inv.client_id) ?? '').toLowerCase().includes(search.toLowerCase()) ||
      inv.status.includes(search.toLowerCase()) ||
      inv.period_start.includes(search) ||
      inv.period_end.includes(search)
    ), [invoices, search, clientMap]);

  const totalAmount = filtered.reduce((sum, inv) => sum + inv.total, 0);
  const paidAmount = filtered.filter(i => i.status === 'paid').reduce((sum, i) => sum + i.total, 0);
  const outstanding = filtered.filter(i => ['sent', 'overdue'].includes(i.status)).reduce((sum, i) => sum + i.total, 0);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
            <div>
              <h1 className="text-3xl font-bold flex items-center gap-2"><FileText className="size-7" /> Invoices</h1>
              <p className="text-muted-foreground mt-1">{invoices.length} invoice{invoices.length !== 1 ? 's' : ''}</p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => loadInvoices(statusFilter || undefined)} disabled={loading}>
                {loading ? 'Loading...' : 'Refresh'}
              </Button>
              <Dialog open={genOpen} onOpenChange={setGenOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Zap className="size-4 mr-2" />
                    Generate Invoice
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Generate Invoice from Assignments</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4 py-2">
                    <p className="text-sm text-muted-foreground">
                      Auto-generate an invoice for a client based on completed assignments in the given period.
                    </p>
                    <div className="space-y-1">
                      <Label>Client <span className="text-destructive">*</span></Label>
                      <Select value={genClientId} onValueChange={setGenClientId}>
                        <SelectTrigger>
                          <SelectValue placeholder="Select client" />
                        </SelectTrigger>
                        <SelectContent>
                          {clients.map((c) => (
                            <SelectItem key={c.id} value={c.id.toString()}>{c.name}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1">
                        <Label>Period Start <span className="text-destructive">*</span></Label>
                        <Input type="date" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
                      </div>
                      <div className="space-y-1">
                        <Label>Period End <span className="text-destructive">*</span></Label>
                        <Input type="date" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
                      </div>
                    </div>
                    <Button
                      className="w-full"
                      onClick={handleGenerate}
                      disabled={genLoading || !genClientId || !genStart || !genEnd}
                    >
                      {genLoading ? 'Generating...' : 'Generate Invoice'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </div>

          {/* Summary cards */}
          {invoices.length > 0 && (
            <div className="grid gap-4 sm:grid-cols-3 mb-6">
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Total Invoiced</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold">£{totalAmount.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Paid</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-green-600">£{paidAmount.toFixed(2)}</span>
                </CardContent>
              </Card>
              <Card>
                <CardHeader className="pb-2">
                  <CardTitle className="text-sm font-medium text-muted-foreground">Outstanding</CardTitle>
                </CardHeader>
                <CardContent>
                  <span className="text-2xl font-bold text-amber-600">£{outstanding.toFixed(2)}</span>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-3 mb-4">
            <Input
              placeholder="Search by client, status or period..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="max-w-sm"
            />
            <Select
              value={statusFilter || 'all'}
              onValueChange={(v) => {
                const val = v === 'all' ? '' : v;
                setStatusFilter(val);
                loadInvoices(val || undefined);
              }}
            >
              <SelectTrigger className="w-[160px]">
                <SelectValue placeholder="All statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                {STATUS_OPTIONS.map((s) => (
                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Card>
            <CardHeader>
              <CardTitle>All Invoices</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading invoices...</div>
              ) : filtered.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  {search ? 'No invoices match your search.' : 'No invoices yet. Use "Generate Invoice" to create one.'}
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Inv #</TableHead>
                        <TableHead>Client</TableHead>
                        <TableHead>Period</TableHead>
                        <TableHead>Total</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Change Status</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filtered.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-medium text-muted-foreground">#{inv.id}</TableCell>
                          <TableCell className="font-medium whitespace-nowrap">
                            {clientMap.get(inv.client_id) ?? `Client #${inv.client_id}`}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-sm">
                            {inv.period_start} – {inv.period_end}
                          </TableCell>
                          <TableCell className="font-bold whitespace-nowrap">£{inv.total.toFixed(2)}</TableCell>
                          <TableCell>
                            <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[inv.status] ?? 'bg-secondary text-secondary-foreground'}`}>
                              {inv.status.charAt(0).toUpperCase() + inv.status.slice(1)}
                            </span>
                          </TableCell>
                          <TableCell>
                            <Select
                              value={inv.status}
                              onValueChange={(v) => handleStatusChange(inv.id, v)}
                            >
                              <SelectTrigger className="h-7 text-xs w-[120px]">
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {STATUS_OPTIONS.map((s) => (
                                  <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="text-destructive hover:text-destructive hover:bg-destructive/10"
                              onClick={() => handleDelete(inv.id)}
                              title="Delete invoice"
                            >
                              <Trash2 className="size-4" />
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
        </div>
      </div>
    </ProtectedRoute>
  );
}
