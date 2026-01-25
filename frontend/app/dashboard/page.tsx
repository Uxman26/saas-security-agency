'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('token');
    if (!token) {
      router.push('/login');
    }
  }, [router]);

  return (
    <div>
      <Nav />
      <div className="container mx-auto px-4 py-8">
        <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
          <Card>
            <CardHeader>
              <CardTitle>Guards</CardTitle>
              <CardDescription>Manage security guards</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/guards" className="text-primary hover:underline">
                View Guards →
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Sites</CardTitle>
              <CardDescription>Manage sites</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/sites" className="text-primary hover:underline">
                View Sites →
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Assignments</CardTitle>
              <CardDescription>Manage assignments</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/assignments" className="text-primary hover:underline">
                View Assignments →
              </a>
            </CardContent>
          </Card>
          <Card>
            <CardHeader>
              <CardTitle>Rota</CardTitle>
              <CardDescription>View guard rota</CardDescription>
            </CardHeader>
            <CardContent>
              <a href="/rota" className="text-primary hover:underline">
                View Rota →
              </a>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
