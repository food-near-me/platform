import { neon, type NeonQueryFunction } from "@neondatabase/serverless";

let sqlInstance: NeonQueryFunction<false, false> | null = null;

export function isDatabaseConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

export function getSql() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    throw new Error("Missing DATABASE_URL (Neon connection string)");
  }
  if (!sqlInstance) {
    sqlInstance = neon(url);
  }
  return sqlInstance;
}

export function getDatabaseHost(): string | null {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}
