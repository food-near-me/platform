"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

export const BEACHHEAD = {
  city: "Miami, FL",
  lat: 25.782,
  lng: -80.229,
  radiusMiles: 3,
  allergyRadiusMiles: 12,
} as const;

export const NEED_OPTIONS = [
  { id: "", label: "Any" },
  { id: "gluten_free", label: "Gluten / Celiac" },
  { id: "dairy_free", label: "Dairy" },
  { id: "nut_aware", label: "Nuts" },
  { id: "vegetarian", label: "Vegetarian" },
] as const;

type NearMePlace = {
  id: string;
  name: string;
  slug: string;
  place_url: string;
  distance_miles: number;
  cuisine_type: string[];
  trust_label: string;
  address: string | null;
  maps_url: string;
  website_url: string | null;
  phone: string | null;
  phone_url: string | null;
  menu_available: boolean;
  open_now: boolean | null;
  hours_label: string;
  hours_detail: string | null;
  is_top_pick: boolean;
  is_chain: boolean;
  allergy_safety_tier: string;
  allergy_safety_label: string;
  allergy_safety_note: string | null;
  matches_need: boolean;
  why: string | null;
};

type NearMeResponse = {
  metadata: {
    city: string;
    source: string;
    results_count: number;
    radius_miles: number;
    need?: string | null;
    open_now?: boolean;
    curated_matches?: number;
    allergy_disclaimer?: string;
    ranking?: string;
    top_pick_id?: string | null;
  };
  data: NearMePlace[];
  error?: string;
};

type LocState =
  | { status: "idle" }
  | { status: "locating" }
  | { status: "ready"; lat: number; lng: number; source: "geo" | "fallback"; city: string }
  | { status: "denied" };

function clientTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
  } catch {
    return "America/New_York";
  }
}

function PlaceCard({ place, featured }: { place: NearMePlace; featured?: boolean }) {
  const openClass =
    place.open_now === true
      ? "is-open"
      : place.open_now === false
        ? "is-closed"
        : "is-unknown";

  return (
    <li className={`near-me-card${featured ? " near-me-card-featured" : ""}`}>
      <div className="near-me-card-top">
        <div>
          {featured && <p className="near-me-pick-label">Top pick nearby</p>}
          <h2>{place.name}</h2>
        </div>
        <span className="near-me-tier">{place.trust_label}</span>
      </div>
      {place.why && <p className="near-me-why">{place.why}</p>}
      {place.matches_need && place.allergy_safety_tier !== "unknown" && (
        <p className="near-me-safety">{place.allergy_safety_label}</p>
      )}
      <p className="near-me-meta">
        {place.distance_miles} mi
        {place.cuisine_type?.length
          ? ` · ${place.cuisine_type.slice(0, 3).join(", ")}`
          : ""}
      </p>
      <p className={`near-me-hours ${openClass}`}>{place.hours_label}</p>
      {place.address ? (
        <p className="near-me-address">{place.address}</p>
      ) : (
        <p className="near-me-address mute">Address not listed yet</p>
      )}
      <div className="near-me-actions">
        <Link className="btn" href={place.place_url}>
          View place
        </Link>
        <a
          className="btn btn-ghost"
          href={place.maps_url}
          target="_blank"
          rel="noopener noreferrer"
        >
          Maps
        </a>
        {place.phone_url && (
          <a className="btn btn-ghost" href={place.phone_url}>
            Call
          </a>
        )}
        {place.website_url && (
          <a
            className="btn btn-ghost"
            href={place.website_url}
            target="_blank"
            rel="noopener noreferrer"
          >
            Website
          </a>
        )}
      </div>
    </li>
  );
}

export function NearMeSearch() {
  const [loc, setLoc] = useState<LocState>({ status: "idle" });
  const [query, setQuery] = useState("");
  const [need, setNeed] = useState("gluten_free");
  const [openNow, setOpenNow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<NearMePlace[] | null>(null);
  const [meta, setMeta] = useState<NearMeResponse["metadata"] | null>(null);

  const useBeachhead = useCallback(() => {
    setLoc({
      status: "ready",
      lat: BEACHHEAD.lat,
      lng: BEACHHEAD.lng,
      source: "fallback",
      city: BEACHHEAD.city,
    });
  }, []);

  const requestGeo = useCallback(() => {
    if (!navigator.geolocation) {
      useBeachhead();
      return;
    }
    setLoc({ status: "locating" });
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLoc({
          status: "ready",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          source: "geo",
          city: "near you",
        });
      },
      () => {
        setLoc({ status: "denied" });
      },
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 60_000 },
    );
  }, [useBeachhead]);

  const runSearch = useCallback(
    async (
      lat: number,
      lng: number,
      source: "geo" | "fallback",
      city: string,
      q: string,
      needKey: string,
      openNowOnly: boolean,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const radius = needKey ? BEACHHEAD.allergyRadiusMiles : BEACHHEAD.radiusMiles;
        const params = new URLSearchParams({
          lat: String(lat),
          lng: String(lng),
          radius: String(radius),
          city,
          source,
          query: q,
          tz: clientTimeZone(),
        });
        if (needKey) params.set("need", needKey);
        if (openNowOnly) params.set("open_now", "1");
        const res = await fetch(`/api/v1/near-me?${params}`);
        const json = (await res.json()) as NearMeResponse & { error?: string };
        if (!res.ok) {
          setResults(null);
          setMeta(null);
          setError(json.error || "Search unavailable — try again in a moment");
          return;
        }
        setResults(json.data);
        setMeta(json.metadata);
      } catch {
        setResults(null);
        setMeta(null);
        setError("Search unavailable — check your connection and try again");
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    if (loc.status !== "ready") return;
    void runSearch(loc.lat, loc.lng, loc.source, loc.city, query, need, openNow);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.status === "ready" ? `${loc.lat},${loc.lng},${loc.source}` : ""]);

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (loc.status !== "ready") {
      useBeachhead();
      return;
    }
    void runSearch(loc.lat, loc.lng, loc.source, loc.city, query, need, openNow);
  }

  function onNeedChange(next: string) {
    setNeed(next);
    if (loc.status === "ready") {
      void runSearch(loc.lat, loc.lng, loc.source, loc.city, query, next, openNow);
    }
  }

  function onOpenNowChange(next: boolean) {
    setOpenNow(next);
    if (loc.status === "ready") {
      void runSearch(loc.lat, loc.lng, loc.source, loc.city, query, need, next);
    }
  }

  const topPick = results?.find((p) => p.is_top_pick) ?? results?.[0] ?? null;
  const alsoNearby = results?.filter((p) => p.id !== topPick?.id) ?? [];

  return (
    <section className="section" id="near-me">
      <div className="section-head">
        <p className="label">allergy-aware near me</p>
        <h1 className="near-me-title">
          Where can you <em>safely</em> eat?
        </h1>
        <p className="lede">
          Miami first — curated allergy notes with an honest kitchen mechanism,
          plus nearby listed places. Not medical advice. Always verify with the restaurant.
        </p>
      </div>

      <div className="section-body full">
        <div className="near-me-panel">
          <div className="near-me-loc">
            {loc.status === "idle" && (
              <>
                <button type="button" className="btn" onClick={requestGeo}>
                  Use my location
                </button>
                <button type="button" className="btn btn-ghost" onClick={useBeachhead}>
                  Browse {BEACHHEAD.city}
                </button>
              </>
            )}
            {loc.status === "locating" && (
              <p className="near-me-status">Getting your location…</p>
            )}
            {loc.status === "denied" && (
              <div className="near-me-denied">
                <p className="near-me-status">
                  Location blocked — that’s fine. Browse the beachhead instead.
                </p>
                <button type="button" className="btn" onClick={useBeachhead}>
                  Browse {BEACHHEAD.city}
                </button>
              </div>
            )}
            {loc.status === "ready" && (
              <p className="near-me-status">
                Searching <strong>{loc.city}</strong>
                {loc.source === "fallback" ? " (beachhead)" : ""} ·{" "}
                {meta?.radius_miles ??
                  (need ? BEACHHEAD.allergyRadiusMiles : BEACHHEAD.radiusMiles)}{" "}
                mi
              </p>
            )}
          </div>

          <div className="near-me-needs" role="group" aria-label="Dietary need">
            {NEED_OPTIONS.map((opt) => (
              <button
                key={opt.id || "any"}
                type="button"
                className={`near-me-chip${need === opt.id ? " is-active" : ""}`}
                onClick={() => onNeedChange(opt.id)}
                aria-pressed={need === opt.id}
              >
                {opt.label}
              </button>
            ))}
          </div>

          <label className="near-me-toggle">
            <input
              type="checkbox"
              checked={openNow}
              onChange={(e) => onOpenNowChange(e.target.checked)}
            />
            <span>Open now</span>
          </label>

          <form className="near-me-form" onSubmit={onSubmit}>
            <label className="near-me-field">
              <span className="sr-only">Cuisine or dish</span>
              <input
                name="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="pizza, sushi, coffee…"
                autoComplete="off"
              />
            </label>
            <button type="submit" className="btn" disabled={loading || loc.status === "locating"}>
              {loading ? "Searching…" : "Search"}
            </button>
          </form>

          {error && <p className="near-me-error">{error}</p>}

          {results && results.length === 0 && !error && (
            <p className="near-me-empty">
              No matches within {meta?.radius_miles ?? BEACHHEAD.radiusMiles} miles
              {query ? ` for “${query}”` : ""}
              {need ? " with that need" : ""}. Try Any need, turn off Open now, or widen cuisine.
            </p>
          )}

          {topPick && (
            <ul className="near-me-list near-me-list-featured">
              <PlaceCard place={topPick} featured />
            </ul>
          )}

          {alsoNearby.length > 0 && (
            <div className="near-me-also">
              <h3 className="near-me-also-heading">Also nearby</h3>
              <ul className="near-me-list">
                {alsoNearby.map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </ul>
            </div>
          )}

          <p className="near-me-footnote">
            {meta?.allergy_disclaimer ||
              "Curated safety notes describe kitchen mechanism, not a medical guarantee. Always verify with the restaurant. For celiac, cross-check Find Me Gluten Free."}
          </p>
        </div>
      </div>
    </section>
  );
}
