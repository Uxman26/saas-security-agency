import { NextResponse } from 'next/server';
import { buildHelpContext, findHelpAnswers } from '@/lib/help-qa';
import { askFreeLlm, sanitizeHistory } from '@/lib/free-llm';

type Body = { message?: string; history?: unknown };

const SYSTEM_PROMPT = [
  'You are the ControlOps help assistant. ControlOps (Control Operations) is UK workforce operations software for',
  'shift-based service businesses: staff and compliance documents, sites and clients, rotas and shifts, attendance,',
  'payroll, invoicing, reports, leads, the client portal, roles and permissions, and company billing.',
  '',
  'Rules:',
  '- Answer ControlOps questions ONLY from the reference context below. Never invent menus, buttons, features,',
  '  prices, limits, integrations or policies. If the context does not cover it, say you are not sure and point',
  '  to the closest Help Centre page, /contact, /book-demo, or chatting with a live agent.',
  '- If the context only partly answers, give the part it supports and say plainly which part it does not cover.',
  '  Do not fill gaps with assumptions or "e.g." examples of settings that are not in the context.',
  '- For "how do I" questions, reply with short numbered steps using the exact menu and button names from the context.',
  '- End with the most relevant Help Centre link from the context (for example "More detail: /help/rotas-shifts").',
  '- For prices, say plans and current prices are on /pricing; do not quote numbers.',
  '- Keep replies concise: plain text, no markdown tables or headings. Reply in the same language and script the user writes in (Roman Urdu stays Roman Urdu).',
  '- Never ask for or repeat passwords, card numbers or other secrets.',
  '- You may answer brief general questions (greetings, general workforce terms) but keep the focus on ControlOps.',
].join('\n');

export async function POST(req: Request) {
  let body: Body;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ detail: 'Invalid JSON' }, { status: 400 });
  }

  const message = (body.message ?? '').trim();
  if (!message) {
    return NextResponse.json({ detail: 'Message is required' }, { status: 400 });
  }
  if (message.length > 1000) {
    return NextResponse.json({ detail: 'Message is too long' }, { status: 400 });
  }

  const history = sanitizeHistory(body.history);
  const matches = findHelpAnswers(message, 3);
  const sources = matches.map((m) => ({ title: m.question, href: m.href }));

  // Follow-ups like "and how do I delete it?" carry no topic, so retrieve with the previous question too.
  const lastUserTurn = [...history].reverse().find((t) => t.role === 'user')?.content ?? '';
  const retrievalQuery = `${message} ${lastUserTurn}`.trim();

  const llmAnswer = await askFreeLlm({
    system: SYSTEM_PROMPT,
    context: buildHelpContext(retrievalQuery, 5),
    question: message,
    history,
  });
  if (llmAnswer) {
    return NextResponse.json({ answer: llmAnswer, sources, provider: 'llm' as const });
  }

  if (matches.length) {
    const top = matches[0];
    return NextResponse.json({
      answer: `${top.answer}\n\nMore detail: ${top.href}`,
      sources,
      provider: 'local' as const,
    });
  }

  return NextResponse.json({
    answer:
      'I could not find a specific answer for that. You can chat with a live agent if one is available, browse the Help Centre, or book a demo.',
    sources: [
      { title: 'Help Centre', href: '/help' },
      { title: 'Book a demo', href: '/book-demo' },
      { title: 'FAQ', href: '/help/faq' },
    ],
    provider: 'local' as const,
    suggest_agent: true,
  });
}
