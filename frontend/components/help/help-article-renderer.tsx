import Link from 'next/link';
import type { HelpArticle, HelpBlock } from '@/lib/help-content';
import { getHelpCategory } from '@/lib/help-content';
import { AlertCircle, Lightbulb } from 'lucide-react';

export function HelpArticleRenderer({ article }: { article: HelpArticle }) {
  const category = getHelpCategory(article.category);

  return (
    <article className="rounded-xl border bg-card">
      <header className="border-b px-6 py-6 md:px-8">
        {category && (
          <p className="text-xs font-semibold uppercase tracking-wide text-primary mb-2">
            {category.title}
          </p>
        )}
        <h2 className="text-2xl md:text-3xl font-bold tracking-tight">{article.title}</h2>
        <p className="mt-2 text-muted-foreground">{article.description}</p>
      </header>
      <div className="px-6 py-6 md:px-8 space-y-5">
        {article.body.map((block, i) => (
          <HelpBlockView key={i} block={block} />
        ))}
      </div>
      <footer className="border-t px-6 py-4 md:px-8 flex flex-wrap gap-3 text-sm">
        <Link href="/help" className="text-muted-foreground hover:text-foreground">
          ← All help topics
        </Link>
        <span className="text-border">·</span>
        <Link href="/contact" className="text-muted-foreground hover:text-foreground">
          Contact
        </Link>
        <span className="text-border">·</span>
        <Link href="/book-demo" className="text-primary font-medium hover:underline">
          Book a demo
        </Link>
      </footer>
    </article>
  );
}

function HelpBlockView({ block }: { block: HelpBlock }) {
  switch (block.type) {
    case 'paragraph':
      return <p className="text-[15px] leading-relaxed text-foreground/90">{block.text}</p>;
    case 'heading':
      return <h3 className="text-lg font-semibold tracking-tight pt-2">{block.text}</h3>;
    case 'steps':
      return (
        <ol className="list-decimal ps-5 space-y-2 text-[15px] leading-relaxed text-foreground/90">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ol>
      );
    case 'bullets':
      return (
        <ul className="list-disc ps-5 space-y-2 text-[15px] leading-relaxed text-foreground/90">
          {block.items.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      );
    case 'tip':
      return (
        <div className="flex gap-3 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm leading-relaxed">
          <Lightbulb className="size-4 shrink-0 text-amber-600 dark:text-amber-400 mt-0.5" />
          <p>
            <span className="font-medium text-foreground">Tip: </span>
            <span className="text-muted-foreground">{block.text}</span>
          </p>
        </div>
      );
    case 'links':
      return (
        <div className="flex flex-wrap gap-2 pt-1">
          {block.items.map((item) => (
            <Link
              key={item.href + item.label}
              href={item.href}
              className="inline-flex items-center rounded-md border bg-background px-3 py-1.5 text-sm font-medium text-foreground hover:border-primary/40 hover:text-primary transition-colors"
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
