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
import { useCallback } from 'react';
import { ArrowUpRight, Info, LayoutGrid, List as ListIcon, MoreHorizontal, Search, X } from 'lucide-react';
import { CountUp } from '@/components/dashboard/kit/count-up';
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
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-[1.625rem] font-semibold leading-tight tracking-[-0.02em] text-foreground sm:text-[1.875rem]">
          {title}
          {hint ? (
            <Tooltip.Provider delayDuration={200}>
              <Tooltip.Root>
                <Tooltip.Trigger asChild>
                  <button
                    type="button"
                    className="rounded-full text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                    className="z-[120] max-w-xs rounded-lg bg-popover px-3 py-2 text-xs text-popover-foreground shadow-pop ring-1 ring-hairline"
                  >
                    {hint}
                    <Tooltip.Arrow className="fill-popover" />
                  </Tooltip.Content>
                </Tooltip.Portal>
              </Tooltip.Root>
            </Tooltip.Provider>
          ) : null}
        </h1>
        {description ? <p className="mt-1.5 max-w-3xl text-sm text-muted-foreground">{description}</p> : null}
      </div>
      {actions ? <div className="flex flex-wrap items-center gap-2">{actions}</div> : null}
    </div>
  );
}

/* -------------------------------------------------------------- stat cards ---- */

/** The accents a stat card may use. Named by meaning, not colour, so a card that
 *  changes tone does not need every page updated. */
export type StatTone = 'neutral' | 'positive' | 'muted' | 'warning' | 'info' | 'danger';

const TONE_STYLES: Record<StatTone, { tile: string; value: string; accent?: string }> = {
  neutral: { tile: 'bg-info-soft text-info ring-info/15', value: '' },
  positive: { tile: 'bg-success-soft text-success ring-success/15', value: '' },
  muted: { tile: 'bg-muted text-muted-foreground ring-hairline', value: '' },
  warning: {
    tile: 'bg-warning-soft text-warning ring-warning/20',
    value: 'text-warning',
    accent: 'from-warning/80 via-warning/40',
  },
  info: {
    tile: 'bg-indigo-50 text-indigo-600 ring-indigo-200/60 dark:bg-indigo-500/15 dark:text-indigo-300 dark:ring-indigo-400/20',
    value: '',
  },
  danger: { tile: 'bg-danger-soft text-danger ring-danger/20', value: 'text-danger', accent: 'from-danger/80 via-danger/40' },
};

/** The raised surface every module card sits on — the same one the main dashboard uses. */
export const SURFACE =
  'gap-0 rounded-2xl border-hairline bg-surface py-0 shadow-card dark:bg-[linear-gradient(180deg,rgb(255_255_255/0.025),transparent_40%)] dark:bg-surface';

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
  /** A thin bar under the caption, 0–100 — coverage, completion. */
  progress?: { value: number; tone?: StatTone };
  /** Replace the value/caption block entirely (e.g. a date navigator). */
  body?: React.ReactNode;
};

const BAR_STYLES: Record<StatTone, string> = {
  neutral: 'bg-viz-ontime',
  positive: 'bg-viz-2',
  muted: 'bg-viz-neutral',
  warning: 'bg-viz-late',
  info: 'bg-viz-3',
  danger: 'bg-viz-absent',
};

/** A slim 0–100 bar, shared by stat cards and table cells. */
export function ProgressBar({ value, tone = 'positive', className }: { value: number; tone?: StatTone; className?: string }) {
  const pct = Math.max(0, Math.min(100, Number.isFinite(value) ? value : 0));
  return (
    <div
      className={cn('h-1.5 w-full overflow-hidden rounded-full bg-foreground/[0.06]', className)}
      role="progressbar"
      aria-valuenow={Math.round(pct)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div className={cn('h-full rounded-full transition-[width] duration-700 ease-out', BAR_STYLES[tone])} style={{ width: `${pct}%` }} />
    </div>
  );
}

const NUMERIC = /^([^\d-]*)(-?[\d,]+)(\.\d+)?(.*)$/;

function parseFigure(value: React.ReactNode) {
  if (typeof value === 'number' && Number.isFinite(value)) return { pre: '', n: value, dp: 0, post: '' };
  if (typeof value !== 'string') return null;
  const m = NUMERIC.exec(value.trim());
  if (!m) return null;
  const n = Number(`${m[2].replace(/,/g, '')}${m[3] ?? ''}`);
  return Number.isFinite(n) ? { pre: m[1], n, dp: m[3] ? m[3].length - 1 : 0, post: m[4] } : null;
}

/** Counts a figure up from zero; currency, % and units around it are kept as they are. */
function AnimatedValue({ value }: { value: React.ReactNode }) {
  const parsed = parseFigure(value);
  const pre = parsed?.pre ?? '';
  const dp = parsed?.dp ?? 0;
  const post = parsed?.post ?? '';
  const format = useCallback(
    (v: number) => `${pre}${v.toLocaleString('en-GB', { minimumFractionDigits: dp, maximumFractionDigits: dp })}${post}`,
    [pre, dp, post]
  );
  if (!parsed) return <>{value}</>;
  return (
    <>
      <CountUp value={parsed.n} format={format} />
      <span className="sr-only">{String(value)}</span>
    </>
  );
}

export function StatCards({ cards, className }: { cards: StatCardSpec[]; className?: string }) {
  if (!cards.length) return null;
  return (
    <div
      className={cn(
        'grid gap-4 sm:grid-cols-2 lg:grid-cols-3',
        cards.length >= 5 ? 'xl:grid-cols-5' : 'xl:grid-cols-4',
        className
      )}
    >
      {cards.map((c) => {
        const tone = TONE_STYLES[c.tone ?? 'neutral'];
        const Icon = c.icon;
        return (
          <div
            key={c.key}
            className={cn(
              'dash-card group/stat relative flex min-w-0 flex-col overflow-hidden p-5 transition-[transform,box-shadow] duration-300 ease-out',
              c.action && 'hover:-translate-y-0.5 hover:shadow-card-hover'
            )}
          >
            {tone.accent ? (
              <span aria-hidden className={cn('pointer-events-none absolute inset-x-0 top-0 h-[3px] bg-gradient-to-r to-transparent', tone.accent)} />
            ) : null}
            <div className="flex min-w-0 items-center gap-2.5">
              <span className={cn('flex size-8 shrink-0 items-center justify-center rounded-lg ring-1', tone.tile)}>
                <Icon className="size-4" />
              </span>
              {c.body ? null : <p className="min-w-0 truncate text-[13px] font-medium text-muted-foreground" title={c.label}>{c.label}</p>}
            </div>
            {c.body ? (
              <div className="mt-3 min-w-0">{c.body}</div>
            ) : (
              <div className="mt-3.5 flex min-w-0 flex-1 flex-col">
                <p className={cn('break-words text-[1.625rem] font-semibold leading-none tracking-tight tabular-nums text-foreground', tone.value)}>
                  <AnimatedValue value={c.value} />
                </p>
                {c.progress ? <ProgressBar className="mt-2.5" value={c.progress.value} tone={c.progress.tone ?? c.tone} /> : null}
                {c.caption || c.action ? (
                  <div className="mt-auto flex items-center justify-between gap-2 pt-2">
                    <p className="min-w-0 truncate text-xs text-muted-foreground">{c.caption}</p>
                    {c.action ? (
                      <button
                        type="button"
                        onClick={c.action.onClick}
                        aria-label={`${c.action.label}: ${c.label}`}
                        className="inline-flex shrink-0 items-center gap-0.5 rounded-md px-1.5 py-0.5 text-xs font-semibold text-primary transition-colors after:absolute after:inset-0 after:content-[''] hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                      >
                        {c.action.label}
                        <ArrowUpRight className="size-3.5 transition-transform group-hover/stat:-translate-y-px group-hover/stat:translate-x-px rtl:-scale-x-100" />
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            )}
          </div>
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
    <Card className={SURFACE}>
      <CardContent className="flex flex-wrap items-end gap-3 p-4 sm:p-5">
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
    <div role="radiogroup" aria-label="View" className="inline-flex items-center gap-0.5 rounded-lg bg-muted/80 p-0.5 ring-1 ring-hairline dark:bg-white/5">
      {(
        [
          ['list', 'List', ListIcon],
          ['cards', 'Cards', LayoutGrid],
        ] as const
      ).map(([id, label, Icon]) => (
        <button
          key={id}
          type="button"
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className={cn(
            'flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
            value === id
              ? 'bg-surface-raised text-foreground shadow-sm ring-1 ring-hairline'
              : 'text-muted-foreground hover:text-foreground'
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
    <Card className={cn(SURFACE, 'min-w-0 overflow-hidden')}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-hairline px-5 py-3.5">
        <h2 className="flex items-center gap-2 text-[15px] font-semibold tracking-tight">
          {title}
          {count != null ? (
            <span className="rounded-full bg-foreground/[0.06] px-2 py-0.5 text-[11px] font-semibold tabular-nums text-muted-foreground">
              {count.toLocaleString('en-GB')}
            </span>
          ) : null}
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
  neutral: 'bg-info-soft text-info',
  positive: 'bg-success-soft text-success',
  warning: 'bg-warning-soft text-warning',
  danger: 'bg-danger-soft text-danger',
  info: 'bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold',
        BADGE_STYLES[tone],
        className
      )}
    >
      {dot ? <span className="size-1.5 rounded-full bg-current" /> : null}
      {children}
    </span>
  );
}

const AVATAR_HUES = [
  'bg-brand-100 text-brand-700',
  'bg-info-soft text-info',
  'bg-success-soft text-success',
  'bg-indigo-100 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300',
  'bg-warning-soft text-warning',
];

/** The circular monogram used wherever a record needs a face. */
export function RecordAvatar({ name, className }: { name: string; className?: string }) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  const initials = parts.length
    ? (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
    : '?';
  const hue = AVATAR_HUES[[...(name || '')].reduce((a, ch) => a + ch.charCodeAt(0), 0) % AVATAR_HUES.length];
  return (
    <span className={cn('flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold', hue, className)}>
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
          'flex cursor-pointer items-center gap-2 rounded-md px-2 py-1.5 text-sm outline-none data-[highlighted]:bg-accent',
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
          className="z-[120] min-w-[200px] rounded-xl bg-popover p-1 text-popover-foreground shadow-pop ring-1 ring-hairline"
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
    <div className={cn('grid gap-4 md:grid-cols-2', links.length === 4 ? 'xl:grid-cols-4' : 'xl:grid-cols-3')}>
      {links.map((l) => {
        const tone = TONE_STYLES[l.tone ?? 'neutral'];
        const Icon = l.icon;
        const inner = (
          <>
            {l.action.label}
            <ArrowUpRight className="size-3.5 transition-transform group-hover/ql:-translate-y-px group-hover/ql:translate-x-px rtl:-scale-x-100" />
          </>
        );
        const cls =
          "inline-flex items-center gap-1 rounded-md text-xs font-semibold text-primary after:absolute after:inset-0 after:content-[''] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";
        return (
          <div
            key={l.key}
            className="dash-card group/ql relative flex items-start gap-3.5 p-5 transition-[transform,box-shadow] duration-300 hover:-translate-y-0.5 hover:shadow-card-hover"
          >
            <span className={cn('flex size-10 shrink-0 items-center justify-center rounded-xl ring-1', tone.tile)}>
              <Icon className="size-[1.125rem]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-foreground">{l.title}</p>
              <p className="mt-0.5 text-xs leading-relaxed text-muted-foreground">{l.description}</p>
              <div className="mt-3">
                {l.action.href ? (
                  <a href={l.action.href} className={cls}>
                    {inner}
                  </a>
                ) : (
                  <button type="button" onClick={l.action.onClick} className={cls}>
                    {inner}
                  </button>
                )}
              </div>
            </div>
          </div>
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
