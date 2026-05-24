type LatLng = { lat: number; lng: number };

function decodeSignedValue(encoded: string, cursor: number): [number, number] {
  let result = 0;
  let shift = 0;
  let byte = 0;
  let index = cursor;

  do {
    if (index >= encoded.length) {
      throw new Error("Invalid encoded polyline: truncated sequence");
    }
    byte = encoded.charCodeAt(index++) - 63;
    result |= (byte & 0x1f) << shift;
    shift += 5;
  } while (byte >= 0x20);

  const delta = (result & 1) !== 0 ? ~(result >> 1) : result >> 1;
  return [delta, index];
}

/** Decode Google encoded polyline format into decimal-degree coordinates. */
export function decodePolyline(encoded: string): LatLng[] {
  if (!encoded || encoded.trim() === "") {
    throw new Error("Invalid encoded polyline: empty string");
  }

  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  while (index < encoded.length) {
    const [dLat, nextAfterLat] = decodeSignedValue(encoded, index);
    index = nextAfterLat;
    const [dLng, nextAfterLng] = decodeSignedValue(encoded, index);
    index = nextAfterLng;

    lat += dLat;
    lng += dLng;
    points.push({
      lat: lat / 1e5,
      lng: lng / 1e5,
    });
  }

  if (points.length < 2) {
    throw new Error("Invalid encoded polyline: expected at least 2 points");
  }

  return points;
}
