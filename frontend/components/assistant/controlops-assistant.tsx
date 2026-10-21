'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bot, Loader2, Send, Sparkles, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useAuth } from '@/contexts/auth-context';
import { api } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { storageGet, storageSet } from '@/lib/safe-storage';

type Msg = {
  id: string;
  role: 'user' | 'assistant';
  text: string;
  sources?: { id: string; title: string; href?: string }[];
  navigation?: { label: string; href: string }[];
  proposal?: Record<string, unknown> | null;
};

const FAB_SIZE = 48;
const FAB_MARGIN = 16;
const FAB_POS_KEY = 'controlops-assistant-pos';

function rotaFabInset() {
  if (typeof window === 'undefined') return { x: 0, y: 0 };
  const path = window.location.pathname || '';
  if (!path.startsWith('/rota')) return { x: 0, y: 0 };
  return { x: 8, y: 72 };
}

function defaultFabPos() {
  if (typeof window === 'undefined') return { x: FAB_MARGIN, y: FAB_MARGIN };
  const inset = rotaFabInset();
  return {
    x: Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN - inset.x),
    y: Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN - inset.y),
  };
}

function loadFabPos() {
  try {
    const raw = storageGet(FAB_POS_KEY);
    if (!raw) return defaultFabPos();
    const parsed = JSON.parse(raw) as { x?: number; y?: number };
    if (typeof parsed.x !== 'number' || typeof parsed.y !== 'number') return defaultFabPos();
    return clampFabPos(parsed.x, parsed.y);
  } catch {
    return defaultFabPos();
  }
}

function clampFabPos(x: number, y: number) {
  if (typeof window === 'undefined') return { x, y };
  const inset = rotaFabInset();
  return {
    x: Math.min(
      Math.max(FAB_MARGIN, x),
      Math.max(FAB_MARGIN, window.innerWidth - FAB_SIZE - FAB_MARGIN - inset.x)
    ),
    y: Math.min(
      Math.max(FAB_MARGIN, y),
      Math.max(FAB_MARGIN, window.innerHeight - FAB_SIZE - FAB_MARGIN - inset.y)
    ),
  };
}

const SUGGESTIONS_BY_PATH: { match: RegExp; tips: string[] }[] = [
  { match: /^\/rota/, tips: ['How do I publish a rota?', 'Create morning shifts for Site next Monday', 'Explain rota conflicts'] },
  { match: /^\/attendance/, tips: ['Summarise attendance exceptions', 'What does late status mean?', 'How does clock-in work?'] },
  { match: /^\/payroll/, tips: ['How is payroll calculated?', 'Explain missing rates', 'Payroll vs rota hours'] },
  { match: /^\/invoices/, tips: ['How do invoices work?', 'Summarise outstanding invoices', 'What are credit notes?'] },
  { match: /^\/settings/, tips: ['How do I configure SMTP?', 'Explain roles and permissions', 'Company profile settings'] },
  { match: /^\/admin/, tips: ['What can Super Admin manage?', 'Explain packages', 'Tenant isolation rules'] },
];

function defaultTips(path: string, role?: string): string[] {
  for (const row of SUGGESTIONS_BY_PATH) {
    if (row.match.test(path)) return row.tips;
  }
  if (role === 'super_admin') return ['What can Super Admin manage?', 'Explain tenant isolation', 'How does live support work?'];
  if (role === 'staff' || role === 'client') return ['How do I see my shifts?', 'What can I access in the portal?', 'How do notifications work?'];
  return ['How do I use ControlOps?', 'How do rotas work?', 'Explain attendance'];
}

export function ControlOpsAssistant({
  className,
  embedded = false,
  defaultOpen = false,
  title = 'ControlOps Assistant',
}: {
  className?: string;
  embedded?: boolean;
  defaultOpen?: boolean;
  title?: string;
}) {
  const { user } = useAuth();
  const pathname = usePathname();
  const t = useTranslations('app');
  const tc = useTranslations('common');
  const [open, setOpen] = useState(defaultOpen || embedded);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [pendingProposal, setPendingProposal] = useState<Record<string, unknown> | null>(null);
  const [messages, setMessages] = useState<Msg[]>([
    {
      id: 'welcome',
      role: 'assistant',
      text: '',
    },
  ]);
  const endRef = useRef<HTMLDivElement>(null);
  const [fabPos, setFabPos] = useState(defaultFabPos);
  const [portalReady, setPortalReady] = useState(false);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    origX: number;
    origY: number;
    moved: boolean;
  } | null>(null);

  useEffect(() => {
    setPortalReady(true);
    setFabPos(loadFabPos());
    const onResize = () => setFabPos((p) => clampFabPos(p.x, p.y));
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    setFabPos((p) => clampFabPos(p.x, p.y));
  }, [pathname]);

  useEffect(() => {
    setMessages((m) =>
      m.map((msg) => (msg.id === 'welcome' ? { ...msg, text: t('assistantWelcome') } : msg))
    );
  }, [t]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, open]);

  const send = useCallback(
    async (text: string, confirm?: Record<string, unknown> | null) => {
      const trimmed = text.trim();
      if ((!trimmed && !confirm) || busy || !user) return;
      if (trimmed) {
        setMessages((m) => [...m, { id: `u-${Date.now()}`, role: 'user', text: trimmed }]);
        setInput('');
      }
      setBusy(true);
      try {
        const res = await api.assistant.chat({
          message: trimmed || (confirm ? 'Confirm proposal' : ''),
          path: pathname || undefined,
          confirm_proposal: confirm || undefined,
        });
        setPendingProposal(res.proposal || null);
        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            text: res.reply,
            sources: res.sources,
            navigation: res.navigation,
            proposal: res.proposal,
          },
        ]);
      } catch (e) {
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            text: e instanceof Error ? e.message : 'Assistant unavailable. ControlOps continues to work normally.',
          },
        ]);
      } finally {
        setBusy(false);
      }
    },
    [busy, user, pathname]
  );

  if (!user) return null;

  const tips = defaultTips(pathname || '', user.role);
  const panelW = typeof window === 'undefined' ? 360 : Math.min(360, window.innerWidth - 24);
  const panelH = typeof window === 'undefined' ? 480 : Math.min(520, window.innerHeight * 0.68);
  const viewW = typeof window === 'undefined' ? 1200 : window.innerWidth;
  const viewH = typeof window === 'undefined' ? 800 : window.innerHeight;
  const panelLeft = Math.min(Math.max(12, fabPos.x + FAB_SIZE - panelW), Math.max(12, viewW - panelW - 12));
  const panelTop = Math.min(Math.max(12, fabPos.y - panelH - 8), Math.max(12, viewH - panelH - FAB_SIZE - 24));

  const panel = (
    <div
      className={cn(
        'flex flex-col bg-background border shadow-lg',
        embedded ? 'h-full min-h-[320px] rounded-lg' : 'fixed z-[80] rounded-xl',
        className
      )}
      style={
        embedded
          ? undefined
          : {
              left: panelLeft,
              top: panelTop,
              width: panelW,
              height: panelH,
            }
      }
    >
      <div className="flex items-center justify-between gap-2 border-b px-3 py-2 bg-muted/40 rounded-t-xl">
        <div className="flex items-center gap-2 min-w-0">
          <Sparkles className="size-4 text-orange-600 shrink-0" />
          <div className="min-w-0">
            <p className="text-sm font-semibold truncate">{title === 'ControlOps Assistant' ? t('assistantTitle') : title}</p>
            <p className="text-xs text-muted-foreground truncate">{t('assistantHint')}</p>
          </div>
        </div>
        {!embedded ? (
          <Button variant="ghost" size="icon" className="size-8" onClick={() => setOpen(false)} aria-label={tc('cancel')}>
            <X className="size-4" />
          </Button>
        ) : null}
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3 text-sm">
        {messages.map((m) => (
          <div
            key={m.id}
            className={cn(
              'rounded-lg px-3 py-2 whitespace-pre-wrap',
              m.role === 'user' ? 'bg-orange-600 text-white ms-8' : 'bg-muted me-4'
            )}
          >
            {m.text}
            {m.sources && m.sources.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.sources.map((s) =>
                  s.href ? (
                    <Link key={s.id} href={s.href} className="text-xs underline text-orange-700 dark:text-orange-300">
                      {s.title}
                    </Link>
                  ) : (
                    <span key={s.id} className="text-xs opacity-70">{s.title}</span>
                  )
                )}
              </div>
            ) : null}
            {m.navigation && m.navigation.length > 0 ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {m.navigation.map((n) => (
                  <Link
                    key={n.href}
                    href={n.href}
                    className="inline-flex rounded-md border bg-background px-2 py-0.5 text-xs hover:bg-muted"
                  >
                    {n.label}
                  </Link>
                ))}
              </div>
            ) : null}
            {m.proposal && !(m.proposal as { needs_clarification?: boolean }).needs_clarification ? (
              <div className="mt-2 flex gap-2">
                <Button
                  size="sm"
                  className="h-7 text-xs"
                  disabled={busy}
                  onClick={() => void send('', m.proposal as Record<string, unknown>)}
                >
                  {t('confirmCreate')}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => {
                    setPendingProposal(null);
                    setMessages((prev) => [
                      ...prev,
                      { id: `c-${Date.now()}`, role: 'assistant', text: tc('cancel') },
                    ]);
                  }}
                >
                  {tc('cancel')}
                </Button>
              </div>
            ) : null}
            {m.proposal && (m.proposal as { needs_clarification?: boolean }).needs_clarification ? (
              <div className="mt-2 flex flex-wrap gap-1">
                {((m.proposal as { options?: { id: number; name: string }[] }).options || []).map((o) => (
                  <Button
                    key={o.id}
                    size="sm"
                    variant="outline"
                    className="h-7 text-xs"
                    disabled={busy}
                    onClick={() => {
                      const ctype = (m.proposal as { clarification_type?: string }).clarification_type;
                      const partial = (m.proposal as { partial?: Record<string, unknown> }).partial || {};
                      const msg =
                        ctype === 'site'
                          ? `Create shift at ${o.name} on ${partial.date || ''} ${partial.shift_start || ''}-${partial.shift_end || ''}`
                          : `Create ${o.name} shift at ${partial.site_name || ''} ${partial.shift_start || ''}-${partial.shift_end || ''} on ${partial.date || ''}`;
                      void send(msg);
                    }}
                  >
                    {o.name}
                  </Button>
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {busy ? (
          <div className="flex items-center gap-2 text-muted-foreground text-xs">
            <Loader2 className="size-3.5 animate-spin" /> {t('assistantThinking')}
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {!messages.some((m) => m.role === 'user') ? (
        <div className="px-3 pb-2 flex flex-wrap gap-1">
          {tips.map((t) => (
            <button
              key={t}
              type="button"
              className="text-xs rounded-full border px-2 py-1 hover:bg-muted text-left"
              onClick={() => void send(t)}
            >
              {t}
            </button>
          ))}
        </div>
      ) : null}

      <form
        className="border-t p-2 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          void send(input);
        }}
      >
        <input
          className="flex-1 rounded-md border bg-background px-2 py-1.5 text-sm"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t('assistantPlaceholder')}
          maxLength={2000}
          disabled={busy}
        />
        <Button type="submit" size="icon" className="shrink-0" disabled={busy || !input.trim()}>
          <Send className="size-4" />
        </Button>
      </form>
      {pendingProposal ? (
        <p className="px-3 pb-2 text-xs text-muted-foreground">{t('proposalWaiting')}</p>
      ) : null}
    </div>
  );

  if (embedded) return panel;

  const onFabPointerDown = (e: React.PointerEvent<HTMLButtonElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = {
      pointerId: e.pointerId,
      startX: e.clientX,
      startY: e.clientY,
      origX: fabPos.x,
      origY: fabPos.y,
      moved: false,
    };
  };

  const onFabPointerMove = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    const dx = e.clientX - drag.startX;
    const dy = e.clientY - drag.startY;
    if (!drag.moved && Math.hypot(dx, dy) < 6) return;
    drag.moved = true;
    setFabPos(clampFabPos(drag.origX + dx, drag.origY + dy));
  };

  const onFabPointerUp = (e: React.PointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== e.pointerId) return;
    dragRef.current = null;
    if (drag.moved) {
      const next = clampFabPos(fabPos.x, fabPos.y);
      setFabPos(next);
      storageSet(FAB_POS_KEY, JSON.stringify(next));
      return;
    }
    setOpen((v) => !v);
  };

  const overlay = (
    <>
      {open ? panel : null}
      <Button
        type="button"
        size="icon"
        className="fixed z-[80] size-12 cursor-grab touch-none rounded-full shadow-lg bg-primary hover:bg-primary-hover text-primary-foreground active:cursor-grabbing"
        style={{ left: fabPos.x, top: fabPos.y }}
        onPointerDown={onFabPointerDown}
        onPointerMove={onFabPointerMove}
        onPointerUp={onFabPointerUp}
        onPointerCancel={onFabPointerUp}
        aria-label={t('assistantTitle')}
      >
        {open ? <X className="size-5" /> : <Bot className="size-5" />}
      </Button>
    </>
  );

  if (portalReady && typeof document !== 'undefined') {
    return createPortal(overlay, document.body);
  }
  return overlay;
}
