#!/usr/bin/env npx tsx
/**
 * @deprecated Use scripts/import-discovered.ts
 */
import { spawnSync } from "node:child_process";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const script = resolve(dirname(fileURLToPath(import.meta.url)), "import-discovered.ts");
const result = spawnSync("npx", ["tsx", script, ...process.argv.slice(2)], {
  stdio: "inherit",
  cwd: resolve(dirname(script), ".."),
  env: process.env,
});

process.exit(result.status ?? 1);
