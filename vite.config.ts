import { randomUUID } from "node:crypto"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vite"
import { imagetools } from "vite-imagetools"

const buildVersion = randomUUID()

export default defineConfig(({ command }) => ({
  // Calculation probes create separate Vite servers with the default cache path.
  cacheDir: "node_modules/.vite-app",
  optimizeDeps: { entries: ["index.html"] },
  plugins: [
    react(),
    imagetools(),
    {
      name: "deployment-version",
      generateBundle() {
        this.emitFile({ type: "asset", fileName: "version.json", source: JSON.stringify({ version: buildVersion }) })
      },
    },
  ],
  define: { __APP_VERSION__: JSON.stringify(buildVersion) },
  base: command === "build" ? "/where-builds-meet/" : "/",
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (
            id.includes("node_modules/react/") ||
            id.includes("node_modules/react-dom/") ||
            id.includes("node_modules/scheduler/")
          ) {
            return "vendor-react"
          }
          if (id.includes("/data/")) {
            return "game-data"
          }
        },
      },
    },
  },
}))
