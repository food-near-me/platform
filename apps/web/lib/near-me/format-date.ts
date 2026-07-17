/**
 * Format a DB timestamp as a short, honest freshness date ("Jan 15, 2026").
 * No timezone conversion: last_external_update is a data-currency marker, not a
 * user-local event time. Returns null on missing/unparseable input so callers
 * hide the line entirely rather than render "Invalid Date".
 */
export function formatLastCheckedDate(isoString: string | null): string | null {
  if (!isoString) return null;
  const date = new Date(isoString);
  if (Number.isNaN(date.getTime())) return null;
  try {
    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
      day: "numeric",
    }).format(date);
  } catch {
    return null;
  }
}
