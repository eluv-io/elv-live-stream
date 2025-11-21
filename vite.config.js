import {defineConfig} from "vite";
import react from "@vitejs/plugin-react-swc";
import {viteStaticCopy} from "vite-plugin-static-copy";
import {fileURLToPath, URL} from "url";
import {visualizer} from "rollup-plugin-visualizer";

export default defineConfig({
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
    // Uncomment to analyze bundle size
    // visualizer({
    //   filename: "bundle-analysis.html",
    //   open: false,
    //   gzipSize: true,
    //   brotliSize: true
    // })
  ],
  optimizeDeps: {
    include: ["hash.js", "@eluvio/elv-client-js", "mux-embed", "node-interval-tree"],
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
          'vendor-eluvio': ['@eluvio/elv-client-js'],
          'vendor-mantine': [
            '@mantine/core',
            '@mantine/hooks',
            '@mantine/form',
            '@mantine/notifications',
            '@mantine/dates',
            'mantine-datatable'
          ]
          // Other small deps (react, mobx, icons) bundled with app code
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
