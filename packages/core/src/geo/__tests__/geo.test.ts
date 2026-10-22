import { decodePolyline, toAddressPoint } from '../index.ts';

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
