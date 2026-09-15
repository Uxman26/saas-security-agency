import type { ReactNode } from 'react';
import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

type Props = {
  title: string;
  children: ReactNode;
  effectiveDate?: string;
  version?: string;
};

export function LegalPage({ title, children, effectiveDate, version }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <article className="container mx-auto px-4 py-16 max-w-3xl prose prose-neutral dark:prose-invert prose-headings:scroll-mt-24 prose-a:text-primary">
        <h1>{title}</h1>
        {(effectiveDate || version) && (
          <p className="text-sm text-muted-foreground not-prose -mt-4 mb-8">
            {effectiveDate ? <>Effective date: {effectiveDate}</> : null}
            {effectiveDate && version ? ' · ' : null}
            {version ? <>Version {version}</> : null}
            <br />
            <span className="text-xs">
              English is the authoritative language of this document. For assistance, contact{' '}
              <a className="text-primary hover:underline" href="mailto:info@controlops.co.uk">
                info@controlops.co.uk
              </a>
              .
            </span>
          </p>
        )}
        {children}
        <p className="text-sm text-muted-foreground not-prose mt-12">
          For questions,{' '}
          <Link href="/book-demo" className="text-primary hover:underline">
            book a demo
          </Link>{' '}
          or contact your ControlOps representative.
        </p>
      </article>
      <MarketingFooter />
    </div>
  );
}
