import {lazy} from "react";

// After a new deploy, a tab still running the old bundle can try to lazy-load
// a route chunk whose hashed filename no longer exists on the server (old
// build files are gone from hosting), throwing
// "Failed to fetch dynamically imported module" straight into React Router's
// default error boundary. Wrapping lazy() importers with this retries once via
// a full reload - which pulls the new bundle - instead of crashing the app.
//
// The flag is keyed per-chunk (not shared) so a chunk that's genuinely and
// persistently broken can't have its retry flag cleared by an unrelated
// chunk succeeding, which would otherwise cause an infinite reload loop.
const RELOAD_FLAG_PREFIX = "elv-chunk-reload-attempted:";

// Exported separately from the lazy() wrapper so the retry logic can be
// unit-tested without rendering a Suspense/ErrorBoundary tree.
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
