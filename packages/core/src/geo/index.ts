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
