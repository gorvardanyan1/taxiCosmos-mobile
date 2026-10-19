import AsyncStorage from '@react-native-async-storage/async-storage';

/**
 * Where the person's own UI choices (theme, language) are kept between launches. Not secret, so not the secure store, and never the
 * session. A store that fails to read or write simply behaves as if nothing was saved: the app still opens with the defaults.
 */
export interface PreferenceStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
}

export const THEME_KEY = 'taxikosmos.ui.theme';
export const LOCALE_KEY = 'taxikosmos.ui.locale';

export const asyncStoragePreferences: PreferenceStore = {
  async get(key) {
    try {
      return await AsyncStorage.getItem(key);
    } catch {
      return null;
    }
  },
  async set(key, value) {
    try {
      await AsyncStorage.setItem(key, value);
    } catch {
      // The choice still applies for this session; it just is not remembered.
    }
  },
};

/** A store that lives only as long as the process: for tests and previews. */
export function createMemoryPreferences(initial: Record<string, string> = {}): PreferenceStore {
  const values = new Map(Object.entries(initial));

  return {
    get: (key) => Promise.resolve(values.get(key) ?? null),
    set: (key, value) => {
      values.set(key, value);

      return Promise.resolve();
    },
  };
}
