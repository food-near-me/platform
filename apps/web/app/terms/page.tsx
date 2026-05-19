import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Terms of Service | foodnear.me",
  description:
    "Terms of Service for foodnear.me — Menu Protocol infrastructure, API access, and beta restaurant discovery services.",
};

export default function TermsPage() {
  return (
    <LegalDocument
      crumb="terms"
      title="Terms of Service"
      summary="These terms govern use of foodnear.me, our API, MCP server, and beta restaurant discovery services."
      updated="May 19, 2026"
    >
      <h2>1. Agreement</h2>
      <p>
        By accessing foodnear.me, submitting a lead form, or using our API or MCP
        endpoints, you agree to these Terms of Service (&quot;Terms&quot;). If you
        do not agree, do not use the service.
      </p>

      <h2>2. Service description</h2>
      <p>
        foodnear.me provides AI-native restaurant discovery infrastructure,
        including the Menu Protocol (MP), Agent Discovery Optimization (ADO),
        public APIs, and an MCP server for AI agents. The service is currently
        offered in <strong>beta</strong>. Features, availability, and pricing may
        change without notice.
      </p>
      <ul>
        <li>
          We do not operate a full food ordering or delivery marketplace in beta.
        </li>
        <li>
          Menu and restaurant data may be incomplete, outdated, or subject to
          verification status labels (discovered, menu_indexed, verified).
        </li>
        <li>
          Only data marked verified and owner-approved should be treated as
          authoritative for operational decisions.
        </li>
      </ul>

      <h2>3. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>Abuse API or MCP endpoints (scraping beyond documented limits, DDoS, credential stuffing).</li>
        <li>Attempt to bypass rate limits, authentication, or security controls.</li>
        <li>Misrepresent affiliation with foodnear.me or restaurant partners.</li>
        <li>Use the service for unlawful purposes or to publish harmful content.</li>
        <li>Reverse engineer or resell access in violation of applicable law or these Terms.</li>
      </ul>

      <h2>4. Restaurant and menu data</h2>
      <p>
        Dietary flags, allergen fields, and menu items are provided for discovery
        and agent-readability. <strong>They are not medical or safety guarantees.</strong>{" "}
        Consumers with allergies or strict dietary requirements must confirm details
        directly with the restaurant before ordering or visiting.
      </p>
      <p>
        Restaurants remain responsible for the accuracy of menu information they
        approve for publication through Menu Protocol.
      </p>

      <h2>5. Lead forms and communications</h2>
      <p>
        When you submit an ADO audit or waitlist request, you provide contact
        information so we can respond about foodnear.me services. You represent that
        the information is accurate and that you have authority to share it.
      </p>

      <h2>6. API and MCP access</h2>
      <p>
        Public beta endpoints may be rate-limited. We may require API keys, usage
        tiers, or paid access (including x402 or other payment rails) in the
        future. Continued access is not guaranteed during beta.
      </p>

      <h2>7. Intellectual property</h2>
      <p>
        The foodnear.me brand, site design, and proprietary tooling are owned by
        the project operators. Menu Protocol specifications intended as open
        standards may be published under separate license terms. Third-party
        trademarks (restaurant names, cuisines) belong to their respective owners.
      </p>

      <h2>8. Disclaimers</h2>
      <p>
        THE SERVICE IS PROVIDED &quot;AS IS&quot; AND &quot;AS AVAILABLE&quot; WITHOUT
        WARRANTIES OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING MERCHANTABILITY,
        FITNESS FOR A PARTICULAR PURPOSE, AND NON-INFRINGEMENT. WE DO NOT
        WARRANT UNINTERRUPTED OR ERROR-FREE OPERATION.
      </p>

      <h2>9. Limitation of liability</h2>
      <p>
        TO THE MAXIMUM EXTENT PERMITTED BY LAW, FOODNEAR.ME AND ITS OPERATORS
        WILL NOT BE LIABLE FOR INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR
        PUNITIVE DAMAGES, OR FOR ANY LOSS ARISING FROM RELIANCE ON MENU,
        ALLERGEN, OR LOCATION DATA. OUR TOTAL LIABILITY FOR ANY CLAIM RELATING
        TO THE SERVICE IS LIMITED TO THE GREATER OF USD $100 OR THE AMOUNT YOU
        PAID US IN THE TWELVE MONTHS BEFORE THE CLAIM.
      </p>

      <h2>10. Changes</h2>
      <p>
        We may update these Terms. Material changes will be reflected on this
        page with an updated date. Continued use after changes constitutes
        acceptance.
      </p>

      <h2>11. Contact</h2>
      <p>
        Questions about these Terms:{" "}
        <a href="mailto:api@foodnear.me">api@foodnear.me</a> or our{" "}
        <a href="/support">support page</a>.
      </p>

      <p className="legal-note">
        This document is provided for beta operations and is not legal advice.
        Consult qualified counsel before relying on it for compliance in your
        jurisdiction.
      </p>
    </LegalDocument>
  );
}
