import type { LatLng } from '@taxikosmos/core';
import * as Location from 'expo-location';
import { useCallback, useEffect, useState } from 'react';
import { AppState } from 'react-native';

/**
 * `checking`: the phone has not been asked yet. `undetermined`: the person was never asked (show why we want it first).
 * `denied`: they said no but the system will ask again. `blocked`: they said no for good; only the phone's Settings can change it.
 */
export type LocationPermission = 'checking' | 'undetermined' | 'granted' | 'denied' | 'blocked';

export interface ForegroundLocation {
  permission: LocationPermission;
  /** The last position found; `null` until there is one. */
  position: LatLng | null;
  locating: boolean;
  /** The last attempt to find the position failed (location switched off, no signal). Cleared by the next attempt. */
  failed: boolean;
  /** Asks the system for permission (the rationale screen's "Allow" button) and, if given, finds the position. */
  request: () => Promise<void>;
  /** Finds the position now. Does nothing without permission. */
  locate: () => Promise<void>;
}

/** What the system currently says, without asking. A failure to ask counts as a refusal: the screen then offers the address box. */
async function readPermission(): Promise<LocationPermission> {
  try {
    return permissionOf(await Location.getForegroundPermissionsAsync());
  } catch {
    return 'denied';
  }
}

function permissionOf(response: Location.LocationPermissionResponse): LocationPermission {
  if (response.status === Location.PermissionStatus.GRANTED) {
    return 'granted';
  }

  if (response.status === Location.PermissionStatus.UNDETERMINED) {
    return 'undetermined';
  }

  return response.canAskAgain ? 'denied' : 'blocked';
}

/**
 * The phone's position while the app is open (foreground only: there is no background location in the MVP). Reads the permission without asking,
 * finds the position when it is already granted, and looks again when the app returns from Settings. It never throws: a refusal or a failure is a
 * state the screen shows, so the map and the address search keep working without it.
 */
export function useForegroundLocation(): ForegroundLocation {
  const [permission, setPermission] = useState<LocationPermission>('checking');
  const [position, setPosition] = useState<LatLng | null>(null);
  const [locating, setLocating] = useState(false);
  const [failed, setFailed] = useState(false);

  const locate = useCallback(async () => {
    setLocating(true);
    setFailed(false);

    try {
      const found = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      setPosition({ lat: found.coords.latitude, lng: found.coords.longitude });
    } catch {
      setFailed(true);
    } finally {
      setLocating(false);
    }
  }, []);

  const request = useCallback(async () => {
    try {
      const next = permissionOf(await Location.requestForegroundPermissionsAsync());
      setPermission(next);

      if (next === 'granted') {
        await locate();
      }
    } catch {
      setPermission('denied');
    }
  }, [locate]);

  useEffect(() => {
    let active = true;

    const refresh = () =>
      readPermission().then((next) => {
        if (active) {
          setPermission(next);

          if (next === 'granted') {
            void locate();
          }
        }
      });

    void refresh();
    // Back from the phone's Settings: pick up a change the person made there.
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void refresh();
      }
    });

    return () => {
      active = false;
      subscription.remove();
    };
  }, [locate]);

  return { permission, position, locating, failed, request, locate };
}
