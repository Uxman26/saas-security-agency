'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Search, Loader2 } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { cn } from '@/lib/utils';

type Hit = { id: number; name: string; href: string };
type Results = { guards: Hit[]; sites: Hit[]; clients: Hit[]; invoices: Hit[] };

const empty: Results = { guards: [], sites: [], clients: [], invoices: [] };

export function GlobalSearch({ className }: { className?: string }) {
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Results>(empty);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDoc = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => {
    if (q.trim().length < 2) {
      setResults(empty);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      api.search
        .query(q.trim())
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults(empty))
        .finally(() => setLoading(false));
    }, 220);
    return () => clearTimeout(t);
  }, [q]);

  const groups: { label: string; items: Hit[] }[] = [
    { label: 'Staff', items: results.guards },
    { label: 'Sites', items: results.sites },
    { label: 'Clients', items: results.clients },
    { label: 'Invoices', items: results.invoices },
  ].filter((g) => g.items.length);

  return (
    <div ref={boxRef} className={cn('relative hidden md:block w-full max-w-sm', className)}>
      <div className="relative">
        <Search className="pointer-events-none absolute start-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => q.trim().length >= 2 && setOpen(true)}
          placeholder="Search staff, sites, clients…"
          className="h-8 ps-8 text-sm"
          aria-label="Global search"
        />
        {loading ? <Loader2 className="absolute end-2.5 top-1/2 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" /> : null}
      </div>
      {open && groups.length > 0 ? (
        <div className="absolute start-0 end-0 z-50 mt-1 max-h-80 overflow-auto rounded-md border bg-popover p-1 shadow-md">
          {groups.map((g) => (
            <div key={g.label} className="mb-1">
              <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">{g.label}</p>
              {g.items.map((item) => (
                <Link
                  key={`${g.label}-${item.id}`}
                  href={item.href}
                  className="block rounded-sm px-2 py-1.5 text-sm hover:bg-muted"
                  onClick={() => {
                    setOpen(false);
                    setQ('');
                  }}
                >
                  {item.name}
                </Link>
              ))}
            </div>
          ))}
        </div>
      ) : null}
      {open && !loading && q.trim().length >= 2 && groups.length === 0 ? (
        <div className="absolute start-0 end-0 z-50 mt-1 rounded-md border bg-popover px-3 py-2 text-sm text-muted-foreground shadow-md">
          No matches
        </div>
      ) : null}
    </div>
  );
}
