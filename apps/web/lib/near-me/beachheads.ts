/**
 * Consumer beachhead cities — default Miami; Jacksonville is city #2.
 */

export type BeachheadId = "miami" | "jacksonville";

export type Beachhead = {
  id: BeachheadId;
  city: string;
  shortLabel: string;
  lat: number;
  lng: number;
  radiusMiles: number;
  allergyRadiusMiles: number;
};

export const BEACHHEADS: Beachhead[] = [
  {
    id: "miami",
    city: "Miami, FL",
    shortLabel: "Miami",
    lat: 25.782,
    lng: -80.229,
    radiusMiles: 3,
    allergyRadiusMiles: 12,
  },
  {
    id: "jacksonville",
    city: "Jacksonville, FL",
    shortLabel: "Jacksonville",
    lat: 30.3322,
    lng: -81.6557,
    radiusMiles: 3,
    allergyRadiusMiles: 12,
  },
];

export const DEFAULT_BEACHHEAD_ID: BeachheadId = "miami";

export function getBeachhead(id: string | null | undefined): Beachhead {
  const key = (id || DEFAULT_BEACHHEAD_ID).toLowerCase();
  return BEACHHEADS.find((b) => b.id === key) ?? BEACHHEADS[0];
}

export function isBeachheadId(id: string | null | undefined): id is BeachheadId {
  return Boolean(id && BEACHHEADS.some((b) => b.id === id));
}
