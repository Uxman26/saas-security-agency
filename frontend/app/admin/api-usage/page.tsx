'use client';

import { useCallback, useEffect, useState } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { ApiUsageSummary } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminApiUsagePage() {
  const { user } = useAuth();
  const [days, setDays] = useState('7');
  const [companyId, setCompanyId] = useState('');
  const [data, setData] = useState<ApiUsageSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    api.admin
      .apiUsage({
        days: parseInt(days, 10),
        company_id: companyId ? parseInt(companyId, 10) : undefined,
      })
      .then(setData)
      .catch(() => toast.error('Failed to load API usage'))
      .finally(() => setLoading(false));
  }, [days, companyId]);

  useEffect(() => {
    if (!user) return;
    load();
  }, [user, load]);

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 space-y-6">
          <div className="flex flex-wrap justify-between items-center gap-3">
            <h1 className="text-3xl font-bold">API usage</h1>
            <div className="flex flex-wrap gap-2">
              <Select value={days} onValueChange={setDays}>
                <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">1 day</SelectItem>
                  <SelectItem value="7">7 days</SelectItem>
                  <SelectItem value="30">30 days</SelectItem>
                  <SelectItem value="90">90 days</SelectItem>
                </SelectContent>
              </Select>
              <Input
                className="w-36"
                placeholder="Company ID"
                value={companyId}
                onChange={(e) => setCompanyId(e.target.value.replace(/\D/g, ''))}
              />
              <Button variant="outline" size="sm" onClick={load}>Refresh</Button>
            </div>
          </div>

          {loading && !data ? (
            <p className="text-muted-foreground">Loading...</p>
          ) : data ? (
            <>
              <Card>
                <CardHeader><CardTitle>Total calls</CardTitle></CardHeader>
                <CardContent>
                  <p className="text-3xl font-bold tabular-nums">{data.total.toLocaleString()}</p>
                  <p className="text-sm text-muted-foreground mt-1">Last {data.days} days</p>
                </CardContent>
              </Card>

              <div className="grid gap-4 lg:grid-cols-2">
                <Card>
                  <CardHeader><CardTitle>By company</CardTitle></CardHeader>
                  <CardContent>
                    {(data.by_company || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Company</TableHead>
                            <TableHead className="text-end">Calls</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.by_company.map((r, i) => (
                            <TableRow key={`${r.company_id}-${i}`}>
                              <TableCell>{r.company_name || (r.company_id != null ? `#${r.company_id}` : '—')}</TableCell>
                              <TableCell className="text-end tabular-nums">{r.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
                <Card>
                  <CardHeader><CardTitle>By path</CardTitle></CardHeader>
                  <CardContent>
                    {(data.by_path || []).length === 0 ? (
                      <p className="text-sm text-muted-foreground">No data.</p>
                    ) : (
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Path</TableHead>
                            <TableHead className="text-end">Calls</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {data.by_path.map((r, i) => (
                            <TableRow key={`${r.path}-${i}`}>
                              <TableCell className="font-mono text-xs max-w-[280px] truncate">{r.path || '—'}</TableCell>
                              <TableCell className="text-end tabular-nums">{r.count}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    )}
                  </CardContent>
                </Card>
              </div>

              <Card>
                <CardHeader><CardTitle>Recent</CardTitle></CardHeader>
                <CardContent>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Method</TableHead>
                        <TableHead>Path</TableHead>
                        <TableHead>Company</TableHead>
                        <TableHead>When</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {(data.recent || []).map((r) => (
                        <TableRow key={r.id}>
                          <TableCell className="font-mono text-xs">{r.method || '—'}</TableCell>
                          <TableCell className="font-mono text-xs max-w-md truncate">{r.path || '—'}</TableCell>
                          <TableCell>{r.company_id != null ? `#${r.company_id}` : '—'}</TableCell>
                          <TableCell className="text-sm whitespace-nowrap">
                            {r.logged_at ? new Date(r.logged_at).toLocaleString() : '—'}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </>
          ) : (
            <p className="text-muted-foreground">No data.</p>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
