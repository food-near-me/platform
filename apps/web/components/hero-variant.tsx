"use client";

import Link from "next/link";
import { useMemo, useState } from "react";

type Audience = "restaurants" | "investors";

const COPY: Record<
  Audience,
  {
    headline: [string, string, string];
    body: string;
    cta: string;
  }
> = {
  restaurants: {
    headline: ["Get found", "by agents.", "Not ads."],
    body: "Replace SEO guesswork and 20–30% delivery fees with Agent Discovery Optimization and Menu Protocol — structured menus machines can trust.",
    cta: "Get free ADO audit",
  },
  investors: {
    headline: ["Infrastructure", "for agentic", "commerce."],
    body: "Open menu standards, agent-native payments, and token-aligned growth — a defensible layer beneath every food app and LLM.",
    cta: "View tokenization model",
  },
};

export function HeroVariant() {
  const [audience, setAudience] = useState<Audience>("restaurants");
  const copy = useMemo(() => COPY[audience], [audience]);

  return (
    <section className="hero">
      <div className="hero-watermark" aria-hidden>
        foodnear.me
      </div>

      <div className="hero-bar">
        <div className="audience-toggle" role="tablist" aria-label="Audience">
          <button
            type="button"
            role="tab"
            aria-selected={audience === "restaurants"}
            className={audience === "restaurants" ? "active" : ""}
            onClick={() => setAudience("restaurants")}
          >
            Restaurant owners
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={audience === "investors"}
            className={audience === "investors" ? "active" : ""}
            onClick={() => setAudience("investors")}
          >
            Investors
          </button>
        </div>
        <p className="eyebrow">
          <span>Agent Discovery Optimization</span>
          <span className="commit">Beta</span>
        </p>
      </div>

      <h1>
        <span className="accent">{copy.headline[0]}</span>{" "}
        {copy.headline[1]}
        <br />
        <span className="quiet">{copy.headline[2]}</span>
      </h1>

      <p className="sub">
        <b>foodnear.me</b> — {copy.body}
      </p>

      <div className="hero-actions">
        {audience === "restaurants" ? (
          <a href="#launch-offer" className="btn">
            {copy.cta}
          </a>
        ) : (
          <Link href="/tokenization" className="btn">
            {copy.cta}
          </Link>
        )}
        <a href="#comparison" className="btn btn-ghost">
          See fee comparison
        </a>
      </div>

      <div className="hero-meta">
        <div className="cell">
          <span className="k">Commission</span>
          <span className="v">
            5–10<small>%</small>
          </span>
        </div>
        <div className="cell">
          <span className="k">Legacy apps</span>
          <span className="v">
            20–30<small>%</small>
          </span>
        </div>
        <div className="cell">
          <span className="k">API call</span>
          <span className="v">
            $0.001<small> x402</small>
          </span>
        </div>
        <div className="cell">
          <span className="k">Settlement</span>
          <span className="v">
            seconds<small> not days</small>
          </span>
        </div>
      </div>

      <div className="hero-ping">
        <span className="ping">
          <span className="dot live" aria-hidden />
          MCP server
          <span className="lat">live</span>
        </span>
        <span className="ping">
          <span className="dot" aria-hidden />
          Menu Protocol
          <span className="lat">v1.0</span>
        </span>
        <span className="ping">
          <span className="dot" aria-hidden />
          OpenAPI
          <span className="lat">3.1</span>
        </span>
      </div>
    </section>
  );
}
