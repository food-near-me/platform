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
  "explore_area_for_diet",
  "compare_restaurants_for_diet",
  "find_restaurants_along_route",
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

export type McpToolDefinition = {
  name: string;
  description?: string;
  annotations?: {
    readOnlyHint?: boolean;
    destructiveHint?: boolean;
    idempotentHint?: boolean;
    openWorldHint?: boolean;
  };
};

export type McpFlowClient = {
  listTools: () => Promise<string[]>;
  listToolDefinitions: () => Promise<McpToolDefinition[]>;
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

function stableJson(value: unknown): string {
  return JSON.stringify(value, Object.keys(value as Record<string, unknown>).sort());
}

function assertCitationAndAttribution(
  data: Record<string, unknown>,
  label: string,
): void {
  assert(
    typeof data.citation === "string" && (data.citation as string).startsWith("http"),
    `${label} must return a top-level citation URL`,
  );
  assert(
    data.attribution === data.citation,
    `${label} must return attribution matching citation`,
  );
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
    await runFlow("tools-list", `List all ${EXPECTED_MCP_TOOLS.length} MCP tools`, async () => {
      const names = (await client.listTools()).sort();
      const expected = [...EXPECTED_MCP_TOOLS].sort();
      assert(names.length === expected.length, `Expected ${expected.length} tools, got ${names.length}: ${names.join(", ")}`);
      for (let i = 0; i < expected.length; i++) {
        assert(names[i] === expected[i], `Tool mismatch at ${i}: expected ${expected[i]}, got ${names[i]}`);
      }

      const tools = await client.listToolDefinitions();
      for (const tool of tools) {
        const annotations = tool.annotations;
        assert(annotations, `${tool.name} missing annotations`);
        assert(annotations!.readOnlyHint === true, `${tool.name} readOnlyHint must be true`);
        assert(annotations!.destructiveHint === false, `${tool.name} destructiveHint must be false`);
        assert(annotations!.idempotentHint === false, `${tool.name} idempotentHint must be false`);
        assert(annotations!.openWorldHint === false, `${tool.name} openWorldHint must be false`);
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
      assertCitationAndAttribution(data, "validate_menu_protocol");
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
      assert(
        data.schema_strict_valid === false,
        "Expected schema_strict_valid=false for broken payload",
      );
    })
  );

  results.push(
    await runFlow(
      "flow-validate-strict-promotes-zod-issues",
      "Strict mode promotes schema warnings to errors",
      async () => {
        // This payload satisfies the lenient checks (valid=true in default mode)
        // but fails strict Zod parsing because the restaurant lacks `slug` and
        // the menu lacks `last_updated`/items lack `category_id` etc.
        const lenientArgs = {
          payload: {
            version: "1.0",
            domain: "foodnear.me",
            restaurant: { "@type": "Restaurant", id: "test-123", name: "Test" },
            menu: {
              id: "menu-123",
              restaurant_id: "test-123",
              categories: [{ id: "cat-1", name: "Mains" }],
              items: [
                {
                  id: "item-1",
                  name: "Test Dish",
                  price: 12.99,
                  dietary: { vegetarian: true },
                  allergens: [],
                },
              ],
            },
          },
        };

        const lenient = await client.callTool("validate_menu_protocol", lenientArgs);
        const lenientData = requireData(lenient) as Record<string, unknown>;
        assert(
          lenientData.valid === true,
          "Default mode must keep the lenient fixture passing",
        );
        assert(
          lenientData.schema_strict_valid === false,
          "schema_strict_valid should report false even when lenient passes",
        );
        assert(
          Array.isArray(lenientData.warnings) && (lenientData.warnings as string[]).length > 0,
          "Default mode must surface schema warnings",
        );
        assert(
          (lenientData.warnings as string[]).some((w) => w.startsWith("schema:")),
          "Schema-derived warnings must be prefixed with `schema:`",
        );

        const strict = await client.callTool("validate_menu_protocol", {
          ...lenientArgs,
          strict: true,
        });
        const strictData = requireData(strict) as Record<string, unknown>;
        assert(strictData.valid === false, "Strict mode must flip valid=false");
        assert(strictData.strict_mode === true, "Strict mode flag should be true");
        assert(
          Array.isArray(strictData.errors) && (strictData.errors as string[]).length > 0,
          "Strict mode must surface schema errors",
        );
        assert(
          (strictData.errors as string[]).some((e) => e.startsWith("schema:")),
          "Schema-derived errors must be prefixed with `schema:`",
        );
      },
    ),
  );

  if (!db) {
    results.push(await skipFlow("flow-a", "Dietary-safe search", "Database not configured"));
    results.push(
      await skipFlow(
        "flow-search-google-shape",
        "Google-style locationBias search",
        "Database not configured",
      ),
    );
    results.push(
      await skipFlow(
        "flow-search-text-query-alias",
        "Google-style textQuery alias",
        "Database not configured",
      ),
    );
    results.push(
      await skipFlow(
        "flow-locale-passthrough",
        "Google-style locale passthrough",
        "Database not configured",
      ),
    );
    results.push(
      await skipFlow(
        "flow-search-empty-next-steps",
        "Empty search returns next_steps guidance",
        "Database not configured",
      ),
    );
    results.push(await skipFlow("flow-a-chain", "Search → get_menu chain", "Database not configured"));
    results.push(await skipFlow("flow-indexed-tier", "menu_indexed tier + trust_notice", "Database not configured"));
    results.push(
      await skipFlow(
        "flow-claim-invitation",
        "claim_invitation on non-verified results",
        "Database not configured",
      ),
    );
    results.push(
      await skipFlow(
        "flow-explore-area-williamsburg",
        "explore_area_for_diet tier buckets",
        "Database not configured",
      ),
    );
    results.push(
      await skipFlow(
        "flow-compare-for-diet",
        "compare_restaurants_for_diet ranking",
        "Database not configured",
      ),
    );
    results.push(
      await skipFlow(
        "flow-along-route-williamsburg",
        "find_restaurants_along_route route ranking",
        "Database not configured",
      ),
    );
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

      assertCitationAndAttribution(data, "search_restaurants");

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
    await runFlow("flow-search-google-shape", "Google-style locationBias search", async () => {
      const flat = requireData(
        await client.callTool("search_restaurants", {
          ...MENU_INDEXED_TEST_LOCATION,
          query: "cafe",
          radius_miles: 0.5,
        }),
      ) as Record<string, unknown>;

      const google = requireData(
        await client.callTool("search_restaurants", {
          textQuery: "cafe",
          locationBias: {
            circle: {
              center: {
                latitude: MENU_INDEXED_TEST_LOCATION.lat,
                longitude: MENU_INDEXED_TEST_LOCATION.lng,
              },
              radiusMeters: 804.67,
            },
          },
        }),
      ) as Record<string, unknown>;

      assert(
        google.results_count === flat.results_count,
        `Google-style results_count (${google.results_count}) must match flat-form (${flat.results_count})`,
      );
      assert(
        stableJson(google.tier_breakdown) === stableJson(flat.tier_breakdown),
        "Google-style tier_breakdown must match flat-form tier_breakdown",
      );
      assert(google.query === "cafe", "textQuery must normalize to the response query field");
      const location = google.location as { lat?: number; lng?: number } | undefined;
      assert(
        location?.lat === MENU_INDEXED_TEST_LOCATION.lat &&
          location?.lng === MENU_INDEXED_TEST_LOCATION.lng,
        "locationBias center must normalize to response location",
      );
    }),
  );

  results.push(
    await runFlow("flow-search-text-query-alias", "Google-style textQuery alias", async () => {
      const data = requireData(
        await client.callTool("search_restaurants", {
          textQuery: "thai",
          locationBias: {
            circle: {
              center: {
                latitude: DEFAULT_TEST_LOCATION.lat,
                longitude: DEFAULT_TEST_LOCATION.lng,
              },
              radiusMeters: 16093.4,
            },
          },
        }),
      ) as Record<string, unknown>;

      assert(data.query === "thai", "textQuery must normalize to query echo");
      assert(typeof data.results_count === "number", "Expected results_count");
    }),
  );

  results.push(
    await runFlow("flow-locale-passthrough", "Google-style locale passthrough", async () => {
      const data = requireData(
        await client.callTool("search_restaurants", {
          ...DEFAULT_TEST_LOCATION,
          languageCode: "es",
          regionCode: "US",
        }),
      ) as Record<string, unknown>;

      const locale = data.request_locale as
        | { languageCode?: unknown; regionCode?: unknown }
        | undefined;
      assert(locale?.languageCode === "es", "Expected languageCode passthrough");
      assert(locale?.regionCode === "US", "Expected regionCode passthrough");
      assert(data.locale_support === "us_en_only_v1", "Expected locale support version");
    }),
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

      const profile = requireData(
        await client.callTool("get_restaurant", { restaurant_id: sampleRestaurantId! }),
      ) as Record<string, unknown>;
      assertCitationAndAttribution(profile, "get_restaurant");

      const menu = requireData(
        await client.callTool("get_menu", { restaurant_id: sampleRestaurantId! })
      ) as Record<string, unknown>;

      assert(menu.version === "1.0", "Expected Menu Protocol v1.0");
      assert(menu.restaurant && typeof menu.restaurant === "object", "Missing restaurant block");
      assert(menu.menu && typeof menu.menu === "object", "Missing menu block");

      assertCitationAndAttribution(menu, "get_menu");
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

      assertCitationAndAttribution(menu, "indexed get_menu");
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

      const menuClaim = menu.claim_invitation as Record<string, unknown> | undefined;
      assert(
        menuClaim && typeof menuClaim === "object",
        "indexed get_menu must carry top-level claim_invitation",
      );
      assert(
        (menuClaim!.url as string).includes(`/claim/${indexedId}`),
        "get_menu claim_invitation.url must point at /claim/<id>",
      );
      assert(
        menuClaim!.reason === "indexed_menu_not_owner_verified",
        "indexed get_menu claim_invitation.reason mismatch",
      );
    }),
  );

  results.push(
    await runFlow(
      "flow-claim-invitation",
      "claim_invitation on non-verified results",
      async () => {
        const search = requireData(
          await client.callTool("search_restaurants", {
            ...MENU_INDEXED_TEST_LOCATION,
            radius_miles: 1,
          }),
        ) as Record<string, unknown>;
        const rows = (search.results as Array<Record<string, unknown>>) ?? [];
        assert(rows.length > 0, "expected non-empty Williamsburg fixture for claim-invitation");

        const verifiedRow = rows.find((r) => r.verification_status === "verified");
        const indexedRow = rows.find((r) => r.verification_status === "menu_indexed");
        const discoveredRow = rows.find((r) => r.verification_status === "discovered");

        if (verifiedRow) {
          assert(
            verifiedRow.claim_invitation === undefined,
            "verified-tier rows MUST NOT include claim_invitation",
          );
        }

        if (indexedRow) {
          const inv = indexedRow.claim_invitation as Record<string, unknown> | undefined;
          assert(inv && typeof inv === "object", "menu_indexed row must carry claim_invitation");
          assert(
            typeof inv!.url === "string" && (inv!.url as string).includes("/claim/"),
            "menu_indexed claim_invitation.url must include /claim/",
          );
          assert(
            inv!.reason === "indexed_menu_not_owner_verified",
            "menu_indexed claim_invitation.reason mismatch",
          );
          assert(
            inv!.audience === "owner_or_advocate",
            "claim_invitation.audience must be owner_or_advocate",
          );
          assert(inv!.cost === "free", "claim_invitation.cost must be 'free'");
          assert(
            typeof inv!.message === "string" && (inv!.message as string).length > 0,
            "claim_invitation.message must be a non-empty string",
          );
        }

        if (discoveredRow) {
          const inv = discoveredRow.claim_invitation as Record<string, unknown> | undefined;
          assert(inv && typeof inv === "object", "discovered row must carry claim_invitation");
          assert(
            inv!.reason === "no_owner_approved_menu",
            "discovered claim_invitation.reason mismatch",
          );
        }

        if (indexedRow) {
          const profile = requireData(
            await client.callTool("get_restaurant", {
              restaurant_id: indexedRow.id as string,
            }),
          ) as Record<string, unknown>;
          const profileClaim = profile.claim_invitation as Record<string, unknown> | undefined;
          assert(
            profileClaim && typeof profileClaim === "object",
            "indexed get_restaurant must include top-level claim_invitation",
          );
          assert(
            profileClaim!.reason === "indexed_menu_not_owner_verified",
            "indexed get_restaurant claim_invitation.reason mismatch",
          );
        }
      },
    ),
  );

  results.push(
    await runFlow(
      "flow-explore-area-williamsburg",
      "explore_area_for_diet tier buckets",
      async () => {
        const data = requireData(
          await client.callTool("explore_area_for_diet", {
            location: {
              latitude: MENU_INDEXED_TEST_LOCATION.lat,
              longitude: MENU_INDEXED_TEST_LOCATION.lng,
            },
            radius_meters: 1500,
            dietary: ["vegan"],
            top_n_per_tier: 3,
          }),
        ) as Record<string, unknown>;

        assertCitationAndAttribution(data, "explore_area_for_diet");

        const tiers = data.tiers as
          | {
              verified?: unknown;
              menu_indexed?: unknown;
              discovered?: unknown;
            }
          | undefined;
        assert(
          tiers && typeof tiers === "object",
          "explore_area_for_diet must return a tiers object",
        );
        assert(Array.isArray(tiers!.verified), "tiers.verified must be an array");
        assert(Array.isArray(tiers!.menu_indexed), "tiers.menu_indexed must be an array");
        assert(Array.isArray(tiers!.discovered), "tiers.discovered must be an array");

        const verifiedList = tiers!.verified as Array<Record<string, unknown>>;
        const indexedList = tiers!.menu_indexed as Array<Record<string, unknown>>;
        const discoveredList = tiers!.discovered as Array<Record<string, unknown>>;
        for (const entry of [...verifiedList, ...indexedList, ...discoveredList]) {
          assert(typeof entry.id === "string", "explore entry must include id");
          assert(typeof entry.name === "string", "explore entry must include name");
          assert(typeof entry.tier === "string", "explore entry must include tier");
          assert(
            typeof entry.distance_meters === "number",
            "explore entry must include distance_meters",
          );
          assert(
            typeof entry.menu_available === "boolean",
            "explore entry must include menu_available",
          );
          assert(
            typeof entry.trust_notice === "string",
            "explore entry must include trust_notice",
          );
        }

        const tierCounts = data.tier_counts as
          | {
              verified?: number;
              menu_indexed?: number;
              discovered?: number;
              total?: number;
            }
          | undefined;
        assert(
          tierCounts && typeof tierCounts === "object",
          "explore_area_for_diet must return tier_counts",
        );
        const verifiedCount = tierCounts!.verified ?? 0;
        const indexedCount = tierCounts!.menu_indexed ?? 0;
        const discoveredCount = tierCounts!.discovered ?? 0;
        const total = tierCounts!.total ?? 0;
        assert(
          verifiedCount + indexedCount + discoveredCount === total,
          `tier_counts buckets (${verifiedCount}+${indexedCount}+${discoveredCount}) must sum to total (${total})`,
        );

        assert(
          verifiedList.length <= 3 &&
            indexedList.length <= 3 &&
            discoveredList.length <= 3,
          "trimmed tier buckets must respect top_n_per_tier=3",
        );

        const hasEmptyBucket =
          verifiedCount === 0 || indexedCount === 0 || discoveredCount === 0;
        if (hasEmptyBucket) {
          assert(
            Array.isArray(data.next_steps) && (data.next_steps as unknown[]).length > 0,
            "next_steps must be populated when any tier bucket is empty",
          );
        }

        const echoedLocation = data.location as
          | { latitude?: unknown; longitude?: unknown }
          | undefined;
        assert(
          echoedLocation?.latitude === MENU_INDEXED_TEST_LOCATION.lat &&
            echoedLocation?.longitude === MENU_INDEXED_TEST_LOCATION.lng,
          "explore_area_for_diet must echo the requested location",
        );
        assert(
          data.radius_meters === 1500,
          `explore_area_for_diet must echo radius_meters (got ${String(data.radius_meters)})`,
        );
      },
    ),
  );

  results.push(
    await runFlow(
      "flow-compare-for-diet",
      "compare_restaurants_for_diet ranking",
      async () => {
        const search = requireData(
          await client.callTool("search_restaurants", {
            ...MENU_INDEXED_TEST_LOCATION,
            query: "cafe",
            radius_miles: 1,
          }),
        ) as Record<string, unknown>;
        const rows = (search.results as Array<Record<string, unknown>>) ?? [];
        assert(rows.length >= 2, "Need at least 2 restaurants near fixture to compare");

        const picks: string[] = [];
        const indexed = rows.find(
          (r) => r.verification_status === "menu_indexed" && r.menu_available === true,
        );
        if (indexed?.id) picks.push(indexed.id as string);
        const discovered = rows.find((r) => r.verification_status === "discovered");
        if (discovered?.id && !picks.includes(discovered.id as string)) {
          picks.push(discovered.id as string);
        }
        for (const row of rows) {
          const id = row.id as string | undefined;
          if (!id || picks.includes(id)) continue;
          picks.push(id);
          if (picks.length >= 2) break;
        }
        assert(picks.length >= 2, "Could not assemble compare fixture ids");

        const payload = requireData(
          await client.callTool("compare_restaurants_for_diet", {
            restaurant_ids: picks.slice(0, 3),
            dietary: ["vegan"],
          }),
        ) as Record<string, unknown>;

        assertCitationAndAttribution(payload, "compare_restaurants_for_diet");
        const compared = payload.restaurants as Array<Record<string, unknown>>;
        assert(Array.isArray(compared) && compared.length >= 2, "Expected compared restaurants");
        for (const row of compared) {
          assert(typeof row.id === "string", "compare row missing id");
          assert(typeof row.tier === "string", "compare row missing tier");
          assert(Array.isArray(row.dietary_eligible_items), "compare row missing dietary_eligible_items");
          assert(typeof row.item_count === "number", "compare row missing item_count");
          // v1 should NOT include distance_meters when user_location absent
          assert(
            row.distance_meters === undefined,
            "compare row must omit distance_meters when user_location is not supplied",
          );
        }
        const ranking = (payload.comparison_summary as Record<string, unknown>).ranking as Array<
          Record<string, unknown>
        >;
        assert(Array.isArray(ranking) && ranking.length === compared.length, "ranking mismatch");

        // v2 with user_location supplied
        const withLocation = requireData(
          await client.callTool("compare_restaurants_for_diet", {
            restaurant_ids: picks.slice(0, 3),
            dietary: ["vegan"],
            user_location: {
              latitude: MENU_INDEXED_TEST_LOCATION.lat,
              longitude: MENU_INDEXED_TEST_LOCATION.lng,
            },
          }),
        ) as Record<string, unknown>;

        const echoedLocation = withLocation.user_location as
          | { latitude?: unknown; longitude?: unknown }
          | undefined;
        assert(
          echoedLocation?.latitude === MENU_INDEXED_TEST_LOCATION.lat &&
            echoedLocation?.longitude === MENU_INDEXED_TEST_LOCATION.lng,
          "compare must echo user_location when supplied",
        );

        const v2Rows = withLocation.restaurants as Array<Record<string, unknown>>;
        let rowsWithDistance = 0;
        for (const row of v2Rows) {
          if (row.tier === "not_found") continue;
          if (typeof row.distance_meters === "number") {
            assert(
              (row.distance_meters as number) >= 0,
              "distance_meters must be non-negative",
            );
            rowsWithDistance++;
          } else {
            const note = String(row.note ?? "");
            assert(
              note.includes("distance_not_available"),
              "rows without distance_meters must carry distance_not_available note",
            );
          }
        }
        assert(
          rowsWithDistance >= 1,
          "at least one Williamsburg compared row should have geocoded coordinates",
        );
      },
    ),
  );

  results.push(
    await runFlow(
      "flow-along-route-williamsburg",
      "find_restaurants_along_route route ranking",
      async () => {
        const payload = requireData(
          await client.callTool("find_restaurants_along_route", {
            origin: { latitude: 40.7218, longitude: -73.9569 },
            destination: { latitude: 40.7061, longitude: -73.9969 },
            dietary: ["vegan"],
            max_results: 5,
          }),
        ) as Record<string, unknown>;

        assertCitationAndAttribution(payload, "find_restaurants_along_route");
        assert(
          typeof payload.direct_distance_meters === "number" &&
            (payload.direct_distance_meters as number) > 0,
          "along-route must return positive direct_distance_meters",
        );
        assert(typeof payload.route_method === "string", "along-route missing route_method");

        const places = payload.places as Array<Record<string, unknown>>;
        assert(Array.isArray(places), "along-route places must be an array");
        for (const place of places) {
          assert(typeof place.restaurant_id === "string", "along-route place missing restaurant_id");
          assert(typeof place.tier === "string", "along-route place missing tier");
          assert(
            typeof place.route_proximity_meters === "number",
            "along-route place missing route_proximity_meters",
          );
        }

        const tier = payload.tier_breakdown as
          | { verified?: number; menu_indexed?: number; discovered?: number }
          | undefined;
        assert(tier && typeof tier === "object", "along-route must return tier_breakdown");
        const sum = (tier!.verified ?? 0) + (tier!.menu_indexed ?? 0) + (tier!.discovered ?? 0);
        assert(sum === places.length, "tier_breakdown must sum to places.length");
      },
    ),
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
      assertCitationAndAttribution(data, "get_ado_score_breakdown");
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
