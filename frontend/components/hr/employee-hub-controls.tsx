'use client';

/**
 * The Employee Hub's own controls: Find / Filter by / Sort by / Status, the
 * "not registered" prompt with its terminated switch, and the Teams / List toggle.
 *
 * Kept apart from the Staff page so the two views share one set of controls and cannot
 * drift — switching between Teams View and List View changes only how the same result is
 * drawn, never what is in it.
 */

import Link from 'next/link';
import { LayoutGrid, List as ListIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { Team } from '@/lib/types';
import { cn } from '@/lib/utils';

export type HubView = 'teams' | 'list';

export type HubQuery = {
  search: string;
  teamId: string;
  sort: string;
  status: string;
  includeTerminated: boolean;
};

export const EMPTY_HUB_QUERY: HubQuery = {
  search: '',
  teamId: 'all',
  sort: 'first_name_asc',
  status: 'all',
  includeTerminated: false,
};

// Kept in step with the server's SORT_OPTIONS / STATUS_OPTIONS.
const SORT_OPTIONS: [string, string][] = [
  ['first_name_asc', 'First name (A – Z)'],
  ['first_name_desc', 'First name (Z – A)'],
  ['last_name_asc', 'Last name (A – Z)'],
  ['job_title_asc', 'Job title (A – Z)'],
  ['recent', 'Recently added'],
];

const STATUS_OPTIONS: [string, string][] = [
  ['all', 'All'],
  ['active', 'Active'],
  ['terminated', 'Terminated'],
  ['registered', 'Registered'],
  ['not_registered', 'Not registered'],
];

const SELECT_CLASS =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm';

export function EmployeeHubControls({
  query,
  onChange,
  teams,
  view,
  onViewChange,
  notRegistered,
  terminatedCount,
  /** List View drops the Status control, matching the spec's page 2. */
  showStatus = true,
}: {
  query: HubQuery;
  onChange: (next: HubQuery) => void;
  teams: Team[];
  view: HubView;
  onViewChange: (v: HubView) => void;
  notRegistered: number;
  terminatedCount: number;
  showStatus?: boolean;
}) {
  const set = (patch: Partial<HubQuery>) => onChange({ ...query, ...patch });

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3 rounded-md border bg-muted/30 px-3 py-2">
          <span className="text-sm">
            <strong>{notRegistered}</strong>{' '}
            {notRegistered === 1 ? 'employee has' : 'employees have'} no portal login yet
          </span>
          {notRegistered > 0 ? (
            <Button
              variant="outline"
              size="sm"
              className="h-7"
              onClick={() => set({ status: 'not_registered', includeTerminated: false })}
            >
              View
            </Button>
          ) : null}
          <label className="flex cursor-pointer select-none items-center gap-2 text-sm">
            <input
              type="checkbox"
              className="size-4 rounded border-input"
              checked={query.includeTerminated}
              onChange={(e) => set({ includeTerminated: e.target.checked })}
            />
            Include terminated employees
            {terminatedCount > 0 ? (
              <span className="text-muted-foreground">({terminatedCount})</span>
            ) : null}
          </label>
        </div>

        <div className="flex items-center gap-1 rounded-md border p-1">
          {(
            [
              ['teams', 'Teams View', LayoutGrid],
              ['list', 'List View', ListIcon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              onClick={() => onViewChange(id)}
              className={cn(
                'flex items-center gap-1.5 rounded px-3 py-1.5 text-xs font-medium transition-colors',
                view === id
                  ? 'bg-primary text-primary-foreground shadow-sm'
                  : 'text-muted-foreground hover:bg-muted'
              )}
            >
              <Icon className="size-3.5" />
              {label}
            </button>
          ))}
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Find</Label>
          <Input
            placeholder="Name, job title"
            value={query.search}
            onChange={(e) => set({ search: e.target.value })}
          />
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Filter by</Label>
          <select
            className={SELECT_CLASS}
            value={query.teamId}
            onChange={(e) => set({ teamId: e.target.value })}
            aria-label="Filter by team"
          >
            <option value="all">All</option>
            <option value="0">No team</option>
            {teams.map((t) => (
              <option key={t.id} value={String(t.id)}>
                {t.name} ({t.member_count})
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs text-muted-foreground">Sort by</Label>
          <select
            className={SELECT_CLASS}
            value={query.sort}
            onChange={(e) => set({ sort: e.target.value })}
            aria-label="Sort by"
          >
            {SORT_OPTIONS.map(([v, label]) => (
              <option key={v} value={v}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {showStatus ? (
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">Status</Label>
            <select
              className={SELECT_CLASS}
              value={query.status}
              onChange={(e) => set({ status: e.target.value })}
              aria-label="Status"
            >
              {STATUS_OPTIONS.map(([v, label]) => (
                <option key={v} value={v}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        ) : (
          <div className="flex items-end">
            <Link href="/guards?tab=teams" className="text-xs text-primary hover:underline">
              Manage teams
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
