'use client';

import { useEffect, useRef } from 'react';
import { animate, useReducedMotion } from 'motion/react';

type Props = {
  value: number;
  format: (v: number) => string;
  className?: string;
};

export function CountUp({ value, format, className }: Props) {
  const ref = useRef<HTMLSpanElement>(null);
  const from = useRef(0);
  const reduce = useReducedMotion();

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduce) {
      el.textContent = format(value);
      from.current = value;
      return;
    }
    const ctl = animate(from.current, value, {
      duration: from.current === 0 ? 1.1 : 0.6,
      ease: [0.16, 1, 0.3, 1],
      onUpdate: (v) => {
        el.textContent = format(v);
      },
    });
    from.current = value;
    return () => ctl.stop();
  }, [value, format, reduce]);

  return (
    <span ref={ref} className={className} aria-hidden>
      {format(reduce ? value : 0)}
    </span>
  );
}
