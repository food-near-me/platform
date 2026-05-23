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

export const EXPECTED_MCP_PROMPTS = [
  "find_dinner_near_me",
  "dietary_constrained_menu",
  "validate_my_menu",
] as const;

/** Default test coordinates — NYC (Brooklyn Bridge area). */
export const DEFAULT_TEST_LOCATION = {
  lat: 40.7128,
  lng: -74.006,
} as const;

/** Williamsburg — production menu_indexed fixture (Black Star Bakery & Cafe). */
export const MENU_INDEXED_TEST_LOCATION = {
  lat: 40.7178,
  lng: -73.9571,
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

export type McpPromptResult = {
  messages: Array<{ role: string; content: { type: string; text?: string } }>;
};

export type McpFlowClient = {
  listTools: () => Promise<string[]>;
  listResources: () => Promise<string[]>;
  listPrompts: () => Promise<string[]>;
  getPrompt: (name: string, args?: Record<string, string>) => Promise<McpPromptResult>;
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
    await runFlow("prompts-list", "List all 3 MCP prompts", async () => {
      const names = (await client.listPrompts()).sort();
      const expected = [...EXPECTED_MCP_PROMPTS].sort();
      assert(names.length === expected.length, `Expected ${expected.length} prompts, got ${names.length}`);
      for (let i = 0; i < expected.length; i++) {
        assert(names[i] === expected[i], `Prompt mismatch at ${i}: expected ${expected[i]}, got ${names[i]}`);
      }
    })
  );

  results.push(
    await runFlow("prompt-get-dinner", "Get find_dinner_near_me prompt", async () => {
      const result = await client.getPrompt("find_dinner_near_me", {
        location: "Brooklyn Bridge",
        cuisine: "thai",
        dietary: "vegan",
      });
      assert(Array.isArray(result.messages) && result.messages.length > 0, "Expected messages");
      const text = result.messages[0]?.content?.text ?? "";
      assert(text.includes("search_restaurants"), "Prompt should reference search_restaurants");
      assert(text.includes("get_menu"), "Prompt should reference get_menu");
      assert(text.toLowerCase().includes("dietary"), "Prompt should mention dietary handling");
    })
  );

  results.push(
    await runFlow("prompt-get-validate", "Get validate_my_menu prompt", async () => {
      const result = await client.getPrompt("validate_my_menu", { strict: "true" });
      const text = result.messages[0]?.content?.text ?? "";
      assert(text.includes("validate_menu_protocol"), "Prompt should reference validate_menu_protocol");
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
      assert(
        typeof data.citation === "string" && (data.citation as string).startsWith("http"),
        "validate_menu_protocol must return a top-level citation URL",
      );
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
    results.push(
      await skipFlow(
        "flow-search-empty-next-steps",
        "Empty search returns next_steps guidance",
        "Database not configured",
      ),
    );
    results.push(await skipFlow("flow-a-chain", "Search → get_menu chain", "Database not configured"));
    results.push(await skipFlow("flow-indexed-tier", "menu_indexed tier + trust_notice", "Database not configured"));
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

      assert(
        typeof data.citation === "string" && (data.citation as string).startsWith("http"),
        "search_restaurants must return a top-level citation URL",
      );

      const tierBreakdown = data.tier_breakdown as
        | { verified?: number; menu_indexed?: number; discovered?: number }
        | undefined;
      assert(
        tierBreakdown && typeof tierBreakdown === "object",
        "search_restaurants must return tier_breakdown aggregate",
      );
      assert(
        typeof tierBreakdown!.verified === "number" &&
          typeof tierBreakdown!.menu_indexed === "number" &&
          typeof tierBreakdown!.discovered === "number",
        "tier_breakdown must include verified/menu_indexed/discovered counts",
      );
      const tierSum =
        (tierBreakdown!.verified ?? 0) +
        (tierBreakdown!.menu_indexed ?? 0) +
        (tierBreakdown!.discovered ?? 0);
      assert(
        tierSum === (data.results_count as number),
        `tier_breakdown sum (${tierSum}) must match results_count (${data.results_count})`,
      );

      const filters = data.filters as
        | { applied_to?: unknown[]; note?: string }
        | undefined;
      assert(
        Array.isArray(filters?.applied_to) &&
          (filters!.applied_to as unknown[]).includes("verified"),
        "filters.applied_to must surface dietary/score-filter scoping",
      );

      const resultsList = data.results as Array<Record<string, unknown>>;
      if (resultsList.length > 0) {
        const first = resultsList[0];
        assert(typeof first.id === "string", "Result missing id");
        assert(typeof first.name === "string", "Result missing name");
        assert(
          typeof first.verification_status === "string",
          "Result missing verification_status"
        );
        const withMenu = resultsList.find((r) => r.menu_available === true);
        if (withMenu?.id) sampleRestaurantId = withMenu.id as string;
      }
    })
  );

  results.push(
    await runFlow(
      "flow-search-empty-next-steps",
      "Empty search returns next_steps guidance",
      async () => {
        const data = requireData(
          await client.callTool("search_restaurants", {
            lat: -54.8,
            lng: -68.3,
            radius_miles: 0.5,
            query: "ramen",
            dietary: ["vegan"],
          }),
        ) as Record<string, unknown>;

        assert(
          (data.results_count as number) === 0,
          "Expected zero results in remote ocean fixture",
        );
        const nextSteps = data.next_steps as unknown[] | undefined;
        assert(
          Array.isArray(nextSteps) && nextSteps.length > 0,
          "Empty results must include next_steps array",
        );
        const joined = (nextSteps as string[]).join(" ").toLowerCase();
        assert(
          joined.includes("radius") || joined.includes("dietary"),
          "next_steps should suggest widening radius or dropping dietary filters",
        );
      },
    ),
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
          throw new Error("SKIP: No restaurants in search area — run db:import:discovered or seed beta data");
        }
        const withMenu = resultsList.find((r) => r.menu_available === true);
        if (!withMenu?.id) {
          throw new Error("SKIP: No menu_available restaurants — seed verified beta data");
        }
        sampleRestaurantId = withMenu.id as string;
      }

      const menu = requireData(
        await client.callTool("get_menu", { restaurant_id: sampleRestaurantId! })
      ) as Record<string, unknown>;

      assert(menu.version === "1.0", "Expected Menu Protocol v1.0");
      assert(menu.restaurant && typeof menu.restaurant === "object", "Missing restaurant block");
      assert(menu.menu && typeof menu.menu === "object", "Missing menu block");

      assert(
        typeof menu.citation === "string" && (menu.citation as string).startsWith("http"),
        "get_menu must return a top-level citation URL",
      );
      assert(
        typeof menu.last_updated === "string",
        "get_menu must return a top-level last_updated ISO timestamp",
      );

      const menuBlock = menu.menu as Record<string, unknown>;
      assert(Array.isArray(menuBlock.categories), "Expected categories array");
      assert(typeof menuBlock.items_count === "number", "Missing items_count");
    })
  );

  results.push(
    await runFlow("flow-indexed-tier", "menu_indexed tier + trust_notice + get_menu", async () => {
      const search = requireData(
        await client.callTool("search_restaurants", {
          ...MENU_INDEXED_TEST_LOCATION,
          query: "cafe",
          radius_miles: 0.5,
        }),
      ) as Record<string, unknown>;

      const resultsList = search.results as Array<Record<string, unknown>>;
      assert(Array.isArray(resultsList), "Expected results array");

      const indexed = resultsList.find(
        (r) => r.verification_status === "menu_indexed" && r.menu_available === true,
      );
      if (!indexed) {
        throw new Error(
          "Expected at least one menu_indexed result with menu_available near Williamsburg fixture",
        );
      }

      const indexedId = indexed.id as string;

      const trustNotice = String(indexed.trust_notice ?? "");
      assert(
        trustNotice.toLowerCase().includes("indexed") &&
          trustNotice.toLowerCase().includes("not owner-verified"),
        "Expected indexed trust_notice caveat on search result",
      );

      const menu = requireData(
        await client.callTool("get_menu", { restaurant_id: indexedId }),
      ) as Record<string, unknown>;

      assert(menu.verification_status === "menu_indexed", "Expected menu_indexed on get_menu");
      const menuTrust = String(menu.trust_notice ?? "");
      assert(
        menuTrust.toLowerCase().includes("not owner-verified"),
        "Expected indexed trust_notice on get_menu",
      );

      assert(
        typeof menu.citation === "string" && (menu.citation as string).startsWith("http"),
        "indexed get_menu must include a top-level citation URL",
      );
      assert(
        typeof menu.last_updated === "string",
        "indexed get_menu must include a top-level last_updated timestamp",
      );

      const menuBlock = menu.menu as Record<string, unknown>;
      assert(typeof menuBlock.items_count === "number", "Missing items_count");
      assert((menuBlock.items_count as number) > 0, "Expected at least one menu item");

      const items = menuBlock.items as Array<Record<string, unknown>>;
      const withCaution = items.find((item) => typeof item.caution === "string");
      assert(
        withCaution !== undefined,
        "indexed get_menu items must carry an item-level caution string",
      );
      assert(
        (withCaution!.caution as string).toLowerCase().includes("allergen") ||
          (withCaution!.caution as string).toLowerCase().includes("not safe"),
        "item-level caution must reference allergen/safety boundary",
      );
    }),
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
      assert(
        typeof data.citation === "string" && (data.citation as string).startsWith("http"),
        "get_ado_score_breakdown must return a top-level citation URL",
      );
      assert(Array.isArray(data.next_steps), "Expected next_steps array");
      const scoringInfo = data.scoring_info as
        | { scoring_method?: unknown; caveat?: unknown }
        | undefined;
      assert(
        scoringInfo?.scoring_method === "heuristic_v1",
        "scoring_info.scoring_method must be heuristic_v1",
      );
      assert(
        typeof scoringInfo?.caveat === "string",
        "scoring_info.caveat must describe heuristic limitation",
      );
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
