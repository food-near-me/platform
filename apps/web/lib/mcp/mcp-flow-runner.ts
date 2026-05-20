/**
 * Automated MCP agent flow runner for foodnear.me.
 * Mirrors apps/web/docs/example-agent-flows.md
 */

import type { McpToolErrorMeta } from "./tool-errors";

export const EXPECTED_MCP_TOOLS = [
  "search_restaurants",
  "get_restaurant",
  "get_menu",
  "get_ado_score_breakdown",
  "validate_menu_protocol",
] as const;

export const EXPECTED_MCP_RESOURCES = [
  "foodnearme://spec/menu-protocol",
  "foodnearme://spec/openapi",
  "foodnearme://agent/skill",
  "foodnearme://examples/search-flow",
] as const;

/** Default test coordinates — NYC (Brooklyn Bridge area). */
export const DEFAULT_TEST_LOCATION = {
  lat: 40.7128,
  lng: -74.006,
} as const;

export type FlowStatus = "pass" | "fail" | "skip";

export type FlowResult = {
  id: string;
  name: string;
  status: FlowStatus;
  message?: string;
  durationMs: number;
};

export type McpToolCallResult = {
  data?: unknown;
  isError?: boolean;
  rawText?: string;
  error?: McpToolErrorMeta;
};

export type McpFlowClient = {
  listTools: () => Promise<string[]>;
  listResources: () => Promise<string[]>;
  callTool: (name: string, args: Record<string, unknown>) => Promise<McpToolCallResult>;
};

export type RunMcpFlowsOptions = {
  /** When false, skip flows that need Supabase + seed data. */
  databaseAvailable?: boolean;
};

function assert(condition: unknown, message: string): void {
  if (!condition) throw new Error(message);
}

async function runFlow(
  id: string,
  name: string,
  fn: () => Promise<void>
): Promise<FlowResult> {
  const start = performance.now();
  try {
    await fn();
    return { id, name, status: "pass", durationMs: Math.round(performance.now() - start) };
  } catch (error) {
    return {
      id,
      name,
      status: "fail",
      message: error instanceof Error ? error.message : String(error),
      durationMs: Math.round(performance.now() - start),
    };
  }
}

async function skipFlow(id: string, name: string, reason: string): Promise<FlowResult> {
  return { id, name, status: "skip", message: reason, durationMs: 0 };
}

function requireData(result: McpToolCallResult): unknown {
  if (result.isError) {
    throw new Error(result.rawText ?? "Tool returned isError");
  }
  return result.data;
}

export async function runMcpFlows(
  client: McpFlowClient,
  options: RunMcpFlowsOptions = {}
): Promise<FlowResult[]> {
  const db = options.databaseAvailable ?? true;
  const results: FlowResult[] = [];

  results.push(
    await runFlow("tools-list", "List all 5 MCP tools", async () => {
      const names = (await client.listTools()).sort();
      const expected = [...EXPECTED_MCP_TOOLS].sort();
      assert(names.length === expected.length, `Expected ${expected.length} tools, got ${names.length}: ${names.join(", ")}`);
      for (let i = 0; i < expected.length; i++) {
        assert(names[i] === expected[i], `Tool mismatch at ${i}: expected ${expected[i]}, got ${names[i]}`);
      }
    })
  );

  results.push(
    await runFlow("resources-list", "List all 4 MCP resources", async () => {
      const uris = (await client.listResources()).sort();
      const expected = [...EXPECTED_MCP_RESOURCES].sort();
      assert(uris.length === expected.length, `Expected ${expected.length} resources, got ${uris.length}`);
      for (let i = 0; i < expected.length; i++) {
        assert(uris[i] === expected[i], `Resource mismatch at ${i}: expected ${expected[i]}, got ${uris[i]}`);
      }
    })
  );

  results.push(
    await runFlow("flow-static-validation", "Reject invalid lat/lng", async () => {
      const result = await client.callTool("search_restaurants", {
        lat: 999,
        lng: -74.006,
      });
      assert(result.isError === true, "Expected validation error for out-of-range lat");
      assert(
        (result.rawText ?? "").toLowerCase().includes("lat"),
        "Validation message should mention lat"
      );
      assert(result.error?.code === "VALIDATION_ERROR", "Expected VALIDATION_ERROR code in _meta");
      assert(result.error?.retryable === false, "Validation errors should not be retryable");
    })
  );

  results.push(
    await runFlow("flow-static-dietary", "Reject invalid dietary filter", async () => {
      const result = await client.callTool("search_restaurants", {
        ...DEFAULT_TEST_LOCATION,
        dietary: ["not_a_real_filter"],
      });
      assert(result.isError === true, "Expected validation error for invalid dietary filter");
    })
  );

  results.push(
    await runFlow("flow-static-uuid", "Reject invalid restaurant_id UUID", async () => {
      const result = await client.callTool("get_restaurant", {
        restaurant_id: "not-a-uuid",
      });
      assert(result.isError === true, "Expected validation error for invalid UUID");
    })
  );

  results.push(
    await runFlow("flow-validate-valid", "Validate valid Menu Protocol payload", async () => {
      const result = await client.callTool("validate_menu_protocol", {
        payload: {
          version: "1.0",
          domain: "foodnear.me",
          restaurant: {
            "@type": "Restaurant",
            id: "test-123",
            name: "Test Restaurant",
          },
          menu: {
            id: "menu-123",
            restaurant_id: "test-123",
            categories: [{ id: "cat-1", name: "Mains" }],
            items: [
              {
                id: "item-1",
                name: "Test Dish",
                price: 12.99,
                dietary: { vegetarian: true, vegan: false },
                allergens: ["gluten"],
              },
            ],
          },
        },
      });
      const data = requireData(result) as Record<string, unknown>;
      assert(data.valid === true, "Expected valid=true for correct payload");
      assert(data.schema_version === "Menu Protocol v1.0", "Expected schema version");
    })
  );

  results.push(
    await runFlow("flow-validate-invalid", "Reject invalid Menu Protocol payload", async () => {
      const result = await client.callTool("validate_menu_protocol", {
        payload: {
          version: "2.0", // wrong version
          restaurant: {}, // missing required fields
          menu: "not-an-object", // wrong type
        },
      });
      const data = requireData(result) as Record<string, unknown>;
      assert(data.valid === false, "Expected valid=false for broken payload");
      assert(Array.isArray(data.errors), "Expected errors array");
      assert((data.errors as string[]).length > 0, "Expected at least one error");
    })
  );

  if (!db) {
    results.push(await skipFlow("flow-a", "Dietary-safe search", "Database not configured"));
    results.push(await skipFlow("flow-a-chain", "Search → get_menu chain", "Database not configured"));
    results.push(await skipFlow("flow-c", "ADO score breakdown", "Database not configured"));
    return results;
  }

  let sampleRestaurantId: string | undefined;

  results.push(
    await runFlow("flow-a", "Dietary-safe search (vegan Thai)", async () => {
      const data = requireData(
        await client.callTool("search_restaurants", {
          ...DEFAULT_TEST_LOCATION,
          query: "thai",
          dietary: ["vegan"],
          radius_miles: 10,
        })
      ) as Record<string, unknown>;

      assert(typeof data.results_count === "number", "Missing results_count");
      assert(Array.isArray(data.results), "Expected results array");
      assert(data.location && typeof data.location === "object", "Missing location echo");

      const resultsList = data.results as Array<Record<string, unknown>>;
      if (resultsList.length > 0) {
        const first = resultsList[0];
        assert(typeof first.id === "string", "Result missing id");
        assert(typeof first.name === "string", "Result missing name");
        assert(typeof first.agent_score === "number", "Result missing agent_score");
        sampleRestaurantId = first.id as string;
      }
    })
  );

  results.push(
    await runFlow("flow-a-chain", "Search → get_menu chain", async () => {
      if (!sampleRestaurantId) {
        const search = requireData(
          await client.callTool("search_restaurants", {
            ...DEFAULT_TEST_LOCATION,
            radius_miles: 25,
          })
        ) as Record<string, unknown>;
        const resultsList = search.results as Array<Record<string, unknown>>;
        if (!Array.isArray(resultsList) || resultsList.length === 0) {
          throw new Error("SKIP: No verified restaurants in seed data — add beta restaurants");
        }
        sampleRestaurantId = resultsList[0].id as string;
      }

      const menu = requireData(
        await client.callTool("get_menu", { restaurant_id: sampleRestaurantId! })
      ) as Record<string, unknown>;

      assert(menu.version === "1.0", "Expected Menu Protocol v1.0");
      assert(menu.restaurant && typeof menu.restaurant === "object", "Missing restaurant block");
      assert(menu.menu && typeof menu.menu === "object", "Missing menu block");

      const menuBlock = menu.menu as Record<string, unknown>;
      assert(Array.isArray(menuBlock.categories), "Expected categories array");
      assert(typeof menuBlock.items_count === "number", "Missing items_count");
    })
  );

  results.push(
    await runFlow("flow-c", "ADO score breakdown", async () => {
      if (!sampleRestaurantId) {
        throw new Error("SKIP: No restaurant id from search — seed data required");
      }

      const data = requireData(
        await client.callTool("get_ado_score_breakdown", {
          restaurant_id: sampleRestaurantId,
        })
      ) as Record<string, unknown>;

      assert(typeof data.total_score === "number", "Missing total_score");
      assert(data.breakdown && typeof data.breakdown === "object", "Missing breakdown");
      assert(Array.isArray(data.recommendations), "Expected recommendations array");
    })
  );

  return results;
}

export function formatFlowReport(results: FlowResult[]): string {
  const lines: string[] = [];
  let passed = 0;
  let failed = 0;
  let skipped = 0;

  for (const r of results) {
    const icon = r.status === "pass" ? "✓" : r.status === "fail" ? "✗" : "○";
    const suffix = r.message ? ` — ${r.message}` : "";
    lines.push(`${icon} [${r.id}] ${r.name} (${r.durationMs}ms)${suffix}`);
    if (r.status === "pass") passed++;
    else if (r.status === "fail") failed++;
    else skipped++;
  }

  lines.push("");
  lines.push(`Summary: ${passed} passed, ${failed} failed, ${skipped} skipped`);
  return lines.join("\n");
}

export function exitCodeFromResults(results: FlowResult[]): number {
  return results.some((r) => r.status === "fail") ? 1 : 0;
}

/** Parse MCP tools/call JSON-RPC result. */
export function parseMcpToolResult(result: unknown): McpToolCallResult {
  if (!result || typeof result !== "object") {
    throw new Error("Invalid MCP tool result");
  }

  const payload = result as {
    content?: Array<{ type: string; text?: string }>;
    isError?: boolean;
    _meta?: { error?: McpToolErrorMeta };
  };

  const text = payload.content?.find((c) => c.type === "text")?.text;
  if (!text) {
    throw new Error("MCP result missing text content");
  }

  if (payload.isError) {
    return {
      isError: true,
      rawText: text,
      error: payload._meta?.error,
    };
  }

  try {
    return { data: JSON.parse(text), isError: false, rawText: text };
  } catch {
    return { data: text, isError: false, rawText: text };
  }
}
