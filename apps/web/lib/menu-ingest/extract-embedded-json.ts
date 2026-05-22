/** Extract a JSON array or object starting at `startIndex` (must point at `[` or `{`). */
export function parseJsonAt(
  text: string,
  startIndex: number,
): unknown | null {
  const open = text[startIndex];
  if (open !== "[" && open !== "{") return null;

  const close = open === "[" ? "]" : "}";
  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = startIndex; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === "\\") {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }

    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth++;
    else if (ch === close) {
      depth--;
      if (depth === 0) {
        try {
          return JSON.parse(text.slice(startIndex, i + 1));
        } catch {
          return null;
        }
      }
    }
  }

  return null;
}

/** Find `"key":[` or `"key":{` and parse the value. */
export function extractJsonValueForKey(
  text: string,
  key: string,
): unknown | null {
  const needle = `"${key}":`;
  let pos = 0;
  while (pos < text.length) {
    const idx = text.indexOf(needle, pos);
    if (idx === -1) return null;
    let i = idx + needle.length;
    while (i < text.length && /\s/.test(text[i])) i++;
    const value = parseJsonAt(text, i);
    if (value !== null) return value;
    pos = idx + needle.length;
  }
  return null;
}
