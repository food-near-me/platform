import Link from "next/link";
import { DemandSignal } from "@/components/demand-signal";
import { HeroVariant } from "@/components/hero-variant";
import { LeadForm } from "@/components/lead-form";
import { SiteShell } from "@/components/site-shell";

export default function Home() {
  return (
    <SiteShell>
      <HeroVariant />
      <DemandSignal />

      <section className="section" id="comparison">
        <div className="section-head">
          <p className="label">02 · routing</p>
          <h2>
            The path <em>changes</em>
          </h2>
          <p className="lede">
            Delivery platforms extracted margin and customer relationships. Agent
            infrastructure returns both to the restaurant.
          </p>
        </div>
        <div className="section-body full">
          <div className="flow-strip">
            <article className="flow-card before">
              <p className="flow-label">
                <span
                  className="dot"
                  style={{ background: "var(--err)", boxShadow: "none" }}
                  aria-hidden
                />
                Current state
              </p>
              <p className="flow-path">
                Human → Google search → Ad results → DoorDash →{" "}
                <strong>20–30% fee</strong>
              </p>
            </article>
            <article className="flow-card after">
              <p className="flow-label">
                <span className="dot live" aria-hidden />
                Future state
              </p>
              <p className="flow-path">
                Human → AI agent →{" "}
                <span className="hl">foodnear.me API</span> → Restaurant →{" "}
                <strong>5–10% commission</strong>
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="label">03 · thesis</p>
          <h2>
            Why this <em>wins</em>
          </h2>
        </div>
        <div className="section-body full">
          <div className="card-grid">
            <article className="card">
              <h3>Core messaging</h3>
              <ul>
                <li>ADO is the new SEO — get found by agents, not just Google</li>
                <li>Pay 5–10% instead of 20–30%</li>
                <li>You own your customer relationship</li>
                <li>Stop paying platforms to own your customers</li>
              </ul>
            </article>
            <article className="card">
              <h3>Market data</h3>
              <ul>
                <li>362M+ registered domains globally</li>
                <li>$360B+ domain asset class</li>
                <li>20–30% extracted by legacy delivery apps</li>
                <li>$0.001 per agent API call via x402</li>
              </ul>
            </article>
            <article className="card">
              <h3>Moat</h3>
              <ul>
                <li>Open Menu Protocol (schema-level advantage)</li>
                <li>Agent-native API + x402 machine payments</li>
                <li>Faster settlement — seconds vs days</li>
                <li>Infrastructure layer, not another app</li>
              </ul>
            </article>
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="label">04 · protocol</p>
          <h2>
            Built different <em>by design</em>
          </h2>
        </div>
        <div className="section-body full">
          <div className="moat-grid">
            <div className="moat-cell">
              <p className="moat-tag">Menu Protocol</p>
              <h3>Schema-level moat</h3>
              <p>
                Agents prefer structured, reliable data over scraped PDFs and
                broken HTML.
              </p>
            </div>
            <div className="moat-cell">
              <p className="moat-tag">ADO</p>
              <h3>The new SEO</h3>
              <p>
                Compete on machine-readability and response quality, not ad
                spend.
              </p>
            </div>
            <div className="moat-cell">
              <p className="moat-tag">x402</p>
              <h3>Payments for agents</h3>
              <p>
                Machine-to-machine micropayments as low as $0.001 per API call.
              </p>
            </div>
            <div className="moat-cell">
              <p className="moat-tag">Layer 0</p>
              <h3>Infrastructure positioning</h3>
              <p>
                Not another delivery app. A protocol where apps and agents route
                demand.
              </p>
            </div>
          </div>
        </div>
      </section>

      <section className="section" id="launch-offer">
        <div className="section-head">
          <p className="label">05 · launch</p>
          <h2>
            Free ADO <em>audit</em>
          </h2>
          <p className="lede">
            Menu Protocol validation plus a fee-savings projection — see exactly
            how you rank in agent-driven discovery.
          </p>
        </div>
        <div className="section-body full">
          <div className="launch-panel">
            <div className="launch-tags">
              <span className="tag">Free ADO audit</span>
              <span className="tag">Menu Protocol score</span>
              <span className="tag">Fee savings projection</span>
            </div>
            <LeadForm />
          </div>
        </div>
      </section>

      <section className="section">
        <div className="section-body full">
          <div className="token-teaser">
            <div>
              <p className="label" style={{ margin: 0 }}>
                06 · alignment
              </p>
              <h2 style={{ margin: "8px 0 0", fontSize: 22, fontWeight: 500 }}>
                Domain tokenization
              </h2>
              <p>
                Financing and alignment for long-term build-out — not the
                primary message. Restaurants first: lower fees, agent discovery,
                customer ownership.
              </p>
            </div>
            <Link href="/tokenization" className="btn btn-ghost">
              Read model →
            </Link>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
