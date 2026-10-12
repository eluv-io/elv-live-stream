import {lazy} from "react";

// After a deploy, a stale tab can fail to lazy-load a chunk whose hashed file is gone.
// Retry once via a full reload (pulls the new bundle) instead of crashing.
// The flag is per-chunk so an unrelated chunk succeeding can't clear it and cause a reload loop.
const RELOAD_FLAG_PREFIX = "elv-chunk-reload-attempted:";

// Split from the lazy() wrapper so it can be unit-tested without Suspense.
export function withReloadOnce(importer, key) {
  const reloadFlag = RELOAD_FLAG_PREFIX + key;

  return async () => {
    try {
      const module = await importer();
      sessionStorage.removeItem(reloadFlag);
      return module;
    } catch (error) {
      if(sessionStorage.getItem(reloadFlag)) {
        throw error;
      }

      sessionStorage.setItem(reloadFlag, "1");
      window.location.reload();

      // Reload is in flight - never resolve so React doesn't render an error state.
      return new Promise(() => {});
    }
  };
}

export default function lazyWithReload(importer, key) {
  return lazy(withReloadOnce(importer, key));
}
