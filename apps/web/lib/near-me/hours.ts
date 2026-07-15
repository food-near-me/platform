/**
 * Parse OSM opening_hours for consumer display.
 * Never invents hours — unknown/unparseable → open_now null + honest label.
 */

import OpeningHours from "opening_hours";

export type HoursStatus = {
  /** Raw OSM string, or null when missing. */
  opening_hours: string | null;
  /** true/false when evaluable; null when unknown or unparseable. */
  open_now: boolean | null;
  /** Short human line for the UI. */
  hours_label: string;
  /** Longer hint (next change), optional. */
  hours_detail: string | null;
};

function formatClock(date: Date, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      timeZone,
      hour: "numeric",
      minute: "2-digit",
    }).format(date);
  } catch {
    return date.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });
  }
}

export function evaluateOpeningHours(
  raw: string | null | undefined,
  opts: { now?: Date; timeZone?: string } = {},
): HoursStatus {
  const opening_hours = raw?.trim() || null;
  if (!opening_hours) {
    return {
      opening_hours: null,
      open_now: null,
      hours_label: "Hours not confirmed",
      hours_detail: "Confirm before you go",
    };
  }

  const timeZone = opts.timeZone || "America/New_York";
  const now = opts.now ?? new Date();

  try {
    // opening_hours expects optional nominatim object for locale; pass tz via date only.
    const oh = new OpeningHours(opening_hours, null, { tag_key: "opening_hours" });
    const open_now = oh.getState(now);
    const nextChange = oh.getNextChange(now);

    if (open_now) {
      const until =
        nextChange && nextChange.getTime() - now.getTime() < 36 * 60 * 60 * 1000
          ? `until ${formatClock(nextChange, timeZone)}`
          : null;
      return {
        opening_hours,
        open_now: true,
        hours_label: until ? `Open now · ${until}` : "Open now",
        hours_detail: until,
      };
    }

    const opens =
      nextChange && nextChange.getTime() - now.getTime() < 48 * 60 * 60 * 1000
        ? `opens ${formatClock(nextChange, timeZone)}`
        : null;
    return {
      opening_hours,
      open_now: false,
      hours_label: opens ? `Closed · ${opens}` : "Closed now",
      hours_detail: opens,
    };
  } catch {
    return {
      opening_hours,
      open_now: null,
      hours_label: "Hours not confirmed",
      hours_detail: "Listed hours could not be read — confirm before you go",
    };
  }
}

export function telHref(phone: string | null | undefined): string | null {
  if (!phone?.trim()) return null;
  const digits = phone.replace(/[^\d+]/g, "");
  if (digits.replace(/\D/g, "").length < 7) return null;
  return `tel:${digits}`;
}
