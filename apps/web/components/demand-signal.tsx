"use client";

import { useEffect, useMemo, useState } from "react";

function easeOutCubic(t: number) {
  return 1 - Math.pow(1 - t, 3);
}

function formatNumber(value: number) {
  return new Intl.NumberFormat("en-US").format(Math.round(value));
}

function useCountUp(target: number, durationMs: number) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    let raf = 0;

    if (media.matches) {
      raf = window.requestAnimationFrame(() => setValue(target));
      return () => window.cancelAnimationFrame(raf);
    }

    const start = performance.now();

    const tick = (now: number) => {
      const elapsed = now - start;
      const progress = Math.min(elapsed / durationMs, 1);
      setValue(target * easeOutCubic(progress));

      if (progress < 1) {
        raf = window.requestAnimationFrame(tick);
      }
    };

    raf = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(raf);
  }, [durationMs, target]);

  return value;
}

export function DemandSignal() {
  const [mode, setMode] = useState<"monthly" | "global">("monthly");
  const monthlySearchesTarget = 2_700_000;
  const globalSearchesTarget = 83_100_000;

  const monthlySearches = useCountUp(monthlySearchesTarget, 1400);
  const globalSearches = useCountUp(globalSearchesTarget, 1700);

  const monthlyLabel = useMemo(
    () => `${formatNumber(monthlySearches)}+`,
    [monthlySearches],
  );
  const globalLabel = useMemo(
    () => `${formatNumber(globalSearches)}+`,
    [globalSearches],
  );
  const primaryLabel = mode === "monthly" ? monthlyLabel : globalLabel;
  const primaryDescription =
    mode === "monthly"
      ? "monthly searches · Google estimate"
      : "global searches · all locations";
  const secondaryTitle =
    mode === "monthly" ? "Global volume" : "Monthly volume";
  const secondaryLabel = mode === "monthly" ? globalLabel : monthlyLabel;

  return (
    <section className="section">
      <div className="section-head">
        <p className="label">01 · demand</p>
        <h2>
          People still search <em>food near me</em>
        </h2>
        <p className="lede">
          The intent is massive. The routing layer is broken. Agents need
          structured menus — not ad auctions.
        </p>
      </div>

      <div className="section-body full">
        <div className="pulse-panel">
          <div className="pulse-head">
            <p className="label" style={{ margin: 0 }}>
              Demand pulse
            </p>
            <div className="audience-toggle" style={{ margin: 0 }}>
              <button
                type="button"
                className={mode === "monthly" ? "active" : ""}
                onClick={() => setMode("monthly")}
              >
                Monthly
              </button>
              <button
                type="button"
                className={mode === "global" ? "active" : ""}
                onClick={() => setMode("global")}
              >
                Global
              </button>
            </div>
          </div>

          <p style={{ margin: "0 0 8px", fontSize: 14, color: "var(--fg-dim)" }}>
            Keyword: &ldquo;food near me&rdquo;
          </p>
          <p className="pulse-value">
            {primaryLabel}
            <span className="unit"> searches</span>
          </p>
          <p style={{ margin: "8px 0 24px", fontSize: 13, color: "var(--fg-mute)" }}>
            {primaryDescription}
          </p>

          <div className="pulse-stats">
            <div className="pulse-stat">
              <p className="k">{secondaryTitle}</p>
              <p className="v">{secondaryLabel}</p>
            </div>
            <div className="pulse-stat">
              <p className="k">Avg CPC signal</p>
              <p className="v">$0.71</p>
            </div>
            <div className="pulse-stat">
              <p className="k">Search intent</p>
              <p className="v">Info</p>
            </div>
          </div>

          <p style={{ margin: "20px 0 0", fontSize: 11, color: "var(--fg-faint)" }}>
            Estimated from keyword research snapshots · last updated May 2026
          </p>
        </div>
      </div>
    </section>
  );
}
