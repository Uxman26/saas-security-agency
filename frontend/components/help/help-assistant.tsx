'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HELP_SUGGESTIONS } from '@/lib/help-qa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { MessageCircleQuestion, Send, X, Loader2, BookOpen } from 'lucide-react';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: { title: string; href: string }[];
};

const APP_PREFIXES = [
  '/dashboard',
  '/guards',
  '/sites',
  '/clients',
  '/assignments',
  '/rota',
  '/client-portal',
  '/requests',
  '/attendance',
  '/documents',
  '/contractors',
  '/sub-contractors',
  '/payroll',
  '/reports',
  '/invoices',
  '/expenses',
  '/payments',
  '/allowances',
  '/leads',
  '/settings',
  '/admin',
];

function isAppRoute(pathname: string) {
  return APP_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function HelpAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi — ask me anything about ControlOps. I can help with signup, rotas, payroll, billing, and troubleshooting.',
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages, busy]);

  if (isAppRoute(pathname)) return null;

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    setInput('');
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text: q }]);
    setBusy(true);

    try {
      const res = await fetch('/help-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q }),
      });
      const data = await res.json().catch(() => ({}));
      const answer =
        typeof data.answer === 'string' && data.answer
          ? data.answer
          : 'Something went wrong. Try the Help Centre or book a demo.';
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: answer,
          sources: Array.isArray(data.sources) ? data.sources : undefined,
        },
      ]);
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: 'I could not reach the help assistant right now. Browse /help or book a demo.',
          sources: [
            { title: 'Help Centre', href: '/help' },
            { title: 'Book a demo', href: '/book-demo' },
          ],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed bottom-4 end-4 z-[60] flex flex-col items-end gap-3 pointer-events-none">
      {open ? (
        <div
          className="pointer-events-auto w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/20"
          role="dialog"
          aria-label="ControlOps help assistant"
        >
          <div className="flex items-center justify-between gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <p className="font-semibold leading-tight">Ask ControlOps</p>
              <p className="text-xs text-primary-foreground/80">FAQ & product help</p>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="rounded-lg p-1.5 hover:bg-primary-foreground/15"
              aria-label="Close help assistant"
            >
              <X className="size-4" />
            </button>
          </div>

          <div className="flex max-h-[min(60vh,28rem)] flex-col">
            <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
              {messages.map((m) => (
                <div
                  key={m.id}
                  className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}
                >
                  <div
                    className={cn(
                      'max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                      m.role === 'user'
                        ? 'bg-primary text-primary-foreground rounded-br-md'
                        : 'bg-muted text-foreground rounded-bl-md'
                    )}
                  >
                    {m.text}
                    {m.sources?.length ? (
                      <div className="mt-2 space-y-1 border-t border-border/40 pt-2">
                        {m.sources.slice(0, 3).map((s) => (
                          <Link
                            key={s.href + s.title}
                            href={s.href}
                            className="flex items-center gap-1.5 text-xs font-medium text-primary hover:underline"
                            onClick={() => setOpen(false)}
                          >
                            <BookOpen className="size-3 shrink-0" />
                            <span className="truncate">{s.title}</span>
                          </Link>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}
              {busy ? (
                <div className="flex justify-start">
                  <div className="inline-flex items-center gap-2 rounded-2xl rounded-bl-md bg-muted px-3 py-2 text-sm text-muted-foreground">
                    <Loader2 className="size-3.5 animate-spin" />
                    Thinking…
                  </div>
                </div>
              ) : null}
              <div ref={bottomRef} />
            </div>

            {!busy && messages.length < 3 ? (
              <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
                {HELP_SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => ask(s)}
                    className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                  >
                    {s}
                  </button>
                ))}
              </div>
            ) : null}

            <form
              className="flex items-center gap-2 border-t p-3"
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
            >
              <Input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask a question…"
                aria-label="Ask a help question"
                disabled={busy}
                className="h-10"
              />
              <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      ) : null}

      <Button
        type="button"
        size="icon-lg"
        onClick={() => setOpen((v) => !v)}
        className="pointer-events-auto size-14 rounded-full shadow-lg shadow-foreground/20"
        aria-label={open ? 'Close help assistant' : 'Open help assistant'}
        aria-expanded={open}
      >
        {open ? <X className="size-6" /> : <MessageCircleQuestion className="size-6" />}
      </Button>
    </div>
  );
}
