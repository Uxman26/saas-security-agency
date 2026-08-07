'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { usePathname, useSearchParams } from 'next/navigation';
import CubeLoader from '@/components/ui/cube-loader';
import { cn } from '@/lib/utils';

const MAX_VISIBLE_MS = 12_000;
const MIN_VISIBLE_MS = 280;

function isInternalNavClick(e: MouseEvent, anchor: HTMLAnchorElement): boolean {
  if (e.defaultPrevented) return false;
  if (e.button !== 0) return false;
  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return false;
  if (anchor.target && anchor.target !== '_self') return false;
  if (anchor.hasAttribute('download')) return false;
  if (anchor.dataset.noLoader === 'true') return false;

  const href = anchor.getAttribute('href');
  if (!href || href.startsWith('#') || href.startsWith('mailto:') || href.startsWith('tel:')) {
    return false;
  }

  let url: URL;
  try {
    url = new URL(href, window.location.href);
  } catch {
    return false;
  }

  if (url.origin !== window.location.origin) return false;

  const next = `${url.pathname}${url.search}`;
  const current = `${window.location.pathname}${window.location.search}`;
  if (next === current) return false;

  return true;
}

/**
 * Full-screen CubeLoader while App Router navigations are in flight.
 * Starts on internal link clicks; clears when the URL settles.
 */
export function PageTransitionLoader() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [visible, setVisible] = useState(false);
  const shownAt = useRef(0);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const maxTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearTimers = useCallback(() => {
    if (hideTimer.current) {
      clearTimeout(hideTimer.current);
      hideTimer.current = null;
    }
    if (maxTimer.current) {
      clearTimeout(maxTimer.current);
      maxTimer.current = null;
    }
  }, []);

  const show = useCallback(() => {
    clearTimers();
    shownAt.current = Date.now();
    setVisible(true);
    maxTimer.current = setTimeout(() => setVisible(false), MAX_VISIBLE_MS);
  }, [clearTimers]);

  const hide = useCallback(() => {
    clearTimers();
    const elapsed = Date.now() - shownAt.current;
    const wait = Math.max(0, MIN_VISIBLE_MS - elapsed);
    hideTimer.current = setTimeout(() => setVisible(false), wait);
  }, [clearTimers]);

  // Hide when the route has actually changed.
  useEffect(() => {
    hide();
    // searchParams identity changes with the URL; pathname covers path segments.
  }, [pathname, searchParams, hide]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      const anchor = target?.closest?.('a') as HTMLAnchorElement | null;
      if (!anchor) return;
      if (!isInternalNavClick(e, anchor)) return;
      show();
    };

    const onPopState = () => show();

    document.addEventListener('click', onClick, true);
    window.addEventListener('popstate', onPopState);
    return () => {
      document.removeEventListener('click', onClick, true);
      window.removeEventListener('popstate', onPopState);
      clearTimers();
    };
  }, [show, clearTimers]);

  return (
    <div
      aria-busy={visible}
      aria-live="polite"
      aria-hidden={!visible}
      className={cn(
        'pointer-events-none fixed inset-0 z-[100] flex items-center justify-center transition-opacity duration-200',
        visible
          ? 'pointer-events-auto opacity-100'
          : 'opacity-0'
      )}
    >
      <div className="absolute inset-0 bg-background/75 backdrop-blur-sm dark:bg-[#0B0F14]/80" />
      <div className="relative">
        {visible ? (
          <CubeLoader
            compact
            label="Loading"
            description="Moving to the next page…"
          />
        ) : null}
      </div>
    </div>
  );
}
