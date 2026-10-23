import { addressAt, decodePolyline, distanceMeters, midpoint, toAddressPoint, zoomToFit } from '../index.ts';

describe('decodePolyline', () => {
  it("decodes Google's documented example", () => {
    expect(decodePolyline('_p~iF~ps|U_ulLnnqC_mqNvxq`@')).toEqual([
      { lat: 38.5, lng: -120.2 },
      { lat: 40.7, lng: -120.95 },
      { lat: 43.252, lng: -126.453 },
    ]);
  });

  it('decodes one point, and nothing for an empty string', () => {
    expect(decodePolyline('_p~iF~ps|U')).toEqual([{ lat: 38.5, lng: -120.2 }]);
    expect(decodePolyline('')).toEqual([]);
  });

  it('decodes points near Yerevan, each relative to the one before', () => {
    expect(decodePolyline('ojgtFcztnGgEoK')).toEqual([
      { lat: 40.1836, lng: 44.5125 },
      { lat: 40.1846, lng: 44.5145 },
    ]);
  });

  it('refuses a string cut short, or with characters outside the encoding', () => {
    expect(() => decodePolyline('_p~iF')).toThrow(RangeError);
    expect(() => decodePolyline('_p~iF~ps|')).toThrow(RangeError);
    expect(() => decodePolyline('_p~iF~ps|U ')).toThrow(RangeError);
  });
});

describe('toAddressPoint', () => {
  const place = {
    place_id: 'osm:N1',
    name: 'Cascade',
    address: '10 Tamanyan St, Yerevan',
    location: { lat: 40.19, lng: 44.52 },
  };

  it('gives the lat, lng and address that booking and saved places use', () => {
    expect(toAddressPoint(place)).toEqual({
      lat: 40.19,
      lng: 44.52,
      address: '10 Tamanyan St, Yerevan',
      place_id: 'osm:N1',
    });
  });

  it('leaves the place id out when the provider had none (a bare coordinate)', () => {
    const point = toAddressPoint({ ...place, place_id: null });

    expect(point).toEqual({ lat: 40.19, lng: 44.52, address: '10 Tamanyan St, Yerevan' });
    expect('place_id' in point).toBe(false);
  });
});

describe('distanceMeters', () => {
  it('is 0 for the same place and symmetric', () => {
    const a = { lat: 40.18, lng: 44.51 };
    const b = { lat: 40.19, lng: 44.52 };

    expect(distanceMeters(a, a)).toBe(0);
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
  });

  it('knows a hundredth of a degree of latitude is about 1112 m, and a degree of longitude shrinks with latitude', () => {
    expect(distanceMeters({ lat: 40.18, lng: 44.51 }, { lat: 40.19, lng: 44.51 })).toBeCloseTo(1111.95, 1);
    expect(distanceMeters({ lat: 0, lng: 0 }, { lat: 0, lng: 1 })).toBeCloseTo(111194.9, 0);
    expect(distanceMeters({ lat: 60, lng: 0 }, { lat: 60, lng: 1 })).toBeCloseTo(55597, -1);
  });
});

describe('midpoint', () => {
  it('is halfway between two places', () => {
    expect(midpoint({ lat: 40, lng: 44 }, { lat: 41, lng: 46 })).toEqual({ lat: 40.5, lng: 45 });
  });
});

describe('zoomToFit', () => {
  it.each([
    [0.01, 13],
    [0.05, 11],
    [1, 7],
    [100, 3],
    [0.00001, 17],
  ])('a span of %s degrees fits at zoom %s', (span, zoom) => {
    expect(zoomToFit({ lat: 40, lng: 44 }, { lat: 40 + span, lng: 44 })).toBe(zoom);
  });

  it('uses the larger of the two spans and closes in for a single place', () => {
    expect(zoomToFit({ lat: 40, lng: 44 }, { lat: 40.001, lng: 44.05 })).toBe(11);
    expect(zoomToFit({ lat: 40, lng: 44 }, { lat: 40, lng: 44 })).toBe(17);
  });
});

describe('addressAt', () => {
  const place = {
    place_id: 'osm:N9',
    name: null,
    address: '5 Abovyan St, Yerevan',
    location: { lat: 40.1801, lng: 44.5102 },
  };

  it('keeps the pin where it is and takes only the address (and id) from the provider', () => {
    expect(addressAt({ lat: 40.18, lng: 44.51 }, place)).toEqual({
      lat: 40.18,
      lng: 44.51,
      address: '5 Abovyan St, Yerevan',
      place_id: 'osm:N9',
    });
  });

  it('leaves the id out for a bare coordinate', () => {
    expect('place_id' in addressAt({ lat: 40.18, lng: 44.51 }, { ...place, place_id: null })).toBe(false);
  });
});
