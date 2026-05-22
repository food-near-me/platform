/** Detect sites unlikely to yield menus — skip deep probing to save time. */

const DEAD_PAGE =
  /page not found|404|coming soon|under construction|couldn't find the page|page isn.t available|we couldn't find the page|automatically reloaded in \d seconds/i;

const PLACEHOLDER_ONLY =
  /^(?:home|about|contact|menu|order|reserve|locations?)$/i;

export function isDeadOrPlaceholderSite(
  html: string | null,
  visibleText: string,
): boolean {
  const combined = `${html ?? ""}\n${visibleText}`.toLowerCase();
  if (DEAD_PAGE.test(combined)) return true;

  const lines = visibleText
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 1);

  const hasPrice = /\$\s*\d+(?:\.\d{2})?/.test(visibleText);
  const substantive = lines.filter((l) => !PLACEHOLDER_ONLY.test(l) && l.length > 8);

  if (visibleText.length === 0 && html && html.length > 8_000) {
    return false;
  }

  if (visibleText.length > 0 && visibleText.length < 120 && !hasPrice && substantive.length <= 4) {
    return true;
  }

  if (
    html &&
    html.length < 3_000 &&
    !hasPrice &&
    substantive.length <= 2 &&
    visibleText.length < 80
  ) {
    return true;
  }

  return false;
}
