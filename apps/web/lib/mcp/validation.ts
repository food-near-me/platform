/**
 * Input validators shared by MCP tool handlers.
 *
 * Each validator throws `ValidationError` (with an actionable `hint`) when
 * input is malformed so the dispatch layer in `lib/mcp/rpc.ts` can convert
 * it into a structured tool-error result.
 */

import { VALID_DIETARY_FILTERS } from "./constants";
import { ValidationError } from "./errors";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidUUID(value: string): boolean {
  return UUID_REGEX.test(value);
}

export function validateRestaurantId(value: unknown): string {
  if (typeof value !== "string" || !isValidUUID(value)) {
    throw new ValidationError(
      "restaurant_id must be a valid UUID",
      "Use an id from search_restaurants results.",
    );
  }
  return value;
}

export function validateLatLng(lat: unknown, lng: unknown): { lat: number; lng: number } {
  if (typeof lat !== "number" || typeof lng !== "number") {
    throw new ValidationError(
      "lat and lng must be numbers",
      "Pass decimal degrees, e.g. lat: 40.7128, lng: -74.006.",
    );
  }
  if (lat < -90 || lat > 90) {
    throw new ValidationError(
      "lat must be between -90 and 90",
      `Received lat=${lat}. Use a valid latitude.`,
    );
  }
  if (lng < -180 || lng > 180) {
    throw new ValidationError(
      "lng must be between -180 and 180",
      `Received lng=${lng}. Use a valid longitude.`,
    );
  }
  return { lat, lng };
}

export function validateDietaryFilters(dietary: unknown): string[] {
  if (!dietary) return [];
  if (!Array.isArray(dietary)) {
    throw new ValidationError(
      "dietary must be an array",
      'Pass dietary as a string array, e.g. ["vegan"].',
    );
  }
  const invalid = dietary.filter(
    (d) => !VALID_DIETARY_FILTERS.includes(d as (typeof VALID_DIETARY_FILTERS)[number]),
  );
  if (invalid.length > 0) {
    throw new ValidationError(
      `Invalid dietary filters: ${invalid.join(", ")}`,
      `Valid options: ${VALID_DIETARY_FILTERS.join(", ")}`,
    );
  }
  return dietary as string[];
}
