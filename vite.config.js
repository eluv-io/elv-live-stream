import {defineConfig} from "vite";
import react from "@vitejs/plugin-react-swc";
import {viteStaticCopy} from "vite-plugin-static-copy";
import {fileURLToPath, URL} from "url";

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
    react()
  ],
  optimizeDeps: {
    include: ["hash.js", "@eluvio/elv-client-js", "mux-embed"],
  },
  build: {
    outDir: "dist",
    manifest: true
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
      "@/utils": fileURLToPath(new URL("./src/utils", import.meta.url)),
      "@/hooks": fileURLToPath(new URL("./src/hooks", import.meta.url))
    }
  }
});
