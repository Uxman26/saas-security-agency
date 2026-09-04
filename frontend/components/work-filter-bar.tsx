'use client';

/**
 * The Client / Site / Contractor / Sub-contractor / Staff / Job title filter row shared
 * by Invoices, Payroll and Rota.
 *
 * The three screens filter the same underlying work, so they offer the same controls
 * and send the same six query parameters — see `WorkFilterParams`. Any combination is
 * valid, and the server ANDs them.
 *
 * Picking a client is deliberately *not* the same as picking its sites: the client is
 * sent as-is and the backend expands it to every site assigned to that client, so a
 * client with ten sites needs one selection rather than ten. The Site list narrows to
 * the chosen client's sites purely as a convenience for the next pick.
 */

import { useCallback, useEffect, useMemo, useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { api } from '@/lib/api';
import type {
  Client,
  DirectoryContractorList,
  Guard,
  JobTitle,
  MainContractor,
  Site,
  SubContractor,
  WorkFilterParams,
} from '@/lib/types';

/** Everything blank. The Select components need a real value, so "" is "all". */
export const EMPTY_WORK_FILTERS: WorkFilterValues = {
  client: '',
  site: '',
  contractor: '',
  subContractor: '',
  guard: '',
  jobTitle: '',
};

export type WorkFilterValues = {
  client: string;
  site: string;
  contractor: string;
  subContractor: string;
  guard: string;
  jobTitle: string;
};

/** Which of the six a screen should show. Omit to show them all. */
export type WorkFilterKey = keyof WorkFilterValues;

const ALL_KEYS: WorkFilterKey[] = ['client', 'site', 'contractor', 'subContractor', 'guard', 'jobTitle'];

/** The values as the API wants them. Blank fields are dropped, not sent empty. */
export function toWorkFilterParams(v: WorkFilterValues): WorkFilterParams {
  const out: WorkFilterParams = {};
  if (v.client) out.client_id = parseInt(v.client, 10);
  if (v.site) out.site_id = parseInt(v.site, 10);
  if (v.contractor) out.contractor_id = v.contractor;
  if (v.subContractor) out.sub_contractor_id = v.subContractor;
  if (v.guard) out.guard_id = parseInt(v.guard, 10);
  if (v.jobTitle) out.job_title = v.jobTitle;
  return out;
}

export function hasWorkFilters(v: WorkFilterValues): boolean {
  return ALL_KEYS.some((k) => Boolean(v[k]));
}

/** A short human summary, for "showing results for …" lines and export subtitles. */
export function describeWorkFilters(v: WorkFilterValues, o: WorkFilterOptions): string[] {
  const label = (list: { value: string; label: string }[], value: string) =>
    list.find((x) => x.value === value)?.label ?? value;
  const parts: string[] = [];
  if (v.client) parts.push(label(o.clients, v.client));
  if (v.site) parts.push(label(o.sites, v.site));
  if (v.contractor) parts.push(label(o.contractors, v.contractor));
  if (v.subContractor) parts.push(label(o.subContractors, v.subContractor));
  if (v.guard) parts.push(label(o.guards, v.guard));
  if (v.jobTitle) parts.push(v.jobTitle);
  return parts;
}

type Option = { value: string; label: string };

export type WorkFilterOptions = {
  clients: Option[];
  /** Every site, for the "site belongs to which client" lookup below. */
  sites: Option[];
  sitesByClient: (clientId: string) => Option[];
  contractors: Option[];
  subContractors: Option[];
  guards: Option[];
  jobTitles: Option[];
  loading: boolean;
};

/**
 * Loads the pick-lists once per screen.
 *
 * Each list is fetched independently and a refusal is swallowed: a role may hold
 * Payroll but not Contractors, and one missing list must leave the other five filters
 * working rather than blanking the row. A filter with no options is hidden by the bar.
 */
export function useWorkFilterOptions(): WorkFilterOptions {
  const [clients, setClients] = useState<Client[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [guards, setGuards] = useState<Guard[]>([]);
  const [jobTitles, setJobTitles] = useState<JobTitle[]>([]);
  const [directory, setDirectory] = useState<DirectoryContractorList[]>([]);
  const [legacyMains, setLegacyMains] = useState<MainContractor[]>([]);
  const [legacySubs, setLegacySubs] = useState<SubContractor[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    const settle = <T,>(p: Promise<T>, set: (v: T) => void) =>
      p.then((v) => alive && set(v)).catch(() => {});
    Promise.allSettled([
      settle(api.clients.list(), setClients),
      settle(api.sites.list(), setSites),
      settle(api.guards.list(), setGuards),
      settle(api.jobTitles.list(), setJobTitles),
      settle(api.directoryContractors.getContractors(), setDirectory),
      settle(api.mainContractors.list(), setLegacyMains),
      settle(api.subContractors.list(), setLegacySubs),
    ]).finally(() => {
      if (alive) setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, []);

  const clientOptions = useMemo(
    () => clients.map((c) => ({ value: String(c.id), label: c.name })),
    [clients]
  );
  const clientNames = useMemo(() => new Map(clients.map((c) => [c.id, c.name])), [clients]);
  const siteOptions = useMemo(
    () =>
      sites.map((s) => ({
        value: String(s.id),
        label: s.client_id && clientNames.get(s.client_id) ? `${s.name} · ${clientNames.get(s.client_id)}` : s.name,
      })),
    [sites, clientNames]
  );
  const sitesByClient = useCallback(
    (clientId: string) => {
      if (!clientId) return siteOptions;
      const wanted = parseInt(clientId, 10);
      const ids = new Set(sites.filter((s) => s.client_id === wanted).map((s) => String(s.id)));
      return siteOptions.filter((o) => ids.has(o.value));
    },
    [siteOptions, sites]
  );

  /**
   * The directory is the current home for contractors, but sites and staff linked
   * before it exists still carry a legacy row. Both are offered, de-duplicated by name,
   * with the directory winning — the backend widens either id to cover the other.
   */
  const contractorOptions = useMemo(() => {
    const build = (
      dir: DirectoryContractorList[],
      legacy: { id: number; name: string }[]
    ): Option[] => {
      const seen = new Set(dir.map((c) => c.name.trim().toLowerCase()));
      return [
        ...dir.map((c) => ({ value: c.id, label: c.name })),
        ...legacy
          .filter((c) => !seen.has((c.name || '').trim().toLowerCase()))
          .map((c) => ({ value: String(c.id), label: c.name })),
      ].sort((a, b) => a.label.localeCompare(b.label));
    };
    return {
      main: build(directory.filter((c) => c.type === 'main'), legacyMains),
      sub: build(directory.filter((c) => c.type === 'sub'), legacySubs),
    };
  }, [directory, legacyMains, legacySubs]);

  const guardOptions = useMemo(
    () => guards.map((g) => ({ value: String(g.id), label: g.full_name })),
    [guards]
  );

  /**
   * Staff carry their job title as free text, so the pick-list is widened with any
   * title already in use — otherwise a title typed onto a record before the list was
   * curated would be unfilterable.
   */
  const jobTitleOptions = useMemo(() => {
    const names = new Map<string, string>();
    for (const t of jobTitles) names.set(t.name.trim().toLowerCase(), t.name);
    for (const g of guards) {
      const t = (g.job_title || '').trim();
      if (t && !names.has(t.toLowerCase())) names.set(t.toLowerCase(), t);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b)).map((n) => ({ value: n, label: n }));
  }, [jobTitles, guards]);

  return {
    clients: clientOptions,
    sites: siteOptions,
    sitesByClient,
    contractors: contractorOptions.main,
    subContractors: contractorOptions.sub,
    guards: guardOptions,
    jobTitles: jobTitleOptions,
    loading,
  };
}

type BarProps = {
  value: WorkFilterValues;
  onChange: (next: WorkFilterValues) => void;
  options: WorkFilterOptions;
  /** Which filters to show, in order. Defaults to all six. */
  keys?: WorkFilterKey[];
  disabled?: boolean;
  className?: string;
};

export function WorkFilterBar({ value, onChange, options, keys = ALL_KEYS, disabled, className }: BarProps) {
  const set = (patch: Partial<WorkFilterValues>) => onChange({ ...value, ...patch });

  const siteOptions = options.sitesByClient(value.client);

  // A site that is no longer under the chosen client would filter to nothing and give
  // no clue why, so changing client drops a site that does not belong to it.
  useEffect(() => {
    if (value.site && !siteOptions.some((o) => o.value === value.site)) {
      onChange({ ...value, site: '' });
    }
    // Only the client/site pair matters here; onChange is recreated every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value.client, value.site, siteOptions]);

  const controls: Record<WorkFilterKey, { label: string; options: Option[]; current: string; apply: (v: string) => void }> = {
    client: { label: 'All clients', options: options.clients, current: value.client, apply: (v) => set({ client: v }) },
    site: { label: 'All sites', options: siteOptions, current: value.site, apply: (v) => set({ site: v }) },
    contractor: {
      label: 'All contractors',
      options: options.contractors,
      current: value.contractor,
      apply: (v) => set({ contractor: v }),
    },
    subContractor: {
      label: 'All sub-contractors',
      options: options.subContractors,
      current: value.subContractor,
      apply: (v) => set({ subContractor: v }),
    },
    guard: { label: 'All staff', options: options.guards, current: value.guard, apply: (v) => set({ guard: v }) },
    jobTitle: {
      label: 'All job titles',
      options: options.jobTitles,
      current: value.jobTitle,
      apply: (v) => set({ jobTitle: v }),
    },
  };

  const shown = keys.filter((k) => controls[k].options.length > 0 || controls[k].current);

  if (!shown.length) return null;

  return (
    <div className={className ?? 'flex flex-wrap items-center gap-2'}>
      {shown.map((k) => {
        const c = controls[k];
        return (
          <SearchableSelect
            key={k}
            className="w-[190px]"
            value={c.current || '__all'}
            options={c.options}
            noneOption={{ value: '__all', label: c.label }}
            placeholder={c.label}
            searchPlaceholder="Search…"
            emptyText="No matches"
            disabled={disabled}
            onChange={(v) => c.apply(v === '__all' ? '' : v)}
          />
        );
      })}
      {hasWorkFilters(value) ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onChange(EMPTY_WORK_FILTERS)}
          disabled={disabled}
        >
          <X className="size-3.5 mr-1" />
          Clear filters
        </Button>
      ) : null}
    </div>
  );
}
