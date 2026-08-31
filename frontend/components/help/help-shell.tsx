'use client';

import { createContext, useContext, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTheme } from 'next-themes';
import { MarketingNav } from '@/components/marketing/marketing-nav';
import { MarketingFooter } from '@/components/marketing/marketing-footer';
import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  articleMatchesQuery,
  type HelpArticle,
  type HelpCategoryId,
} from '@/lib/help-content';
import { Input } from '@/components/ui/input';
import { MagicCard } from '@/components/ui/magic-card';
import { SpotlightCard } from '@/components/ui/spotlight-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { FlickeringGrid } from '@/components/ui/flickering-grid';
import { cn } from '@/lib/utils';
import {
  ArrowRight,
  BookOpen,
  Building2,
  ChevronRight,
  CircleHelp,
  ClipboardList,
  FileText,
  Headphones,
  LifeBuoy,
  Search,
  Settings2,
  Sparkles,
  Users,
  Wallet,
  X,
} from 'lucide-react';

const HelpSearchContext = createContext('');

type Props = {
  children: React.ReactNode;
  activeSlug?: string;
};

const CATEGORY_ICON: Record<HelpCategoryId, React.ComponentType<{ className?: string }>> = {
  'getting-started': Sparkles,
  features: ClipboardList,
  account: Settings2,
  faq: CircleHelp,
  support: Headphones,
};

const ARTICLE_ICON: Record<string, React.ComponentType<{ className?: string }>> = {
  'getting-started': Sparkles,
  'signup-login': Users,
  'staff-documents': FileText,
  'sites-clients-assignments': Building2,
  'rotas-shifts': ClipboardList,
  'payroll-invoices': Wallet,
  'leads-client-portal': LifeBuoy,
  reports: BookOpen,
  'company-billing': Building2,
  'roles-users': Users,
  'email-sms': Settings2,
  faq: CircleHelp,
  'contact-support': Headphones,
};

/** Help Centre shell — 21st.dev 3D atmosphere (FlickeringGrid + BorderBeam + MagicCard). */
export function HelpShell({ children, activeSlug }: Props) {
  const [query, setQuery] = useState('');
  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme !== 'light';

  return (
    <div className="relative flex min-h-screen flex-col overflow-x-hidden bg-background">
      {/* Ambient field */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10"
        style={{
          background: isDark
            ? 'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(224,78,0,0.16), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 40%, rgba(253,128,24,0.06), transparent 50%), #0F172A'
            : 'radial-gradient(ellipse 70% 45% at 50% -5%, rgba(224,78,0,0.08), transparent 55%), radial-gradient(ellipse 40% 30% at 90% 40%, rgba(253,128,24,0.04), transparent 50%)',
        }}
      />
      <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 -z-10 h-[520px] overflow-hidden opacity-60 dark:opacity-40">
        <FlickeringGrid
          className="absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,white,transparent_75%)]"
          squareSize={3}
          gridGap={5}
          color={isDark ? 'rgb(253, 128, 24)' : 'rgb(224, 78, 0)'}
          maxOpacity={0.22}
          flickerChance={0.18}
        />
      </div>

      <MarketingNav active="help" />

      <div className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-10 md:py-14">
        {/* Hero */}
        <BlurFade delay={0.04} inView>
          <div className="relative mb-10 overflow-hidden rounded-3xl border border-border/70 bg-card/70 p-6 shadow-sm backdrop-blur-md md:p-10 dark:border-white/10 dark:bg-[#11161D]/75">
            <div
              aria-hidden
              className="pointer-events-none absolute inset-0"
              style={{
                background:
                  'radial-gradient(ellipse 60% 80% at 0% 0%, rgba(224,78,0,0.14), transparent 55%), radial-gradient(ellipse 40% 50% at 100% 100%, oklch(0.55 0.12 66 / 0.08), transparent 50%)',
              }}
            />
            <BorderBeam size={140} duration={12} colorFrom="#F45100" colorTo="#FF6A1F" borderWidth={1.5} />

            <div className="relative max-w-2xl">
              <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
                <span className="inline-flex size-8 items-center justify-center rounded-xl bg-primary/15 ring-1 ring-primary/25">
                  <BookOpen className="size-4" />
                </span>
                Help Centre
              </p>
              <h1 className="text-3xl font-extrabold tracking-tight text-foreground md:text-5xl">
                {activeSlug ? (
                  <Link href="/help" className="transition-colors hover:text-primary">
                    How can we help?
                  </Link>
                ) : (
                  'How can we help?'
                )}
              </h1>
              <p className="mt-3 max-w-xl text-base text-muted-foreground md:text-lg">
                Practical guides for ControlOps — signup, workforce ops, settings, and troubleshooting.
              </p>

              <div className="relative mt-6 max-w-xl">
                <MagicCard
                  className="rounded-2xl"
                  gradientSize={240}
                  gradientFrom="#F45100"
                  gradientTo="#FF6A1F"
                  gradientColor="rgba(224,78,0,0.1)"
                  gradientOpacity={0.55}
                >
                  <div className="relative">
                    <Search
                      className="pointer-events-none absolute start-3.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
                      aria-hidden
                    />
                    <Input
                      type="search"
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder="Search help articles and FAQ…"
                      aria-label="Search help articles and FAQ"
                      className="h-12 border-0 bg-transparent ps-10 pe-10 shadow-none focus-visible:ring-0"
                    />
                    {query ? (
                      <button
                        type="button"
                        onClick={() => setQuery('')}
                        className="absolute end-2.5 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-muted-foreground hover:bg-muted hover:text-foreground"
                        aria-label="Clear search"
                      >
                        <X className="size-4" />
                      </button>
                    ) : null}
                  </div>
                </MagicCard>
              </div>
            </div>
          </div>
        </BlurFade>

        <HelpSearchContext.Provider value={query}>
          <div className="grid gap-8 lg:grid-cols-[280px_minmax(0,1fr)]">
            <HelpSidebar activeSlug={activeSlug} />
            <div className="min-w-0">{children}</div>
          </div>
        </HelpSearchContext.Provider>
      </div>

      <MarketingFooter />
    </div>
  );
}

function HelpSidebar({ activeSlug }: { activeSlug?: string }) {
  const query = useContext(HelpSearchContext);
  const hasQuery = Boolean(query.trim());

  return (
    <aside className="space-y-5 lg:sticky lg:top-24 lg:self-start">
      <BlurFade delay={0.08} inView>
        <SpotlightCard
          className="rounded-2xl border-border/70 bg-card/80 p-4 backdrop-blur-md dark:border-white/10 dark:bg-[#11161D]/80"
          spotlightColor="rgba(224, 78, 0, 0.16)"
          size={280}
        >
          <nav aria-label="Help topics" className="relative space-y-5">
            {HELP_CATEGORIES.map((cat) => {
              const Icon = CATEGORY_ICON[cat.id];
              const articles = HELP_ARTICLES.filter(
                (a) => a.category === cat.id && articleMatchesQuery(a, query)
              ).sort((a, b) => a.order - b.order);
              if (!articles.length) return null;
              return (
                <div key={cat.id}>
                  <p className="mb-2 flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
                    <Icon className="size-3.5 text-primary" />
                    {cat.title}
                  </p>
                  <ul className="space-y-0.5">
                    {articles.map((a) => (
                      <li key={a.slug}>
                        <Link
                          href={`/help/${a.slug}`}
                          className={cn(
                            'flex items-center gap-1.5 rounded-xl px-2.5 py-2 text-sm transition-all',
                            activeSlug === a.slug
                              ? 'bg-primary/15 font-medium text-primary ring-1 ring-primary/25'
                              : 'text-muted-foreground hover:bg-muted/70 hover:text-foreground'
                          )}
                        >
                          <ChevronRight
                            className={cn(
                              'size-3.5 shrink-0 opacity-0 transition-opacity',
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
            {hasQuery && !HELP_ARTICLES.some((a) => articleMatchesQuery(a, query)) ? (
              <p className="px-1 text-sm text-muted-foreground">No matching topics.</p>
            ) : null}
          </nav>
        </SpotlightCard>
      </BlurFade>

      <BlurFade delay={0.12} inView>
        <div className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-5 dark:bg-primary/10">
          <BorderBeam size={80} duration={8} colorFrom="#F45100" colorTo="#FF6A1F" borderWidth={1} />
          <p className="relative font-semibold text-foreground">Need a walkthrough?</p>
          <p className="relative mt-1.5 text-xs leading-relaxed text-muted-foreground">
            Book a demo and we will contact you using the work email you provide.
          </p>
          <Link
            href="/book-demo"
            className="relative mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-primary hover:underline"
          >
            Book a demo
            <ArrowRight className="size-3.5" />
          </Link>
        </div>
      </BlurFade>
    </aside>
  );
}

export function HelpHubGrid() {
  const query = useContext(HelpSearchContext);
  const hasQuery = Boolean(query.trim());

  const sections = useMemo(
    () =>
      HELP_CATEGORIES.map((cat) => ({
        cat,
        articles: HELP_ARTICLES.filter(
          (a) => a.category === cat.id && articleMatchesQuery(a, query)
        ).sort((a, b) => a.order - b.order),
      })).filter((s) => s.articles.length > 0),
    [query]
  );

  if (hasQuery && sections.length === 0) {
    return (
      <BlurFade delay={0.1} inView>
        <MagicCard
          className="rounded-2xl"
          gradientFrom="#F45100"
          gradientTo="#FF6A1F"
          gradientColor="rgba(224,78,0,0.08)"
        >
          <div className="p-10 text-center">
            <CircleHelp className="mx-auto size-10 text-primary/70" />
            <p className="mt-4 font-semibold">No help articles match “{query.trim()}”</p>
            <p className="mt-2 text-sm text-muted-foreground">
              Try a different keyword, or browse topics in the sidebar.
            </p>
          </div>
        </MagicCard>
      </BlurFade>
    );
  }

  const total = sections.reduce((n, s) => n + s.articles.length, 0);

  return (
    <div className="space-y-12">
      {hasQuery ? (
        <p className="text-sm text-muted-foreground">
          Showing {total} result{total === 1 ? '' : 's'} for “{query.trim()}”
        </p>
      ) : null}
      {sections.map(({ cat, articles }, si) => {
        const CatIcon = CATEGORY_ICON[cat.id];
        return (
          <BlurFade key={cat.id} delay={0.06 + si * 0.05} inView>
            <section>
              <div className="mb-4 flex items-start gap-3">
                <span className="mt-0.5 inline-flex size-9 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-primary/20">
                  <CatIcon className="size-4 text-primary" />
                </span>
                <div>
                  <h2 className="text-xl font-bold tracking-tight">{cat.title}</h2>
                  <p className="mt-0.5 text-sm text-muted-foreground">{cat.description}</p>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                {articles.map((a, i) => (
                  <HelpArticleCard key={a.slug} article={a} delay={0.04 + i * 0.03} />
                ))}
              </div>
            </section>
          </BlurFade>
        );
      })}
    </div>
  );
}

function HelpArticleCard({ article, delay = 0 }: { article: HelpArticle; delay?: number }) {
  const Icon = ARTICLE_ICON[article.slug] ?? BookOpen;

  return (
    <BlurFade delay={delay} inView>
      <Link href={`/help/${article.slug}`} className="group block h-full">
        <MagicCard
          className="h-full rounded-2xl"
          gradientSize={220}
          gradientFrom="#F45100"
          gradientTo="#FF6A1F"
          gradientColor="rgba(224,78,0,0.1)"
          gradientOpacity={0.55}
        >
          <div className="relative flex h-full flex-col p-5 transition-transform duration-200 group-hover:-translate-y-0.5">
            <div className="mb-3 flex items-start justify-between gap-3">
              <span className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 ring-1 ring-border/60 dark:bg-primary/20">
                <Icon className="size-4 text-primary" />
              </span>
              <ArrowRight className="size-4 text-muted-foreground/50 transition-all group-hover:translate-x-0.5 group-hover:text-primary" />
            </div>
            <h3 className="font-semibold leading-snug text-foreground transition-colors group-hover:text-primary">
              {article.title}
            </h3>
            <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">{article.description}</p>
          </div>
        </MagicCard>
      </Link>
    </BlurFade>
  );
}
