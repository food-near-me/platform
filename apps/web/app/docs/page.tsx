import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCP & API Docs | Food Near Me",
  description:
    "Connect Claude, Cursor, or any MCP host to foodnear.me — eight tools, three FNM-unique composites, Menu Protocol signed menus, and a Google-Maps-MCP-compatible search shape.",
};

const mcpConfig = `{
  "mcpServers": {
    "foodnear-me": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://foodnear.me/mcp"]
    }
  }
}`;

const examplePromptSearch = `Find restaurants in Williamsburg, Brooklyn with verified vegan options.
Use search_restaurants, prefer the verified tier, then call get_menu and
list the dietary.vegan items by price.`;

const examplePromptCompare = `I'm choosing between these two cafes in Williamsburg:
  • <restaurant_id_A>
  • <restaurant_id_B>
Which one has more gluten-free menu items? Use
compare_restaurants_for_diet with dietary=["gluten_free"].`;

const examplePromptRoute = `I'm walking from McCarren Park (40.7218, -73.9569) to the Brooklyn
Bridge (40.7061, -73.9969). Suggest 3 stops along the way that have
vegan options. Use find_restaurants_along_route.`;

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-400/90 mb-3">
          Model Context Protocol
        </p>
        <h1 className="text-4xl font-semibold tracking-tight mb-4">
          Connect your AI agent
        </h1>
        <p className="text-lg text-zinc-400 mb-8">
          Plug foodnear.me into Claude Desktop, Cursor, or any MCP host —{" "}
          <strong className="text-zinc-200">8 tools</strong> (5 atomic + 3 FNM-unique
          composites),{" "}
          <strong className="text-zinc-200">4 resources</strong>,{" "}
          <strong className="text-zinc-200">3 prompts</strong>, no API key during beta.
        </p>

        <section
          id="quick-start"
          className="scroll-mt-8 mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6"
        >
          <h2 className="text-xl font-medium mb-4">Quick start</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-400 mb-6">
            <li>
              Open <span className="font-mono text-zinc-300">~/.cursor/mcp.json</span> or
              Claude Desktop&apos;s{" "}
              <span className="font-mono text-zinc-300">claude_desktop_config.json</span>
            </li>
            <li>Paste the config below</li>
            <li>Restart your MCP host</li>
          </ol>
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-sm text-zinc-300 border border-zinc-800">
            {mcpConfig}
          </pre>
          <p className="mt-4 text-xs text-zinc-500">
            Endpoint:{" "}
            <span className="font-mono text-zinc-400">https://foodnear.me/mcp</span>
            {" · "}
            <a href="/.well-known/mcp-server.json" className="text-amber-400/90 hover:underline">
              mcp-server.json
            </a>
            {" · "}
            <a href="/llms.txt" className="text-amber-400/90 hover:underline">
              llms.txt
            </a>
            {" · "}
            <a
              href="/skills/foodnearme/SKILL.md"
              className="text-amber-400/90 hover:underline"
            >
              SKILL.md
            </a>
            {" · "}
            <Link href="/health/mcp" className="text-amber-400/90 hover:underline">
              usage stats
            </Link>
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Atomic tools (5)</h2>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <code className="text-amber-200/90">search_restaurants</code> — three-tier
              search (verified → menu_indexed → discovered). Accepts flat{" "}
              <code className="text-zinc-300">lat</code>/
              <code className="text-zinc-300">lng</code> or Google-style{" "}
              <code className="text-zinc-300">locationBias.circle</code>. Check{" "}
              <code className="text-zinc-300">menu_available</code> before{" "}
              <code className="text-zinc-300">get_menu</code>.
            </li>
            <li>
              <code className="text-amber-200/90">get_restaurant</code> — Schema.org
              JSON-LD profile with Menu Protocol extensions.
            </li>
            <li>
              <code className="text-amber-200/90">get_menu</code> — Menu Protocol v1.0
              menu (dietary booleans, allergens, Ed25519 signature on verified tier).
            </li>
            <li>
              <code className="text-amber-200/90">get_ado_score_breakdown</code> — ADO
              factors + improvement recommendations.
            </li>
            <li>
              <code className="text-amber-200/90">validate_menu_protocol</code> —
              validate Menu Protocol JSON before publish (strict mode available).
            </li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-amber-900/40 bg-amber-950/10 p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-amber-400/80 mb-2">
            FNM-unique
          </p>
          <h2 className="text-xl font-medium mb-3">Composite tools (3)</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Higher-level tools that chain atomic calls. These exist because they leverage
            FNM&apos;s signed-menu data — a generic place-search MCP can&apos;t produce
            equivalent results.
          </p>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <code className="text-amber-200/90">explore_area_for_diet</code> — bucketed
              neighborhood overview (verified / menu_indexed / discovered) with{" "}
              <code className="text-zinc-300">tier_counts</code> and{" "}
              <code className="text-zinc-300">next_steps</code>.
            </li>
            <li>
              <code className="text-amber-200/90">compare_restaurants_for_diet</code> —
              side-by-side dietary comparison across 2-5 restaurants, ranked by item
              count then trust tier.
            </li>
            <li>
              <code className="text-amber-200/90">find_restaurants_along_route</code> —
              route-adjacent discovery between two coordinates. Optional{" "}
              <code className="text-zinc-300">route_polyline</code> from your routing
              source; otherwise local great-circle approximation (no external routing
              service ever).
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Example interactions</h2>
          <p className="text-sm text-zinc-400 mb-4">
            Paste any of these prompts into Cursor or Claude Desktop after the quick
            start. They exercise different tools.
          </p>
          <div className="space-y-4">
            <details
              open
              className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 [&_summary]:cursor-pointer"
            >
              <summary className="text-sm font-medium text-zinc-200">
                search → get_menu (verified dietary discovery)
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300 border border-zinc-800 whitespace-pre-wrap">
                {examplePromptSearch}
              </pre>
            </details>
            <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 [&_summary]:cursor-pointer">
              <summary className="text-sm font-medium text-zinc-200">
                compare_restaurants_for_diet (FNM-unique)
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300 border border-zinc-800 whitespace-pre-wrap">
                {examplePromptCompare}
              </pre>
            </details>
            <details className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-4 [&_summary]:cursor-pointer">
              <summary className="text-sm font-medium text-zinc-200">
                find_restaurants_along_route (FNM-unique)
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-zinc-950 p-3 text-xs text-zinc-300 border border-zinc-800 whitespace-pre-wrap">
                {examplePromptRoute}
              </pre>
            </details>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Resources</h2>
          <ul className="space-y-1 text-sm font-mono text-zinc-500">
            <li>foodnearme://spec/menu-protocol</li>
            <li>foodnearme://spec/openapi</li>
            <li>foodnearme://agent/skill</li>
            <li>foodnearme://examples/search-flow</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Prompts</h2>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <code className="text-amber-200/90">find_dinner_near_me</code> — location +
              optional cuisine/dietary
            </li>
            <li>
              <code className="text-amber-200/90">dietary_constrained_menu</code> —
              restaurant_id + restrictions
            </li>
            <li>
              <code className="text-amber-200/90">validate_my_menu</code> — validate
              Menu Protocol JSON before publish
            </li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-medium mb-3">Tool errors</h2>
          <p className="text-sm text-zinc-400 mb-3">
            Failed tool calls return <code className="text-zinc-300">_meta.error</code>{" "}
            with <code className="text-zinc-300">code</code>,{" "}
            <code className="text-zinc-300">hint</code>, and{" "}
            <code className="text-zinc-300">retryable</code> so agents can self-correct.
          </p>
          <p className="text-xs font-mono text-zinc-500">
            VALIDATION_ERROR · NOT_FOUND · UPSTREAM
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-medium mb-3">Data trust (three-tier search)</h2>
          <p className="text-sm text-zinc-400 mb-3">
            <code className="text-zinc-300">search_restaurants</code> returns{" "}
            <strong className="text-zinc-200">verified</strong> →{" "}
            <strong className="text-zinc-200">menu_indexed</strong> →{" "}
            <strong className="text-zinc-200">discovered</strong> (place only when no
            menu).
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-zinc-400">
            <li>
              <code className="text-zinc-300">verified</code> +{" "}
              <code className="text-zinc-300">menu_available: true</code> —
              owner-approved MP, Ed25519-signed (content-bound on{" "}
              <code className="text-zinc-300">fnm-v1</code>); authoritative for
              dietary/allergen claims
            </li>
            <li>
              <code className="text-zinc-300">menu_indexed</code> +{" "}
              <code className="text-zinc-300">menu_available: true</code> — automated /
              public menu; cite with caveat, do not treat dietary/allergens as
              authoritative
            </li>
            <li>
              <code className="text-zinc-300">discovered</code> +{" "}
              <code className="text-zinc-300">menu_available: false</code> — place data
              only; do not cite menu items
            </li>
            <li>
              Trust progression: <code className="text-zinc-300">discovered</code> →{" "}
              <code className="text-zinc-300">menu_indexed</code> →{" "}
              <code className="text-zinc-300">verified</code>
            </li>
          </ul>
          <p className="mt-4 text-xs text-zinc-500">
            <a href="/attribution" className="text-amber-400/90 hover:underline">
              Open-data attribution
            </a>
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-medium mb-3">Owner recruitment payload</h2>
          <p className="text-sm text-zinc-400 mb-3">
            Every non-verified result (search row, profile, indexed menu, composite
            entry) ships with an optional structured{" "}
            <code className="text-zinc-300">claim_invitation</code> object — owner
            recruitment data, not a CTA. Surface it only when relevant: the user is the
            restaurant&apos;s owner, the user asks why the listing lacks a verified menu,
            or the user asks how to help.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-zinc-950 p-4 text-xs text-zinc-300 border border-zinc-800">{`"claim_invitation": {
  "url": "https://foodnear.me/claim/<restaurant_id>",
  "audience": "owner_or_advocate",
  "reason": "no_owner_approved_menu" | "indexed_menu_not_owner_verified",
  "message": "...",
  "estimated_minutes": 5,
  "cost": "free"
}`}</pre>
          <p className="mt-3 text-xs text-zinc-500">
            Verified results omit the field. Details:{" "}
            <a
              href="/skills/foodnearme/SKILL.md#claim-invitations-on-non-verified-results"
              className="text-amber-400/90 hover:underline"
            >
              SKILL.md
            </a>
            .
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-medium mb-3">
            Compatible with Google Maps MCP shape
          </h2>
          <p className="text-sm text-zinc-400 mb-3">
            <code className="text-zinc-300">search_restaurants</code> accepts either the
            flat FNM shape or Google-style{" "}
            <code className="text-zinc-300">locationBias.circle</code> +{" "}
            <code className="text-zinc-300">textQuery</code>, plus the cablate variant.
            Responses carry both <code className="text-zinc-300">citation</code> and{" "}
            <code className="text-zinc-300">attribution</code> (identical) so existing
            local-search agents drop in without retraining. Locale hints (
            <code className="text-zinc-300">languageCode</code>,{" "}
            <code className="text-zinc-300">regionCode</code>) are accepted and echoed;
            FNM is US-English only in v1.
          </p>
        </section>

        <p className="text-sm text-zinc-500">
          Canonical host documentation (FAQ, verify commands, architecture):{" "}
          <a
            href="https://github.com/food-near-me/platform#quick-start"
            className="text-amber-400/90 hover:underline"
          >
            GitHub README
          </a>
          {" · "}
          <Link href="/" className="text-amber-400/90 hover:underline">
            foodnear.me
          </Link>
        </p>
      </div>
    </main>
  );
}
