import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "MCP & API Docs | Food Near Me",
  description:
    "Connect Claude, Cursor, or any MCP host to foodnear.me — restaurant search and Menu Protocol menus for AI agents.",
};

const mcpConfig = `{
  "mcpServers": {
    "foodnear-me": {
      "command": "npx",
      "args": ["-y", "mcp-remote", "https://foodnear.me/mcp"]
    }
  }
}`;

export default function DocsPage() {
  return (
    <main className="min-h-screen bg-zinc-950 text-zinc-100">
      <div className="mx-auto max-w-3xl px-6 py-16">
        <p className="text-sm font-medium uppercase tracking-widest text-amber-400/90 mb-3">
          Model Context Protocol
        </p>
        <h1 className="text-4xl font-semibold tracking-tight mb-4">Connect your AI agent</h1>
        <p className="text-lg text-zinc-400 mb-8">
          Plug foodnear.me into Claude Desktop, Cursor, or any MCP host —{" "}
          <strong className="text-zinc-200">5 tools</strong>,{" "}
          <strong className="text-zinc-200">4 resources</strong>, no API key during beta.
        </p>

        <section id="quick-start" className="scroll-mt-8 mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-medium mb-4">Quick start</h2>
          <ol className="list-decimal list-inside space-y-2 text-sm text-zinc-400 mb-6">
            <li>
              Open <span className="font-mono text-zinc-300">~/.cursor/mcp.json</span> or Claude Desktop&apos;s{" "}
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
          </p>
        </section>

        <section className="mb-10">
          <h2 className="text-xl font-medium mb-3">Tools</h2>
          <ul className="space-y-2 text-sm text-zinc-400">
            <li>
              <code className="text-amber-200/90">search_restaurants</code> — lat/lng search, cuisine, dietary, ADO
            </li>
            <li>
              <code className="text-amber-200/90">get_restaurant</code> — profile + Schema.org JSON-LD
            </li>
            <li>
              <code className="text-amber-200/90">get_menu</code> — Menu Protocol v1.0 menu
            </li>
            <li>
              <code className="text-amber-200/90">get_ado_score_breakdown</code> — ADO factors + recommendations
            </li>
            <li>
              <code className="text-amber-200/90">validate_menu_protocol</code> — validate MP JSON before publish
            </li>
          </ul>
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

        <section className="mb-10 rounded-xl border border-zinc-800 bg-zinc-900/50 p-6">
          <h2 className="text-xl font-medium mb-3">Tool errors</h2>
          <p className="text-sm text-zinc-400 mb-3">
            Failed tool calls return <code className="text-zinc-300">_meta.error</code> with{" "}
            <code className="text-zinc-300">code</code>, <code className="text-zinc-300">hint</code>, and{" "}
            <code className="text-zinc-300">retryable</code> so agents can self-correct.
          </p>
          <p className="text-xs font-mono text-zinc-500">
            VALIDATION_ERROR · NOT_FOUND · UPSTREAM
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
