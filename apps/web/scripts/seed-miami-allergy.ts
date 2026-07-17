#!/usr/bin/env npx tsx
/**
 * Back-compat wrapper — prefer:
 *   npm run db:seed:miami-allergy
 *   npx tsx scripts/seed-allergy-beachhead.ts --region=miami
 */
import { spawnSync } from "child_process";
import * as path from "path";

const script = path.resolve(__dirname, "seed-allergy-beachhead.ts");
const extra = process.argv.slice(2).filter((a) => !a.includes("seed-miami"));
const result = spawnSync(
  process.execPath,
  ["--import", "tsx", script, "--region=miami", ...extra],
  { stdio: "inherit", cwd: process.cwd() },
);
process.exit(result.status ?? 1);
