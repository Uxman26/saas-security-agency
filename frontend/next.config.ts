import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const privateRoots = [
  'dashboard',
  'admin',
  'settings',
  'guards',
  'sites',
  'clients',
  'contractors',
  'sub-contractors',
  'vendors',
  'assignments',
  'rota',
  'payroll',
  'allowances',
  'invoices',
  'custom-invoices',
  'recurring-invoices',
  'statements',
  'payments',
  'accounts',
  'expenses',
  'fixed-expenses',
  'documents',
  'reports',
  'tasks',
  'requests',
  'incidents',
  'accident-reports',
  'occurrence-sheets',
  'patrol',
  'lone-worker',
  'leads',
  'attendance',
  'absence',
  'client-portal',
  'my-portal',
  'signup',
  'login',
  'forgot-password',
  'reset-password',
  'verify-email',
  'payment-pending',
  'auth',
] as const;

const noStore = { key: 'Cache-Control', value: 'private, no-store, max-age=0, must-revalidate' };

const nextConfig: NextConfig = {
  output: "standalone",
  async headers() {
    return [
      {
        source: '/:path*',
        headers: [
          { key: 'X-Content-Type-Options', value: 'nosniff' },
          { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
          { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
          { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
        ],
      },
      ...privateRoots.flatMap((root) => [
        { source: `/${root}`, headers: [noStore] },
        { source: `/${root}/:path*`, headers: [noStore] },
      ]),
      {
        source: '/ControlOps-Logos/:path*',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=31536000, immutable' }],
      },
      {
        source: '/image.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/image-dark.png',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=86400, stale-while-revalidate=604800' }],
      },
      {
        source: '/robots.txt',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }],
      },
      {
        source: '/sitemap.xml',
        headers: [{ key: 'Cache-Control', value: 'public, max-age=3600, stale-while-revalidate=86400' }],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
