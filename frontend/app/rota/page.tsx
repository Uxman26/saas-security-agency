'use client';

import { useState, useMemo } from 'react';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRota } from '@/hooks/use-assignments';

export default function RotaPage() {
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  
  const params = useMemo(() => ({
    start_date: startDate || undefined,
    end_date: endDate || undefined,
  }), [startDate, endDate]);

  const { data: rota = [], isLoading, refetch, isRefetching } = useRota(params);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Rota</h1>
            <Button variant="outline" onClick={() => refetch()} disabled={isRefetching}>
              {isRefetching ? 'Refreshing...' : 'Refresh'}
            </Button>
          </div>
          <Card className="mb-6">
            <CardHeader>
              <CardTitle>Filter</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid gap-4 md:grid-cols-2">
                <div className="space-y-2">
                  <Label>Start Date</Label>
                  <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label>End Date</Label>
                  <Input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)} />
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Guard Rota</CardTitle>
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
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {rota.map((item, idx) => (
                      <TableRow key={idx}>
                        <TableCell>{item.guard_name}</TableCell>
                        <TableCell>{item.site_name}</TableCell>
                        <TableCell>{item.date}</TableCell>
                        <TableCell>
                          {item.shift_start && item.shift_end ? `${item.shift_start} - ${item.shift_end}` : '-'}
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
