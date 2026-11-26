/**
 * An address the way it is printed: street lines, then town, county and postcode, each on
 * its own line (join with whitespace-pre-line to show it). Mirrors the backend's
 * invoice_billto.address_block, so a preview matches the PDF.
 */
export function addressLines(
  street?: string | null,
  town?: string | null,
  county?: string | null,
  postcode?: string | null
): string {
  const streetLines = (street ?? '')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const rest = [town, county, postcode].map((v) => (v ?? '').trim()).filter(Boolean);
  return [...streetLines, ...rest].join('\n');
}
