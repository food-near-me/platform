/**
 * Validate a Menu Protocol v1.0 payload against the canonical Zod schema.
 *
 * This is the package-level validator. The MCP `validate_menu_protocol` tool
 * wraps it and adds aggregated, agent-friendly warnings/recommendations on
 * top of the structural issues this function reports.
 *
 * `valid` is `true` only when `MenuProtocolSchema.safeParse` succeeds.
 * `issues[]` is a flat, human-readable view of Zod's error path + message,
 * suitable for forwarding to API responses without further translation.
 */

import type { ZodIssue } from "zod";
import { MenuProtocolSchema } from "./schema";

export type MenuProtocolIssue = {
  /** Dotted JSON Pointer-style path into the payload (e.g. `menu.items.0.dietary`). */
  path: string;
  /** Human-readable Zod message. */
  message: string;
  /** Zod issue code (e.g. `invalid_type`, `invalid_literal`, `unrecognized_keys`). */
  code: string;
};

export type MenuProtocolValidationResult = {
  valid: boolean;
  issues: MenuProtocolIssue[];
};

function formatPath(path: ReadonlyArray<string | number>): string {
  if (path.length === 0) return "(root)";
  return path.map((segment) => String(segment)).join(".");
}

function toIssue(issue: ZodIssue): MenuProtocolIssue {
  return {
    path: formatPath(issue.path),
    message: issue.message,
    code: issue.code,
  };
}

/**
 * Run the canonical Zod schema against `payload` and return a flat result.
 * Never throws; on any non-object input the result has `valid: false` and a
 * single root-level issue so callers can render a uniform error shape.
 */
export function validateMenuProtocolPayload(payload: unknown): MenuProtocolValidationResult {
  if (!payload || typeof payload !== "object") {
    return {
      valid: false,
      issues: [
        {
          path: "(root)",
          message: "payload must be a JSON object",
          code: "invalid_type",
        },
      ],
    };
  }

  const result = MenuProtocolSchema.safeParse(payload);
  if (result.success) {
    return { valid: true, issues: [] };
  }

  return {
    valid: false,
    issues: result.error.issues.map(toIssue),
  };
}
