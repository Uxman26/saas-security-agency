'use client';

import { useLayoutEffect, useRef, type RefObject } from 'react';

const memory = new Map<string, number>();

export function usePersistedScroll<T extends HTMLElement>(
  key: string
): RefObject<T | null> {
  const ref = useRef<T | null>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;

    const stored = memory.get(key);
    if (typeof stored === 'number' && stored > 0) {
      el.scrollTop = stored;
    }

    const save = () => {
      memory.set(key, el.scrollTop);
    };

    const protect = () => {
      const top = memory.get(key) ?? el.scrollTop;
      requestAnimationFrame(() => {
        if (Math.abs(el.scrollTop - top) > 1) {
          el.scrollTop = top;
        }
        memory.set(key, el.scrollTop);
      });
    };

    el.addEventListener('scroll', save, { passive: true });
    el.addEventListener('click', protect, true);
    el.addEventListener('focusin', protect, true);
    return () => {
      save();
      el.removeEventListener('scroll', save);
      el.removeEventListener('click', protect, true);
      el.removeEventListener('focusin', protect, true);
    };
  }, [key]);

  return ref;
}
