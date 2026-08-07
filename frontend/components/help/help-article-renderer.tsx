'use client';

import Link from 'next/link';
import type { HelpArticle, HelpBlock } from '@/lib/help-content';
import { getHelpCategory } from '@/lib/help-content';
import { MagicCard } from '@/components/ui/magic-card';
import { BorderBeam } from '@/components/ui/border-beam';
import { BlurFade } from '@/components/ui/blur-fade';
import { AlertCircle, ArrowLeft, Lightbulb, Sparkles } from 'lucide-react';

export function HelpArticleRenderer({ article }: { article: HelpArticle }) {
  const category = getHelpCategory(article.category);

  return (
    <BlurFade delay={0.06} inView>
      <article className="relative">
        <MagicCard
          className="overflow-hidden rounded-3xl"
          gradientSize={320}
          gradientFrom="#E04E00"
          gradientTo="#FD8018"
          gradientColor="rgba(224,78,0,0.07)"
          gradientOpacity={0.5}
        >
          <div className="relative overflow-hidden border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 py-7 md:px-9 md:py-9">
            <BorderBeam size={100} duration={10} colorFrom="#E04E00" colorTo="#FD8018" borderWidth={1} />
            {category ? (
              <p className="mb-2 flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.1em] text-primary">
                <Sparkles className="size-3.5" />
                {category.title}
              </p>
            ) : null}
            <h2 className="text-2xl font-extrabold tracking-tight md:text-3xl">{article.title}</h2>
            <p className="mt-2 max-w-2xl text-muted-foreground">{article.description}</p>
          </div>

          <div className="space-y-5 px-6 py-7 md:px-9 md:py-8">
            {article.body.map((block, i) => (
              <HelpBlockView key={i} block={block} />
            ))}
          </div>

          <footer className="flex flex-wrap items-center gap-3 border-t border-border/60 px-6 py-4 md:px-9">
            <Link
              href="/help"
              className="inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
            >
              <ArrowLeft className="size-3.5" />
              All help topics
            </Link>
            <span className="text-border">·</span>
            <Link href="/contact" className="text-sm text-muted-foreground transition-colors hover:text-foreground">
              Contact
            </Link>
            <span className="text-border">·</span>
            <Link href="/book-demo" className="text-sm font-semibold text-primary hover:underline">
              Book a demo
            </Link>
          </footer>
        </MagicCard>
      </article>
    </BlurFade>
  );
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-[15px] leading-relaxed text-foreground/90">{block.text}</p>;
    case 'heading':
      return <h3 className="pt-2 text-lg font-semibold tracking-tight">{block.text}</h3>;
    case 'steps':
      return (
        <ol className="space-y-2.5 ps-0 text-[15px] leading-relaxed text-foreground/90">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-0.5 flex size-6 shrink-0 items-center justify-center rounded-lg bg-primary/15 text-xs font-bold text-primary ring-1 ring-primary/20">
                {i + 1}
              </span>
              <span className="pt-0.5">{item}</span>
            </li>
          ))}
        </ol>
      );
    case 'bullets':
      return (
        <ul className="space-y-2 ps-0 text-[15px] leading-relaxed text-foreground/90">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-3">
              <span className="mt-2 size-1.5 shrink-0 rounded-full bg-primary" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      );
    case 'tip':
      return (
        <div className="relative overflow-hidden rounded-2xl border border-amber-500/30 bg-amber-500/5 px-4 py-3.5 text-sm leading-relaxed dark:bg-amber-500/10">
          <div className="flex gap-3">
            <Lightbulb className="mt-0.5 size-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>
              <span className="font-semibold text-foreground">Tip: </span>
              <span className="text-muted-foreground">{block.text}</span>
            </p>
          </div>
        </div>
      );
    case 'links':
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          {block.items.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="inline-flex items-center rounded-xl border border-border/80 bg-background/80 px-3.5 py-2 text-sm font-medium text-foreground shadow-sm transition-all hover:border-primary/40 hover:text-primary hover:shadow-md dark:bg-card/60"
            >
              {item.label}
            </Link>
          ))}
        </div>
      );
    default:
      return (
        <div className="flex gap-2 text-sm text-destructive">
          <AlertCircle className="size-4" />
          Unsupported content block
        </div>
      );
  }
}
