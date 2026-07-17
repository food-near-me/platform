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
    <main className="min-h-screen bg-[var(--bg)] text-[var(--fg)]">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-[var(--accent)] mb-3">
          Model Context Protocol
        </p>
        <h1 className="text-4xl font-semibold tracking-tight mb-4">
          Connect your AI agent
        </h1>
        <p className="text-lg text-[var(--fg-dim)] mb-8">
          Plug foodnear.me into Claude Desktop, Cursor, or any MCP host —{" "}
          <strong className="text-[var(--fg)]">8 tools</strong> (5 atomic + 3 FNM-unique
          composites),{" "}
          <strong className="text-[var(--fg)]">4 resources</strong>,{" "}
          <strong className="text-[var(--fg)]">3 prompts</strong>, no API key during beta.
        </p>

        <section
          id="quick-start"
          className="scroll-mt-8 mb-10 rounded-xl border border-[var(--line)] bg-[var(--bg-1)] p-6"
        >
          <h2 className="text-xl font-medium mb-4">Quick start</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-[var(--fg-dim)] mb-6">
            <li>
              Open <span className="font-mono text-[var(--fg-dim)]">~/.cursor/mcp.json</span> or
              Claude Desktop&apos;s{" "}
              <span className="font-mono text-[var(--fg-dim)]">claude_desktop_config.json</span>
            </li>
            <li>Paste the config below</li>
            <li>Restart your MCP host</li>
          </ol>
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg)] p-4 text-sm text-[var(--fg-dim)] border border-[var(--line)]">
            {mcpConfig}
          </pre>
          <p className="mt-4 text-xs text-[var(--fg-dim)]">
            Endpoint:{" "}
            <span className="font-mono text-[var(--fg-dim)]">https://foodnear.me/mcp</span>
            {" · "}
            <a href="/.well-known/mcp-server.json" className="text-[var(--accent)] hover:underline">
              mcp-server.json
            </a>
            {" · "}
            <a href="/llms.txt" className="text-[var(--accent)] hover:underline">
              llms.txt
            </a>
            {" · "}
            <a
              href="/skills/foodnearme/SKILL.md"
              className="text-[var(--accent)] hover:underline"
            >
              SKILL.md
            </a>
            {" · "}
            <Link href="/health/mcp" className="text-[var(--accent)] hover:underline">
              usage stats
            </Link>
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Atomic tools (5)</h2>
          <ul className="space-y-2 text-sm text-[var(--fg-dim)]">
            <li>
              <code className="text-[var(--accent)]">search_restaurants</code> — three-tier
              search (verified → menu_indexed → discovered). Accepts flat{" "}
              <code className="text-[var(--fg-dim)]">lat</code>/
              <code className="text-[var(--fg-dim)]">lng</code> or Google-style{" "}
              <code className="text-[var(--fg-dim)]">locationBias.circle</code>. Check{" "}
              <code className="text-[var(--fg-dim)]">menu_available</code> before{" "}
              <code className="text-[var(--fg-dim)]">get_menu</code>.
            </li>
            <li>
              <code className="text-[var(--accent)]">get_restaurant</code> — Schema.org
              JSON-LD profile with Menu Protocol extensions.
            </li>
            <li>
              <code className="text-[var(--accent)]">get_menu</code> — Menu Protocol v1.0
              menu (dietary booleans, allergens, Ed25519 signature on verified tier).
            </li>
            <li>
              <code className="text-[var(--accent)]">get_ado_score_breakdown</code> — ADO
              factors + improvement recommendations.
            </li>
            <li>
              <code className="text-[var(--accent)]">validate_menu_protocol</code> —
              validate Menu Protocol JSON before publish (strict mode available).
            </li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-[var(--accent)] bg-[var(--accent-soft)] p-6">
          <p className="text-xs font-medium uppercase tracking-widest text-[var(--accent)] mb-2">
            FNM-unique
          </p>
          <h2 className="text-xl font-medium mb-3">Composite tools (3)</h2>
          <p className="text-sm text-[var(--fg-dim)] mb-4">
            Higher-level tools that chain atomic calls. These exist because they leverage
            FNM&apos;s signed-menu data — a generic place-search MCP can&apos;t produce
            equivalent results.
          </p>
          <ul className="space-y-2 text-sm text-[var(--fg-dim)]">
            <li>
              <code className="text-[var(--accent)]">explore_area_for_diet</code> — bucketed
              neighborhood overview (verified / menu_indexed / discovered) with{" "}
              <code className="text-[var(--fg-dim)]">tier_counts</code> and{" "}
              <code className="text-[var(--fg-dim)]">next_steps</code>.
            </li>
            <li>
              <code className="text-[var(--accent)]">compare_restaurants_for_diet</code> —
              side-by-side dietary comparison across 2-5 restaurants, ranked by item
              count then trust tier.
            </li>
            <li>
              <code className="text-[var(--accent)]">find_restaurants_along_route</code> —
              route-adjacent discovery between two coordinates. Optional{" "}
              <code className="text-[var(--fg-dim)]">route_polyline</code> from your routing
              source; otherwise local great-circle approximation (no external routing
              service ever).
            </li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Example interactions</h2>
          <p className="text-sm text-[var(--fg-dim)] mb-4">
            Paste any of these prompts into Cursor or Claude Desktop after the quick
            start. They exercise different tools.
          </p>
          <div className="space-y-4">
            <details
              open
              className="rounded-lg border border-[var(--line)] bg-[var(--bg-1)] p-4 [&_summary]:cursor-pointer"
            >
              <summary className="text-sm font-medium text-[var(--fg)]">
                search → get_menu (verified dietary discovery)
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--bg)] p-3 text-xs text-[var(--fg-dim)] border border-[var(--line)] whitespace-pre-wrap">
                {examplePromptSearch}
              </pre>
            </details>
            <details className="rounded-lg border border-[var(--line)] bg-[var(--bg-1)] p-4 [&_summary]:cursor-pointer">
              <summary className="text-sm font-medium text-[var(--fg)]">
                compare_restaurants_for_diet (FNM-unique)
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--bg)] p-3 text-xs text-[var(--fg-dim)] border border-[var(--line)] whitespace-pre-wrap">
                {examplePromptCompare}
              </pre>
            </details>
            <details className="rounded-lg border border-[var(--line)] bg-[var(--bg-1)] p-4 [&_summary]:cursor-pointer">
              <summary className="text-sm font-medium text-[var(--fg)]">
                find_restaurants_along_route (FNM-unique)
              </summary>
              <pre className="mt-3 overflow-x-auto rounded bg-[var(--bg)] p-3 text-xs text-[var(--fg-dim)] border border-[var(--line)] whitespace-pre-wrap">
                {examplePromptRoute}
              </pre>
            </details>
          </div>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Resources</h2>
          <ul className="space-y-1 text-sm font-mono text-[var(--fg-dim)]">
            <li>foodnearme://spec/menu-protocol</li>
            <li>foodnearme://spec/openapi</li>
            <li>foodnearme://agent/skill</li>
            <li>foodnearme://examples/search-flow</li>
          </ul>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Prompts</h2>
          <ul className="space-y-2 text-sm text-[var(--fg-dim)]">
            <li>
              <code className="text-[var(--accent)]">find_dinner_near_me</code> — location +
              optional cuisine/dietary
            </li>
            <li>
              <code className="text-[var(--accent)]">dietary_constrained_menu</code> —
              restaurant_id + restrictions
            </li>
            <li>
              <code className="text-[var(--accent)]">validate_my_menu</code> — validate
              Menu Protocol JSON before publish
            </li>
          </ul>
        </section>

        <section className="mb-10 rounded-xl border border-[var(--line)] bg-[var(--bg-1)] p-6">
          <h2 className="text-xl font-medium mb-3">Tool errors</h2>
          <p className="text-sm text-[var(--fg-dim)] mb-3">
            Failed tool calls return <code className="text-[var(--fg-dim)]">_meta.error</code>{" "}
            with <code className="text-[var(--fg-dim)]">code</code>,{" "}
            <code className="text-[var(--fg-dim)]">hint</code>, and{" "}
            <code className="text-[var(--fg-dim)]">retryable</code> so agents can self-correct.
          </p>
          <p className="text-xs font-mono text-[var(--fg-dim)]">
            VALIDATION_ERROR · NOT_FOUND · UPSTREAM
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-[var(--line)] bg-[var(--bg-1)] p-6">
          <h2 className="text-xl font-medium mb-3">Data trust (three-tier search)</h2>
          <p className="text-sm text-[var(--fg-dim)] mb-3">
            <code className="text-[var(--fg-dim)]">search_restaurants</code> returns{" "}
            <strong className="text-[var(--fg)]">verified</strong> →{" "}
            <strong className="text-[var(--fg)]">menu_indexed</strong> →{" "}
            <strong className="text-[var(--fg)]">discovered</strong> (place only when no
            menu).
          </p>
          <ul className="list-disc list-inside space-y-2 text-sm text-[var(--fg-dim)]">
            <li>
              <code className="text-[var(--fg-dim)]">verified</code> +{" "}
              <code className="text-[var(--fg-dim)]">menu_available: true</code> —
              owner-approved MP, Ed25519-signed (content-bound on{" "}
              <code className="text-[var(--fg-dim)]">fnm-v1</code>); authoritative for
              dietary/allergen claims
            </li>
            <li>
              <code className="text-[var(--fg-dim)]">menu_indexed</code> +{" "}
              <code className="text-[var(--fg-dim)]">menu_available: true</code> — automated /
              public menu; cite with caveat, do not treat dietary/allergens as
              authoritative
            </li>
            <li>
              <code className="text-[var(--fg-dim)]">discovered</code> +{" "}
              <code className="text-[var(--fg-dim)]">menu_available: false</code> — place data
              only; do not cite menu items
            </li>
            <li>
              Trust progression: <code className="text-[var(--fg-dim)]">discovered</code> →{" "}
              <code className="text-[var(--fg-dim)]">menu_indexed</code> →{" "}
              <code className="text-[var(--fg-dim)]">verified</code>
            </li>
          </ul>
          <p className="mt-4 text-xs text-[var(--fg-dim)]">
            <a href="/attribution" className="text-[var(--accent)] hover:underline">
              Open-data attribution
            </a>
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-[var(--line)] bg-[var(--bg-1)] p-6">
          <h2 className="text-xl font-medium mb-3">Owner recruitment payload</h2>
          <p className="text-sm text-[var(--fg-dim)] mb-3">
            Every non-verified result (search row, profile, indexed menu, composite
            entry) ships with an optional structured{" "}
            <code className="text-[var(--fg-dim)]">claim_invitation</code> object — owner
            recruitment data, not a CTA. Surface it only when relevant: the user is the
            restaurant&apos;s owner, the user asks why the listing lacks a verified menu,
            or the user asks how to help.
          </p>
          <pre className="overflow-x-auto rounded-lg bg-[var(--bg)] p-4 text-xs text-[var(--fg-dim)] border border-[var(--line)]">{`"claim_invitation": {
  "url": "https://foodnear.me/claim/<restaurant_id>",
  "audience": "owner_or_advocate",
  "reason": "no_owner_approved_menu" | "indexed_menu_not_owner_verified",
  "message": "...",
  "estimated_minutes": 5,
  "cost": "free"
}`}</pre>
          <p className="mt-3 text-xs text-[var(--fg-dim)]">
            Verified results omit the field. Details:{" "}
            <a
              href="/skills/foodnearme/SKILL.md#claim-invitations-on-non-verified-results"
              className="text-[var(--accent)] hover:underline"
            >
              SKILL.md
            </a>
            .
          </p>
        </section>

        <section className="mb-10 rounded-xl border border-[var(--line)] bg-[var(--bg-1)] p-6">
          <h2 className="text-xl font-medium mb-3">
            Compatible with Google Maps MCP shape
          </h2>
          <p className="text-sm text-[var(--fg-dim)] mb-3">
            <code className="text-[var(--fg-dim)]">search_restaurants</code> accepts either the
            flat FNM shape or Google-style{" "}
            <code className="text-[var(--fg-dim)]">locationBias.circle</code> +{" "}
            <code className="text-[var(--fg-dim)]">textQuery</code>, plus the cablate variant.
            Responses carry both <code className="text-[var(--fg-dim)]">citation</code> and{" "}
            <code className="text-[var(--fg-dim)]">attribution</code> (identical) so existing
            local-search agents drop in without retraining. Locale hints (
            <code className="text-[var(--fg-dim)]">languageCode</code>,{" "}
            <code className="text-[var(--fg-dim)]">regionCode</code>) are accepted and echoed;
            FNM is US-English only in v1.
          </p>
        </section>

        <p className="text-sm text-[var(--fg-dim)]">
          Canonical host documentation (FAQ, verify commands, architecture):{" "}
          <a
            href="https://github.com/food-near-me/platform#quick-start"
            className="text-[var(--accent)] hover:underline"
          >
            GitHub README
          </a>
          {" · "}
          <Link href="/" className="text-[var(--accent)] hover:underline">
            foodnear.me
          </Link>
        </p>
      </div>
    </main>
  );
}
