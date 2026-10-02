import { assert, describe, it } from "vitest"

import type { InnerWayDefinition } from "@/data/innerWayDefinitions"

import { probeLoad } from "./helpers/probe-loader.js"

// Ported from script/probe/check-innerway-filter.mjs.
describe("innerway-filter", () => {
  it("Inner Way filter behavior checks passed", async () => {
    const { innerWayDefinitions, innerWayEntriesForTag } = await probeLoad<
      typeof import("../src/data/innerWayDefinitions")
    >("/src/data/innerWayDefinitions.ts")
    // Every tag any Inner Way declares, so each filter is checked against the whole table.
    const definitions: Record<string, InnerWayDefinition> = innerWayDefinitions
    const allTags = new Set<string>(Object.values(definitions).flatMap(definition => definition.tags ?? []))

    for (const tag of allTags) {
      const filtered = innerWayEntriesForTag(tag)
      assert(filtered.length > 0, `The ${tag} filter must return at least one Inner Way.`)
      const eligible = Object.entries(definitions).filter(([, definition]) => definition.tags?.includes(tag))
      assert(
        filtered.every(([id]) => eligible.some(([eligibleId]) => eligibleId === id)),
        `The ${tag} filter returned an Inner Way without that tag.`,
      )
      for (const [id] of eligible) {
        assert(
          filtered.some(([filteredId]) => filteredId === id),
          `The ${tag} filter omitted eligible Inner Way ${id}.`,
        )
      }
    }

    assert(innerWayEntriesForTag("__unknown_path_tag__").length === 0, "An unknown tag must return no Inner Ways.")

    for (const tag of allTags) {
      const names = innerWayEntriesForTag(tag).map(([, definition]) => definition.name)
      assert.deepEqual(
        names,
        names.toSorted((left, right) => left.localeCompare(right)),
        `The ${tag} selector must list Inner Ways in display-name order.`,
      )
    }
  })
})
