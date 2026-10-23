import type { GeoPlace, LatLng } from '../api/types.ts';

/** Where the map opens when nothing better is known (no location yet, or permission denied): the centre of Yerevan, the launch city. */
export const DEFAULT_MAP_CENTER: LatLng = { lat: 40.1792, lng: 44.4991 };
export const DEFAULT_MAP_ZOOM = 13;

/**
 * A spot the person chose, in the one shape booking and saved places use (`{lat, lng, address}`, as in `dropoff` and `SavedPlace`).
 * `place_id` is only there when the maps provider knew the spot.
 */
export interface AddressPoint extends LatLng {
  address: string;
  place_id?: string;
}

export function toAddressPoint(place: GeoPlace): AddressPoint {
  return {
    lat: place.location.lat,
    lng: place.location.lng,
    address: place.address,
    ...(place.place_id !== null ? { place_id: place.place_id } : {}),
  };
}

/**
 * The spot the rider chose on the map (`point`) with the address the maps provider gave for it: the coordinates stay where the pin is
 * (that is where the driver goes), the address says what is there.
 */
export function addressAt(point: LatLng, place: GeoPlace): AddressPoint {
  return {
    lat: point.lat,
    lng: point.lng,
    address: place.address,
    ...(place.place_id !== null ? { place_id: place.place_id } : {}),
  };
}

/**
 * Reads a Google-encoded polyline (precision 5, what `GET /geo/route` returns) into points. A string that ends in the middle of a number,
 * or holds a character outside the encoding, is refused with a `RangeError` rather than drawn wrong.
 */
export function decodePolyline(encoded: string): LatLng[] {
  const points: LatLng[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;

  const nextDelta = (): number => {
    let result = 0;
    let shift = 0;
    let chunk: number;

    do {
      if (index >= encoded.length) {
        throw new RangeError('The polyline ends in the middle of a coordinate.');
      }

      chunk = encoded.charCodeAt(index++) - 63;

      if (chunk < 0 || chunk > 63) {
        throw new RangeError('The polyline holds a character outside the encoding.');
      }

      result |= (chunk & 0x1f) << shift;
      shift += 5;
    } while (chunk >= 0x20);

    return result & 1 ? ~(result >> 1) : result >> 1;
  };

  while (index < encoded.length) {
    lat += nextDelta();
    lng += nextDelta();
    points.push({ lat: lat / 1e5, lng: lng / 1e5 });
  }

  return points;
}

const EARTH_RADIUS_METERS = 6_371_000;

/** The straight-line distance between two places in metres (haversine). Geometry only: never money. */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (degrees: number) => (degrees * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;

  return 2 * EARTH_RADIUS_METERS * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** The middle of two places (good enough for a trip inside one city). */
export function midpoint(a: LatLng, b: LatLng): LatLng {
  return { lat: (a.lat + b.lat) / 2, lng: (a.lng + b.lng) / 2 };
}

/**
 * A map zoom at which both places fit on a phone screen with some room around them: a 512 px tile world shows about 281 / 2^zoom degrees
 * across 400 px, and the span is given 1.8 times that room. Kept between 3 (a country) and 17 (a street).
 */
export function zoomToFit(a: LatLng, b: LatLng): number {
  const span = Math.max(Math.abs(a.lat - b.lat), Math.abs(a.lng - b.lng));

  if (span === 0) {
    return 17;
  }

  return Math.max(3, Math.min(17, Math.floor(Math.log2(281 / (span * 1.8)))));
}
