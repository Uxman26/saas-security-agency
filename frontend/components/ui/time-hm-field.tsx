'use client';

import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clock } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';

const HOURS = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
const MINUTES = Array.from({ length: 60 }, (_, i) => String(i).padStart(2, '0'));

export function normalizeHm(value?: string | null): string {
  if (!value || !String(value).trim()) return '00:00';
  const parts = String(value).trim().split(':');
  const h = Math.min(23, Math.max(0, parseInt(parts[0] || '0', 10) || 0));
  const m = Math.min(59, Math.max(0, parseInt(parts[1] || '0', 10) || 0));
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

/** Accept typed values like "9", "930", "9:3", "15:00". */
export function parseTypedTime(raw: string): string | null {
  const cleaned = raw.trim().replace(/\s+/g, '');
  if (!cleaned) return null;

  if (/^\d{1,2}:\d{1,2}$/.test(cleaned)) {
    const [hs, ms] = cleaned.split(':');
    const h = parseInt(hs, 10);
    const m = parseInt(ms, 10);
    if (Number.isNaN(h) || Number.isNaN(m) || h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  const digits = cleaned.replace(/\D/g, '');
  if (digits.length === 1 || digits.length === 2) {
    const h = parseInt(digits, 10);
    if (h > 23) return null;
    return `${String(h).padStart(2, '0')}:00`;
  }
  if (digits.length === 3) {
    const h = parseInt(digits.slice(0, 1), 10);
    const m = parseInt(digits.slice(1), 10);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  if (digits.length === 4) {
    const h = parseInt(digits.slice(0, 2), 10);
    const m = parseInt(digits.slice(2), 10);
    if (h > 23 || m > 59) return null;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }
  return null;
}

function format12h(hm: string): string {
  const [hs, ms] = normalizeHm(hm).split(':');
  let h = parseInt(hs, 10);
  const suffix = h >= 12 ? 'pm' : 'am';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${ms}${suffix}`;
}

type Props = {
  value: string;
  onChange: (next: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  'aria-label'?: string;
};

/**
 * Typable HH:MM field with optional hour/minute dropdown (BrightHR-style).
 */
export function TimeHmField({
  value,
  onChange,
  disabled,
  id,
  className,
  'aria-label': ariaLabel = 'Time',
}: Props) {
  const normalized = normalizeHm(value);
  const [text, setText] = useState(normalized);
  const [focused, setFocused] = useState(false);
  const [open, setOpen] = useState(false);
  const [pickH, setPickH] = useState(normalized.slice(0, 2));
  const [pickM, setPickM] = useState(normalized.slice(3, 5));
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const hourListRef = useRef<HTMLDivElement>(null);
  const minuteListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!focused && !open) setText(normalized);
  }, [normalized, focused, open]);

  const updatePos = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const width = Math.max(r.width, 280);
    let left = r.left;
    if (left + width > window.innerWidth - 8) left = Math.max(8, window.innerWidth - width - 8);
    const below = r.bottom + 6;
    const approxH = 320;
    const top =
      below + approxH > window.innerHeight - 8 && r.top > approxH
        ? Math.max(8, r.top - approxH - 6)
        : below;
    setPos({ top, left, width });
  };

  useLayoutEffect(() => {
    if (!open) return;
    updatePos();
    const onScroll = () => updatePos();
    window.addEventListener('resize', onScroll);
    window.addEventListener('scroll', onScroll, true);
    return () => {
      window.removeEventListener('resize', onScroll);
      window.removeEventListener('scroll', onScroll, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      const t = e.target as Node;
      if (rootRef.current?.contains(t) || popRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const scrollSelected = (list: HTMLDivElement | null, key: string) => {
      const row = list?.querySelector<HTMLElement>(`[data-val="${key}"]`);
      row?.scrollIntoView({ block: 'center' });
    };
    const t = window.setTimeout(() => {
      scrollSelected(hourListRef.current, pickH);
      scrollSelected(minuteListRef.current, pickM);
    }, 0);
    return () => window.clearTimeout(t);
    // Only snap to the current value when the picker opens
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const commitText = (raw: string) => {
    const parsed = parseTypedTime(raw);
    if (parsed) {
      setText(parsed);
      onChange(parsed);
      return parsed;
    }
    setText(normalized);
    return normalized;
  };

  const openPicker = () => {
    if (disabled) return;
    const base = parseTypedTime(text) || normalized;
    setPickH(base.slice(0, 2));
    setPickM(base.slice(3, 5));
    setOpen(true);
  };

  const applyPicker = () => {
    const next = `${pickH}:${pickM}`;
    setText(next);
    onChange(next);
    setOpen(false);
  };

  const pickPreview = `${pickH}:${pickM}`;

  return (
    <div ref={rootRef} className={cn('relative', className)}>
      <div
        className={cn(
          'flex h-9 w-full items-center rounded-md border border-input bg-transparent shadow-xs',
          'focus-within:border-ring focus-within:ring-ring/50 focus-within:ring-[3px]',
          open && 'border-sky-400 ring-[3px] ring-sky-400/30',
          disabled && 'pointer-events-none opacity-50'
        )}
      >
        <input
          ref={inputRef}
          id={id}
          type="text"
          inputMode="numeric"
          autoComplete="off"
          spellCheck={false}
          disabled={disabled}
          aria-label={ariaLabel}
          aria-expanded={open}
          aria-haspopup="dialog"
          placeholder="HH:MM"
          value={text}
          onFocus={() => setFocused(true)}
          onChange={(e) => {
            const v = e.target.value;
            if (v.length > 5) return;
            setText(v);
          }}
          onBlur={() => {
            setFocused(false);
            commitText(text);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitText(text);
              (e.target as HTMLInputElement).blur();
            }
            if (e.key === 'ArrowDown' && !open) {
              e.preventDefault();
              openPicker();
            }
          }}
          className="h-full min-w-0 flex-1 bg-transparent px-3 text-sm tabular-nums outline-none"
        />
        <button
          type="button"
          tabIndex={-1}
          disabled={disabled}
          aria-label={`Open ${ariaLabel} picker`}
          className="mr-1 flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => (open ? setOpen(false) : openPicker())}
        >
          <Clock className="size-4" />
        </button>
      </div>

      {open && pos
        ? createPortal(
            <div
              ref={popRef}
              role="dialog"
              aria-label={`${ariaLabel} picker`}
              // pointer-events-auto: Radix Dialog sets body to pointer-events:none; without this,
              // clicks/scroll pass through to fields underneath (e.g. Site select).
              className="pointer-events-auto fixed z-[500] overflow-hidden rounded-md border border-border bg-popover text-popover-foreground shadow-xl"
              style={{ top: pos.top, left: pos.left, width: pos.width }}
              data-time-hm-picker=""
              onPointerDown={(e) => e.stopPropagation()}
              onMouseDown={(e) => e.stopPropagation()}
              onClick={(e) => e.stopPropagation()}
              onWheel={(e) => e.stopPropagation()}
            >
              <div className="grid grid-cols-2 border-b border-border">
                <div className="border-r border-border px-3 py-2 text-center text-xs font-semibold text-muted-foreground">
                  Hour
                </div>
                <div className="px-3 py-2 text-center text-xs font-semibold text-muted-foreground">Minute</div>
              </div>
              <div className="grid h-52 grid-cols-2">
                <div
                  ref={hourListRef}
                  className="h-52 min-h-0 overflow-y-auto overscroll-contain border-r border-border"
                >
                  {HOURS.map((h) => {
                    const selected = h === pickH;
                    return (
                      <button
                        key={h}
                        type="button"
                        data-val={h}
                        className={cn(
                          'flex w-full items-center justify-between px-3 py-1.5 text-sm tabular-nums hover:bg-muted/70',
                          selected && 'bg-sky-100 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-100'
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPickH(h);
                        }}
                      >
                        <span>{h}</span>
                        {selected ? <Check className="size-4 text-sky-600" /> : <span className="size-4" />}
                      </button>
                    );
                  })}
                </div>
                <div
                  ref={minuteListRef}
                  className="h-52 min-h-0 overflow-y-auto overscroll-contain"
                >
                  {MINUTES.map((m) => {
                    const selected = m === pickM;
                    return (
                      <button
                        key={m}
                        type="button"
                        data-val={m}
                        className={cn(
                          'flex w-full items-center justify-between px-3 py-1.5 text-sm tabular-nums hover:bg-muted/70',
                          selected && 'bg-sky-100 font-semibold text-sky-900 dark:bg-sky-950 dark:text-sky-100'
                        )}
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setPickM(m);
                        }}
                      >
                        <span>{m}</span>
                        {selected ? <Check className="size-4 text-sky-600" /> : <span className="size-4" />}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div className="flex items-center gap-2 border-t border-border bg-muted/30 px-3 py-2.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="border-pink-500 text-pink-600 hover:bg-pink-50 hover:text-pink-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    setOpen(false);
                  }}
                >
                  Cancel
                </Button>
                <div className="min-w-0 flex-1 text-center leading-tight">
                  <div className="text-sm font-semibold tabular-nums">{pickPreview}</div>
                  <div className="text-xs text-muted-foreground tabular-nums">{format12h(pickPreview)}</div>
                </div>
                <Button
                  type="button"
                  size="sm"
                  className="bg-pink-600 text-white hover:bg-pink-700"
                  onClick={(e) => {
                    e.stopPropagation();
                    applyPicker();
                  }}
                >
                  Apply
                </Button>
              </div>
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

type DurationProps = {
  hours: number;
  minutes: number;
  onChange: (next: { hours: number; minutes: number }) => void;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
  maxHours?: number;
};

/** Manual hours + minutes inputs with unit suffixes (e.g. break duration). */
export function DurationHmField({
  hours,
  minutes,
  onChange,
  disabled,
  className,
  'aria-label': ariaLabel = 'Duration',
  maxHours = 23,
}: DurationProps) {
  const safeH = Math.min(maxHours, Math.max(0, Number(hours) || 0));
  const safeM = Math.min(59, Math.max(0, Number(minutes) || 0));
  const [hText, setHText] = useState(String(safeH));
  const [mText, setMText] = useState(String(safeM));
  const [hFocused, setHFocused] = useState(false);
  const [mFocused, setMFocused] = useState(false);

  useEffect(() => {
    if (!hFocused) setHText(String(safeH));
  }, [safeH, hFocused]);

  useEffect(() => {
    if (!mFocused) setMText(String(safeM));
  }, [safeM, mFocused]);

  const commitHours = (raw: string) => {
    const n = Math.min(maxHours, Math.max(0, parseInt(raw.replace(/\D/g, ''), 10) || 0));
    setHText(String(n));
    onChange({ hours: n, minutes: safeM });
  };

  const commitMinutes = (raw: string) => {
    const n = Math.min(59, Math.max(0, parseInt(raw.replace(/\D/g, ''), 10) || 0));
    setMText(String(n));
    onChange({ hours: safeH, minutes: n });
  };

  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className={cn('grid grid-cols-2 gap-2', disabled && 'pointer-events-none opacity-50', className)}
    >
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          aria-label={`${ariaLabel} hours`}
          value={hText}
          onFocus={() => setHFocused(true)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
            setHText(v);
          }}
          onBlur={() => {
            setHFocused(false);
            commitHours(hText);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitHours(hText);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-3 pr-10 text-sm tabular-nums shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          hrs
        </span>
      </div>
      <div className="relative">
        <input
          type="text"
          inputMode="numeric"
          disabled={disabled}
          aria-label={`${ariaLabel} minutes`}
          value={mText}
          onFocus={() => setMFocused(true)}
          onChange={(e) => {
            const v = e.target.value.replace(/\D/g, '').slice(0, 2);
            setMText(v);
          }}
          onBlur={() => {
            setMFocused(false);
            commitMinutes(mText);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              commitMinutes(mText);
              (e.target as HTMLInputElement).blur();
            }
          }}
          className={cn(
            'flex h-9 w-full rounded-md border border-input bg-transparent py-1 pl-3 pr-12 text-sm tabular-nums shadow-xs outline-none',
            'focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px]'
          )}
        />
        <span className="pointer-events-none absolute inset-y-0 right-2.5 flex items-center text-xs text-muted-foreground">
          mins
        </span>
      </div>
    </div>
  );
}
