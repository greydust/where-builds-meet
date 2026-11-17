import { mkdirSync } from "node:fs"
import { tmpdir } from "node:os"
import { fileURLToPath } from "node:url"

import react from "@vitejs/plugin-react"
import { defineConfig } from "vitest/config"

import { alias } from "./aliases.js"

// The Windows Codex sandbox rejects Vitest's atomic cache renames in its Temp
// directory. Workers then receive cache paths that were never written. Keep the
// temporary modules in the writable workspace.
if (process.platform === "win32" && tmpdir().includes("#!sandbox.")) {
  const testTemp = fileURLToPath(new URL("./local/vitest-tmp/", import.meta.url))
  mkdirSync(testTemp, { recursive: true })
  process.env.TEMP = testTemp
  process.env.TMP = testTemp
}

// Test conventions: direct imports with no Vite server boilerplate; tests resolve the
// same prefixes as the app, so `import buff from "@gamedata/buff/general.json"` and
// `import { allStatDefinitions } from "@/data/statDefinitions"` both work out of the box.
// DOM tests opt in per file with `// @vitest-environment jsdom`. Helpers live in
// tests/helpers/; DPS baselines in tests/snapshots/. The remaining
// script/probe/*.mjs files are benchmarks, not checks.
// Keep observable-behavior assertions; do not restate literal source values.
export default defineConfig({
  plugins: [react()],
  resolve: { alias },
  test: {
    environment: "node",
    include: ["tests/**/*.test.{ts,tsx}"],
    // Batch verification suites formerly ran as unbounded node processes;
    // keep a generous bound instead of the 5s unit-test default.
    testTimeout: 120_000,
  },
})
