import assert from "node:assert/strict";
import { test } from "node:test";

import type { SupabaseClient } from "@supabase/supabase-js";

import { approveMenuVerification } from "./insert-indexed-menu";

/**
 * Fake supabase client that replays a script of responses against the
 * sequence of calls `approveMenuVerification` makes. This lets us assert
 * the retry behavior and signature wiring without standing up a database.
 *
 * Per attempt the function executes:
 *   1. .from("restaurants").select(...).eq().single()                        [restaurants:single]
 *   2. .from("menus").select("id").eq().eq("pending_approval").maybeSingle() [menus:maybeSingle]
 *   3. .from("menus").select("id").eq().eq("published").maybeSingle()        [menus:maybeSingle]   (only if pending missing)
 *   4. .from("menus").select("id, protocol_version").eq().single()           [menus:single]        (fnm-v1: read protocol_version)
 *   5. .from("menu_categories").select("id, name").eq()  [awaited]           [menu_categories:list]
 *   6. .from("menu_items").select(...).in()              [awaited]           [menu_items:list]     (only if any category)
 *   7. .rpc("approve_menu_verification_atomic", { ... })
 */

type StepResult = { data: unknown; error: unknown };
type RpcResult = { data: unknown; error: unknown };

type SelectScript =
  | { kind: "single"; result: StepResult }
  | { kind: "maybeSingle"; result: StepResult }
  | { kind: "list"; result: StepResult };

function makeQueryBuilder(takeNext: () => SelectScript) {
  let resolvedResult: StepResult | null = null;
  let terminated = false;

  const builder: Record<string, unknown> = {};
  for (const chainMethod of ["select", "eq", "in", "order", "filter", "limit"]) {
    builder[chainMethod] = () => builder;
  }
  builder.single = () => {
    const step = takeNext();
    if (step.kind !== "single") {
      throw new Error(`expected .single() but script step was ${step.kind}`);
    }
    terminated = true;
    resolvedResult = step.result;
    return Promise.resolve(step.result);
  };
  builder.maybeSingle = () => {
    const step = takeNext();
    if (step.kind !== "maybeSingle") {
      throw new Error(`expected .maybeSingle() but script step was ${step.kind}`);
    }
    terminated = true;
    resolvedResult = step.result;
    return Promise.resolve(step.result);
  };
  // Thenable: supports awaiting the builder directly (the "list" pattern,
  // e.g. .from("x").select("col").eq("y", z) without .single/.maybeSingle).
  builder.then = (
    onFulfilled: (value: StepResult) => unknown,
    onRejected?: (reason: unknown) => unknown,
  ) => {
    if (!terminated) {
      const step = takeNext();
      if (step.kind !== "list") {
        throw new Error(`expected list-style await but script step was ${step.kind}`);
      }
      resolvedResult = step.result;
      terminated = true;
    }
    return Promise.resolve(resolvedResult!).then(onFulfilled, onRejected);
  };
  return builder;
}

type FakeSupabase = SupabaseClient & {
  __rpcCalls: Array<{ name: string; args: Record<string, unknown> }>;
};

function makeFakeSupabase(opts: {
  selectScripts: Record<string, SelectScript[]>;
  rpcResults: RpcResult[];
}): FakeSupabase {
  const rpcCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  let rpcCursor = 0;

  // Cursors are shared across .from(table) calls so the script advances
  // in the order the production code reads from the table.
  const cursors = new Map<string, number>();
  for (const table of Object.keys(opts.selectScripts)) cursors.set(table, 0);

  const from = (table: string) => {
    const script = opts.selectScripts[table];
    if (!script) throw new Error(`no script for table ${table}`);
    const takeNext = () => {
      const index = cursors.get(table) ?? 0;
      const step = script[index];
      cursors.set(table, index + 1);
      if (!step) {
        throw new Error(`script for table ${table} exhausted at index ${index}`);
      }
      return step;
    };
    return makeQueryBuilder(takeNext);
  };

  const rpc = (name: string, args: Record<string, unknown>) => {
    rpcCalls.push({ name, args });
    const step = opts.rpcResults[rpcCursor++];
    if (!step) throw new Error("rpc script exhausted");
    return Promise.resolve(step);
  };

  const fake = {
    from,
    rpc,
    __rpcCalls: rpcCalls,
  } as unknown as FakeSupabase;
  return fake;
}

const restaurantId = "11111111-1111-1111-1111-111111111111";
const candidateMenuId = "22222222-2222-2222-2222-222222222222";
const otherMenuId = "33333333-3333-3333-3333-333333333333";

// Required env so loadSigningKeyFromEnv() succeeds. These are throwaway
// test keys; the test only verifies retry control flow, not crypto strength.
process.env.FNM_VERIFIED_SIGNING_KEY =
  process.env.FNM_VERIFIED_SIGNING_KEY ??
  `-----BEGIN PRIVATE KEY-----
MC4CAQAwBQYDK2VwBCIEINTuctv5E1hK1bbY8fdp+K06/nwoy/HU++CXqI9EdVhC
-----END PRIVATE KEY-----`;
process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY =
  process.env.FNM_VERIFIED_SIGNING_PUBLIC_KEY ??
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEAGb9ECWmEzf6FQbrBZ9w7lshQhqowtrbLDFw4rXAxZuE=
-----END PUBLIC KEY-----`;

// Convenience: one full "attempt" worth of menu/category/item scripted reads.
//   - pending: returns the given menu id (so we don't fall through to published)
//   - menu protocol_version read returns "1.0"
//   - empty categories + items lists (canonical content is just `{ items: [] }`)
function attemptForPendingMenu(menuId: string): {
  menus: SelectScript[];
  menu_categories: SelectScript[];
  menu_items: SelectScript[];
} {
  return {
    menus: [
      { kind: "maybeSingle", result: { data: { id: menuId }, error: null } },
      { kind: "single", result: { data: { id: menuId, protocol_version: "1.0" }, error: null } },
    ],
    menu_categories: [{ kind: "list", result: { data: [], error: null } }],
    menu_items: [],
  };
}

function attemptForPublishedOnly(menuId: string): {
  menus: SelectScript[];
  menu_categories: SelectScript[];
  menu_items: SelectScript[];
} {
  return {
    menus: [
      // No pending menu
      { kind: "maybeSingle", result: { data: null, error: null } },
      // Published menu
      { kind: "maybeSingle", result: { data: { id: menuId }, error: null } },
      // Protocol version lookup
      { kind: "single", result: { data: { id: menuId, protocol_version: "1.0" }, error: null } },
    ],
    menu_categories: [{ kind: "list", result: { data: [], error: null } }],
    menu_items: [],
  };
}

function mergeAttempts(attempts: Array<ReturnType<typeof attemptForPendingMenu>>) {
  return {
    menus: attempts.flatMap((a) => a.menus),
    menu_categories: attempts.flatMap((a) => a.menu_categories),
    menu_items: attempts.flatMap((a) => a.menu_items),
  };
}

test("approveMenuVerification short-circuits when restaurant is already verified", async () => {
  const supabase = makeFakeSupabase({
    selectScripts: {
      restaurants: [
        {
          kind: "single",
          result: { data: { id: restaurantId, verification_status: "verified" }, error: null },
        },
      ],
      menus: [
        { kind: "maybeSingle", result: { data: { id: candidateMenuId }, error: null } },
      ],
    },
    rpcResults: [],
  });

  const result = await approveMenuVerification(supabase, restaurantId, "owner@example.com");
  assert.equal(result.alreadyVerified, true);
  assert.equal(result.menuId, candidateMenuId);
  assert.equal(supabase.__rpcCalls.length, 0);
});

test("approveMenuVerification retries when RPC reports menu_state_changed and succeeds on the second attempt", async () => {
  const attempts = mergeAttempts([
    attemptForPendingMenu(candidateMenuId),
    attemptForPublishedOnly(otherMenuId),
  ]);

  const supabase = makeFakeSupabase({
    selectScripts: {
      restaurants: [
        {
          kind: "single",
          result: { data: { id: restaurantId, verification_status: "menu_indexed" }, error: null },
        },
      ],
      ...attempts,
    },
    rpcResults: [
      // Attempt 1: state changed
      {
        data: [{ menu_id: null, already_verified: false, menu_state_changed: true }],
        error: null,
      },
      // Attempt 2: success
      {
        data: [{ menu_id: otherMenuId, already_verified: false, menu_state_changed: false }],
        error: null,
      },
    ],
  });

  const result = await approveMenuVerification(supabase, restaurantId, "owner@example.com");
  assert.equal(result.alreadyVerified, false);
  assert.equal(result.menuId, otherMenuId);
  assert.equal(supabase.__rpcCalls.length, 2);
  assert.equal(supabase.__rpcCalls[0]!.args.p_expected_menu_id, candidateMenuId);
  assert.equal(supabase.__rpcCalls[1]!.args.p_expected_menu_id, otherMenuId);
  // fnm-v1 binds: payload_hash + signing_format must be present and well-formed.
  for (const call of supabase.__rpcCalls) {
    assert.equal(call.args.p_signing_format, "fnm-v1");
    assert.match(String(call.args.p_payload_hash ?? ""), /^[a-f0-9]{64}$/);
  }
});

test("approveMenuVerification throws after exhausting retries when RPC keeps reporting menu_state_changed", async () => {
  const attempts = mergeAttempts([
    attemptForPendingMenu(candidateMenuId),
    attemptForPendingMenu(candidateMenuId),
    attemptForPendingMenu(candidateMenuId),
  ]);
  const supabase = makeFakeSupabase({
    selectScripts: {
      restaurants: [
        {
          kind: "single",
          result: { data: { id: restaurantId, verification_status: "menu_indexed" }, error: null },
        },
      ],
      ...attempts,
    },
    rpcResults: [
      { data: [{ menu_id: null, already_verified: false, menu_state_changed: true }], error: null },
      { data: [{ menu_id: null, already_verified: false, menu_state_changed: true }], error: null },
      { data: [{ menu_id: null, already_verified: false, menu_state_changed: true }], error: null },
    ],
  });

  await assert.rejects(
    () => approveMenuVerification(supabase, restaurantId, "owner@example.com"),
    /menu state changed during signing after multiple retries/i,
  );
  assert.equal(supabase.__rpcCalls.length, 3);
});

test("approveMenuVerification maps no_menu_available RPC error to friendly message", async () => {
  const attempts = mergeAttempts([attemptForPendingMenu(candidateMenuId)]);
  const supabase = makeFakeSupabase({
    selectScripts: {
      restaurants: [
        {
          kind: "single",
          result: { data: { id: restaurantId, verification_status: "menu_indexed" }, error: null },
        },
      ],
      ...attempts,
    },
    rpcResults: [
      {
        data: null,
        error: { message: "no_menu_available", code: "P0002" },
      },
    ],
  });

  await assert.rejects(
    () => approveMenuVerification(supabase, restaurantId, "owner@example.com"),
    /No menu available to verify/,
  );
});

test("approveMenuVerification surfaces alreadyVerified when RPC reports it (concurrent winner)", async () => {
  // The fast path missed the verified status (e.g. it was flipped between
  // the initial read and our RPC) — the RPC should still return cleanly.
  const attempts = mergeAttempts([attemptForPendingMenu(candidateMenuId)]);
  const supabase = makeFakeSupabase({
    selectScripts: {
      restaurants: [
        {
          kind: "single",
          result: { data: { id: restaurantId, verification_status: "menu_indexed" }, error: null },
        },
      ],
      ...attempts,
    },
    rpcResults: [
      {
        data: [{ menu_id: candidateMenuId, already_verified: true, menu_state_changed: false }],
        error: null,
      },
    ],
  });

  const result = await approveMenuVerification(supabase, restaurantId, "owner@example.com");
  assert.equal(result.alreadyVerified, true);
  assert.equal(result.menuId, candidateMenuId);
});
