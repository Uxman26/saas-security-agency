'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { useAuth } from '@/contexts/auth-context';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { api } from '@/lib/api';
import type { Company } from '@/lib/types';

export default function AdminCompaniesPage() {
  const { user } = useAuth();
  const router = useRouter();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    if (user.role !== 'super_admin') {
      setLoading(false);
      router.replace('/dashboard');
      return;
    }
    api.admin.companies().then(setCompanies).catch(() => {}).finally(() => setLoading(false));
  }, [user, router]);

  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="flex justify-between items-center mb-6">
            <h1 className="text-3xl font-bold">Platform – All Companies</h1>
            <button
              type="button"
              onClick={() => api.admin.companies().then(setCompanies)}
              className="text-sm text-primary hover:underline"
            >
              Refresh
            </button>
          </div>
          <Card>
            <CardHeader>
              <CardTitle>Companies (tenants)</CardTitle>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">Loading...</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>ID</TableHead>
                      <TableHead>Name</TableHead>
                      <TableHead>Admin ID</TableHead>
                      <TableHead>Subscription</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {companies.map((c) => (
                      <TableRow key={c.id}>
                        <TableCell>{c.id}</TableCell>
                        <TableCell>{c.name}</TableCell>
                        <TableCell>{c.admin_id}</TableCell>
                        <TableCell>{c.subscription_tier ?? '-'}</TableCell>
                        <TableCell>{c.created_at}</TableCell>
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