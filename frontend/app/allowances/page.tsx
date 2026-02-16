'use client';

import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { api } from '@/lib/api';
import type { Allowance } from '@/lib/types';
import { z } from 'zod';

const allowanceSchema = z.object({
  name: z.string().min(2).max(100),
  allowance_type: z.enum(['fixed', 'hourly']),
  amount: z.number().min(0),
  in_payroll: z.boolean().default(true),
  in_invoice: z.boolean().default(true),
});

export default function AllowancesPage() {
  const [open, setOpen] = useState(false);
  const [allowances, setAllowances] = useState<Allowance[]>([]);
  const [loading, setLoading] = useState(true);

  const { register, handleSubmit, reset } = useForm({
    resolver: zodResolver(allowanceSchema),
    defaultValues: { name: '', allowance_type: 'fixed', amount: 0, in_payroll: true, in_invoice: true },
  });

  const load = () => api.allowances.list().then(setAllowances).catch(() => {}).finally(() => setLoading(false));
  useEffect(() => { load(); }, []);

  const onSubmit = async (data: { name: string; allowance_type: string; amount: number; in_payroll?: boolean; in_invoice?: boolean }) => {
    try {
      await api.allowances.create({
        name: data.name,
        allowance_type: data.allowance_type,
        amount: data.amount,
        in_payroll: data.in_payroll ?? true,
        in_invoice: data.in_invoice ?? true,
      });
      setOpen(false);
      reset();
      load();
    } catch (err) {
      console.error(err);
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Delete this allowance?')) return;
    try {
      await api.allowances.delete(id);
      load();
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
            <h1 className="text-3xl font-bold">Allowances</h1>
            <Dialog open={open} onOpenChange={setOpen}>
              <DialogTrigger asChild>
                <Button>Add Allowance</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Add Allowance</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
                  <div className="space-y-2">
                    <Label>Name</Label>
                    <Input {...register('name')} />
                  </div>
                  <div className="space-y-2">
                    <Label>Type</Label>
                    <select className="w-full border rounded px-3 py-2" {...register('allowance_type')}>
                      <option value="fixed">Fixed</option>
                      <option value="hourly">Hourly</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label>Amount</Label>
                    <Input type="number" step="0.01" {...register('amount', { valueAsNumber: true })} />
                  </div>
                  <div className="flex gap-4">
                    <label className="flex items-center gap-2">
                      <input type="checkbox" {...register('in_payroll')} />
                      In Payroll
                    </label>
                    <label className="flex items-center gap-2">
                      <input type="checkbox" {...register('in_invoice')} />
                      In Invoice
                    </label>
                  </div>
                  <Button type="submit" className="w-full">Create</Button>
                </form>
              </DialogContent>
            </Dialog>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Allowances</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Name</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Payroll</TableHead>
                      <TableHead>Invoice</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {allowances.map((a) => (
                      <TableRow key={a.id}>
                        <TableCell>{a.name}</TableCell>
                        <TableCell>{a.allowance_type}</TableCell>
                        <TableCell>£{a.amount.toFixed(2)}</TableCell>
                        <TableCell>{a.in_payroll ? 'Yes' : 'No'}</TableCell>
                        <TableCell>{a.in_invoice ? 'Yes' : 'No'}</TableCell>
                        <TableCell>
                          <Button variant="destructive" size="sm" onClick={() => handleDelete(a.id)}>Delete</Button>
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
