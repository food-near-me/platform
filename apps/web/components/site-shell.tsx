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
  const resolvedCrumb = crumb ?? (isConsumer ? "near me" : "for restaurants");
  const resolvedMobileHref =
    mobileCtaHref ?? (isConsumer ? "#near-me" : "#launch-offer");
  const resolvedMobileLabel =
    mobileCtaLabel ?? (isConsumer ? "Find food nearby" : "Get free ADO audit");
  const resolvedShowMobile = showMobileCta ?? (isConsumer ? false : true);

  return (
    <>
      <div className="bg-atmosphere" aria-hidden />
      <div className="bg-orb bg-orb-a" aria-hidden />
      <div className="bg-orb bg-orb-b" aria-hidden />
      <div className={`shell${isConsumer ? " shell-consumer" : " shell-b2b"}`}>
        <header className="topbar">
          <Link href="/" className="brand">
            <span className="brand-mark" aria-hidden>
              fn
            </span>
            <span className="brand-word">
              foodnear<span className="brand-dot">.</span>me
            </span>
          </Link>
          {!isConsumer && (
            <span className="crumb">
              / <b>{resolvedCrumb}</b>
            </span>
          )}
          <span className="spacer" />
          {isConsumer ? (
            <>
              <Link href="/#near-me" className="nav-link">
                Find food
              </Link>
              <Link href="/for-restaurants" className="nav-cta hide-sm">
                For restaurants
              </Link>
            </>
          ) : (
            <>
              <span className="pill hide-sm">
                <span className="dot live" aria-hidden />
                agent-ready
              </span>
              <Link href="/" className="nav-link">
                Near me
              </Link>
              <Link href="/pricing" className="nav-link">
                Pricing
              </Link>
            </>
          )}
        </header>
        <main className="page">{children}</main>
        <footer className="foot">
          <span>© {new Date().getFullYear()} foodnear.me</span>
          <span className="foot-links">
            <Link href="/for-restaurants">Restaurants</Link>
            <Link href="/pricing">Pricing</Link>
            <Link href="/docs">Docs</Link>
            <Link href="/terms">Terms</Link>
            <Link href="/privacy">Privacy</Link>
            <Link href="/support">Support</Link>
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
