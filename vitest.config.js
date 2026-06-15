import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import {fileURLToPath} from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: "jsdom",
    setupFiles: "./src/test/setup.js",
    onConsoleLog(log) {
      if(log.includes("non-boolean attribute `inert`")) { return false; }
      if(log.includes("React Router Future Flag Warning")) { return false; }
    },
  },
  coverage: {
    provider: "v8",
    reporter: ["text", "json", "html"],
    include: ["src/**/*"],
    exclude: [
      "**/*.module.css",
      "src/assets/**/*",
      "**/constants.ts",
      "src/test/setup.js",
      "**/*.test.{js,jsx,ts,tsx}"
    ]
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
