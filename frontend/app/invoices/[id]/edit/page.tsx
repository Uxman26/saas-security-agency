'use client';

import { useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';

/**
 * Invoices are edited in the shared invoice form dialog, opened over the invoice
 * itself. This route stays so old links and bookmarks still land there.
 */
export default function InvoiceEditRedirect() {
  const params = useParams();
  const router = useRouter();
  const rawId = params.id;
  const id = Array.isArray(rawId) ? rawId[0] : rawId;

  useEffect(() => {
    router.replace(id ? `/invoices/${id}/view?edit=1` : '/invoices');
  }, [id, router]);

  return null;
}
