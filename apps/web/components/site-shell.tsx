import Link from "next/link";
import type { ReactNode } from "react";

type SiteShellProps = {
  children: ReactNode;
  crumb?: string;
  mobileCtaHref?: string;
  mobileCtaLabel?: string;
};

export function SiteShell({
  children,
  crumb = "infrastructure",
  mobileCtaHref = "#launch-offer",
  mobileCtaLabel = "Get free ADO audit",
}: SiteShellProps) {
  return (
    <>
      <div className="bg-glow" aria-hidden />
      <div className="bg-grid" aria-hidden />
      <div className="scanlines" aria-hidden />
      <div className="shell">
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              FNM
            </span>
            <span>
              foodnear<span style={{ color: "var(--accent)" }}>.</span>me
            </span>
          </Link>
          <span className="crumb">
            / <b>{crumb}</b>
          </span>
          <span className="spacer" />
          <span className="pill hide-sm">
            <span className="dot live" aria-hidden />
            agent-ready
          </span>
          <Link href="/tokenization" className="nav-link">
            tokenization
          </Link>
          <Link href="/pricing" className="nav-link">
            pricing
          </Link>
        </header>
        <main className="page">{children}</main>
        <footer className="foot">
          <span>© {new Date().getFullYear()} foodnear.me · Menu Protocol v1.0</span>
          <span>
            <Link href="/terms">terms</Link>
            {" · "}
            <Link href="/privacy">privacy</Link>
            {" · "}
            <Link href="/support">support</Link>
            {" · "}
            <a href="https://foodnear.me/openapi.json">openapi</a>
            {" · "}
            <a href="https://foodnear.me/.well-known/mcp-server.json">mcp</a>
            {" · "}
            <a href="mailto:api@foodnear.me">api@foodnear.me</a>
          </span>
        </footer>
      </div>
      <div className="mobile-cta">
        <a href={mobileCtaHref} className="btn">
          {mobileCtaLabel}
        </a>
      </div>
    </>
  );
}
