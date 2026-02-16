'use client';

import { useState, useEffect } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import type { Payroll } from '@/lib/types';

export default function PayrollPage() {
  const [payrolls, setPayrolls] = useState<Payroll[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.payroll.list().then(setPayrolls).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Payroll</h1>
            <Button variant="outline" onClick={() => api.payroll.list().then(setPayrolls)} disabled={loading}>
              Refresh
            </Button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Payroll Records</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Guard ID</TableHead>
                      <TableHead>Period</TableHead>
                      <TableHead>Hours</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Bank</TableHead>
                      <TableHead>Cash</TableHead>
                      <TableHead>Allowances</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {payrolls.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell>{p.guard_id}</TableCell>
                        <TableCell>{p.period_start} – {p.period_end}</TableCell>
                        <TableCell>{p.total_hours.toFixed(2)}</TableCell>
                        <TableCell>£{p.hourly_rate.toFixed(2)}</TableCell>
                        <TableCell>£{p.bank_amount.toFixed(2)}</TableCell>
                        <TableCell>£{p.cash_amount.toFixed(2)}</TableCell>
                        <TableCell>£{p.allowance_total.toFixed(2)}</TableCell>
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
