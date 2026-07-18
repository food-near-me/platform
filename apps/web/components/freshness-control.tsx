"use client";

import { useState } from "react";

/**
 * Non-endorsing freshness control. A click writes a content-free curator signal
 * (POST /api/v1/signals) and mutates NOTHING visible: the tier/note on the page
 * never changes, and the toast carries no count, timestamp, or checkmark. The
 * disclaimer is FIXED — a user tap is never a safety confirmation. There is
 * deliberately no "Confirm" button: that reads as an endorsement.
 */

// Fixed, non-endorsing acknowledgement. Never mentions a count, a time, or a
// verification — a signal only moves a human curator's attention.
export const TOAST_TEXT =
  "Thanks — a curator will take a look. This is not a safety confirmation; always verify allergen safety with the restaurant.";

type SignalType = "outdated" | "confirm";

type ControlButton = {
  label: string;
  signalType: SignalType;
};

// Two clear choices — a stale report vs. an all-good ping. (An earlier third
// "Report this listing" wrote the same signal as "Looks out of date", so it was
// redundant.) No "Confirm" wording: that would read as a site-endorsed check.
export const BUTTONS: readonly ControlButton[] = [
  { label: "Looks out of date", signalType: "outdated" },
  { label: "Still looks right", signalType: "confirm" },
];

export function FreshnessControl({ restaurantId }: { restaurantId: string }) {
  const [sent, setSent] = useState(false);
  const [pending, setPending] = useState(false);

  const onSignal = async (signalType: SignalType) => {
    if (pending) return;
    setPending(true);
    try {
      await fetch("/api/v1/signals", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ restaurant_id: restaurantId, signal_type: signalType }),
      });
    } catch {
      // A failed write still shows the same fixed acknowledgement: the control
      // never claims success, only that a curator will look. No error surface
      // that could read as a verification state.
    } finally {
      // Fixed toast regardless of outcome — no count, no timestamp, no checkmark.
      setSent(true);
      setPending(false);
    }
  };

  return (
    <div className="place-freshness-control">
      <p className="place-freshness-title">See something off?</p>
      <p className="place-freshness-hint">
        Flagging it just points a curator at this listing — it doesn&rsquo;t
        change the rating and isn&rsquo;t a safety confirmation.
      </p>
      {sent ? (
        <p className="place-freshness-toast" role="status">
          {TOAST_TEXT}
        </p>
      ) : (
        <div className="place-freshness-actions">
          {BUTTONS.map((b) => (
            <button
              key={b.label}
              type="button"
              className={
                b.signalType === "outdated" ? "btn place-flag-stale" : "btn btn-ghost"
              }
              onClick={() => onSignal(b.signalType)}
              disabled={pending}
            >
              {b.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
