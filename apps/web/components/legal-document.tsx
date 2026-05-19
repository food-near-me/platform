import Link from "next/link";
import type { ReactNode } from "react";
import { SiteShell } from "@/components/site-shell";

type LegalDocumentProps = {
  crumb: string;
  title: string;
  summary: string;
  updated: string;
  children: ReactNode;
};

export function LegalDocument({
  crumb,
  title,
  summary,
  updated,
  children,
}: LegalDocumentProps) {
  return (
    <SiteShell crumb={crumb}>
      <section className="hero legal-hero">
        <p className="eyebrow">
          <span>legal</span>
          <span className="commit">updated {updated}</span>
        </p>
        <h1>{title}</h1>
        <p className="sub">{summary}</p>
        <div className="hero-actions">
          <Link href="/" className="btn btn-ghost">
            ← Back to homepage
          </Link>
        </div>
      </section>
      <section className="section">
        <div className="section-body full">
          <article className="legal-doc">{children}</article>
        </div>
      </section>
    </SiteShell>
  );
}
