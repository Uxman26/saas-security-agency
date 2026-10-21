// Free LLM over any OpenAI-compatible chat endpoint. Returns null on any failure so callers can
// fall back to the local FAQ answer. No SDK, no extra dependencies.
//
// Without env vars it uses Pollinations' keyless tier (only 1 reply per 30s per server IP). For real
// traffic set a free key, e.g. Groq:
//   LLM_API_URL=https://api.groq.com/openai/v1/chat/completions
//   LLM_API_KEY=gsk_...   LLM_MODEL=llama-3.1-8b-instant
const LLM_API_URL = process.env.LLM_API_URL || 'https://text.pollinations.ai/openai';
const LLM_API_KEY = process.env.LLM_API_KEY || '';
const LLM_MODEL = process.env.LLM_MODEL || 'openai';

export type ChatTurn = { role: 'user' | 'assistant'; content: string };

export function sanitizeHistory(raw: unknown, maxTurns = 6): ChatTurn[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter(
      (t): t is ChatTurn =>
        !!t &&
        (t.role === 'user' || t.role === 'assistant') &&
        typeof t.content === 'string' &&
        t.content.trim().length > 0
    )
    .slice(-maxTurns)
    .map((t) => ({ role: t.role, content: t.content.slice(0, 1500) }));
}

export async function askFreeLlm(opts: {
  system: string;
  context: string;
  question: string;
  history?: ChatTurn[];
  timeoutMs?: number;
}): Promise<string | null> {
  try {
    const res = await fetch(LLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(LLM_API_KEY ? { Authorization: `Bearer ${LLM_API_KEY}` } : {}),
      },
      body: JSON.stringify({
        model: LLM_MODEL,
        temperature: 0.3,
        messages: [
          { role: 'system', content: `${opts.system}\n\nReference context:\n${opts.context}` },
          ...(opts.history ?? []),
          { role: 'user', content: opts.question },
        ],
      }),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 15000),
    });
    if (!res.ok) return null;
    const data = await res.json();
    const answer = data?.choices?.[0]?.message?.content;
    return typeof answer === 'string' && answer.trim() ? toPlainText(answer) : null;
  } catch {
    return null;
  }
}

// The chat widgets render plain text, so drop markdown emphasis/headings the model adds anyway.
function toPlainText(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .trim();
}
