type LatLng = { lat: number; lng: number };

type DietaryRecord = Record<string, boolean | undefined>;

type MenuItemLike = {
  dietary?: DietaryRecord;
};

const EARTH_RADIUS_METERS = 6371000;

function toRadians(value: number): number {
  return (value * Math.PI) / 180;
}

export function haversineMeters(a: LatLng, b: LatLng): number {
  const dLat = toRadians(b.lat - a.lat);
  const dLng = toRadians(b.lng - a.lng);
  const lat1 = toRadians(a.lat);
  const lat2 = toRadians(b.lat);

  const h =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) * Math.sin(dLng / 2);

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.sqrt(h));
}

export function filterItemsByDietary<T extends MenuItemLike>(
  items: T[],
  dietary: string[],
): T[] {
  if (dietary.length === 0) return items;

  return items.filter((item) => {
    const row = item.dietary;
    if (!row) return false;
    return dietary.every((flag) => row[flag] === true);
  });
}

export function sampleGreatCircle(
  origin: LatLng,
  destination: LatLng,
  interiorPoints = 5,
): LatLng[] {
  const points: LatLng[] = [origin];
  const steps = Math.max(0, interiorPoints);
  for (let i = 1; i <= steps; i++) {
    const t = i / (steps + 1);
    points.push({
      lat: origin.lat + (destination.lat - origin.lat) * t,
      lng: origin.lng + (destination.lng - origin.lng) * t,
    });
  }
  points.push(destination);
  return points;
}
