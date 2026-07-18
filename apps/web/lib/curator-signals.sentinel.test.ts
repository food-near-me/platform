import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

/**
 * Grep sentinels for the curator-signals honesty invariants.
 *
 *  (a) The identifier `curator_signals` may appear ONLY in the write path
 *      (lib/curator-signals.ts) and the signals route. If it leaks into any
 *      other app/lib module, some new surface can read/aggregate signals — the
 *      exact breach the "no public count/aggregate" invariant forbids.
 *  (b) No SQL `VIEW` / `GROUP BY` / `count(` is ever computed over
 *      curator_signals anywhere in the repo — no aggregate can exist even in a
 *      migration or script.
 *
 * These walk the real filesystem (not `git grep`, which would miss untracked
 * files), so they bite on a planted regression rather than a stale index.
 */

const testDir = dirname(fileURLToPath(import.meta.url));
const webRoot = resolve(testDir, ".."); // apps/web
const repoRoot = resolve(webRoot, "../.."); // repo root

const SKIP_DIRS = new Set(["node_modules", ".git", ".next", "dist", "build"]);
const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|sql)$/;

function* walk(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue;
    const full = resolve(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) yield* walk(full);
    else if (CODE_EXT.test(entry)) yield full;
  }
}

/** Files under the given roots (repo-relative paths) that mention the pattern,
 * excluding test files. */
function filesMentioning(pattern: RegExp, roots: string[]): string[] {
  const out: string[] = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const rel = relative(repoRoot, file);
      if (rel.endsWith(".test.ts")) continue;
      if (pattern.test(readFileSync(file, "utf8"))) out.push(rel);
    }
  }
  return out;
}

const ALLOWED = new Set([
  "apps/web/lib/curator-signals.ts",
  "apps/web/app/api/v1/signals/route.ts",
  // C3 curator queue reads (never aggregates) the signal table to decide which
  // restaurants are open + as a staleness proxy. Membership via EXISTS, latest
  // signal time via a scalar max() — no count/GROUP BY (sentinel (b) enforces).
  "apps/web/lib/curator-queue.ts",
]);

test("(a) `curator_signals` appears only in the write path + signals route across app/+lib", () => {
  const offenders = filesMentioning(/curator_signals/, [
    resolve(webRoot, "app"),
    resolve(webRoot, "lib"),
  ]).filter((p) => !ALLOWED.has(p));
  assert.deepEqual(
    offenders,
    [],
    "curator_signals must not appear outside lib/curator-signals.ts + the signals route (no other surface may read it)",
  );
});

test("(b) no VIEW / GROUP BY / count( is ever computed over curator_signals", () => {
  const forbidden = /\bcreate\s+(or\s+replace\s+)?view\b|\bgroup\s+by\b|\bcount\s*\(/i;
  const offenders = filesMentioning(/curator_signals/, [repoRoot]).filter((rel) => {
    const text = readFileSync(resolve(repoRoot, rel), "utf8");
    return forbidden.test(text);
  });
  assert.deepEqual(
    offenders,
    [],
    "no aggregate/view (VIEW/GROUP BY/count) may exist in a file that touches curator_signals",
  );
});
