'use client';

import { useState } from 'react';
import Link from 'next/link';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { api } from '@/lib/api';
import type { GlobalSearchResult } from '@/lib/types';
import { toast } from '@/lib/toast';

export default function AdminSearchPage() {
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<GlobalSearchResult | null>(null);

  const run = async () => {
    if (q.trim().length < 2) {
      toast.error('Enter at least 2 characters');
      return;
    }
    setLoading(true);
    try {
      setResult(await api.admin.search(q.trim()));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Search failed');
    } finally {
      setLoading(false);
    }
  };

  const groups = result
    ? [
        {
          title: 'Tenants',
          items: result.tenants.map((t) => ({
            key: `t-${t.id}`,
            href: `/admin/companies/${t.id}`,
            label: t.name,
            meta: t.status || '',
          })),
        },
        {
          title: 'Users',
          items: result.users.map((u) => ({
            key: `u-${u.id}`,
            href: u.company_id ? `/admin/companies/${u.company_id}` : '/admin/users',
            label: u.full_name || u.email,
            meta: [u.email, u.role].filter(Boolean).join(' · '),
          })),
        },
        {
          title: 'Tickets',
          items: result.tickets.map((t) => ({
            key: `tk-${t.id}`,
            href: `/admin/tickets/${t.id}`,
            label: `${t.ticket_number} — ${t.subject}`,
            meta: t.status || '',
          })),
        },
        {
          title: 'Invoices',
          items: result.invoices.map((i) => ({
            key: `i-${i.id}`,
            href: `/admin/invoices/${i.id}`,
            label: i.invoice_number,
            meta: `${i.status || ''}${i.total_amount != null ? ` · £${i.total_amount}` : ''}`,
          })),
        },
        {
          title: 'Errors',
          items: result.errors.map((e) => ({
            key: `e-${e.id}`,
            href: '/admin/errors',
            label: e.message,
            meta: [e.severity, e.status].filter(Boolean).join(' · '),
          })),
        },
      ]
    : [];

  return (
    <ProtectedRoute>
      <AppShell>
        <div className="container mx-auto px-4 py-8 max-w-3xl">
          <h1 className="text-3xl font-bold mb-6">Global search</h1>
          <div className="flex gap-2 mb-6">
            <Input
              placeholder="Search tenants, users, tickets, invoices..."
              value={q}
              onChange={(e) => setQ(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && run()}
            />
            <Button onClick={run} disabled={loading}>{loading ? 'Searching...' : 'Search'}</Button>
          </div>
          {result && (
            <div className="space-y-4">
              {groups.map((g) => (
                <Card key={g.title}>
                  <CardHeader className="pb-2">
                    <CardTitle className="text-base">{g.title} ({g.items.length})</CardTitle>
                  </CardHeader>
                  <CardContent>
                    {g.items.length === 0 ? (
                      <p className="text-sm text-muted-foreground">No matches.</p>
                    ) : (
                      <ul className="space-y-2">
                        {g.items.map((item) => (
                          <li key={item.key}>
                            <Link href={item.href} className="block rounded-md border px-3 py-2 hover:bg-muted/50">
                              <p className="text-sm font-medium line-clamp-1">{item.label}</p>
                              {item.meta && <p className="text-xs text-muted-foreground capitalize">{item.meta}</p>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          )}
        </div>
      </AppShell>
    </ProtectedRoute>
  );
}
