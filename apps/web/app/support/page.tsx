import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Support | foodnear.me",
  description:
    "Get help with foodnear.me — ADO audits, Menu Protocol onboarding, API access, and MCP integration.",
};

export default function SupportPage() {
  return (
    <LegalDocument
      crumb="support"
      title="Support"
      summary="Help for restaurant operators, developers, and AI integrators using foodnear.me and Menu Protocol."
      updated="May 19, 2026"
    >
      <h2>Contact</h2>
      <p>
        Email us at{" "}
        <a href="mailto:api@foodnear.me">api@foodnear.me</a>. We respond to
        beta partners and integration questions as quickly as we can — typically
        within 2–3 business days.
      </p>
      <p>
        For ADO audit requests, you can also use the{" "}
        <Link href="/#launch-offer">homepage lead form</Link>.
      </p>

      <h2>Who we help</h2>
      <ul>
        <li>
          <strong>Restaurant operators</strong> — Menu Protocol onboarding, ADO
          scoring, verification, and beta listing questions.
        </li>
        <li>
          <strong>Developers &amp; agents</strong> — REST API, OpenAPI spec, MCP
          tools, rate limits, and integration patterns.
        </li>
        <li>
          <strong>Partners</strong> — Data accuracy reports, takedown requests,
          and co-marketing during beta.
        </li>
      </ul>

      <h2>Developer resources</h2>
      <ul>
        <li>
          <a href="/openapi.json">OpenAPI 3.1 specification</a>
        </li>
        <li>
          <a href="/SKILL.md">SKILL.md</a> — agent usage guide
        </li>
        <li>
          <a href="/llms.txt">llms.txt</a> — project overview for LLMs
        </li>
        <li>
          <a href="/.well-known/mcp-server.json">MCP server manifest</a>
        </li>
        <li>
          MCP endpoint: <code>POST /mcp</code> (JSON-RPC 2.0)
        </li>
        <li>
          Source code:{" "}
          <a
            href="https://github.com/food-near-me/platform"
            rel="noopener noreferrer"
            target="_blank"
          >
            github.com/food-near-me/platform
          </a>
        </li>
      </ul>

      <h2>Common questions</h2>
      <p>
        <strong>Is foodnear.me a delivery app?</strong> No. We are discovery and
        Menu Protocol infrastructure for the agentic web — not a full ordering
        or logistics platform in beta.
      </p>
      <p>
        <strong>Can I trust allergen and dietary flags?</strong> Verified,
        owner-approved menus are the authoritative tier. Always confirm critical
        dietary needs directly with the restaurant.
      </p>
      <p>
        <strong>How do I get my restaurant listed?</strong> Submit an ADO audit
        request on the homepage or email us with your restaurant name, city, and
        a contact email.
      </p>
      <p>
        <strong>API rate limits?</strong> Public beta endpoints are rate-limited
        per IP and email. Higher limits and API keys will be announced as we
        exit beta.
      </p>

      <h2>Report an issue</h2>
      <p>
        For incorrect menu data, security concerns, or abuse: email{" "}
        <a href="mailto:api@foodnear.me">api@foodnear.me</a> with
        &quot;Security&quot; or &quot;Data correction&quot; in the subject. Include
        the restaurant ID or URL and steps to reproduce if applicable.
      </p>

      <h2>Legal</h2>
      <p>
        See our <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </LegalDocument>
  );
}
