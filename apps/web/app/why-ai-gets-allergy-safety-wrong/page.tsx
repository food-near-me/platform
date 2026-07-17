import type { Metadata } from "next";
import Link from "next/link";
import { LegalDocument } from "@/components/legal-document";

export const metadata: Metadata = {
  title: "Why AI gets your allergy-safety answer dangerously wrong | foodnear.me",
  description:
    "General-purpose AI assistants guess at restaurant allergy safety from scraped menus and stale reviews. Here is why that fails, and how foodnear.me handles it differently.",
  alternates: { canonical: "/why-ai-gets-allergy-safety-wrong" },
  openGraph: {
    title: "Why AI gets your allergy-safety answer dangerously wrong | foodnear.me",
    description:
      "General-purpose AI assistants guess at restaurant allergy safety from scraped menus and stale reviews. Here is why that fails, and how foodnear.me handles it differently.",
    url: "/why-ai-gets-allergy-safety-wrong",
    siteName: "foodnear.me",
    type: "article",
  },
};

export default function WhyAiGetsAllergySafetyWrongPage() {
  return (
    <LegalDocument
      crumb="allergy safety & AI"
      title="Why AI gets your allergy-safety answer dangerously wrong"
      summary="Ask a general-purpose chatbot whether a restaurant is safe for your allergy and it will answer with total confidence — from data it never verified. Here is why that fails, and what an honest answer looks like."
      updated="July 17, 2026"
    >
      <h2>1. The short version</h2>
      <p>
        A large language model does not know whether a kitchen is safe for you. It
        predicts the <em>most likely-sounding sentence</em>. When you ask{" "}
        <em>&quot;is this place safe for a peanut allergy?&quot;</em> it will often
        answer <em>&quot;yes&quot;</em> — fluently, confidently, and without any
        basis in how that specific kitchen actually handles cross-contact.
      </p>
      <p>
        For most questions, a confident guess is a minor annoyance. For a
        food-allergy answer, a confident guess is a hazard. This page explains the
        failure modes, and how we try to avoid them.
      </p>

      <h2>2. Where the answer comes from (and why that&apos;s the problem)</h2>
      <p>
        A general-purpose assistant assembles a restaurant answer from whatever it
        can find or was trained on. In practice that means:
      </p>
      <ul>
        <li>
          <strong>Scraped menus and PDFs</strong> — a &quot;gluten-free&quot; menu
          item says nothing about whether it&apos;s cooked in a shared fryer.
        </li>
        <li>
          <strong>Old reviews</strong> — a diner&apos;s good experience two years
          ago is not a protocol, and staff, ownership, and prep all change.
        </li>
        <li>
          <strong>Marketing copy</strong> — a restaurant calling itself
          &quot;allergy-friendly&quot; is a claim, not a verified practice.
        </li>
        <li>
          <strong>Statistical filler</strong> — when the model has no real
          information, it still produces a plausible sentence. That is what these
          systems are built to do.
        </li>
      </ul>
      <p>
        None of these sources describe the one thing that matters to an allergic
        diner: <strong>how this specific kitchen handles cross-contact today.</strong>{" "}
        That is a human judgment about a physical kitchen, and it is not in a
        scraped menu.
      </p>

      <h2>3. Four failure modes</h2>

      <h3>Confident fabrication (&quot;hallucination&quot;)</h3>
      <p>
        Language models generate confident, well-formed text even when they have no
        supporting facts — a documented and widely-studied behavior. An answer that{" "}
        <em>reads</em> authoritative can be entirely invented, and nothing in the
        wording tells you which one you got.
      </p>

      <h3>Stale data presented as current</h3>
      <p>
        A model&apos;s knowledge has a cutoff date, and scraped pages can be months
        or years old. A menu changes, a fryer gets shared, an allergy-aware chef
        moves on — and the answer still sounds current. It has no way to tell you
        &quot;this might be out of date.&quot;
      </p>

      <h3>&quot;Gluten-free menu&quot; ≠ &quot;safe for celiac&quot;</h3>
      <p>
        This is the failure that hurts people. A gluten-free menu item can still be
        prepared on shared surfaces, in shared fryer oil, or with shared utensils.
        A model reading the words &quot;gluten-free&quot; on a menu will happily
        report the venue as safe — conflating a menu label with a cross-contact
        protocol. Celiac disease and severe allergies turn that conflation into a
        medical event.
      </p>

      <h3>No uncertainty signal</h3>
      <p>
        The most dangerous part is tone. A guess and a verified fact are delivered
        in the same calm, fluent voice. There is no &quot;I&apos;m not sure&quot;
        by default — so a diner with a life-threatening allergy cannot tell a real
        answer from a plausible one.
      </p>

      <h2>4. How foodnear.me handles it differently</h2>
      <p>
        We are a small, curated directory covering{" "}
        <strong>Miami and Jacksonville</strong> — not a nationwide guarantee. What
        we can promise is <strong>honesty about what we actually know</strong>:
      </p>
      <ul>
        <li>
          <strong>Allergy-safety tiers are human judgment, never a scrape.</strong>{" "}
          A listing only earns a curated tier when a person has looked at how that
          kitchen handles cross-contact. We never infer a safety tier from an
          open-data tag or a menu keyword.
        </li>
        <li>
          <strong>Uncurated listings say so plainly.</strong> If we don&apos;t have
          a curated note for a place, we show &quot;No curated allergy info&quot;
          and tell you to ask the restaurant directly — we don&apos;t fill the gap
          with a guess.
        </li>
        <li>
          <strong>Our notes describe kitchen mechanism, not a verdict.</strong> A
          curated note explains <em>how</em> a kitchen handles your need (dedicated
          space, shared fryer, prep separation) so you can make your own call.
        </li>
        <li>
          <strong>We route AI agents through the same honesty.</strong> Our API and{" "}
          <a href="https://foodnear.me/.well-known/mcp-server.json">MCP server</a>{" "}
          mark uncurated results and warn agents not to cite safety details a human
          hasn&apos;t verified. See our{" "}
          <Link href="/attribution">data attribution</Link> page for how sources
          are separated.
        </li>
      </ul>

      <h2>5. What we do not claim</h2>
      <p>
        A curated tier is a starting point, not a safety guarantee. Kitchens change,
        staff change, and protocols drift. We can tell you what a kitchen told us and
        what a human observed — we cannot stand in the kitchen the day you visit.
      </p>

      <h2>6. Before you rely on any answer — AI or ours</h2>
      <ul>
        <li>Call ahead and name your specific allergy or need.</li>
        <li>
          Ask how they handle cross-contact — shared fryers, sauces, prep surfaces,
          and utensils.
        </li>
        <li>Confirm the location is open and the details still match.</li>
        <li>Re-verify day-of, even if a past visit went fine. Protocols drift.</li>
        <li>
          For celiac specifically, cross-check a dedicated resource like{" "}
          <a
            href="https://www.findmeglutenfree.com/"
            rel="noopener noreferrer"
          >
            Find Me Gluten Free
          </a>
          .
        </li>
      </ul>

      <p className="legal-note">
        foodnear.me is an honesty-first directory, not a medical or safety
        authority. Nothing here is medical advice. Curated notes describe kitchen
        mechanism, not a medical guarantee — always confirm your specific needs with
        the restaurant before dining. If you have a severe or life-threatening
        allergy, treat every online answer, including ours, as a lead to verify.
      </p>
    </LegalDocument>
  );
}
