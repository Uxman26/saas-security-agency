/**
 * One reading of "is this linked to that contractor?", shared by the screens that
 * filter on it.
 *
 * A contractor can be recorded two ways. Newer records point at the contractor
 * directory through `contractor_id` (a UUID); records created before the directory
 * existed carry the legacy integer `main_contractor_id` / `sub_contractor_id`. Both are
 * checked, with the legacy rows matched to the directory entry by name, so a filter
 * never quietly hides staff or sites whose link predates the directory.
 *
 * This mirrors what the backend's `work_filters` module does for the server-side
 * filters, so the rota planner — which filters its own JSON in the browser — agrees
 * with Payroll, Invoices and the rota list.
 */

/** Anything carrying a contractor link: a staff record or a site. */
export type ContractorLinked = {
  contractor_id?: string | null;
  main_contractor_id?: number | null;
  sub_contractor_id?: number | null;
};

type DirectoryRef = { id: string; name: string };
type LegacyRef = { id: number; name: string };

/**
 * Builds the predicate for one contractor selection.
 *
 * `selected` is a directory id. Passing `'all'` or an empty string gives a predicate
 * that accepts everything, so callers do not need to special-case "no filter".
 */
export function contractorMatcher(
  selected: string,
  kind: 'main' | 'sub',
  directory: DirectoryRef[],
  legacy: LegacyRef[] = []
): (row: ContractorLinked | null | undefined) => boolean {
  if (!selected || selected === 'all') return () => true;

  const picked = directory.find((c) => c.id === selected);
  const name = (picked?.name ?? '').trim().toLowerCase();
  // Every legacy row standing for the same contractor. Usually one, but a company that
  // typed the name twice before the directory existed can have several.
  const legacyIds = new Set(
    name ? legacy.filter((c) => (c.name || '').trim().toLowerCase() === name).map((c) => c.id) : []
  );

  return (row) => {
    if (!row) return false;
    if ((row.contractor_id || '') === selected) return true;
    const legacyId = kind === 'main' ? row.main_contractor_id : row.sub_contractor_id;
    return legacyId != null && legacyIds.has(legacyId);
  };
}

/**
 * The contractors worth offering in a filter: those linked to at least one of the rows
 * on screen. Offering the rest would only ever empty the view.
 */
export function usedContractorOptions(
  directory: DirectoryRef[],
  legacy: LegacyRef[],
  kind: 'main' | 'sub',
  rows: (ContractorLinked | null | undefined)[]
): DirectoryRef[] {
  return directory.filter((c) => {
    const matches = contractorMatcher(c.id, kind, directory, legacy);
    return rows.some((r) => matches(r));
  });
}
