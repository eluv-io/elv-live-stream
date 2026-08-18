import {lazy} from "react";

// After a new deploy, a tab still running the old bundle can try to lazy-load
// a route chunk whose hashed filename no longer exists on the server (old
// build files are gone from hosting), throwing
// "Failed to fetch dynamically imported module" straight into React Router's
// default error boundary. Wrapping lazy() importers with this retries once via
// a full reload - which pulls the new bundle - instead of crashing the app.
const RELOAD_FLAG = "elv-chunk-reload-attempted";

export default function lazyWithReload(importer) {
  return lazy(async () => {
    try {
      const module = await importer();
      sessionStorage.removeItem(RELOAD_FLAG);
      return module;
    } catch (error) {
      if(sessionStorage.getItem(RELOAD_FLAG)) {
        throw error;
      }

      sessionStorage.setItem(RELOAD_FLAG, "1");
      window.location.reload();

      // Reload is in flight - never resolve so React doesn't render an error state.
      return new Promise(() => {});
    }
  });
}
