import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Domain tokenization | foodnear.me",
  description:
    "How foodnear.me uses domain tokenization for aligned incentives and growth capital without changing core restaurant value.",
};

export default function TokenizationPage() {
  return (
    <SiteShell crumb="tokenization">
      <section className="hero" style={{ paddingBottom: "var(--space-6)" }}>
        <p className="eyebrow">
          <span>06 · alignment</span>
          <span className="commit">growth layer</span>
        </p>
        <h1>
          Tokenization <span className="quiet">supports growth.</span>
          <br />
          <span className="accent">Not product value.</span>
        </h1>
        <p className="sub">
          For <b>foodnear.me</b>, tokenization is financing and alignment for
          long-term infrastructure — core value stays lower fees, agent discovery,
          and direct customer ownership.
        </p>
        <div className="hero-actions">
          <Link href="/" className="btn btn-ghost">
            ← Back to homepage
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-body full">
          <div className="flow-strip">
            <article className="flow-card before">
              <p className="flow-label">
                <span
                  className="dot"
                  style={{ background: "var(--warn)", boxShadow: "none" }}
                  aria-hidden
                />
                What changes
              </p>
              <p className="flow-path">
                Optional fractional capital · holder alignment · on-chain revenue
                distribution
              </p>
            </article>
            <article className="flow-card after">
              <p className="flow-label">
                <span className="dot live" aria-hidden />
                What stays the same
              </p>
              <p className="flow-path">
                Restaurant-first homepage · operational GTM focus ·{" "}
                <span className="hl">5–10% not 20–30%</span>
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="label">strategy</p>
          <h2>
            Homepage <em>placement</em>
          </h2>
          <p className="lede">
            Keep tokenization as a short credibility section with a link here.
            Lead with immediate operator value: fee savings, AI discovery, customer
            ownership.
          </p>
        </div>
      </section>
    </SiteShell>
  );
}
