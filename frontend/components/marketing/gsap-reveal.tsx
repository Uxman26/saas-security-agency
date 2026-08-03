'use client';

import { useEffect, useRef, type ReactNode } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { cn } from '@/lib/utils';

gsap.registerPlugin(ScrollTrigger);

type Props = {
  children: ReactNode;
  className?: string;
  /** Stagger children with [data-reveal] */
  stagger?: number;
  y?: number;
  delay?: number;
  once?: boolean;
};

export function GsapReveal({
  children,
  className,
  stagger = 0.08,
  y = 36,
  delay = 0,
  once = true,
}: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const targets = root.querySelectorAll<HTMLElement>('[data-reveal]');
    const els = targets.length ? Array.from(targets) : [root];

    const ctx = gsap.context(() => {
      if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
        gsap.set(els, { opacity: 1, y: 0 });
        return;
      }
      gsap.fromTo(
        els,
        { opacity: 0, y },
        {
          opacity: 1,
          y: 0,
          duration: 0.85,
          delay,
          stagger: targets.length ? stagger : 0,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: root,
            start: 'top 88%',
            once,
          },
        }
      );
    }, root);

    return () => ctx.revert();
  }, [stagger, y, delay, once]);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}

/** Horizontal parallax / scale reveal for product screenshots */
export function GsapMediaReveal({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        root,
        { opacity: 0, y: 48, scale: 0.96 },
        {
          opacity: 1,
          y: 0,
          scale: 1,
          duration: 1.1,
          ease: 'power3.out',
          scrollTrigger: {
            trigger: root,
            start: 'top 85%',
            once: true,
          },
        }
      );
    }, root);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={ref} className={cn(className)}>
      {children}
    </div>
  );
}
