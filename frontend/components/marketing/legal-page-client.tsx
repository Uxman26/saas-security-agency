'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

type LegalKey = 'privacy' | 'terms' | 'cookies' | 'dpa' | 'accessibility' | 'security';

export function LegalPageClient({ page }: { page: LegalKey }) {
  const t = useTranslations(`marketing.legal.${page}`);
  const tf = useTranslations('marketing.legal');

  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <article className="container mx-auto px-4 py-16 max-w-3xl prose prose-neutral dark:prose-invert">
        <h1>{t('title')}</h1>
        <p>{t('body')}</p>
        <p className="text-sm text-muted-foreground not-prose mt-12">
          {tf('footerPrefix')}{' '}
          <Link href="/book-demo" className="text-primary hover:underline">{tf('footerLink')}</Link>{' '}
          {tf('footerSuffix')}
        </p>
      </article>
      <MarketingFooter />
    </div>
  );
}
