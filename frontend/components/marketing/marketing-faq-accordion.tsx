'use client';

import { useState } from 'react';
import { ChevronDown, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { RichInline } from '@/components/marketing/marketing-rich-text';

type Faq = { q: string; a: string };

export function MarketingFaqAccordion({ items, className }: { items: Faq[]; className?: string }) {
  const [open, setOpen] = useState<number | null>(null);

  return (
    <div className={cn('space-y-3', className)}>
      {items.map((f, i) => {
        const isOpen = open === i;
        return (
          <div
            key={f.q}
            className={cn(
              'rounded-xl border bg-card shadow-sm transition-all duration-200',
              isOpen && 'border-primary/40 shadow-md shadow-primary/5 ring-1 ring-primary/10'
            )}
          >
            <button
              type="button"
              onClick={() => setOpen(isOpen ? null : i)}
              className={cn(
                'flex w-full items-center gap-4 p-5 text-start transition-colors',
                isOpen ? 'bg-primary/5' : 'hover:bg-muted/40'
              )}
              aria-expanded={isOpen}
            >
              <span
                className={cn(
                  'flex size-8 shrink-0 items-center justify-center rounded-lg transition-colors',
                  isOpen ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                )}
              >
                <HelpCircle className="size-4" />
              </span>
              <span className="flex-1 font-semibold text-foreground">{f.q}</span>
              <ChevronDown
                className={cn(
                  'size-5 shrink-0 text-muted-foreground transition-transform duration-200',
                  isOpen && 'rotate-180 text-primary'
                )}
              />
            </button>
            {isOpen && (
              <div className="border-t border-border/50 px-5 py-4 bg-muted/20 animate-in fade-in slide-in-from-top-1 duration-200">
                <p className="text-sm text-muted-foreground leading-relaxed ps-12">
                  <RichInline text={f.a} />
                </p>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
