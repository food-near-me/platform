import type { Metadata } from "next";
import Link from "next/link";
import { SiteShell } from "@/components/site-shell";
import { getSql, isDatabaseConfigured } from "@/lib/db/neon";
import { isOpsAuthed } from "@/lib/ops-auth";
import { loadCuratorQueue, stalenessLabel } from "@/lib/curator-queue";
import { muteRestaurant, flagCampaign } from "./actions";

export const metadata: Metadata = {
  title: "Curator queue — ops",
  robots: { index: false, follow: false },
};

export const dynamic = "force-dynamic";

/**
 * Internal curator queue. Cookie-gated (no `?key=` URL secret). Each row is a
 * bare prompt-to-LOOK sorted by STALENESS (oldest curator check first) — never
 * by signal volume, never showing a count. Controls mute / flag a campaign and
 * touch NO public surface.
 */
export default async function CuratorQueuePage() {
  if (!(await isOpsAuthed())) {
    // Fail closed — no cookie, no queue. Never leak rows to an anon caller.
    return (
      <SiteShell variant="consumer" crumb="ops">
        <section className="section">
          <div className="section-head">
            <p className="label">ops</p>
            <h1 className="near-me-title">Curator queue</h1>
            <p className="lede">
              Founder-only. Sign in by POSTing <code className="ops-code">OPS_SECRET</code>{" "}
              to <code className="ops-code">/ops/login</code> (sets an httpOnly
              session cookie).
            </p>
          </div>
        </section>
      </SiteShell>
    );
  }

  if (!isDatabaseConfigured()) {
    return (
      <SiteShell variant="consumer" crumb="ops">
        <section className="section">
          <div className="section-head">
            <p className="label">ops</p>
            <h1 className="near-me-title">Curator queue</h1>
            <p className="lede">Database not configured.</p>
          </div>
        </section>
      </SiteShell>
    );
  }

  const rows = await loadCuratorQueue(getSql());

  return (
    <SiteShell variant="consumer" crumb="ops">
      <section className="section">
        <div className="section-head">
          <p className="label">ops · look, then verify at the source</p>
          <h1 className="near-me-title">Curator queue</h1>
          <p className="lede">
            Restaurants with an open freshness signal, stalest curator check
            first. A signal moves your attention — nothing else. Re-verify at the
            primary source before touching a tier.
          </p>
          <p className="ops-day-links">
            <Link href="/ops/near-me">near-me usage</Link>
            <span className="ops-sep">·</span>
            <Link href="/">← site</Link>
          </p>
        </div>

        <div className="section-body full">
          <div className="near-me-panel ops-panel">
            {rows.length === 0 ? (
              <p className="ops-empty">Nothing open — no restaurant has a signal to look at.</p>
            ) : (
              <ul className="ops-queue">
                {rows.map((row) => (
                  <li key={row.restaurant_id} className="ops-queue-row">
                    <span className="ops-queue-name">
                      {row.slug ? (
                        <Link href={`/place/${encodeURIComponent(row.slug)}`}>
                          {row.name ?? row.slug}
                        </Link>
                      ) : (
                        (row.name ?? row.restaurant_id)
                      )}
                      {row.campaign_flag ? (
                        <span className="ops-campaign-tag"> · possible campaign</span>
                      ) : null}
                    </span>
                    <span className="ops-queue-staleness">
                      {stalenessLabel(row.last_checked_at)}
                    </span>
                    <span className="ops-queue-controls">
                      <form action={muteRestaurant}>
                        <input type="hidden" name="restaurant_id" value={row.restaurant_id} />
                        <input type="hidden" name="muted" value="true" />
                        <button type="submit" className="ops-btn">
                          mute
                        </button>
                      </form>
                      <form action={flagCampaign}>
                        <input type="hidden" name="restaurant_id" value={row.restaurant_id} />
                        <input type="hidden" name="flag" value={String(!row.campaign_flag)} />
                        <button type="submit" className="ops-btn">
                          {row.campaign_flag ? "clear campaign flag" : "possible campaign"}
                        </button>
                      </form>
                    </span>
                  </li>
                ))}
              </ul>
            )}
            <p className="near-me-footnote">
              No signal counts, no aggregates — a queue prompts a curator to LOOK.
              Mute and the campaign flag alter no public surface.
            </p>
          </div>
        </div>
      </section>
    </SiteShell>
  );
}
