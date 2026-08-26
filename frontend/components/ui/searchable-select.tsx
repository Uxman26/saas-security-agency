'use client';

import { useMemo, useState } from 'react';
import { Popover } from 'radix-ui';
import { Check, ChevronsUpDown, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

export type SearchableOption = {
  value: string;
  label: string;
};

type Props = {
  value?: string;
  onChange: (value: string) => void;
  options: SearchableOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  allowCreate?: boolean;
  createLabel?: (q: string) => string;
  disabled?: boolean;
  className?: string;
  /** Optional leading “All / none” choice */
  noneOption?: { value: string; label: string };
};

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = 'Select…',
  searchPlaceholder = 'Search…',
  emptyText = 'No matches',
  allowCreate = false,
  createLabel = (q) => `Add “${q}”`,
  disabled,
  className,
  noneOption,
}: Props) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');

  const selectedLabel = useMemo(() => {
    if (noneOption && value === noneOption.value) return noneOption.label;
    return options.find((o) => o.value === value)?.label ?? (value || placeholder);
  }, [noneOption, options, placeholder, value]);

  const filtered = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const list = noneOption ? [noneOption, ...options] : options;
    if (!needle) return list;
    return list.filter((o) => o.label.toLowerCase().includes(needle) || o.value.toLowerCase().includes(needle));
  }, [noneOption, options, q]);

  const canCreate =
    allowCreate &&
    q.trim().length > 0 &&
    !options.some((o) => o.label.toLowerCase() === q.trim().toLowerCase());

  const close = () => {
    setOpen(false);
    setQ('');
  };

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQ('');
      }}
    >
      <div className={cn('relative', className)}>
        <Popover.Trigger asChild>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            className="w-full justify-between font-normal"
          >
            <span className="truncate">{selectedLabel}</span>
            <ChevronsUpDown className="size-4 opacity-50 shrink-0" />
          </Button>
        </Popover.Trigger>
      </div>
      {/*
        Portalled and positioned by Radix. The panel used to be an absolutely positioned
        child of the field, so any scrollable or overflow-hidden ancestor — the staff edit
        dialog, for one — clipped it and the sections below appeared on top of it.
      */}
      <Popover.Portal>
        <Popover.Content
          align="start"
          sideOffset={4}
          collisionPadding={8}
          className="z-[110] w-[var(--radix-popover-trigger-width)] overflow-hidden rounded-md border bg-popover text-popover-foreground shadow-md"
          // The trigger keeps focus so the field is not scrolled out of view on open;
          // focus is moved into the search box by its own autoFocus instead.
          onOpenAutoFocus={(e) => e.preventDefault()}
        >
          <div className="p-2 border-b">
            <Input
              autoFocus
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={searchPlaceholder}
              className="h-8"
            />
          </div>
          <ul
            className="overflow-y-auto py-1"
            style={{ maxHeight: 'min(14rem, var(--radix-popover-content-available-height, 14rem))' }}
          >
            {filtered.map((o) => (
              <li key={o.value}>
                <button
                  type="button"
                  className={cn(
                    'flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted',
                    value === o.value && 'bg-muted/80'
                  )}
                  onClick={() => {
                    onChange(o.value);
                    close();
                  }}
                >
                  <Check className={cn('size-3.5 shrink-0', value === o.value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.label}</span>
                </button>
              </li>
            ))}
            {canCreate && (
              <li>
                <button
                  type="button"
                  className="flex w-full items-center gap-2 px-3 py-2 text-sm text-left hover:bg-muted text-primary"
                  onClick={() => {
                    onChange(q.trim());
                    close();
                  }}
                >
                  <Plus className="size-3.5 shrink-0" />
                  {createLabel(q.trim())}
                </button>
              </li>
            )}
            {filtered.length === 0 && !canCreate && (
              <li className="px-3 py-2 text-sm text-muted-foreground">{emptyText}</li>
            )}
          </ul>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
