import {defineConfig} from "vite";
import react from "@vitejs/plugin-react-swc";
import {viteStaticCopy} from "vite-plugin-static-copy";
import {fileURLToPath, URL} from "url";
import {writeFileSync} from "fs";
import {resolve} from "path";
// import {visualizer} from "rollup-plugin-visualizer";

// Computed once per build so the value embedded in the JS bundle (__BUILD_ID__)
// always matches the value written to dist/version.json - the client compares
// the two to detect a stale tab after a new deploy.
const buildId = process.env.GIT_SHA || Date.now().toString();

// Writes dist/version.json after the bundle is emitted. Served as a plain
// static file with a no-cache header (see firebase.json) so it can be polled
// for the latest deployed buildId without re-fetching or re-executing index.html/JS.
const versionFilePlugin = () => ({
  name: "version-file",
  writeBundle(options) {
    writeFileSync(resolve(options.dir, "version.json"), JSON.stringify({buildId}));
  }
});

export default defineConfig({
  define: {
    __BUILD_ID__: JSON.stringify(buildId)
  },
  css: {
    preprocessorOptions: {
      scss: {
        sassOptions: {
          quietDeps: true
        }
      }
    }
  },
  plugins: [
    viteStaticCopy({
      targets: [
        {
          src: "configuration.js",
          dest: ""
        }
      ]
    }),
    react(),
    versionFilePlugin(),
    // visualizer({open: true, gzipSize: true, brotliSize: true})
  ],
  optimizeDeps: {
    // elv-player-js is lazy-imported (VideoContainer) so Vite won't see it at
    // startup; pre-bundle it explicitly so the first play click doesn't trigger
    // an on-the-fly dep optimization + page reload that interrupts playback.
    include: ["hash.js", "@eluvio/elv-client-js", "@eluvio/elv-player-js/lib/index.js", "mux-embed", "node-interval-tree"],
  },
  build: {
    outDir: "dist",
    manifest: true,
    commonjsOptions: {
      include: [/node_modules/]
    },
    rollupOptions: {
      output: {
        manualChunks: {
          // Large stable vendor libraries - good for long-term caching
          "vendor-eluvio": ["@eluvio/elv-client-js"],
          "vendor-mantine": [
            "@mantine/core",
            "@mantine/hooks",
            "@mantine/form",
            "@mantine/notifications",
            "@mantine/dates",
            "mantine-datatable"
          ]
        }
      }
    }
  },
  server: {
    port: 8155,
    host: true
  },
  resolve: {
    // Synchronize with jsconfig.json
    alias: {
      "@/assets": fileURLToPath(new URL("./src/assets", import.meta.url)),
      "@/components": fileURLToPath(new URL("./src/components", import.meta.url)),
      "@/pages": fileURLToPath(new URL("./src/pages", import.meta.url)),
      "@/stores": fileURLToPath(new URL("./src/stores", import.meta.url)),
      "@/utils": fileURLToPath(new URL("./src/utils", import.meta.url))
    }
  }
});
