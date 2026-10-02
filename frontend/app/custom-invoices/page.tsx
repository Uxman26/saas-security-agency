'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { ProtectedRoute } from '@/components/protected-route';
import { AppShell } from '@/components/app-shell';
import { ModuleHeader, ModulePage } from '@/components/module-layout';
import { Button } from '@/components/ui/button';
import Link from 'next/link';

export default function CustomInvoicesPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace('/invoices?custom=1');
  }, [router]);
  return (
    <ProtectedRoute>
      <AppShell>
        <ModulePage>
          <ModuleHeader
            title="Custom Invoices"
            description="Create a custom invoice from the Invoices module."
            actions={
              <Button asChild>
                <Link href="/invoices?custom=1">Open custom invoice</Link>
              </Button>
            }
          />
        </ModulePage>
      </AppShell>
    </ProtectedRoute>
  );
}
