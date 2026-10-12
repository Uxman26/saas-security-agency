'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Search, Loader2, CornerDownLeft } from 'lucide-react';
import { api } from '@/lib/api';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import { useAuth } from '@/contexts/auth-context';

export type SearchHit = { id: number | string; name: string; href: string; subtitle?: string | null };

export type TenantSearchResults = {
  guards: SearchHit[];
  sites: SearchHit[];
  clients: SearchHit[];
  invoices: SearchHit[];
  leads: SearchHit[];
  rota_plans: SearchHit[];
  incidents: SearchHit[];
  tasks: SearchHit[];
  contractors: SearchHit[];
  documents: SearchHit[];
  patrol_routes: SearchHit[];
  accident_reports: SearchHit[];
  occurrence_sheets: SearchHit[];
  expenses: SearchHit[];
  vendors: SearchHit[];
  allowances: SearchHit[];
  payrolls: SearchHit[];
  payments: SearchHit[];
  staff_requests: SearchHit[];
  credit_notes: SearchHit[];
  accounts: SearchHit[];
  pages: SearchHit[];
};

const empty: TenantSearchResults = {
  guards: [],
  sites: [],
  clients: [],
  invoices: [],
  leads: [],
  rota_plans: [],
  incidents: [],
  tasks: [],
  contractors: [],
  documents: [],
  patrol_routes: [],
  accident_reports: [],
  occurrence_sheets: [],
  expenses: [],
  vendors: [],
  allowances: [],
  payrolls: [],
  payments: [],
  staff_requests: [],
  credit_notes: [],
  accounts: [],
  pages: [],
};

const GROUPS: { key: keyof TenantSearchResults; label: string }[] = [
  { key: 'pages', label: 'Pages' },
  { key: 'guards', label: 'Staff' },
  { key: 'clients', label: 'Clients' },
  { key: 'sites', label: 'Sites' },
  { key: 'leads', label: 'Leads' },
  { key: 'invoices', label: 'Invoices' },
  { key: 'credit_notes', label: 'Credit notes' },
  { key: 'rota_plans', label: 'Rotas' },
  { key: 'incidents', label: 'Incidents' },
  { key: 'accident_reports', label: 'Accident reports' },
  { key: 'occurrence_sheets', label: 'Occurrence sheets' },
  { key: 'tasks', label: 'Tasks' },
  { key: 'contractors', label: 'Contractors' },
  { key: 'documents', label: 'Documents' },
  { key: 'patrol_routes', label: 'Patrol routes' },
  { key: 'expenses', label: 'Expenses' },
  { key: 'vendors', label: 'Vendors' },
  { key: 'allowances', label: 'Allowances' },
  { key: 'payrolls', label: 'Payroll' },
  { key: 'payments', label: 'Transactions' },
  { key: 'staff_requests', label: 'Staff requests' },
  { key: 'accounts', label: 'Accounts' },
];

function isMac() {
  if (typeof navigator === 'undefined') return false;
  return /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);
}

export function GlobalSearch({ className }: { className?: string }) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<TenantSearchResults>(empty);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const hide = !user || user.role === 'super_admin';

  const flat = useMemo(() => {
    const rows: { group: string; item: SearchHit; key: string }[] = [];
    for (const g of GROUPS) {
      for (const item of results[g.key] || []) {
        rows.push({ group: g.label, item, key: `${g.key}-${item.id}-${item.href}` });
      }
    }
    return rows;
  }, [results]);

  const openPalette = useCallback(() => {
    setOpen(true);
    setTimeout(() => inputRef.current?.focus(), 0);
  }, []);

  const closePalette = useCallback(() => {
    setOpen(false);
    setQ('');
    setResults(empty);
    setActive(0);
  }, []);

  const go = useCallback(
    (href: string) => {
      closePalette();
      router.push(href);
    },
    [closePalette, router]
  );

  useEffect(() => {
    if (hide) return;
    const onKey = (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        setOpen((v) => {
          const next = !v;
          if (next) setTimeout(() => inputRef.current?.focus(), 0);
          else {
            setQ('');
            setResults(empty);
            setActive(0);
          }
          return next;
        });
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [hide]);

  useEffect(() => {
    if (!open) return;
    if (q.trim().length < 2) {
      setResults(empty);
      setLoading(false);
      return;
    }
    const t = setTimeout(() => {
      setLoading(true);
      api.search
        .query(q.trim())
        .then((r) => {
          setResults({ ...empty, ...r });
          setActive(0);
        })
        .catch(() => setResults(empty))
        .finally(() => setLoading(false));
    }, 200);
    return () => clearTimeout(t);
  }, [q, open]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: 'nearest' });
  }, [active]);

  if (hide) return null;

  const shortcut = isMac() ? '⌘K' : 'Ctrl+K';

  return (
    <>
      <div className={cn('flex items-center gap-1', className)}>
        <button
          type="button"
          onClick={openPalette}
          className="hidden md:flex h-8 w-full max-w-sm items-center gap-2 rounded-md border border-input bg-background px-2.5 text-sm text-muted-foreground shadow-xs transition-colors hover:bg-muted/50"
          aria-label="Global search"
        >
          <Search className="size-4 shrink-0" />
          <span className="flex-1 truncate text-start">Search anything…</span>
          <kbd className="pointer-events-none hidden rounded border bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground sm:inline-block">
            {shortcut}
          </kbd>
        </button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="md:hidden"
          aria-label="Global search"
          title="Search"
          onClick={openPalette}
        >
          <Search className="size-4" />
        </Button>
      </div>

      <Dialog open={open} onOpenChange={(v) => (v ? openPalette() : closePalette())}>
        <DialogContent
          showCloseButton={false}
          className="top-[max(0.75rem,env(safe-area-inset-top))] translate-y-0 gap-0 overflow-hidden p-0 sm:max-w-xl max-h-[calc(100dvh-1.5rem-env(safe-area-inset-top)-env(safe-area-inset-bottom))]"
        >
          <DialogTitle className="sr-only">Global search</DialogTitle>
          <div className="flex items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search staff, sites, clients, invoices, leads…"
              className="h-12 border-0 shadow-none focus-visible:ring-0"
              aria-label="Search"
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, Math.max(flat.length - 1, 0)));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  const row = flat[active];
                  if (row) go(row.item.href);
                } else if (e.key === 'Escape') {
                  closePalette();
                }
              }}
            />
            {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" /> : null}
          </div>
          <div ref={listRef} className="max-h-[min(60vh,28rem)] overflow-auto p-1">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                Type at least 2 characters. Press <span className="font-medium">{shortcut}</span> anytime.
              </p>
            ) : !loading && flat.length === 0 ? (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches</p>
            ) : (
              GROUPS.map((g) => {
                const items = results[g.key] || [];
                if (!items.length) return null;
                return (
                  <div key={g.key} className="mb-1">
                    <p className="px-2 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                      {g.label}
                    </p>
                    {items.map((item) => {
                      const key = `${g.key}-${item.id}-${item.href}`;
                      const idx = flat.findIndex((r) => r.key === key);
                      const selected = idx === active;
                      return (
                        <button
                          key={key}
                          type="button"
                          data-idx={idx}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-md px-2 py-2 text-start text-sm',
                            selected ? 'bg-accent text-accent-foreground' : 'hover:bg-muted'
                          )}
                          onMouseEnter={() => setActive(idx)}
                          onClick={() => go(item.href)}
                        >
                          <div className="min-w-0 flex-1">
                            <p className="truncate font-medium">{item.name}</p>
                            {item.subtitle ? (
                              <p className="truncate text-xs text-muted-foreground">{item.subtitle}</p>
                            ) : null}
                          </div>
                          {selected ? <CornerDownLeft className="size-3.5 shrink-0 opacity-60" /> : null}
                        </button>
                      );
                    })}
                  </div>
                );
              })
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
