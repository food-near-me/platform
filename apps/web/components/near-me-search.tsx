"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import {
  BEACHHEADS,
  DEFAULT_BEACHHEAD_ID,
  getBeachhead,
  type Beachhead,
  type BeachheadId,
} from "@/lib/near-me/beachheads";
import { useBeachheadCity } from "@/lib/near-me/beachhead-context";
import {
  getFilterNeighborhood,
  getNeighborhoodsForCity,
  type FilterNeighborhood,
} from "@/lib/near-me/neighborhood";

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
    needs?: string[];
    open_now?: boolean;
    neighborhood?: string | null;
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

/** Beachhead share URL — never embeds personal geo. */
function buildShareSearchParams(opts: {
  cityId: BeachheadId;
  needs: string[];
  neighborhoodId: string;
  openNow: boolean;
  query: string;
}): URLSearchParams {
  const params = new URLSearchParams();
  params.set("browse", "1");
  params.set("city", opts.cityId);
  if (opts.needs.length === 1) {
    params.set("need", opts.needs[0]!);
  } else if (opts.needs.length > 1) {
    params.set("need", opts.needs.join(","));
  }
  if (opts.neighborhoodId) params.set("neighborhood", opts.neighborhoodId);
  if (opts.openNow) params.set("open_now", "1");
  const q = opts.query.trim();
  if (q) params.set("query", q);
  return params;
}

function shareUrlFromFilters(opts: {
  cityId: BeachheadId;
  needs: string[];
  neighborhoodId: string;
  openNow: boolean;
  query: string;
}): string {
  const params = buildShareSearchParams(opts);
  if (typeof window === "undefined") {
    return `https://foodnear.me/?${params.toString()}`;
  }
  return `${window.location.origin}/?${params.toString()}`;
}

function syncShareUrl(opts: {
  cityId: BeachheadId;
  needs: string[];
  neighborhoodId: string;
  openNow: boolean;
  query: string;
}) {
  if (typeof window === "undefined") return;
  try {
    const next = `/?${buildShareSearchParams(opts).toString()}`;
    if (`${window.location.pathname}${window.location.search}` !== next) {
      window.history.replaceState(null, "", next);
    }
  } catch {
    /* ignore */
  }
}

function searchPoint(
  loc: Extract<LocState, { status: "ready" }>,
  hood: FilterNeighborhood | null,
  needs: string[],
  beachhead: Beachhead,
): { lat: number; lng: number; city: string; radius: number; source: "geo" | "fallback" } {
  if (hood) {
    return {
      lat: hood.lat,
      lng: hood.lng,
      city: hood.name,
      radius: hood.radiusMiles,
      source: "fallback",
    };
  }
  return {
    lat: loc.lat,
    lng: loc.lng,
    city: loc.city,
    radius: needs.length > 0 ? beachhead.allergyRadiusMiles : beachhead.radiusMiles,
    source: loc.source,
  };
}

function parseNeedsFromSearchParams(params: URLSearchParams): string[] {
  const out: string[] = [];
  for (const raw of params.getAll("need")) {
    for (const part of raw.split(/[,+]/)) {
      const v = part.trim().toLowerCase();
      if (
        (v === "gluten_free" ||
          v === "dairy_free" ||
          v === "nut_aware" ||
          v === "vegetarian") &&
        !out.includes(v)
      ) {
        out.push(v);
      }
    }
  }
  return out;
}

function mediaHue(name: string): number {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h + name.charCodeAt(i) * (i + 1)) % 360;
  // Bias away from muddy browns toward food-friendly hues
  return (h % 280) + 10;
}

function PlaceCard({ place, featured }: { place: NearMePlace; featured?: boolean }) {
  const openClass =
    place.open_now === true
      ? "is-open"
      : place.open_now === false
        ? "is-closed"
        : "is-unknown";
  const letter = (place.name.trim()[0] || "?").toUpperCase();
  const hue = mediaHue(place.name);

  return (
    <li>
      <Link
        href={place.place_url}
        className={`near-me-card${featured ? " near-me-card-featured" : ""}`}
      >
        <div
          className="near-me-card-media"
          data-letter={letter}
          style={{ ["--media-hue" as string]: hue }}
          aria-hidden
        >
          {featured && <span className="near-me-pick-badge">Top pick</span>}
        </div>
        <div className="near-me-card-body">
          <div className="near-me-card-top">
            <h2>{place.name}</h2>
            <span className="near-me-tier">{place.trust_label}</span>
          </div>
          {place.matches_need && place.allergy_safety_tier !== "unknown" && (
            <p className="near-me-safety">{place.allergy_safety_label}</p>
          )}
          {place.why && <p className="near-me-why">{place.why}</p>}
          <p className="near-me-meta">
            <span>{place.distance_miles} mi</span>
            {place.cuisine_type?.length ? (
              <span> · {place.cuisine_type.slice(0, 2).join(", ")}</span>
            ) : null}
            <span className={`near-me-hours-inline ${openClass}`}>
              {" · "}
              {place.hours_label}
            </span>
          </p>
        </div>
      </Link>
    </li>
  );
}

function SearchIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden>
      <path
        d="M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z"
        stroke="currentColor"
        strokeWidth="2.2"
      />
      <path
        d="M16.2 16.2 21 21"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinecap="round"
      />
    </svg>
  );
}

function SkeletonCards() {
  return (
    <ul className="near-me-list" aria-hidden>
      {Array.from({ length: 6 }).map((_, i) => (
        <li key={i} className="near-me-skeleton">
          <div className="near-me-skeleton-media" />
          <div className="near-me-skeleton-lines">
            <span />
            <span />
            <span />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function NearMeSearch() {
  const { cityId: beachheadId, setCityId: setBeachheadId } = useBeachheadCity();
  const beachhead = getBeachhead(beachheadId);
  const hoodOptions = getNeighborhoodsForCity(beachheadId);
  const [loc, setLoc] = useState<LocState>({ status: "idle" });
  const [query, setQuery] = useState("");
  // Multi-select needs (AND). Default gluten_free — same as the prior single-select default.
  const [needs, setNeeds] = useState<string[]>(["gluten_free"]);
  const [neighborhoodId, setNeighborhoodId] = useState("");
  const [openNow, setOpenNow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<NearMePlace[] | null>(null);
  const [meta, setMeta] = useState<NearMeResponse["metadata"] | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const cityParam = params.get("city");
      const bh = getBeachhead(cityParam);
      setBeachheadId(bh.id);
      const parsedNeeds = parseNeedsFromSearchParams(params);
      if (params.has("need")) setNeeds(parsedNeeds);
      if (params.get("open_now") === "1") setOpenNow(true);
      const q = params.get("query");
      if (q) setQuery(q);
      const hood = getFilterNeighborhood(params.get("neighborhood"), bh.id);
      if (hood) setNeighborhoodId(hood.id);
      // Airbnb-style: land on listings immediately (beachhead, never blank)
      setLoc({
        status: "ready",
        lat: bh.lat,
        lng: bh.lng,
        source: "fallback",
        city: bh.city,
      });
    } catch {
      /* ignore */
    }
  }, []);

  // Keep the address bar shareable once a search is active (no personal geo).
  useEffect(() => {
    if (loc.status !== "ready") return;
    syncShareUrl({ cityId: beachheadId, needs, neighborhoodId, openNow, query });
  }, [loc.status, beachheadId, needs, neighborhoodId, openNow, query]);

  const useBeachhead = useCallback(() => {
    const bh = getBeachhead(beachheadId);
    setLoc({
      status: "ready",
      lat: bh.lat,
      lng: bh.lng,
      source: "fallback",
      city: bh.city,
    });
  }, [beachheadId]);

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
      base: Extract<LocState, { status: "ready" }>,
      q: string,
      needKeys: string[],
      openNowOnly: boolean,
      hoodId: string,
    ) => {
      setLoading(true);
      setError(null);
      try {
        const hood = getFilterNeighborhood(hoodId, beachheadId);
        const bh = getBeachhead(beachheadId);
        const point = searchPoint(base, hood, needKeys, bh);
        const params = new URLSearchParams({
          lat: String(point.lat),
          lng: String(point.lng),
          radius: String(point.radius),
          // Beachhead city for ops (not neighborhood label)
          city: bh.city,
          source: point.source,
          query: q,
          tz: clientTimeZone(),
        });
        if (needKeys.length === 1) params.set("need", needKeys[0]!);
        else if (needKeys.length > 1) params.set("need", needKeys.join(","));
        if (openNowOnly) params.set("open_now", "1");
        if (hood) params.set("neighborhood", hood.id);
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
    [beachheadId],
  );

  useEffect(() => {
    if (loc.status !== "ready") return;
    void runSearch(loc, query, needs, openNow, neighborhoodId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc.status === "ready" ? `${loc.lat},${loc.lng},${loc.source},${beachheadId}` : ""]);

  function ensureReadyThen(
    fn: (base: Extract<LocState, { status: "ready" }>) => void,
  ) {
    if (loc.status === "ready") {
      fn(loc);
      return;
    }
    const bh = getBeachhead(beachheadId);
    const base = {
      status: "ready" as const,
      lat: bh.lat,
      lng: bh.lng,
      source: "fallback" as const,
      city: bh.city,
    };
    setLoc(base);
    fn(base);
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    ensureReadyThen((base) => {
      void runSearch(base, query, needs, openNow, neighborhoodId);
    });
  }

  function onNeedToggle(id: string) {
    // "Any" clears the selection.
    if (id === "") {
      setNeeds([]);
      if (loc.status === "ready") {
        void runSearch(loc, query, [], openNow, neighborhoodId);
      }
      return;
    }
    const next = needs.includes(id)
      ? needs.filter((n) => n !== id)
      : [...needs, id];
    setNeeds(next);
    if (loc.status === "ready") {
      void runSearch(loc, query, next, openNow, neighborhoodId);
    }
  }

  function onNeighborhoodChange(nextId: string) {
    setNeighborhoodId(nextId);
    ensureReadyThen((base) => {
      void runSearch(base, query, needs, openNow, nextId);
    });
  }

  function onOpenNowChange(next: boolean) {
    setOpenNow(next);
    if (loc.status === "ready") {
      void runSearch(loc, query, needs, next, neighborhoodId);
    }
  }

  function onCityChange(nextId: BeachheadId) {
    if (nextId === beachheadId) return;
    setBeachheadId(nextId);
    setNeighborhoodId("");
    const bh = getBeachhead(nextId);
    const base = {
      status: "ready" as const,
      lat: bh.lat,
      lng: bh.lng,
      source: "fallback" as const,
      city: bh.city,
    };
    setLoc(base);
    void runSearch(base, query, needs, openNow, "");
  }

  async function onCopyShareLink() {
    const url = shareUrlFromFilters({
      cityId: beachheadId,
      needs,
      neighborhoodId,
      openNow,
      query,
    });
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback: still sync URL so user can copy from the bar
      syncShareUrl({ cityId: beachheadId, needs, neighborhoodId, openNow, query });
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    }
  }

  const activeHood = getFilterNeighborhood(neighborhoodId, beachheadId);
  const topPick = results?.find((p) => p.is_top_pick) ?? results?.[0] ?? null;
  const alsoNearby = results?.filter((p) => p.id !== topPick?.id) ?? [];

  const resultCount = results?.length ?? 0;
  const placeLabel = activeHood?.name ?? beachhead.shortLabel;

  return (
    <section className="section" id="near-me">
      <div className="near-me-hero">
        <p className="near-me-kicker">Allergy-aware dining</p>
        <h1 className="near-me-title">
          foodnear<span className="brand-dot">.</span>me
        </h1>
        <p className="near-me-lede">
          Honest kitchen notes for Miami and Jacksonville — not medical advice.
          Always verify with the restaurant.
        </p>
      </div>

      <div className="near-me-panel">
        <div className="near-me-toolbar">
          <form className="near-me-searchbar" onSubmit={onSubmit}>
            <label className="near-me-field">
              <span className="sr-only">Cuisine or dish</span>
              <input
                name="query"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search pizza, sushi, coffee…"
                autoComplete="off"
              />
            </label>
            <button
              type="submit"
              className="near-me-search-submit"
              disabled={loading || loc.status === "locating"}
              aria-label={loading ? "Searching" : "Search"}
            >
              <SearchIcon />
            </button>
          </form>

          <div className="near-me-filters">
            <div className="near-me-filter-row" role="group" aria-label="City">
              <span className="near-me-filter-label">City</span>
              {BEACHHEADS.map((city) => (
                <button
                  key={city.id}
                  type="button"
                  className={`near-me-chip near-me-chip-accent${beachheadId === city.id ? " is-active" : ""}`}
                  onClick={() => onCityChange(city.id)}
                  aria-pressed={beachheadId === city.id}
                >
                  {city.shortLabel}
                </button>
              ))}
            </div>

            <div className="near-me-filter-row" role="group" aria-label="Dietary needs">
              <span className="near-me-filter-label">Need</span>
              {NEED_OPTIONS.map((opt) => {
                const active = opt.id === "" ? needs.length === 0 : needs.includes(opt.id);
                return (
                  <button
                    key={opt.id || "any"}
                    type="button"
                    className={`near-me-chip${active ? " is-active" : ""}`}
                    onClick={() => onNeedToggle(opt.id)}
                    aria-pressed={active}
                  >
                    {opt.label}
                  </button>
                );
              })}
            </div>

            <div className="near-me-filter-row" role="group" aria-label="Neighborhood">
              <span className="near-me-filter-label">Area</span>
              <button
                type="button"
                className={`near-me-chip${neighborhoodId === "" ? " is-active" : ""}`}
                onClick={() => onNeighborhoodChange("")}
                aria-pressed={neighborhoodId === ""}
              >
                Any area
              </button>
              {hoodOptions.map((hood) => (
                <button
                  key={hood.id}
                  type="button"
                  className={`near-me-chip${neighborhoodId === hood.id ? " is-active" : ""}`}
                  onClick={() => onNeighborhoodChange(hood.id)}
                  aria-pressed={neighborhoodId === hood.id}
                >
                  {hood.name}
                </button>
              ))}
            </div>
          </div>

          <div className="near-me-loc">
            {loc.status === "locating" && (
              <p className="near-me-status">Getting your location…</p>
            )}
            {loc.status === "denied" && (
              <div className="near-me-denied">
                <p className="near-me-status">
                  Location blocked — browsing {beachhead.shortLabel} instead.
                </p>
                <button type="button" className="near-me-text-btn" onClick={useBeachhead}>
                  Continue browsing
                </button>
              </div>
            )}
            {loc.status === "ready" && (
              <div className="near-me-status-row">
                <p className="near-me-status">
                  {loading ? "Updating" : resultCount ? `${resultCount} places` : "Places"} near{" "}
                  <strong>{activeHood?.name ?? meta?.city ?? loc.city}</strong>
                </p>
                <div className="near-me-status-actions">
                  <button type="button" className="near-me-text-btn" onClick={requestGeo}>
                    Use my location
                  </button>
                  <label className="near-me-toggle">
                    <input
                      type="checkbox"
                      checked={openNow}
                      onChange={(e) => onOpenNowChange(e.target.checked)}
                    />
                    <span>Open now</span>
                  </label>
                  <button
                    type="button"
                    className="near-me-text-btn"
                    onClick={() => void onCopyShareLink()}
                    aria-label={
                      copied ? "Link copied to clipboard" : "Copy search link to clipboard"
                    }
                    aria-live="polite"
                  >
                    {copied ? "Link copied" : "Share"}
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {error && <p className="near-me-error">{error}</p>}

        <div className="near-me-results">
          {loading && !results ? <SkeletonCards /> : null}

          {!loading && results && results.length === 0 && !error && (
            <p className="near-me-empty">
              No matches near {placeLabel}
              {query ? ` for “${query}”` : ""}
              {needs.length ? " with those needs" : ""}. Try Any area, Any need, or turn off Open now.
            </p>
          )}

          {topPick && (
            <>
              <div className="near-me-results-head">
                <h2 className="near-me-results-title">Places in {placeLabel}</h2>
                <p className="near-me-results-sub">
                  Curated allergy notes first — then nearby listed spots.
                </p>
              </div>
              <ul className="near-me-list">
                <PlaceCard place={topPick} featured />
                {alsoNearby.map((place) => (
                  <PlaceCard key={place.id} place={place} />
                ))}
              </ul>
            </>
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
