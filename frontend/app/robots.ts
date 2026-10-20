import type { MetadataRoute } from 'next';
import { SITE_URL } from '@/lib/site';

const PRIVATE_PREFIXES = [
  '/dashboard',
  '/admin',
  '/settings',
  '/guards',
  '/sites',
  '/clients',
  '/contractors',
  '/sub-contractors',
  '/vendors',
  '/assignments',
  '/rota',
  '/payroll',
  '/allowances',
  '/invoices',
  '/custom-invoices',
  '/recurring-invoices',
  '/statements',
  '/payments',
  '/accounts',
  '/expenses',
  '/fixed-expenses',
  '/documents',
  '/reports',
  '/tasks',
  '/requests',
  '/incidents',
  '/accident-reports',
  '/occurrence-sheets',
  '/patrol',
  '/lone-worker',
  '/leads',
  '/attendance',
  '/absence',
  '/client-portal',
  '/my-portal',
  '/signup',
  '/login',
  '/secret',
  '/forgot-password',
  '/reset-password',
  '/verify-email',
  '/payment-pending',
  '/auth/',
  '/api/',
  '/help-assistant',
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      {
        userAgent: '*',
        allow: '/',
        disallow: PRIVATE_PREFIXES,
      },
    ],
    sitemap: `${SITE_URL}/sitemap.xml`,
    host: SITE_URL.replace(/^https?:\/\//, ''),
  };
}
