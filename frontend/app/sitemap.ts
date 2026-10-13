import type { MetadataRoute } from 'next';
import { HELP_ARTICLES } from '@/lib/help-content';
import { PUBLIC_SITEMAP_PATHS, SITE_URL } from '@/lib/site';

export default function sitemap(): MetadataRoute.Sitemap {
  const now = new Date();
  const seen = new Set<string>();
  const staticEntries: MetadataRoute.Sitemap = PUBLIC_SITEMAP_PATHS.map((path) => {
    const url = `${SITE_URL}${path === '/' ? '' : path}`;
    seen.add(url);
    return {
      url,
      lastModified: now,
      changeFrequency: path === '/' || path === '/pricing' ? 'weekly' : 'monthly',
      priority: path === '/' ? 1 : path === '/pricing' || path === '/platform' ? 0.9 : path === '/help' ? 0.8 : 0.7,
    };
  });

  const helpEntries: MetadataRoute.Sitemap = HELP_ARTICLES.filter((a) => a.slug).map((a) => {
    const url = `${SITE_URL}/help/${a.slug}`;
    if (seen.has(url)) return null;
    seen.add(url);
    return {
      url,
      lastModified: now,
      changeFrequency: 'monthly' as const,
      priority: 0.55,
    };
  }).filter(Boolean) as MetadataRoute.Sitemap;

  return [...staticEntries, ...helpEntries];
}
