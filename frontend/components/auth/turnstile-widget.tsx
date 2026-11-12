'use client';

import { useEffect, useRef } from 'react';
import { useTheme } from 'next-themes';
import { TURNSTILE_RESET_EVENT, TURNSTILE_SITE_KEY, setTurnstileToken } from '@/lib/turnstile';

type TurnstileApi = {
  render: (el: HTMLElement, opts: Record<string, unknown>) => string;
  reset: (id: string) => void;
  remove: (id: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const SCRIPT_ID = 'cf-turnstile-script';
const SCRIPT_SRC = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<TurnstileApi> {
  return new Promise((resolve, reject) => {
    if (window.turnstile) return resolve(window.turnstile);
    let s = document.getElementById(SCRIPT_ID) as HTMLScriptElement | null;
    if (!s) {
      s = document.createElement('script');
      s.id = SCRIPT_ID;
      s.src = SCRIPT_SRC;
      s.async = true;
      s.defer = true;
      document.head.appendChild(s);
    }
    s.addEventListener('load', () => (window.turnstile ? resolve(window.turnstile) : reject()));
    s.addEventListener('error', () => reject());
  });
}

/** Cloudflare Turnstile challenge. Renders nothing until NEXT_PUBLIC_TURNSTILE_SITE_KEY is set. */
export function TurnstileWidget({ action }: { action?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | null>(null);
  const { resolvedTheme } = useTheme();
  const theme = resolvedTheme === 'dark' ? 'dark' : 'light';

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !ref.current) return;
    let cancelled = false;
    setTurnstileToken(null);
    loadScript()
      .then((ts) => {
        if (cancelled || !ref.current) return;
        widgetId.current = ts.render(ref.current, {
          sitekey: TURNSTILE_SITE_KEY,
          theme,
          size: 'flexible',
          action,
          callback: (token: string) => setTurnstileToken(token),
          'expired-callback': () => setTurnstileToken(null),
          'error-callback': () => setTurnstileToken(null),
        });
      })
      .catch(() => {
        /* Script blocked/offline: backend reports "complete the security check". */
      });
    const onReset = () => {
      if (widgetId.current && window.turnstile) window.turnstile.reset(widgetId.current);
    };
    window.addEventListener(TURNSTILE_RESET_EVENT, onReset);
    return () => {
      cancelled = true;
      window.removeEventListener(TURNSTILE_RESET_EVENT, onReset);
      if (widgetId.current && window.turnstile) window.turnstile.remove(widgetId.current);
      widgetId.current = null;
      setTurnstileToken(null);
    };
  }, [action, theme]);

  if (!TURNSTILE_SITE_KEY) return null;
  return <div ref={ref} className="min-h-[65px] w-full" />;
}
