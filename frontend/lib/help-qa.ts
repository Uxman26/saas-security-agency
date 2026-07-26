import {
  HELP_ARTICLES,
  HELP_CATEGORIES,
  type HelpArticle,
  type HelpBlock,
} from '@/lib/help-content';

export type HelpQaEntry = {
  id: string;
  question: string;
  answer: string;
  href: string;
  tags: string[];
};

function blockToPlain(block: HelpBlock): string {
  switch (block.type) {
    case 'paragraph':
    case 'heading':
    case 'tip':
      return block.text;
    case 'steps':
    case 'bullets':
      return block.items.map((item, i) => (block.type === 'steps' ? `${i + 1}. ${item}` : `• ${item}`)).join('\n');
    case 'links':
      return block.items.map((i) => `${i.label}: ${i.href}`).join('\n');
    default:
      return '';
  }
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 2);
}

export function extractFaqEntries(article: HelpArticle): HelpQaEntry[] {
  const entries: HelpQaEntry[] = [];
  let currentQ: string | null = null;
  let answerParts: string[] = [];

  const flush = () => {
    if (!currentQ || !answerParts.length) {
      currentQ = null;
      answerParts = [];
      return;
    }
    entries.push({
      id: `${article.slug}:${entries.length}`,
      question: currentQ,
      answer: answerParts.join('\n\n').trim(),
      href: `/help/${article.slug}`,
      tags: [article.category, article.slug],
    });
    currentQ = null;
    answerParts = [];
  };

  for (const block of article.body) {
    if (block.type === 'heading') {
      flush();
      currentQ = block.text;
      continue;
    }
    if (currentQ) answerParts.push(blockToPlain(block));
  }
  flush();
  return entries;
}

export function getHelpQaKnowledge(): HelpQaEntry[] {
  const fromFaqArticles = HELP_ARTICLES.flatMap((a) =>
    a.category === 'faq' || a.slug === 'faq' ? extractFaqEntries(a) : []
  );

  const fromArticles = HELP_ARTICLES.map((article) => {
    const category = HELP_CATEGORIES.find((c) => c.id === article.category);
    const body = article.body.map(blockToPlain).filter(Boolean).join('\n\n');
    return {
      id: `article:${article.slug}`,
      question: article.title,
      answer: `${article.description}\n\n${body}`.trim(),
      href: `/help/${article.slug}`,
      tags: [article.category, article.slug, category?.title ?? ''],
    } satisfies HelpQaEntry;
  });

  return [...fromFaqArticles, ...fromArticles];
}

export function scoreHelpQa(entry: HelpQaEntry, query: string): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;
  const hay = `${entry.question}\n${entry.answer}\n${entry.tags.join(' ')}`.toLowerCase();
  if (hay.includes(q)) return 100;

  const tokens = tokenize(q);
  if (!tokens.length) return 0;

  let score = 0;
  const qTokens = new Set(tokenize(entry.question));
  const aTokens = new Set(tokenize(entry.answer));
  for (const t of tokens) {
    if (qTokens.has(t)) score += 8;
    else if (aTokens.has(t)) score += 3;
    else if (hay.includes(t)) score += 1;
  }
  return score;
}

export function findHelpAnswers(query: string, limit = 3): HelpQaEntry[] {
  return getHelpQaKnowledge()
    .map((entry) => ({ entry, score: scoreHelpQa(entry, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((x) => x.entry);
}

export function buildHelpContext(query: string, limit = 4): string {
  const matches = findHelpAnswers(query, limit);
  if (!matches.length) {
    return HELP_ARTICLES.slice(0, 4)
      .map((a) => `## ${a.title}\n${a.description}\n${a.body.map(blockToPlain).join('\n')}`)
      .join('\n\n');
  }
  return matches
    .map((m) => `## ${m.question}\n${m.answer}\nSource: ${m.href}`)
    .join('\n\n');
}

export const HELP_SUGGESTIONS = [
  'How do I get started?',
  'I cannot sign in',
  'How does payroll work?',
  'Can I downgrade my plan?',
  'How do I book a demo?',
];
