/**
 * Minimal Supabase-client-shaped adapter over Neon HTTP SQL.
 *
 * Covers the call patterns used in this repo: `.rpc()`, `.from().select|insert|
 * update|delete|upsert()` with `.eq/.neq/.in/.gte/.lte/.order/.limit/
 * .single/.maybeSingle()`, and `{ count: "exact", head: true }`.
 *
 * Not a full PostgREST clone — extend when a call site needs a new verb.
 */

import { getSql } from "@/lib/db/neon";

type DbError = { message: string; code?: string };
type Result<T> = Promise<{ data: T; error: DbError | null; count?: number | null }>;

function err(message: string, code?: string): DbError {
  return { message, code };
}

function quoteIdent(id: string): string {
  if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(id)) {
    throw new Error(`Invalid identifier: ${id}`);
  }
  return `"${id}"`;
}

function parseColumns(select: string): string[] {
  if (select.trim() === "*" || select.trim() === "") return ["*"];
  return select.split(",").map((c) => c.trim()).filter(Boolean);
}

type Filter =
  | { type: "eq" | "neq" | "gte" | "lte" | "lt" | "gt"; col: string; value: unknown }
  | { type: "in"; col: string; value: unknown[] }
  | { type: "is"; col: string; value: null | boolean }
  | { type: "not_is"; col: string; value: null | boolean };

class FilterBuilder<T = any> {
  private filters: Filter[] = [];
  private orderBy: { col: string; ascending: boolean } | null = null;
  private limitN: number | null = null;
  private offsetN: number | null = null;
  private wantSingle = false;
  private wantMaybeSingle = false;
  private head = false;
  private wantCount = false;

  constructor(
    private table: string,
    private mode: "select" | "insert" | "update" | "delete" | "upsert",
    private payload?: Record<string, unknown> | Record<string, unknown>[],
    private selectCols: string = "*",
    private upsertOpts?: { onConflict?: string },
  ) {}

  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    this.selectCols = columns;
    if (opts?.count === "exact") this.wantCount = true;
    if (opts?.head) this.head = true;
    return this;
  }

  /** No-op type helper kept for Supabase call-site compatibility. */
  returns<R = any>() {
    return this as any;
  }
  eq(col: string, value: unknown) {
    this.filters.push({ type: "eq", col, value });
    return this;
  }
  neq(col: string, value: unknown) {
    this.filters.push({ type: "neq", col, value });
    return this;
  }
  gte(col: string, value: unknown) {
    this.filters.push({ type: "gte", col, value });
    return this;
  }
  lte(col: string, value: unknown) {
    this.filters.push({ type: "lte", col, value });
    return this;
  }
  gt(col: string, value: unknown) {
    this.filters.push({ type: "gt", col, value });
    return this;
  }
  lt(col: string, value: unknown) {
    this.filters.push({ type: "lt", col, value });
    return this;
  }
  in(col: string, value: unknown[]) {
    this.filters.push({ type: "in", col, value });
    return this;
  }
  is(col: string, value: null | boolean) {
    this.filters.push({ type: "is", col, value });
    return this;
  }
  not(col: string, op: string, value: null | boolean) {
    if (op === "is") {
      this.filters.push({ type: "not_is", col, value });
      return this;
    }
    throw new Error(`Unsupported .not() op: ${op}`);
  }
  order(col: string, opts?: { ascending?: boolean }) {
    this.orderBy = { col, ascending: opts?.ascending !== false };
    return this;
  }
  limit(n: number) {
    this.limitN = n;
    return this;
  }
  /** Inclusive PostgREST-style range: `.range(0, 999)` → OFFSET 0 LIMIT 1000. */
  range(from: number, to: number) {
    const start = Math.max(0, Math.floor(from));
    const end = Math.max(start, Math.floor(to));
    this.offsetN = start;
    this.limitN = end - start + 1;
    return this;
  }
  single() {
    this.wantSingle = true;
    this.limitN = 1;
    return this as any;
  }
  maybeSingle() {
    this.wantMaybeSingle = true;
    this.limitN = 1;
    return this as any;
  }

  private buildWhere(startIndex = 1): { clause: string; params: unknown[]; next: number } {
    const params: unknown[] = [];
    const parts: string[] = [];
    let i = startIndex;
    for (const f of this.filters) {
      if (f.type === "in") {
        if (!f.value.length) {
          parts.push("FALSE");
          continue;
        }
        const placeholders = f.value.map(() => `$${i++}`);
        params.push(...f.value);
        parts.push(`${quoteIdent(f.col)} IN (${placeholders.join(", ")})`);
      } else if (f.type === "is" || f.type === "not_is") {
        if (f.value === null) {
          parts.push(
            f.type === "not_is"
              ? `${quoteIdent(f.col)} IS NOT NULL`
              : `${quoteIdent(f.col)} IS NULL`,
          );
        } else {
          parts.push(
            f.type === "not_is"
              ? `${quoteIdent(f.col)} IS DISTINCT FROM $${i}`
              : `${quoteIdent(f.col)} IS NOT DISTINCT FROM $${i}`,
          );
          params.push(f.value);
          i++;
        }
      } else {
        const op =
          f.type === "eq"
            ? "="
            : f.type === "neq"
              ? "<>"
              : f.type === "gte"
                ? ">="
                : f.type === "gt"
                  ? ">"
                  : f.type === "lt"
                    ? "<"
                    : "<=";
        parts.push(`${quoteIdent(f.col)} ${op} $${i++}`);
        params.push(f.value);
      }
    }
    return {
      clause: parts.length ? `WHERE ${parts.join(" AND ")}` : "",
      params,
      next: i,
    };
  }

  then<TResult1 = { data: T; error: DbError | null; count?: number | null }, TResult2 = never>(
    onfulfilled?:
      | ((value: { data: T; error: DbError | null; count?: number | null }) => TResult1 | PromiseLike<TResult1>)
      | null,
    onrejected?: ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
  ): Promise<TResult1 | TResult2> {
    return this.execute().then(onfulfilled, onrejected);
  }

  private async execute(): Promise<{ data: T; error: DbError | null; count?: number | null }> {
    const sql = getSql();
    try {
      if (this.mode === "select") {
        const cols =
          this.selectCols.trim() === "*"
            ? "*"
            : parseColumns(this.selectCols).map(quoteIdent).join(", ");
        const { clause, params } = this.buildWhere(1);
        let q = `SELECT ${cols} FROM ${quoteIdent(this.table)} ${clause}`;
        if (this.orderBy) {
          q += ` ORDER BY ${quoteIdent(this.orderBy.col)} ${this.orderBy.ascending ? "ASC" : "DESC"}`;
        }
        if (this.limitN != null) q += ` LIMIT ${Number(this.limitN)}`;
        if (this.offsetN != null) q += ` OFFSET ${Number(this.offsetN)}`;

        if (this.head && this.wantCount) {
          const countQ = `SELECT COUNT(*)::int AS count FROM ${quoteIdent(this.table)} ${clause}`;
          const rows = (await sql.query(countQ, params)) as { count: number }[];
          return { data: null as T, error: null, count: rows[0]?.count ?? 0 };
        }

        const rows = (await sql.query(q, params)) as T[];
        if (this.wantSingle) {
          if (!rows.length) return { data: null as T, error: err("JSON object requested, multiple (or no) rows returned") };
          return { data: rows[0], error: null };
        }
        if (this.wantMaybeSingle) {
          return { data: (rows[0] ?? null) as T, error: null };
        }
        return { data: rows as T, error: null };
      }

      if (this.mode === "insert") {
        const rowsIn = Array.isArray(this.payload) ? this.payload : [this.payload!];
        if (!rowsIn.length) return { data: null as T, error: null };
        const keys = Object.keys(rowsIn[0]);
        const colList = keys.map(quoteIdent).join(", ");
        const returning =
          this.selectCols.trim() === "*"
            ? "*"
            : parseColumns(this.selectCols).map(quoteIdent).join(", ");
        const allParams: unknown[] = [];
        const valueGroups: string[] = [];
        let i = 1;
        for (const row of rowsIn) {
          const placeholders: string[] = [];
          for (const k of keys) {
            placeholders.push(`$${i++}`);
            allParams.push(row[k]);
          }
          valueGroups.push(`(${placeholders.join(", ")})`);
        }
        const q = `INSERT INTO ${quoteIdent(this.table)} (${colList}) VALUES ${valueGroups.join(", ")} RETURNING ${returning}`;
        const rows = (await sql.query(q, allParams)) as T[];
        if (this.wantSingle || !Array.isArray(this.payload)) {
          if (this.wantSingle && !rows.length) {
            return { data: null as T, error: err("JSON object requested, multiple (or no) rows returned") };
          }
          return { data: rows[0] as T, error: null };
        }
        return { data: rows as T, error: null };
      }

      if (this.mode === "upsert") {
        const rowsIn = Array.isArray(this.payload) ? this.payload : [this.payload!];
        const keys = Object.keys(rowsIn[0]);
        const colList = keys.map(quoteIdent).join(", ");
        const conflict = this.upsertOpts?.onConflict
          ? this.upsertOpts.onConflict.split(",").map((c) => quoteIdent(c.trim())).join(", ")
          : quoteIdent(keys[0]);
        const updates = keys
          .filter((k) => !(this.upsertOpts?.onConflict ?? keys[0]).split(",").map((s) => s.trim()).includes(k))
          .map((k) => `${quoteIdent(k)} = EXCLUDED.${quoteIdent(k)}`)
          .join(", ");
        const allParams: unknown[] = [];
        const valueGroups: string[] = [];
        let i = 1;
        for (const row of rowsIn) {
          const placeholders: string[] = [];
          for (const k of keys) {
            placeholders.push(`$${i++}`);
            allParams.push(row[k]);
          }
          valueGroups.push(`(${placeholders.join(", ")})`);
        }
        const q = `INSERT INTO ${quoteIdent(this.table)} (${colList}) VALUES ${valueGroups.join(", ")}
          ON CONFLICT (${conflict}) DO UPDATE SET ${updates || `${quoteIdent(keys[0])} = EXCLUDED.${quoteIdent(keys[0])}`}
          RETURNING *`;
        const rows = (await sql.query(q, allParams)) as T[];
        return {
          data: (Array.isArray(this.payload) ? rows : rows[0]) as T,
          error: null,
        };
      }

      if (this.mode === "update") {
        const patch = this.payload as Record<string, unknown>;
        const keys = Object.keys(patch);
        const sets: string[] = [];
        const params: unknown[] = [];
        let i = 1;
        for (const k of keys) {
          sets.push(`${quoteIdent(k)} = $${i++}`);
          params.push(patch[k]);
        }
        const { clause, params: whereParams } = this.buildWhere(i);
        params.push(...whereParams);
        const q = `UPDATE ${quoteIdent(this.table)} SET ${sets.join(", ")} ${clause} RETURNING *`;
        const rows = (await sql.query(q, params)) as T[];
        return { data: rows as T, error: null };
      }

      if (this.mode === "delete") {
        const { clause, params } = this.buildWhere(1);
        const q = `DELETE FROM ${quoteIdent(this.table)} ${clause} RETURNING *`;
        const rows = (await sql.query(q, params)) as T[];
        return {
          data: rows as T,
          error: null,
          count: this.wantCount ? rows.length : null,
        };
      }

      return { data: null as T, error: err(`Unsupported mode: ${this.mode}`) };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const code =
        e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
          ? (e as { code: string }).code
          : undefined;
      return {
        data: null as T,
        error: err(message, code),
      };
    }
  }
}

class FromBuilder {
  constructor(private table: string) {}
  select(columns = "*", opts?: { count?: "exact"; head?: boolean }) {
    const b = new FilterBuilder(this.table, "select");
    return b.select(columns, opts);
  }
  insert(payload: Record<string, unknown> | Record<string, unknown>[]) {
    return new FilterBuilder(this.table, "insert", payload);
  }
  update(payload: Record<string, unknown>) {
    return new FilterBuilder(this.table, "update", payload);
  }
  delete(opts?: { count?: "exact" }) {
    const b = new FilterBuilder(this.table, "delete");
    if (opts?.count === "exact") {
      // count after delete is approximated via RETURNING length in execute
      (b as FilterBuilder).select("*", { count: "exact" });
    }
    return b;
  }
  upsert(
    payload: Record<string, unknown> | Record<string, unknown>[],
    opts?: { onConflict?: string },
  ) {
    return new FilterBuilder(this.table, "upsert", payload, "*", opts);
  }
}

export type NeonDbClient = {
  from: (table: string) => FromBuilder;
  rpc: (
    fn: string,
    args?: Record<string, unknown>,
  ) => Promise<{ data: any; error: DbError | null }>;
};

export function createNeonDbClient(): NeonDbClient {
  return {
    from(table: string) {
      return new FromBuilder(table);
    },
    async rpc(fn: string, args: Record<string, unknown> = {}) {
      const sql = getSql();
      try {
        if (!/^[a-zA-Z_][a-zA-Z0-9_]*$/.test(fn)) {
          return { data: null, error: err(`Invalid RPC name: ${fn}`) };
        }
        const keys = Object.keys(args).filter((k) => args[k] !== undefined);
        const params = keys.map((k) => args[k]);
        const placeholders = keys.map((k, i) => `${quoteIdent(k)} := $${i + 1}`);
        // Named args via := for Postgres functions
        const q =
          keys.length === 0
            ? `SELECT * FROM ${quoteIdent(fn)}()`
            : `SELECT * FROM ${quoteIdent(fn)}(${placeholders.join(", ")})`;
        const data = await sql.query(q, params);
        return { data, error: null };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        const code =
          e && typeof e === "object" && "code" in e && typeof (e as { code: unknown }).code === "string"
            ? (e as { code: string }).code
            : undefined;
        return {
          data: null,
          error: err(message, code),
        };
      }
    },
  };
}
