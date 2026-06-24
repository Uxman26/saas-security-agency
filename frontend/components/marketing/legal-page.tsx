import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';

type Props = { title: string; children: React.ReactNode };

export function LegalPage({ title, children }: Props) {
  return (
    <div className="min-h-screen bg-background">
      <MarketingNav />
      <article className="container mx-auto px-4 py-16 max-w-3xl prose prose-neutral dark:prose-invert">
        <h1>{title}</h1>
        {children}
        <p className="text-sm text-muted-foreground not-prose mt-12">
          For questions, <Link href="/book-demo" className="text-primary hover:underline">book a demo</Link> or contact your ControlOps representative.
        </p>
      </article>
      <MarketingFooter />
    </div>
  );
}
