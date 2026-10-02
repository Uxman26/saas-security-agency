import { NextResponse } from 'next/server';
import { findHelpAnswers } from '@/lib/help-qa';

type Body = { message?: string };

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
  if (matches.length) {
    const top = matches[0];
    return NextResponse.json({
      answer: `${top.answer}\n\nMore detail: ${top.href}`,
      sources: matches.map((m) => ({ title: m.question, href: m.href })),
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
