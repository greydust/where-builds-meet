import { readFile } from "node:fs/promises"

import { assert, describe, it } from "vitest"

import { probeLoad } from "./helpers/probe-loader.js"

// The character sheet resolves Inner Way labels with a direct
// `system.innerWay.<id>` lookup instead of gameText(), so every registered Inner Way
// needs that canonical row or the selector silently falls back to English.
describe("innerway-canonical-names", () => {
  it("gives every registered Inner Way a canonical translation row", async () => {
    const { innerWayDefinitions } = await probeLoad<typeof import("../src/data/innerWayDefinitions")>(
      "/src/data/innerWayDefinitions.ts",
    )
    const catalog = await readFile(new URL("../locales/translations.csv", import.meta.url), "utf8")
    const rows = new Map(
      catalog
        .split(/\r?\n/)
        .filter(Boolean)
        .slice(1)
        .map(line => {
          const [key, english] = line.split(",")
          return [key, english]
        }),
    )

    const canonicalOwners = new Map<string, string>()
    for (const id of Object.keys(innerWayDefinitions)) {
      const key = `system.innerWay.${id.charAt(0).toLowerCase()}${id.slice(1)}`
      const english = innerWayDefinitions[id as keyof typeof innerWayDefinitions].name
      assert.equal(rows.get(key), english, `The character sheet looks up ${key} for ${id}, so it must be canonical.`)
      const previous = canonicalOwners.get(english)
      assert(!previous, `${english} is owned by both ${previous} and ${key}; canonical terms must be unique.`)
      canonicalOwners.set(english, key)
    }

    for (const key of rows.keys())
      if (key.startsWith("system.innerWay."))
        assert(
          canonicalOwners.has(rows.get(key)!),
          `${key} is a stale canonical row; no registered Inner Way owns that name.`,
        )
  })
})
