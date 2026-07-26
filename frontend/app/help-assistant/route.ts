import { NextResponse } from 'next/server';
import { buildHelpContext, findHelpAnswers } from '@/lib/help-qa';

const POLLINATIONS_URL = 'https://text.pollinations.ai/openai';

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
  const context = buildHelpContext(message, 4);

  const fallback = () => {
    if (matches.length) {
      const top = matches[0];
      return {
        answer: `${top.answer}\n\nMore detail: ${top.href}`,
        sources: matches.map((m) => ({ title: m.question, href: m.href })),
        provider: 'local' as const,
      };
    }
    return {
      answer:
        'I could not find a specific answer for that. Browse the Help Centre or book a demo and the team will follow up.',
      sources: [
        { title: 'Help Centre', href: '/help' },
        { title: 'Book a demo', href: '/book-demo' },
        { title: 'FAQ', href: '/help/faq' },
      ],
      provider: 'local' as const,
    };
  };

  try {
    const res = await fetch(POLLINATIONS_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: 'Bearer not-needed',
      },
      body: JSON.stringify({
        model: 'openai',
        messages: [
          {
            role: 'system',
            content:
              'You are the ControlOps help assistant. Answer briefly and accurately using ONLY the provided ControlOps help context. If the context does not cover the question, say so and suggest /help, /help/faq, or /book-demo. Do not invent product features. Prefer plain text, short paragraphs, and bullet points when useful.',
          },
          {
            role: 'user',
            content: `Help context:\n${context}\n\nUser question: ${message}`,
          },
        ],
        temperature: 0.2,
      }),
      signal: AbortSignal.timeout(20000),
    });

    if (!res.ok) return NextResponse.json(fallback());

    const data = await res.json();
    const answer =
      data?.choices?.[0]?.message?.content?.trim() ||
      data?.content?.trim() ||
      '';

    if (!answer) return NextResponse.json(fallback());

    return NextResponse.json({
      answer,
      sources: matches.map((m) => ({ title: m.question, href: m.href })),
      provider: 'pollinations' as const,
    });
  } catch {
    return NextResponse.json(fallback());
  }
}
