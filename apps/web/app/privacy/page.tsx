import type { Metadata } from "next";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Privacy Policy | foodnear.me",
  description:
    "Privacy Policy for foodnear.me — how we collect, use, and protect data for our restaurant discovery platform and API.",
};

export default function PrivacyPage() {
  return (
    <LegalDocument
      crumb="privacy"
      title="Privacy Policy"
      summary="How foodnear.me collects, uses, stores, and shares information when you use our site, API, and MCP services."
      updated="May 19, 2026"
    >
      <h2>1. Who we are</h2>
      <p>
        foodnear.me (&quot;we,&quot; &quot;us&quot;) operates AI-native restaurant
        discovery infrastructure, including public websites, APIs, and MCP
        endpoints. Contact: <a href="mailto:api@foodnear.me">api@foodnear.me</a>.
      </p>

      <h2>2. Information we collect</h2>
      <p>Depending on how you interact with the service, we may collect:</p>
      <ul>
        <li>
          <strong>Lead and waitlist data:</strong> restaurant name, city, email,
          and source tag when you submit an ADO audit or contact form.
        </li>
        <li>
          <strong>Technical logs:</strong> IP address, user agent, request paths,
          timestamps, and error diagnostics for security and rate limiting.
        </li>
        <li>
          <strong>API/MCP usage metadata:</strong> query parameters (e.g. location,
          search terms), rate-limit counters, and aggregated usage patterns.
        </li>
        <li>
          <strong>Restaurant partner data:</strong> business details, menus, and
          verification records provided by participating restaurants.
        </li>
      </ul>
      <p>
        We do not intentionally collect sensitive categories (health diagnoses,
        government IDs) through public beta forms. Do not submit them.
      </p>

      <h2>3. How we use information</h2>
      <ul>
        <li>Provide, secure, and improve discovery, API, and MCP services.</li>
        <li>Respond to audit requests, support inquiries, and onboarding.</li>
        <li>Enforce rate limits, prevent abuse, and maintain system integrity.</li>
        <li>Measure product usage and plan capacity (aggregated where possible).</li>
        <li>Comply with legal obligations and enforce our Terms of Service.</li>
      </ul>

      <h2>4. Legal bases (where applicable)</h2>
      <p>
        For users in regions with data-protection laws (e.g. GDPR, UK GDPR), we
        rely on: (a) consent for marketing communications where required; (b)
        legitimate interests in operating and securing the platform; and (c)
        contractual necessity when providing services to restaurant partners.
      </p>

      <h2>5. Sharing and processors</h2>
      <p>We may share data with service providers that help us operate, including:</p>
      <ul>
        <li>Hosting and deployment (e.g. Vercel)</li>
        <li>Database and authentication (e.g. Supabase)</li>
        <li>Email delivery (e.g. Resend), when configured for lead notifications</li>
      </ul>
      <p>
        We do not sell personal information. We may disclose information if
        required by law, to protect rights and safety, or in connection with a
        merger or acquisition with appropriate safeguards.
      </p>

      <h2>6. Retention</h2>
      <p>
        Lead records are retained while relevant to onboarding and communication,
        unless you request deletion or a shorter period is required by law. Server
        logs are retained for a limited period for security and debugging, then
        rotated or aggregated.
      </p>

      <h2>7. Security</h2>
      <p>
        We use industry-standard measures including encrypted transport (HTTPS),
        access controls, and separation of public vs. service credentials.
        No method of transmission or storage is 100% secure.
      </p>

      <h2>8. Your choices and rights</h2>
      <p>
        Depending on your location, you may have rights to access, correct,
        delete, or restrict processing of your personal data, or to object to
        certain processing. To exercise these rights, email{" "}
        <a href="mailto:api@foodnear.me">api@foodnear.me</a> with
        &quot;Privacy request&quot; in the subject line.
      </p>

      <h2>9. AI agents and public discovery files</h2>
      <p>
        We publish machine-readable discovery assets (e.g. llms.txt, OpenAPI,
        MCP manifests) intended for AI systems. These describe public capabilities
        and documentation links — not private user data. Agent queries to our API
        may be logged as described above.
      </p>

      <h2>10. Children</h2>
      <p>
        The service is not directed to children under 13 (or 16 where applicable).
        We do not knowingly collect data from children.
      </p>

      <h2>11. International transfers</h2>
      <p>
        Data may be processed in the United States and other countries where our
        providers operate. We use appropriate safeguards where required for
        cross-border transfers.
      </p>

      <h2>12. Changes</h2>
      <p>
        We will post updates on this page with a revised date. Material changes
        may also be communicated via email to registered leads where appropriate.
      </p>

      <p className="legal-note">
        This Privacy Policy is a beta-stage template. Consult qualified privacy
        counsel before treating it as complete for regulated markets.
      </p>
    </LegalDocument>
  );
}
