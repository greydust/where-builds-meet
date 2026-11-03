// @vitest-environment jsdom
import { beforeEach, expect, it } from "vitest"

import { loadAttunementOverrides, loadAttunementStats } from "@/application/persistence/attunements"
import { attunementOverrideStorageKey, attunementStorageKey } from "@/application/persistence/keys"
import { migrateAttunementValues } from "@/calculations/attunementStats"
import { parseCharacterProfiles } from "@/characterProfiles"
import { buildPresetInventory, defaultBuildPresets, parseGearInventory } from "@/gear"

const canonical = "vernalProjectile280304Boost"
const retired = "vernalProjectile280305Boost"
beforeEach(() => localStorage.clear())

it("merges saved attunement totals and overrides without dropping either bonus", () => {
  for (const key of [attunementStorageKey, attunementOverrideStorageKey])
    localStorage.setItem(key, JSON.stringify({ [canonical]: 0.12, [retired]: 0.06 }))
  expect(loadAttunementStats()[canonical]).toBeCloseTo(0.18, 12)
  expect(loadAttunementOverrides()[canonical]).toBeCloseTo(0.18, 12)
  expect(loadAttunementStats()).not.toHaveProperty(retired)
  expect(loadAttunementOverrides()).not.toHaveProperty(retired)
  const once = migrateAttunementValues({ [canonical]: 0.12, [retired]: 0.06 })
  expect(migrateAttunementValues(once)).toEqual(once)
})

it("converts the retired legacy percentage key before applying unit conversion", () => {
  localStorage.setItem("wwm-attunement-session-v1", JSON.stringify({ [retired]: 6 }))
  expect(loadAttunementStats()[canonical]).toBe(0.06)
})

it("preserves old gear and imported profile bonuses under the canonical key", () => {
  const inventory = buildPresetInventory(
    defaultBuildPresets.find(build => build.id === "jade-graduate")!,
    100,
  )
  const item = inventory.items.find(item => item.attunement?.key === canonical)!
  item.attunement!.key = retired
  const loaded = parseGearInventory(inventory)
  expect(loaded.items).toHaveLength(inventory.items.length)
  expect(loaded.items.find(candidate => candidate.id === item.id)!.attunement).toEqual({
    key: canonical,
    value: item.attunement!.value,
  })
  const [profile] = parseCharacterProfiles([
    { id: "legacy-jade", name: "Legacy Jade", attunementOverrides: { [retired]: 0.06 } },
  ])
  expect(profile.attunementOverrides).toEqual({ [canonical]: 0.06 })
})
