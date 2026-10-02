import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: [
          '/dashboard',
          '/admin',
          '/settings',
          '/guards',
          '/sites',
          '/clients',
          '/rota',
          '/payroll',
          '/invoices',
          '/payments',
          '/documents',
          '/incidents',
          '/patrol',
          '/leads',
          '/tasks',
          '/occurrence',
          '/lone-worker',
          '/client-portal',
          '/my-portal',
          '/signup',
          '/login',
          '/forgot-password',
          '/reset-password',
          '/verify-email',
          '/payment-pending',
          '/auth/',
          '/api/',
        ],
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL.replace(/^https?:\/\//, ''),
  };
}
