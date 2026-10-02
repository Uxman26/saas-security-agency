export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://controlops.co.uk').replace(/\/$/, '');

export const GA_MEASUREMENT_ID = (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID || '').trim();

export const PUBLIC_SITEMAP_PATHS = [
  '/',
  '/platform',
  '/pricing',
  '/about',
  '/industries',
  '/industries/security',
  '/industries/cleaning-facilities',
  '/industries/event-staffing',
  '/industries/temporary-staffing',
  '/book-demo',
  '/contact',
  '/help',
  '/privacy',
  '/terms',
  '/cookies',
  '/security',
  '/dpa',
  '/accessibility',
] as const;
