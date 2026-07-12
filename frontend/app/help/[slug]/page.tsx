import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { HelpShell } from '@/components/help/help-shell';
import { HelpArticleRenderer } from '@/components/help/help-article-renderer';
import { getAllHelpSlugs, getHelpArticle } from '@/lib/help-content';

type Props = { params: Promise<{ slug: string }> };

export function generateStaticParams() {
  return getAllHelpSlugs().map((slug) => ({ slug }));
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) return { title: { absolute: 'Help | ControlOps' } };
  return {
    title: { absolute: `${article.title} | Help | ControlOps` },
    description: article.description,
  };
}

export default async function HelpArticlePage({ params }: Props) {
  const { slug } = await params;
  const article = getHelpArticle(slug);
  if (!article) notFound();

  return (
    <HelpShell activeSlug={slug}>
      <HelpArticleRenderer article={article} />
    </HelpShell>
  );
}
