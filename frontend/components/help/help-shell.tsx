'use client';

import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import { HELP_ARTICLES, HELP_CATEGORIES, type HelpArticle } from '@/lib/help-content';
import { cn } from '@/lib/utils';
import { BookOpen, ChevronRight } from 'lucide-react';

type Props = {
  children: React.ReactNode;
  activeSlug?: string;
};

export function HelpShell({ children, activeSlug }: Props) {
  return (
    <div className="min-h-screen bg-background flex flex-col">
      <MarketingNav active="help" />
      <div className="flex-1 container mx-auto px-4 py-10 md:py-14">
        <div className="mb-8 max-w-3xl">
          <p className="text-sm font-medium text-primary mb-2 flex items-center gap-2">
            <BookOpen className="size-4" />
            Help Centre
          </p>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">
            {activeSlug ? (
              <Link href="/help" className="hover:text-primary transition-colors">
                How can we help?
              </Link>
            ) : (
              'How can we help?'
            )}
          </h1>
          <p className="mt-3 text-muted-foreground">
            Practical guides for ControlOps — signup, workforce ops, settings, and troubleshooting.
          </p>
        </div>
        <div className="grid gap-8 lg:grid-cols-[240px_minmax(0,1fr)] xl:grid-cols-[260px_minmax(0,1fr)]">
          <HelpSidebar activeSlug={activeSlug} />
          <div className="min-w-0">{children}</div>
        </div>
      </div>
      <MarketingFooter />
    </div>
  );
}

function HelpSidebar({ activeSlug }: { activeSlug?: string }) {
  return (
    <aside className="lg:sticky lg:top-24 lg:self-start space-y-6">
      <nav aria-label="Help topics" className="rounded-xl border bg-card p-4 space-y-5">
        {HELP_CATEGORIES.map((cat) => {
          const articles = HELP_ARTICLES.filter((a) => a.category === cat.id).sort(
            (a, b) => a.order - b.order
          );
          if (!articles.length) return null;
          return (
            <div key={cat.id}>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {cat.title}
              </p>
              <ul className="space-y-0.5">
                {articles.map((a) => (
                  <li key={a.slug}>
                    <Link
                      href={`/help/${a.slug}`}
                      className={cn(
                        'flex items-center gap-1 rounded-md px-2 py-1.5 text-sm transition-colors',
                        activeSlug === a.slug
                          ? 'bg-primary/10 text-primary font-medium'
                          : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                      )}
                    >
                      <ChevronRight
                        className={cn(
                          'size-3.5 shrink-0 opacity-0',
                          activeSlug === a.slug && 'opacity-100'
                        )}
                      />
                      <span className="leading-snug">{a.title}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </nav>
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-4 text-sm">
        <p className="font-medium text-foreground">Need a walkthrough?</p>
        <p className="mt-1 text-muted-foreground text-xs leading-relaxed">
          Book a demo and we will contact you using the work email you provide.
        </p>
        <Link
          href="/book-demo"
          className="mt-3 inline-flex text-sm font-medium text-primary hover:underline"
        >
          Book a demo →
        </Link>
      </div>
    </aside>
  );
}

export function HelpHubGrid() {
  return (
    <div className="space-y-10">
      {HELP_CATEGORIES.map((cat) => {
        const articles = HELP_ARTICLES.filter((a) => a.category === cat.id).sort(
          (a, b) => a.order - b.order
        );
        if (!articles.length) return null;
        return (
          <section key={cat.id}>
            <h2 className="text-xl font-semibold tracking-tight">{cat.title}</h2>
            <p className="mt-1 text-sm text-muted-foreground mb-4">{cat.description}</p>
            <div className="grid gap-3 sm:grid-cols-2">
              {articles.map((a) => (
                <HelpArticleCard key={a.slug} article={a} />
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function HelpArticleCard({ article }: { article: HelpArticle }) {
  return (
    <Link
      href={`/help/${article.slug}`}
      className="group rounded-xl border bg-card p-4 transition-colors hover:border-primary/40 hover:bg-muted/30"
    >
      <h3 className="font-medium group-hover:text-primary transition-colors">{article.title}</h3>
      <p className="mt-1.5 text-sm text-muted-foreground leading-relaxed">{article.description}</p>
    </Link>
  );
}
