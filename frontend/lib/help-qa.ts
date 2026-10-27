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
    .filter((t) => t.length > 2)
    .map((t) => (t.length > 4 && t.endsWith('s') && !t.endsWith('ss') ? t.slice(0, -1) : t));
}

// Words customers use for the same ControlOps concept, so "add an employee" finds the staff article.
const SYNONYM_GROUPS = [
  ['staff', 'guard', 'employee', 'worker', 'officer', 'cleaner', 'people', 'contractor', 'team'],
  ['rota', 'shift', 'schedule', 'scheduling', 'roster', 'planner'],
  ['payroll', 'pay', 'wage', 'salary', 'payslip', 'timesheet'],
  ['invoice', 'bill', 'billing', 'payment', 'charge'],
  ['login', 'signin', 'sign', 'password', 'reset', 'locked', 'verify', 'verification'],
  ['site', 'location', 'venue', 'client', 'customer', 'assignment'],
  ['plan', 'subscription', 'package', 'upgrade', 'downgrade', 'cancel', 'trial', 'pricing', 'price'],
  ['role', 'permission', 'user', 'access', 'admin'],
  ['document', 'compliance', 'licence', 'license', 'sia', 'certificate', 'expiry'],
  ['report', 'export', 'attendance', 'overtime', 'analytics'],
  ['email', 'smtp', 'sms', 'notification', 'message'],
  ['lead', 'portal', 'request', 'enquiry'],
  ['support', 'contact', 'help', 'demo', 'agent'],
];
const SYNONYMS = new Map<string, string[]>();
for (const group of SYNONYM_GROUPS) for (const word of group) SYNONYMS.set(word, group);

function expandTokens(tokens: string[]): string[] {
  const out = new Set(tokens);
  for (const t of tokens) for (const s of SYNONYMS.get(t) ?? []) out.add(s);
  return [...out];
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
  // Synonyms count for less than the user's own words so exact matches still rank first.
  for (const t of expandTokens(tokens)) {
    if (tokens.includes(t)) continue;
    if (qTokens.has(t)) score += 3;
    else if (aTokens.has(t)) score += 1;
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

export function buildHelpContext(query: string, limit = 5): string {
  const matches = findHelpAnswers(query, limit);
  const index =
    '## All Help Centre pages\n' +
    HELP_ARTICLES.map((a) => `• ${a.title}: /help/${a.slug} (${a.description})`).join('\n');
  const relevant = matches.length
    ? matches.map((m) => `## ${m.question}\n${m.answer}\nSource: ${m.href}`)
    : HELP_ARTICLES.slice(0, 3).map(
        (a) => `## ${a.title}\n${a.description}\n${a.body.map(blockToPlain).join('\n')}\nSource: /help/${a.slug}`
      );
  return [...relevant, index].join('\n\n');
}

export const HELP_SUGGESTIONS = [
  'How do I get started?',
  'I cannot sign in',
  'How does payroll work?',
  'Can I downgrade my plan?',
  'How do I book a demo?',
];
