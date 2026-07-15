import Link from "next/link";
import type { ReactNode } from "react";

type SiteShellProps = {
  children: ReactNode;
  crumb?: string;
  /** consumer = diner-facing nav; restaurants = B2B pitch nav */
  variant?: "consumer" | "restaurants";
  mobileCtaHref?: string;
  mobileCtaLabel?: string;
  showMobileCta?: boolean;
};

export function SiteShell({
  children,
  crumb,
  variant = "consumer",
  mobileCtaHref,
  mobileCtaLabel,
  showMobileCta,
}: SiteShellProps) {
  const isConsumer = variant === "consumer";
  const resolvedCrumb = crumb ?? (isConsumer ? "near me" : "infrastructure");
  const resolvedMobileHref =
    mobileCtaHref ?? (isConsumer ? "#near-me" : "#launch-offer");
  const resolvedMobileLabel =
    mobileCtaLabel ?? (isConsumer ? "Find food nearby" : "Get free ADO audit");
  const resolvedShowMobile =
    showMobileCta ?? (isConsumer ? false : true);

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
            / <b>{resolvedCrumb}</b>
          </span>
          <span className="spacer" />
          {isConsumer ? (
            <>
              <Link href="/for-restaurants" className="nav-link hide-sm">
                for restaurants
              </Link>
              <Link href="/docs" className="nav-link hide-sm">
                docs
              </Link>
            </>
          ) : (
            <>
              <span className="pill hide-sm">
                <span className="dot live" aria-hidden />
                agent-ready
              </span>
              <Link href="/" className="nav-link">
                near me
              </Link>
              <Link href="/pricing" className="nav-link">
                pricing
              </Link>
            </>
          )}
        </header>
        <main className="page">{children}</main>
        <footer className="foot">
          <span>© {new Date().getFullYear()} foodnear.me</span>
          <span>
            <Link href="/for-restaurants">restaurants</Link>
            {" · "}
            <Link href="/pricing">pricing</Link>
            {" · "}
            <Link href="/docs">docs</Link>
            {" · "}
            <Link href="/terms">terms</Link>
            {" · "}
            <Link href="/privacy">privacy</Link>
            {" · "}
            <Link href="/attribution">attribution</Link>
            {" · "}
            <Link href="/support">support</Link>
            {" · "}
            <a href="https://foodnear.me/.well-known/mcp-server.json">mcp</a>
          </span>
        </footer>
      </div>
      {resolvedShowMobile ? (
        <div className="mobile-cta">
          <a href={resolvedMobileHref} className="btn">
            {resolvedMobileLabel}
          </a>
        </div>
      ) : null}
    </>
  );
}
