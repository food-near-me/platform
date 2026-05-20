/**
 * Structured MCP tool error contract for agent self-correction.
 * Returned in tools/call results via `_meta.error`.
 */

export const MCP_ERROR_DOCS = "https://foodnear.me/docs#quick-start";

export type McpToolErrorCode =
  | "VALIDATION_ERROR"
  | "NOT_FOUND"
  | "RATE_LIMITED"
  | "UPSTREAM"
  | "UNKNOWN";

export type McpToolErrorMeta = {
  code: McpToolErrorCode;
  message: string;
  hint?: string;
  retryable: boolean;
  docs?: string;
};

export function toolErrorResult(meta: McpToolErrorMeta) {
  const docs = meta.docs ?? MCP_ERROR_DOCS;
  const hintLine = meta.hint ? ` ${meta.hint}` : "";
  const text = `${meta.message}.${hintLine}`.replace(/\.\s*\./g, ".").trim();

  return {
    content: [{ type: "text" as const, text }],
    isError: true,
    _meta: {
      error: {
        ...meta,
        docs,
      },
    },
  };
}
