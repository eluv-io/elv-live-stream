import {makeAutoObservable, toJS} from "mobx";
import type RootStore from "@/stores/RootStore";

interface TableFilters {
  streams: string[];
  outputs: string[];
}

interface Settings {
  tableFilters: TableFilters;
}

type SettingsKey = keyof Settings;

const DEFAULT_SETTINGS: Settings = {
  tableFilters: {streams: [], outputs: []}
};

const DefaultFor = <K extends SettingsKey>(key: K): Settings[K] => structuredClone(DEFAULT_SETTINGS[key]);

// Only pick the fields the current shape declares - discards anything else (e.g. stray
// keys from a previously corrupted write) instead of carrying it forward indefinitely.
const Sanitize = <K extends SettingsKey>(key: K, value: any): Settings[K] => {
  const defaults = DefaultFor(key);

  return Object.fromEntries(
    Object.keys(defaults).map(field => [field, value?.[field] ?? (defaults as any)[field]])
  ) as Settings[K];
};

const APP_ID = "live-stream-manager";
const PERSIST_DEBOUNCE_MS = 800;

class UserSettingsStore {
  rootStore: RootStore;
  loaded = false;
  settings: Settings = structuredClone(DEFAULT_SETTINGS);
  persistTimeouts: Partial<Record<SettingsKey, ReturnType<typeof setTimeout>>> = {};

  constructor(rootStore: RootStore) {
    this.rootStore = rootStore;

    makeAutoObservable(this, {persistTimeouts: false}, {autoBind: true});
  }

  *Load() {
    const keys = Object.keys(DEFAULT_SETTINGS) as SettingsKey[];

    yield Promise.all(keys.map(key => this.LoadKey(key)));

    this.loaded = true;
  }

  *LoadKey(key: SettingsKey) {
    try {
      const response = yield this.rootStore.client.walletClient.ProfileMetadata({
        type: "app",
        appId: APP_ID,
        mode: "private",
        key
      });

      if(response) {
        const parsed = typeof response === "string" ? JSON.parse(response) : response;
        this.settings = {...this.settings, [key]: Sanitize(key, parsed)};
      }
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to load user settings for "${key}"`, error);
    }
  }

  Persist<K extends SettingsKey>(key: K, update: Partial<Settings[K]>) {
    this.settings = {
      ...this.settings,
      [key]: {...this.settings[key], ...update}
    };

    if(this.persistTimeouts[key]) {
      clearTimeout(this.persistTimeouts[key]);
    }

    this.persistTimeouts[key] = setTimeout(() => this.Save(key, this.settings[key]), PERSIST_DEBOUNCE_MS);
  }

  *Save<K extends SettingsKey>(key: K, value: Settings[K]) {
    try {
      yield this.rootStore.client.walletClient.SetProfileMetadata({
        type: "app",
        appId: APP_ID,
        mode: "private",
        key,
        value: toJS(value)
      });
    } catch(error) {
      // eslint-disable-next-line no-console
      console.error(`Failed to persist user settings for "${key}"`, error);
    }
  }
}

export default UserSettingsStore;
