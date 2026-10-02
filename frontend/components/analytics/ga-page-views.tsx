'use client';

import { useEffect } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import { GA_MEASUREMENT_ID } from '@/lib/site';
import { hasAnalyticsConsent, trackPageView } from '@/lib/analytics';

export function GaPageViews() {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!GA_MEASUREMENT_ID || !hasAnalyticsConsent()) return;
    const qs = searchParams?.toString();
    trackPageView(qs ? `${pathname}?${qs}` : pathname || '/');
  }, [pathname, searchParams]);

  return null;
}
