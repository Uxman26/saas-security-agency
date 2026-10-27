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
      <article className="legal-prose container mx-auto px-4 py-12 md:py-16 max-w-3xl">
        <header className="not-prose mb-10 border-b border-border pb-6">
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight text-foreground">{title}</h1>
        {(effectiveDate || version) && (
          <p className="mt-3 text-sm text-muted-foreground">
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
        </header>
        {children}
        <p className="not-prose mt-12 border-t border-border pt-6 text-sm text-muted-foreground">
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
