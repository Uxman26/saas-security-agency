'use client';

import { useTranslations } from 'next-intl';
import { IndustryPageTemplate } from '@/components/marketing/industry-page-template';

export type IndustryKey = 'security' | 'cleaning' | 'event' | 'temporary';

export function IndustryPageClient({ industry }: { industry: IndustryKey }) {
  const t = useTranslations(`marketing.industries.${industry}`);

  const disclaimer = industry === 'security' ? t('disclaimer') : undefined;

  return (
    <IndustryPageTemplate
      eyebrow={t('eyebrow')}
      title={t('title')}
      paragraph={t('paragraph')}
      cta={t('cta')}
      disclaimer={disclaimer}
      problems={t.raw('problems') as { title: string; text: string }[]}
      capabilities={t.raw('capabilities') as { title: string; text: string }[]}
      workflow={t.raw('workflow') as string[]}
      faqs={t.raw('faqs') as { q: string; a: string }[]}
    />
  );
}
