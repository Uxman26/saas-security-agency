'use client';

/**
 * The shared furniture every module dashboard is built from.
 *
 * Invoices, Payroll, Clients and Staff all show the same shape — a header with actions,
 * a row of stat cards, a filter bar, a results card with its own view controls, and a
 * row of quick links at the bottom. Keeping that shape in one file is what stops the
 * four screens drifting into four slightly different products, and means a change to,
 * say, the stat card lands everywhere at once.
 *
 * Each piece is deliberately dumb: it takes what to draw and hands interaction back to
 * the page. Filtering, sorting and paging stay where the data is.
 */

import { DropdownMenu, Tooltip } from 'radix-ui';
import { ChevronDown, Info, LayoutGrid, List as ListIcon, MoreHorizontal, Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { TABLE_PAGE_SIZES } from '@/lib/use-table-list';
import { cn } from '@/lib/utils';

/* ------------------------------------------------------------------ header ---- */

export function DashboardHeader({
  title,
  description,
  /** Shown behind the ⓘ next to the title, for the detail that would clutter the subtitle. */
  hint,
  actions,
}: {
  title: string;
  description?: string;
  hint?: string;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl font-bold">
          {title}
          {hint ? (
            <Tooltip.Provider delayDuration={200}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className="text-muted-foreground hover:text-foreground"
                    aria-label={`About ${title}`}
                  >
                    <Info className="size-4" />
                  </button>
                </Tooltip.Trigger>
                <Tooltip.Portal>
                  <Tooltip.Content
                    side="bottom"
                    align="start"
                    sideOffset={6}
                    className="z-[120] max-w-xs rounded-md border bg-popover px-3 py-2 text-xs text-popover-foreground shadow-md"
                  >
                    {hint}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          ) : null}
        </h1>
        {description ? <p className="mt-1 text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- stat cards ---- */

/** The accents a stat card may use. Named by meaning, not colour, so a card that
 *  changes tone does not need every page updated. */
export type StatTone = 'neutral' | 'positive' | 'muted' | 'warning' | 'info' | 'danger';

const TONE_STYLES: Record<StatTone, { tile: string; value: string }> = {
  neutral: { tile: 'bg-sky-100 text-sky-700 dark:bg-sky-950/50 dark:text-sky-300', value: '' },
  positive: { tile: 'bg-green-100 text-green-700 dark:bg-green-950/50 dark:text-green-300', value: '' },
  muted: { tile: 'bg-muted text-muted-foreground', value: '' },
  warning: {
    tile: 'bg-amber-100 text-amber-700 dark:bg-amber-950/50 dark:text-amber-300',
    value: 'text-amber-700 dark:text-amber-300',
  },
  info: { tile: 'bg-violet-100 text-violet-700 dark:bg-violet-950/50 dark:text-violet-300', value: '' },
  danger: {
    tile: 'bg-red-100 text-red-700 dark:bg-red-950/50 dark:text-red-300',
    value: 'text-red-600 dark:text-red-400',
  },
};

export type StatCardSpec = {
  key: string;
  label: string;
  value: React.ReactNode;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  /** A short caption under the value — "3 invoices", "this search". */
  caption?: string;
  /** The "View" affordance on the right of the card. */
  action?: { label: string; onClick: () => void };
};

export function StatCards({ cards, className }: { cards: StatCardSpec[]; className?: string }) {
  if (!cards.length) return null;
  return (
    <div
      className={cn(
        'grid gap-3 sm:grid-cols-2 lg:grid-cols-3',
        cards.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
        className
      )}
    >
      {cards.map((c) => {
        const tone = TONE_STYLES[c.tone ?? 'neutral'];
        const Icon = c.icon;
        return (
          <Card key={c.key}>
            <CardContent className="flex items-center gap-3 p-4">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone.tile)}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-xs text-muted-foreground">{c.label}</p>
                <p className={cn('truncate text-2xl font-bold tabular-nums', tone.value)}>{c.value}</p>
                {c.caption ? <p className="truncate text-[11px] text-muted-foreground">{c.caption}</p> : null}
              </div>
              {c.action ? (
                <button
                  type="button"
                  onClick={c.action.onClick}
                  className="shrink-0 text-sm font-medium text-primary hover:underline"
                >
                  {c.action.label}
                </button>
              ) : null}
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/* -------------------------------------------------------------- filter bar ---- */

/**
 * The filter row. `onSearch` is optional: pages that filter as you type leave it out and
 * only get Clear, so no screen shows a Search button that does nothing.
 */
export function FilterBar({
  children,
  onSearch,
  onClear,
  searching,
  showClear = true,
}: {
  children: React.ReactNode;
  onSearch?: () => void;
  onClear?: () => void;
  searching?: boolean;
  showClear?: boolean;
}) {
  return (
    <Card>
      <CardContent className="flex flex-wrap items-end gap-3 p-4">
        {children}
        <div className="ml-auto flex items-end gap-2">
          {onSearch ? (
            <Button onClick={onSearch} disabled={searching}>
              <Search className="mr-1.5 size-4" />
              {searching ? 'Searching…' : 'Search'}
            </Button>
          ) : null}
          {showClear && onClear ? (
            <Button variant="outline" onClick={onClear}>
              <X className="mr-1.5 size-4" />
              Clear
            </Button>
          ) : null}
        </div>
      </CardContent>
    </Card>
  );
}

/** One labelled control in the filter bar, so every field lines up the same way. */
export function FilterField({
  label,
  children,
  className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    // The Select trigger is w-fit by default, so a field set to grow would widen while its
    // control stayed at its intrinsic size, leaving a gap after every dropdown. Filter
    // controls always fill their field.
    <div className={cn('min-w-[160px] space-y-1 [&>button]:w-full', className)}>
      <label className="block text-xs font-medium text-muted-foreground">{label}</label>
      {children}
    </div>
  );
}

/* ------------------------------------------------------------- results card ---- */

export type ResultsView = 'list' | 'cards';

export function ViewToggle({ value, onChange }: { value: ResultsView; onChange: (v: ResultsView) => void }) {
  return (
    <div className="flex items-center gap-1 rounded-md border p-0.5">
      {(
        [
          ['list', 'List', ListIcon],
          ['cards', 'Cards', LayoutGrid],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          onClick={() => onChange(id)}
          className={cn(
            'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
            value === id ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted'
          )}
        >
          <Icon className="size-3.5" />
          {label}
        </button>
      ))}
    </div>
  );
}

export function PerPageSelect({
  value,
  onChange,
  options = [...TABLE_PAGE_SIZES],
}: {
  value: number;
  onChange: (n: number) => void;
  options?: readonly number[];
}) {
  return (
    <div className="flex items-center gap-2 text-sm text-muted-foreground">
      <span>Show</span>
      <Select value={String(value)} onValueChange={(v) => onChange(parseInt(v, 10))}>
        <SelectTrigger className="h-8 w-[74px]">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((n) => (
            <SelectItem key={n} value={String(n)}>
              {n}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span>per page</span>
    </div>
  );
}

/**
 * The card the results sit in: a counted title on the left, the per-page and view
 * controls on the right, and whatever the page wants to draw inside.
 */
export function ResultsCard({
  title,
  count,
  view,
  onViewChange,
  pageSize,
  onPageSizeChange,
  toolbar,
  children,
}: {
  title: string;
  count?: number;
  view?: ResultsView;
  onViewChange?: (v: ResultsView) => void;
  pageSize?: number;
  onPageSizeChange?: (n: number) => void;
  /** Extra controls between the title and the view switch. */
  toolbar?: React.ReactNode;
  children: React.ReactNode;
}) {
  const hasRight = toolbar || (pageSize != null && onPageSizeChange) || (view && onViewChange);
  return (
    <Card className="min-w-0 overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b px-4 py-3">
        <h2 className="text-base font-semibold">
          {title}
          {count != null ? <span className="ml-1 text-muted-foreground">({count})</span> : null}
        </h2>
        {hasRight ? (
          <div className="flex flex-wrap items-center gap-3">
            {toolbar}
            {pageSize != null && onPageSizeChange ? (
              <PerPageSelect value={pageSize} onChange={onPageSizeChange} />
            ) : null}
            {view && onViewChange ? <ViewToggle value={view} onChange={onViewChange} /> : null}
          </div>
        ) : null}
      </div>
      <CardContent className="min-w-0 p-0">{children}</CardContent>
    </Card>
  );
}

/* ------------------------------------------------------------ row elements ---- */

export type BadgeTone = 'neutral' | 'positive' | 'warning' | 'danger' | 'info' | 'muted';

const BADGE_STYLES: Record<BadgeTone, string> = {
  neutral: 'bg-sky-100 text-sky-800 dark:bg-sky-900/40 dark:text-sky-300',
  positive: 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-300',
  warning: 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-300',
  danger: 'bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300',
  info: 'bg-violet-100 text-violet-800 dark:bg-violet-900/40 dark:text-violet-300',
  muted: 'bg-muted text-muted-foreground',
};

export function Pill({
  tone = 'muted',
  dot,
  children,
  className,
}: {
  tone?: BadgeTone;
  /** A leading status dot, as on the Active / Inactive pills. */
  dot?: boolean;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-medium',
        BADGE_STYLES[tone],
        className
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

/** The circular monogram used wherever a record needs a face. */
export function RecordAvatar({ name, className }: { name: string; className?: string }) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const initials = parts.length
    ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
    : '?';
  return (
    <span
      className={cn(
        'flex size-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-semibold text-primary',
        className
      )}
    >
      {initials}
    </span>
  );
}

export type RowAction = {
  label: string;
  icon?: React.ComponentType<{ className?: string }>;
  onSelect: () => void;
  /** Renders in the destructive colour and sits below a divider. */
  destructive?: boolean;
  disabled?: boolean;
};

/** The ⋯ menu at the end of a row. Actions that are not permitted are left out by the
 *  caller rather than shown disabled, so the menu only ever offers real choices. */
export function RowActionsMenu({ actions, label = 'Row actions' }: { actions: RowAction[]; label?: string }) {
  const usable = actions.filter((a) => !a.disabled);
  if (!usable.length) return null;
  const normal = usable.filter((a) => !a.destructive);
  const destructive = usable.filter((a) => a.destructive);

  const item = (a: RowAction) => {
    const Icon = a.icon;
    return (
      <DropdownMenu.Item
        key={a.label}
        onSelect={a.onSelect}
        className={cn(
          'flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent',
          a.destructive && 'text-destructive data-[highlighted]:bg-destructive/10'
        )}
      >
        {Icon ? <Icon className="size-4" /> : null}
        {a.label}
      </DropdownMenu.Item>
    );
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <Button variant="ghost" size="icon" className="size-8" aria-label={label}>
          <MoreHorizontal className="size-4" />
        </Button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          className="z-[120] min-w-[200px] rounded-md border bg-popover p-1 text-popover-foreground shadow-md"
        >
          {normal.map(item)}
          {destructive.length && normal.length ? (
            <DropdownMenu.Separator className="my-1 h-px bg-border" />
          ) : null}
          {destructive.map(item)}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}

/* -------------------------------------------------------------- quick links ---- */

export type QuickLinkSpec = {
  key: string;
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  tone?: StatTone;
  action: { label: string; href?: string; onClick?: () => void };
};

/** The row of "where to go next" cards along the bottom of a module dashboard. */
export function QuickLinks({ links }: { links: QuickLinkSpec[] }) {
  if (!links.length) return null;
  return (
    <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
      {links.map((l) => {
        const tone = TONE_STYLES[l.tone ?? 'neutral'];
        const Icon = l.icon;
        return (
          <Card key={l.key} className="bg-muted/30">
            <CardContent className="flex items-start gap-3 p-4">
              <span className={cn('flex size-11 shrink-0 items-center justify-center rounded-xl', tone.tile)}>
                <Icon className="size-5" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold text-primary">{l.title}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{l.description}</p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  asChild={Boolean(l.action.href)}
                  onClick={l.action.onClick}
                >
                  {l.action.href ? (
                    <a href={l.action.href}>
                      {l.action.label}
                      <ChevronDown className="ml-1.5 size-3.5 -rotate-90" />
                    </a>
                  ) : (
                    <span>
                      {l.action.label}
                      <ChevronDown className="ml-1.5 size-3.5 -rotate-90" />
                    </span>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

/** "Showing 1 to 10 of 42" — the phrasing used under every module table. */
export function ShowingCount({
  rangeStart,
  rangeEnd,
  total,
  noun,
}: {
  rangeStart: number;
  rangeEnd: number;
  total: number;
  noun: string;
}) {
  return (
    <p className="text-sm text-muted-foreground">
      {total === 0
        ? `No ${noun}`
        : `Showing ${rangeStart} to ${rangeEnd} of ${total} ${noun}`}
    </p>
  );
}
