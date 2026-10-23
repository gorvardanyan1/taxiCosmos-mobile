# Map, location and address search (M3-T1)

Free maps only (MVP scope): OpenStreetMap tiles drawn by MapLibre, addresses from the backend's `/geo/*` (Nominatim, routes from OSRM).

## Pieces

| Piece                                              | Where                                      | What it does                                                                                                                                                        |
| -------------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `MapView`                                          | `@taxikosmos/ui`                           | The map: light/dark look, markers (rider, car, driver arrow, pickup, drop-off), a route line, a fixed centre pin, a "my location" button. No network, no location.  |
| `buildMapStyle`                                    | `@taxikosmos/ui`                           | The raster style for a theme and a tile URL. Dark mode dims and desaturates the same tiles; the page behind is the template's map grey.                             |
| `decodePolyline`, `toAddressPoint`, `AddressPoint` | `@taxikosmos/core`                         | Turns `/geo/route`'s polyline into points; turns a `GeoPlace` into `{lat, lng, address, place_id?}`, the shape booking and saved places use.                        |
| `useForegroundLocation`, `LocationPrompt`          | `@taxikosmos/app-shell`                    | Permission state (`checking`, `undetermined`, `granted`, `denied`, `blocked`), the position, and the explain-first card. Foreground only; no background location.   |
| `useAddressSearch`, `AddressSearch`                | `@taxikosmos/app-shell`                    | The address box: one request per 300 ms pause, one session token per search (reused for the final `/geo/places/{id}`), a message for every failure.                 |
| `MapPreviewScreen` (`/map-preview`)                | `@taxikosmos/app-shell`, both apps' routes | All of it together as the booking screens (M4) will use it. Development and staging only; a production build redirects home. Opened from the home screen's **Map**. |

## Rules the code keeps

- The map and the address box never depend on the location: refusing it shows a card (`Location is off`) beside them, never instead of them.
- The system permission dialog is only shown after the explain-first card's **Allow location**. A permission the system will not ask for again
  (`blocked`) offers **Open settings**; coming back from Settings is noticed.
- Picking by dragging uses a pin fixed in the middle and the map moving under it (`onCenterChange` fires when the person lets go, never for moves
  the screen made), then `/geo/reverse` for that spot. A place chosen by typing wins until the map is moved again.
- Coordinates are never logged or sent to Sentry; the scrubber already blanks them.

## Tiles

`MAP_TILE_URL` (`docs/environments.md`) is a raster template such as `https://tiles.example.com/{z}/{x}/{y}.png`. Unset, the app uses
OpenStreetMap's public server, which its usage policy allows for development only. Before launch, self-host tiles (natively, no Docker) or use
a provider, and set `MAP_TILE_URL` per EAS environment. The attribution `© OpenStreetMap contributors` is shown by the map.

## Native build

`@maplibre/maplibre-react-native` and `expo-location` are native modules: Expo Go cannot run them. Build the development build
(`pnpm rider android` / `pnpm driver android`, or `eas build --profile development`) after pulling M3-T1. The `expo-location` plugin text names
the app and asks for "while using" only.

## Testing

Jest cannot run the native map. `packages/ui/jest/maplibre.js` stands in for MapLibre (each component becomes a `View` that keeps its props, and
the camera records `flyTo`) and `jest/setup.js` stands in for `expo-location`; tests read what the screen asked the map to show. The map itself,
tile loading and the real permission dialogs are checked on a device (`maestro/flows/map-address-search.yaml` and the QA list in the PR).
