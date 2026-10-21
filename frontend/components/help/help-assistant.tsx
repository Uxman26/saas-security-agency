'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { HELP_SUGGESTIONS } from '@/lib/help-qa';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';
import { api, ApiError } from '@/lib/api';
import { BookOpen, Headphones, Loader2, MessageCircleQuestion, Send, X } from 'lucide-react';

type ChatMsg = {
  id: string;
  role: 'user' | 'assistant' | 'agent' | 'system';
  text: string;
  sources?: { title: string; href: string }[];
};

type Mode = 'ai' | 'intake' | 'live';

const LIVE_CHAT_KEY = 'controlops_live_chat';
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

type LiveChatSession = { public_id: string; visitor_token: string };

function readLiveChatSession(): LiveChatSession | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(LIVE_CHAT_KEY) || sessionStorage.getItem('controlops_live_chat_id');
    if (!raw) return null;
    if (raw.startsWith('LC-')) return { public_id: raw, visitor_token: '' };
    const parsed = JSON.parse(raw) as Partial<LiveChatSession>;
    if (parsed.public_id) return { public_id: String(parsed.public_id), visitor_token: String(parsed.visitor_token || '') };
  } catch {
    return null;
  }
  return null;
}

function writeLiveChatSession(session: LiveChatSession | null) {
  if (typeof window === 'undefined') return;
  if (!session) {
    localStorage.removeItem(LIVE_CHAT_KEY);
    sessionStorage.removeItem('controlops_live_chat_id');
    return;
  }
  localStorage.setItem(LIVE_CHAT_KEY, JSON.stringify(session));
  sessionStorage.removeItem('controlops_live_chat_id');
}

function validateIntake(intake: { full_name: string; email: string; company_name: string; city: string }) {
  const errors: Record<string, string> = {};
  if (intake.full_name.trim().length < 2) errors.full_name = 'Enter your name.';
  if (!EMAIL_RE.test(intake.email.trim())) errors.email = 'Enter a valid email address.';
  if (intake.company_name.trim().length < 2) errors.company_name = 'Enter your company name.';
  if (intake.city.trim().length < 2) errors.city = 'Enter your city.';
  return errors;
}

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
  '/absence',
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

function isAuthRoute(pathname: string) {
  return (
    pathname === '/login' ||
    pathname.startsWith('/login/') ||
    pathname === '/signup' ||
    pathname.startsWith('/signup/') ||
    pathname === '/forgot-password' ||
    pathname === '/reset-password'
  );
}

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function wantsHuman(text: string) {
  return /\b(human|agent|person|someone|live\s*chat|speak\s*to|talk\s*to)\b/i.test(text);
}

export function HelpAssistant() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<Mode>('ai');
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [suggestAgent, setSuggestAgent] = useState(false);
  const [offlineNote, setOfflineNote] = useState('');
  const [publicId, setPublicId] = useState<string | null>(null);
  const [visitorToken, setVisitorToken] = useState('');
  const [intake, setIntake] = useState({ full_name: '', email: '', company_name: '', city: '' });
  const [intakeErrors, setIntakeErrors] = useState<Record<string, string>>({});
  const [liveStatus, setLiveStatus] = useState<{ available: boolean; reason?: string; offline_message?: string } | null>(null);
  const [messages, setMessages] = useState<ChatMsg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: 'Hi — ask me anything about ControlOps. I can help with signup, rotas, payroll, billing, and troubleshooting. You can also chat with a live agent when available.',
    },
  ]);
  const bottomRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
      inputRef.current?.focus();
    }
  }, [open, messages, busy, mode]);

  useEffect(() => {
    api.liveSupport
      .status()
      .then((s) => setLiveStatus(s))
      .catch(() => {});
  }, [open]);

  useEffect(() => {
    const saved = readLiveChatSession();
    if (!saved) return;
    api.liveSupport
      .get(saved.public_id, saved.visitor_token)
      .then((conv) => {
        if (String(conv.status || '') === 'closed' || String(conv.status || '') === 'resolved') {
          writeLiveChatSession(null);
          return;
        }
        setPublicId(saved.public_id);
        setVisitorToken(saved.visitor_token);
        setMode('live');
        const msgs = Array.isArray(conv.messages) ? (conv.messages as Record<string, unknown>[]) : [];
        setMessages(
          msgs.map((m) => ({
            id: String(m.id),
            role: m.sender_type === 'visitor' ? 'user' : m.sender_type === 'agent' ? 'agent' : 'system',
            text: String(m.body || ''),
          }))
        );
      })
      .catch(() => writeLiveChatSession(null));
  }, []);

  useEffect(() => {
    if (mode !== 'live' || !publicId) return;
    const pull = () => {
      api.liveSupport
        .get(publicId, visitorToken)
        .then((conv) => {
          if (String(conv.status || '') === 'closed' || String(conv.status || '') === 'resolved') {
            writeLiveChatSession(null);
          }
          const msgs = Array.isArray(conv.messages) ? (conv.messages as Record<string, unknown>[]) : [];
          setMessages(
            msgs.map((m) => ({
              id: String(m.id),
              role: m.sender_type === 'visitor' ? 'user' : m.sender_type === 'agent' ? 'agent' : 'system',
              text: String(m.body || ''),
            }))
          );
        })
        .catch(() => {});
    };
    pull();
    const t = setInterval(pull, 3500);
    const onVis = () => {
      if (document.visibilityState === 'visible') pull();
    };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      clearInterval(t);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [mode, publicId, visitorToken]);

  if (isAppRoute(pathname) || isAuthRoute(pathname)) return null;

  async function openAgentIntake() {
    setBusy(true);
    try {
      const status = await api.liveSupport.status();
      setLiveStatus(status);
      const canStart = status.available || status.can_queue;
      if (!canStart) {
        const next = status.next_open_at
          ? `\n\nNext available: ${new Date(status.next_open_at).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })} (${status.timezone || 'Europe/London'}).`
          : '';
        const note = `${status.offline_message || 'Live agents are currently unavailable.'}${next}${
          status.contact_email ? `\n\nYou can also email ${status.contact_email}.` : ''
        }`;
        setOfflineNote(note);
        setMessages((prev) => [
          ...prev,
          {
            id: uid(),
            role: 'assistant',
            text: note,
            sources: [
              { title: 'Help Centre', href: '/help' },
              { title: 'Book a demo', href: '/book-demo' },
            ],
          },
        ]);
        setMode('ai');
        return;
      }
      setOfflineNote(status.reason === 'no_agents' ? status.offline_message || '' : '');
      setMode('intake');
    } catch {
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: 'Live support status could not be checked right now. Continue with AI help or book a demo.',
          sources: [{ title: 'Book a demo', href: '/book-demo' }],
        },
      ]);
    } finally {
      setBusy(false);
    }
  }

  async function startLiveChat() {
    const errors = validateIntake(intake);
    setIntakeErrors(errors);
    if (Object.keys(errors).length) return;
    const { full_name, email, company_name, city } = intake;
    setBusy(true);
    try {
      const conv = await api.liveSupport.start({
        full_name: full_name.trim(),
        email: email.trim(),
        company_name: company_name.trim(),
        city: city.trim(),
        initial_message: 'I would like to speak with an agent.',
      });
      const id = String(conv.public_id || '');
      const token = String(conv.visitor_token || '');
      setPublicId(id);
      setVisitorToken(token);
      if (id) writeLiveChatSession({ public_id: id, visitor_token: token });
      setMode('live');
      const msgs = Array.isArray(conv.messages) ? (conv.messages as Record<string, unknown>[]) : [];
      setMessages(
        msgs.map((m) => ({
          id: String(m.id),
          role: m.sender_type === 'visitor' ? 'user' : m.sender_type === 'agent' ? 'agent' : 'system',
          text: String(m.body || ''),
        }))
      );
    } catch (e) {
      const msg = e instanceof ApiError || e instanceof Error ? e.message : 'Could not start live chat';
      setMessages((prev) => [...prev, { id: uid(), role: 'assistant', text: msg }]);
      setMode('ai');
    } finally {
      setBusy(false);
    }
  }

  async function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;

    if (mode === 'live' && publicId) {
      setInput('');
      setBusy(true);
      try {
        const conv = await api.liveSupport.send(publicId, q, visitorToken);
        const msgs = Array.isArray(conv.messages) ? (conv.messages as Record<string, unknown>[]) : [];
        setMessages(
          msgs.map((m) => ({
            id: String(m.id),
            role: m.sender_type === 'visitor' ? 'user' : m.sender_type === 'agent' ? 'agent' : 'system',
            text: String(m.body || ''),
          }))
        );
      } catch (e) {
        setMessages((prev) => [
          ...prev,
          { id: uid(), role: 'system', text: e instanceof Error ? e.message : 'Failed to send message' },
        ]);
      } finally {
        setBusy(false);
      }
      return;
    }

    if (wantsHuman(q)) {
      setMessages((prev) => [...prev, { id: uid(), role: 'user', text: q }]);
      setInput('');
      void openAgentIntake();
      return;
    }

    const history = messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .slice(-6)
      .map((m) => ({ role: m.role, content: m.text }));
    setInput('');
    setMessages((prev) => [...prev, { id: uid(), role: 'user', text: q }]);
    setBusy(true);
    setSuggestAgent(false);

    try {
      const res = await fetch('/help-assistant', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: q, history }),
      });
      const data = await res.json().catch(() => ({}));
      const answer =
        typeof data.answer === 'string' && data.answer
          ? data.answer
          : 'Something went wrong. Try the Help Centre or book a demo.';
      setSuggestAgent(Boolean(data.suggest_agent) || /live agent/i.test(answer));
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
      setSuggestAgent(true);
      setMessages((prev) => [
        ...prev,
        {
          id: uid(),
          role: 'assistant',
          text: 'I could not reach the help assistant right now. Browse /help, book a demo, or chat with an agent.',
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
    <div className="fixed bottom-[max(1rem,env(safe-area-inset-bottom))] end-[max(1rem,env(safe-area-inset-right))] z-[60] flex flex-col items-end gap-3 pointer-events-none">
      {open ? (
        <div
          className="pointer-events-auto w-[min(100vw-2rem,24rem)] overflow-hidden rounded-2xl border bg-card shadow-2xl shadow-black/20"
          role="dialog"
          aria-label="ControlOps help assistant"
        >
          <div className="flex items-center justify-between gap-3 border-b bg-primary px-4 py-3 text-primary-foreground">
            <div className="min-w-0">
              <p className="font-semibold leading-tight">{mode === 'live' ? 'Live agent chat' : 'Ask ControlOps'}</p>
              <p className="text-xs text-primary-foreground/80">
                {mode === 'live'
                  ? 'Connected with support'
                  : mode === 'intake'
                    ? 'Tell us who you are'
                    : liveStatus?.available
                      ? 'AI help · live agent available'
                      : 'AI help · live chat currently offline'}
              </p>
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

          <div className="flex max-h-[min(70vh,34rem)] flex-col">
            {mode === 'intake' ? (
              <div className="space-y-3 overflow-y-auto px-3 py-3">
                <p className="text-sm text-muted-foreground">Tell us who you are so we can connect you with an agent.</p>
                {(
                  [
                    ['full_name', 'Full name'],
                    ['email', 'Email address'],
                    ['company_name', 'Company name'],
                    ['city', 'City'],
                  ] as const
                ).map(([key, label]) => (
                  <div key={key} className="space-y-1">
                    <label htmlFor={`live-chat-${key}`} className="text-xs font-medium">
                      {label}
                    </label>
                    <Input
                      id={`live-chat-${key}`}
                      value={intake[key]}
                      onChange={(e) => {
                        setIntake((prev) => ({ ...prev, [key]: e.target.value }));
                        setIntakeErrors((prev) => ({ ...prev, [key]: '' }));
                      }}
                      type={key === 'email' ? 'email' : 'text'}
                      autoComplete={
                        key === 'email' ? 'email' : key === 'full_name' ? 'name' : key === 'city' ? 'address-level2' : 'organization'
                      }
                      aria-invalid={Boolean(intakeErrors[key])}
                      aria-describedby={intakeErrors[key] ? `live-chat-${key}-error` : undefined}
                    />
                    {intakeErrors[key] ? (
                      <p id={`live-chat-${key}-error`} className="text-xs text-destructive">
                        {intakeErrors[key]}
                      </p>
                    ) : null}
                  </div>
                ))}
                {offlineNote ? <p className="text-sm text-amber-700 dark:text-amber-300">{offlineNote}</p> : null}
                <div className="flex gap-2">
                  <Button className="flex-1" disabled={busy} onClick={() => void startLiveChat()}>
                    {busy ? <Loader2 className="size-4 animate-spin" /> : 'Start live chat'}
                  </Button>
                  <Button variant="outline" onClick={() => setMode('ai')}>
                    Back to AI
                  </Button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
                  {messages.map((m) => (
                    <div key={m.id} className={cn('flex', m.role === 'user' ? 'justify-end' : 'justify-start')}>
                      <div
                        className={cn(
                          'max-w-[90%] rounded-2xl px-3 py-2 text-sm leading-relaxed whitespace-pre-wrap',
                          m.role === 'user'
                            ? 'bg-primary text-primary-foreground rounded-br-md'
                            : m.role === 'agent'
                              ? 'bg-emerald-100 text-emerald-950 dark:bg-emerald-950/40 dark:text-emerald-100 rounded-bl-md'
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
                        {mode === 'live' ? 'Sending…' : 'Thinking…'}
                      </div>
                    </div>
                  ) : null}
                  <div ref={bottomRef} />
                </div>

                {mode === 'ai' && !busy ? (
                  <div className="flex flex-wrap gap-1.5 border-t px-3 py-2">
                    <button
                      type="button"
                      onClick={() => void openAgentIntake()}
                      className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/5 px-2.5 py-1 text-xs font-medium text-primary"
                    >
                      <Headphones className="size-3" /> Chat with an Agent
                    </button>
                    {suggestAgent ? (
                      <span className="self-center text-xs text-muted-foreground">Recommended for this question</span>
                    ) : null}
                    {messages.length < 3
                      ? HELP_SUGGESTIONS.map((s) => (
                          <button
                            key={s}
                            type="button"
                            onClick={() => ask(s)}
                            className="rounded-full border bg-background px-2.5 py-1 text-xs text-muted-foreground transition-colors hover:border-primary/40 hover:text-foreground"
                          >
                            {s}
                          </button>
                        ))
                      : null}
                  </div>
                ) : null}

                <div className="border-t px-3 pt-2">
                  <Link href="/help" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                    Help Centre
                  </Link>
                  {' · '}
                  <Link href="/contact" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                    Contact
                  </Link>
                  {' · '}
                  <Link href="/book-demo" className="text-xs text-muted-foreground hover:text-foreground underline-offset-2 hover:underline">
                    Book a demo
                  </Link>
                </div>
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
                    placeholder={mode === 'live' ? 'Message the agent…' : 'Ask a question…'}
                    aria-label="Ask a help question"
                    disabled={busy}
                    className="h-10"
                  />
                  <Button type="submit" size="icon" disabled={busy || !input.trim()} aria-label="Send">
                    <Send className="size-4" />
                  </Button>
                </form>
              </>
            )}
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
