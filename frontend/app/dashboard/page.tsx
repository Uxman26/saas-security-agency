'use client';

import { ProtectedRoute } from '@/components/protected-route';
import { Nav } from '@/components/nav';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Link from 'next/link';
import {
  Users,
  MapPin,
  ClipboardList,
  Calendar,
  Building2,
  UserCog,
  ArrowRight,
} from 'lucide-react';

const tiles = [
  { href: '/guards', title: 'Guards', desc: 'Manage security guards', icon: Users },
  { href: '/sites', title: 'Sites', desc: 'Manage sites', icon: MapPin },
  { href: '/assignments', title: 'Assignments', desc: 'Manage assignments', icon: ClipboardList },
  { href: '/rota', title: 'Rota', desc: 'View guard rota', icon: Calendar },
  { href: '/clients', title: 'Clients', desc: 'Manage clients', icon: Building2 },
  { href: '/sub-contractors', title: 'Sub-Contractors', desc: 'Manage sub-contractors', icon: UserCog },
];

export default function DashboardPage() {
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-b from-background to-muted/30">
        <Nav />
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold tracking-tight text-foreground">Dashboard</h1>
            <p className="mt-1 text-muted-foreground">Overview of your security operations</p>
          </div>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {tiles.map(({ href, title, desc, icon: Icon }) => (
              <Link key={href} href={href}>
                <Card className="h-full transition-all duration-200 border-border/80 hover:border-primary/30 hover:shadow-md hover:shadow-primary/5 group">
                  <CardHeader className="flex flex-row items-start gap-4">
                    <div className="rounded-lg bg-primary/10 p-2.5 text-primary group-hover:bg-primary/20 transition-colors">
                      <Icon className="size-5" />
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <CardTitle className="text-lg">{title}</CardTitle>
                      <CardDescription>{desc}</CardDescription>
                    </div>
                    <ArrowRight className="size-4 text-muted-foreground shrink-0 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </CardHeader>
                  <CardContent className="pt-0">
                    <span className="text-sm font-medium text-primary group-hover:underline">
                      View {title} →
                    </span>
                  </CardContent>
                </Card>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
