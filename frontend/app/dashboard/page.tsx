'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div>
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <h1 className="text-3xl font-bold mb-6">Dashboard</h1>
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Guards</CardTitle>
                <CardDescription>Manage security guards</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/guards" className="text-primary hover:underline">
                  View Guards →
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sites</CardTitle>
                <CardDescription>Manage sites</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/sites" className="text-primary hover:underline">
                  View Sites →
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Assignments</CardTitle>
                <CardDescription>Manage assignments</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/assignments" className="text-primary hover:underline">
                  View Assignments →
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Rota</CardTitle>
                <CardDescription>View guard rota</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/rota" className="text-primary hover:underline">
                  View Rota →
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Clients</CardTitle>
                <CardDescription>Manage clients</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/clients" className="text-primary hover:underline">
                  View Clients →
                </Link>
              </CardContent>
            </Card>
            <Card>
              <CardHeader>
                <CardTitle>Sub-Contractors</CardTitle>
                <CardDescription>Manage sub-contractors</CardDescription>
              </CardHeader>
              <CardContent>
                <Link href="/sub-contractors" className="text-primary hover:underline">
                  View Sub-Contractors →
                </Link>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
