import type { Metadata } from "next";
import Link from "next/link";
import { PricingInterestForm } from "@/components/pricing-interest-form";
import { SiteShell } from "@/components/site-shell";

export const metadata: Metadata = {
  title: "Pricing | foodnear.me",
  description:
    "Free verified listings for single-location operators. Paid plans for visibility, analytics, multi-location management, and API access.",
};

const plans = [
  {
    name: "Community",
    price: "Free",
    cadence: "for one location",
    tag: "Start here",
    description:
      "A verified place in the agent-readable food map for independent operators.",
    features: [
      "1 verified restaurant, truck, bodega, or stall",
      "Hosted Menu Protocol endpoint",
      "Searchable in MCP and REST API",
      "Basic ADO score snapshot",
    ],
    cta: "Claim free listing",
    href: "#pricing-intake",
  },
  {
    name: "Pro",
    price: "$49",
    cadence: "/mo early access",
    tag: "Recommended",
    description:
      "For operators who want to improve how agents understand and rank their menu.",
    features: [
      "Everything in Community",
      "ADO improvement checklist",
      "Priority visibility signals",
      "Menu Protocol badge",
      "Monthly menu update support",
    ],
    cta: "Get Pro early access",
    href: "#pricing-intake",
    featured: true,
  },
  {
    name: "Multi-location",
    price: "$199+",
    cadence: "/mo",
    tag: "2-5 locations",
    description:
      "One operator view for multiple stores, trucks, or concepts in the same market.",
    features: [
      "Shared dashboard across locations",
      "Bulk menu updates",
      "Location-level analytics",
      "Cross-location ADO tracking",
    ],
    cta: "Talk to us",
    href: "#pricing-intake",
  },
  {
    name: "Enterprise / API",
    price: "Custom",
    cadence: "volume-based",
    tag: "Integrations",
    description:
      "For platforms, POS systems, and data partners that need structured menu access.",
    features: [
      "POS and API integrations",
      "Bulk Menu Protocol data",
      "White-label options",
      "Custom rate limits and support",
    ],
    cta: "Contact us",
    href: "mailto:api@foodnear.me?subject=Food%20Near%20Me%20Enterprise%20API",
  },
];

export default function PricingPage() {
  return (
    <SiteShell
      crumb="pricing"
      mobileCtaHref="#pricing-intake"
      mobileCtaLabel="Claim or upgrade"
    >
      <section className="hero pricing-hero">
        <p className="eyebrow">
          <span>pricing</span>
          <span className="commit">free to exist · paid to win</span>
        </p>
        <h1>
          Get on the map.
          <br />
          <span className="accent">Pay for advantage.</span>
        </h1>
        <p className="sub">
          Single-location operators can publish a verified, agent-readable menu
          for free. Paid plans unlock visibility, analytics, updates, and
          multi-location control.
        </p>
        <div className="hero-actions">
          <Link href="#pricing-intake" className="btn">
            Choose a path
          </Link>
          <Link href="/" className="btn btn-ghost">
            See infrastructure
          </Link>
        </div>
      </section>

      <section className="section">
        <div className="section-head">
          <p className="label">01 · model</p>
          <h2>
            Four plans, <em>one clear rule</em>
          </h2>
          <p className="lede">
            We do not charge small operators just to be present. We charge when
            the product creates leverage: better visibility, repeated updates,
            analytics, multiple locations, or API-scale use.
          </p>
        </div>
        <div className="section-body full">
          <div className="pricing-grid">
            {plans.map((plan) => (
              <article
                key={plan.name}
                className={`pricing-card${plan.featured ? " featured" : ""}`}
              >
                <div className="pricing-card-top">
                  <span className="tag">{plan.tag}</span>
                  <h3>{plan.name}</h3>
                  <p>{plan.description}</p>
                </div>
                <div className="price-line">
                  <span className="price">{plan.price}</span>
                  <span className="cadence">{plan.cadence}</span>
                </div>
                <ul>
                  {plan.features.map((feature) => (
                    <li key={feature}>{feature}</li>
                  ))}
                </ul>
                <a
                  href={plan.href}
                  className={plan.featured ? "btn" : "btn btn-ghost"}
                >
                  {plan.cta}
                </a>
              </article>
            ))}
          </div>
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
                Free layer
              </p>
              <p className="flow-path">
                1 verified location · hosted menu.mp · searchable by agents
              </p>
            </article>
            <article className="flow-card after">
              <p className="flow-label">
                <span className="dot live" aria-hidden />
                Paid layer
              </p>
              <p className="flow-path">
                Better ADO · analytics · updates · multi-location management ·
                <span className="hl"> API scale</span>
              </p>
            </article>
          </div>
        </div>
      </section>

      <section className="section" id="pricing-intake">
        <div className="section-head">
          <p className="label">02 · onboarding</p>
          <h2>
            Pick the <em>right lane</em>
          </h2>
          <p className="lede">
            Tell us which path fits your business. We will use this to route you
            into free listing setup, Pro early access, multi-location onboarding,
            or API/partner discussions.
          </p>
        </div>
        <div className="section-body full">
          <div className="launch-panel">
            <div className="launch-tags">
              <span className="tag">Community free</span>
              <span className="tag">Pro $49 early</span>
              <span className="tag">Multi-location $199+</span>
              <span className="tag">Enterprise/API custom</span>
            </div>
            <PricingInterestForm />
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
