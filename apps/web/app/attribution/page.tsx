import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Data Attribution | foodnear.me",
  description:
    "Open data sources and licenses for discovered restaurant listings on foodnear.me — OpenStreetMap, NYC Open Data, and owner-verified Menu Protocol data.",
};

export default function AttributionPage() {
  return (
    <LegalDocument
      crumb="attribution"
      title="Data Attribution"
      summary="How we source discovered restaurant listings, what licenses apply, and how that differs from owner-verified Menu Protocol menus."
      updated="May 20, 2026"
    >
      <h2>1. Two layers of data</h2>
      <p>
        foodnear.me combines <strong>discovered</strong> listings (public open
        data) with <strong>verified</strong> listings (owner-approved Menu
        Protocol menus). They are not the same trust level.
      </p>
      <ul>
        <li>
          <strong>Discovered</strong> — name, location, and basic attributes
          imported from third-party open datasets. Menus are{" "}
          <strong>not</strong> owner-verified unless stated otherwise.
        </li>
        <li>
          <strong>Verified</strong> — restaurant operators approve structured
          menu data published through Menu Protocol. Agent search ranks verified
          venues first; use <code>menu_available</code> on API and MCP results
          before calling <code>get_menu</code>.
        </li>
      </ul>

      <h2>2. OpenStreetMap</h2>
      <p>
        Many discovered listings include data ©{" "}
        <a
          href="https://www.openstreetmap.org/copyright"
          rel="noopener noreferrer"
        >
          OpenStreetMap contributors
        </a>
        .
      </p>
      <ul>
        <li>
          <strong>License:</strong> Open Database License (ODbL) 1.0 — see{" "}
          <a
            href="https://opendatacommons.org/licenses/odbl/"
            rel="noopener noreferrer"
          >
            Open Data Commons ODbL summary
          </a>
        </li>
        <li>
          <strong>How we use it:</strong> restaurant and food-related points of
          interest (amenities such as restaurants, cafés, bars, and similar
          tags) via the public Overpass API, filtered by geographic region.
        </li>
        <li>
          <strong>Limitations:</strong> community-maintained data may be
          incomplete, outdated, or include closed venues. We do not treat OSM as
          a source of authoritative menus or prices.
        </li>
      </ul>
      <p>
        If you use foodnear.me data in your own product or research, you must
        comply with OSM&apos;s attribution and ODbL requirements for any
        OpenStreetMap-derived content you redistribute.
      </p>

      <h2>3. NYC Open Data</h2>
      <p>
        Listings in the New York City area may include attributes from the City
        of New York&apos;s open data program, including restaurant inspection
        results.
      </p>
      <ul>
        <li>
          <strong>Dataset:</strong>{" "}
          <a
            href="https://data.cityofnewyork.us/City-Government/DOHMH-New-York-City-Restaurant-Inspection-Results/43nn-pn8j"
            rel="noopener noreferrer"
          >
            DOHMH New York City Restaurant Inspection Results
          </a>{" "}
          (CAMIS identifiers used as stable record keys where applicable)
        </li>
        <li>
          <strong>Typical fields:</strong> business name, location, cuisine
          description, and inspection grade when available
        </li>
        <li>
          <strong>Portal:</strong>{" "}
          <a href="https://opendata.cityofnewyork.us/" rel="noopener noreferrer">
            NYC Open Data
          </a>
        </li>
      </ul>
      <p>
        NYC data is used to enrich discovered listings in NYC boroughs; it does
        not replace owner-verified menu content.
      </p>

      <h2>4. Other regions (Tier 1 metros)</h2>
      <p>
        Outside NYC, discovered coverage is primarily from OpenStreetMap per
        metro bounding boxes (for example Los Angeles, Chicago, Houston, Austin,
        and other Tier 1 US markets). As we add municipal open-data feeds for
        additional cities, we will list them on this page.
      </p>

      <h2>5. Verified menus (Menu Protocol)</h2>
      <p>
        Menu Protocol (MP) documents submitted and approved by restaurant
        operators are <strong>separate</strong> from OSM and NYC Open Data.
        They are governed by your agreement with foodnear.me and our{" "}
        <Link href="/terms">Terms of Service</Link>, not by ODbL.
      </p>

      <h2>6. API, MCP, and agents</h2>
      <p>
        Search responses include <code>verification_status</code>,{" "}
        <code>menu_available</code>, and <code>data_source</code> where
        applicable. Discovered results include a trust notice advising agents
        not to cite menu items without owner verification. See our{" "}
        <a href="https://foodnear.me/.well-known/mcp-server.json">MCP server</a>{" "}
        and <a href="https://foodnear.me/openapi.json">OpenAPI</a> specifications.
      </p>

      <h2>7. Corrections and claims</h2>
      <p>
        Restaurant operators can claim a discovered listing and publish verified
        menu data:
      </p>
      <ul>
        <li>
          Use the claim link on a listing or visit{" "}
          <Link href="/pricing">pricing</Link> / <Link href="/support">support</Link>{" "}
          to get started
        </li>
        <li>
          To report inaccurate location data or request removal, contact{" "}
          <a href="mailto:api@foodnear.me">api@foodnear.me</a>
        </li>
      </ul>

      <h2>8. Changes</h2>
      <p>
        We may update this page when we add data sources or change import
        regions. The &quot;updated&quot; date at the top reflects the latest
        revision.
      </p>

      <p className="legal-note">
        This page summarizes attribution requirements for beta operations. It is
        not legal advice. Consult qualified counsel for compliance in your
        jurisdiction, especially if you redistribute combined datasets.
      </p>
    </LegalDocument>
  );
}
