import { NextResponse } from 'next/server';
import { buildHelpContext, findHelpAnswers } from '@/lib/help-qa';
import { askFreeLlm, sanitizeHistory } from '@/lib/free-llm';

type Body = { message?: string; history?: unknown };

const SYSTEM_PROMPT =
  'You are the ControlOps help assistant. Answer briefly and accurately, grounded in the ControlOps reference context. ' +
  'You may also answer general questions the way a helpful assistant would, but never invent ControlOps features, prices or policies. ' +
  'If the context does not cover a ControlOps-specific question, say so and suggest /help, /book-demo, or chatting with a live agent. ' +
  'Prefer plain text, short paragraphs, and bullet points when useful.';

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

  const matches = findHelpAnswers(message, 3);
  const sources = matches.map((m) => ({ title: m.question, href: m.href }));

  const llmAnswer = await askFreeLlm({
    system: SYSTEM_PROMPT,
    context: buildHelpContext(message, 4),
    question: message,
    history: sanitizeHistory(body.history),
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
