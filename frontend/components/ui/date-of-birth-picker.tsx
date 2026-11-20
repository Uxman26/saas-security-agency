'use client';

import { useRef, useState } from 'react';
import { Popover } from 'radix-ui';
import { CalendarDays } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

/** 'YYYY-MM-DD' -> local Date (no UTC shift), or undefined when blank or malformed. */
function parseIso(v: string | null | undefined): Date | undefined {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(v ?? '');
  if (!m) return undefined;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return Number.isNaN(d.getTime()) ? undefined : d;
}

function toIso(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function toUk(d: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${p(d.getDate())}/${p(d.getMonth() + 1)}/${d.getFullYear()}`;
}

/**
 * Calendar picker for a date of birth, value as 'YYYY-MM-DD' ('' when cleared).
 * Month and year are dropdowns so an older date is two clicks away rather than decades
 * of paging, and future dates cannot be picked.
 */
export function DateOfBirthPicker({
  value,
  onChange,
  placeholder = 'Select date of birth',
  className,
  disabled,
}: {
  value: string | null | undefined;
  onChange: (v: string) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // As in SearchableSelect: inside a Radix Dialog the popover must be modal to scroll.
  const [modal, setModal] = useState(false);
  const fieldRef = useRef<HTMLDivElement>(null);
  const selected = parseIso(value);
  const today = new Date();
  const thirtyYearsAgo = new Date(today.getFullYear() - 30, today.getMonth(), 1);

  return (
    <Popover.Root
      open={open}
      modal={modal}
      onOpenChange={(next) => {
        if (next) setModal(!!fieldRef.current?.closest('[data-slot="dialog-content"]'));
        setOpen(next);
      }}
    >
      <div ref={fieldRef} className={cn('relative', className)}>
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className={cn('w-full justify-between font-normal', !selected && 'text-muted-foreground')}
          >
            <span className="truncate">{selected ? toUk(selected) : placeholder}</span>
            <CalendarDays className="size-4 shrink-0 opacity-60" />
          </Button>
        </Popover.Trigger>
      </div>
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[110] rounded-md border bg-popover text-popover-foreground shadow-md"
        >
          <Calendar
            mode="single"
            captionLayout="dropdown"
            selected={selected}
            defaultMonth={selected ?? thirtyYearsAgo}
            startMonth={new Date(1920, 0)}
            endMonth={today}
            disabled={{ after: today }}
            onSelect={(d) => {
              onChange(d ? toIso(d) : '');
              if (d) setOpen(false);
            }}
          />
          {selected ? (
            <div className="flex justify-end border-t px-3 py-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                onClick={() => {
                  onChange('');
                  setOpen(false);
                }}
              >
                Clear
              </Button>
            </div>
          ) : null}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
