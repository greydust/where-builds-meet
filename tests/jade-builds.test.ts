import { describe, expect, it } from "vitest"

import { calculateGlobalStatState } from "@/application/characterComposition"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets, maxGearRoll } from "@/gear"

describe("Jade starter builds", () => {
  it.each([
    [96, "jade-graduate", "jade-fully-relayed-max"],
    [100, "jade-graduate", "jade-fully-relayed-max"],
    [96, "jade-graduate-short", "jade-fully-relayed-max-bp"],
    [100, "jade-graduate-short", "jade-fully-relayed-max-bp"],
  ] as const)("loads Graduate with full non-relayed rolls at tier %s (%s)", (tier, graduateId, referenceId) => {
    const preset = defaultBuildPresets.find(build => build.id === graduateId)!
    const reference = buildPresetInventory(
      defaultBuildPresets.find(build => build.id === referenceId)!,
      tier,
    )
    const inventory = buildPresetInventory(preset, tier)
    expect(inventory.items).toHaveLength(reference.items.length)
    for (const [index, item] of inventory.items.entries()) {
      expect(item.relayed).not.toBe(true)
      const affixes = [item.baseAffix!, ...item.additionalAffixes]
      const source = reference.items[index]
      expect(affixes.map(affix => affix.key)).toEqual(
        [source.baseAffix!, ...source.additionalAffixes].map(affix => affix.key),
      )
      for (const affix of affixes) expect(affix.value).toBe(maxGearRoll(affix.key, "affix", false, tier))
    }
  })
  it.each([96, 100] as const)("reaches approximately 80% effective critical rate at gear tier %s", tier => {
    for (const id of ["jade-fully-relayed-min", "jade-fully-relayed-max"]) {
      const preset = defaultBuildPresets.find(build => build.id === id)!
      const inventory = buildPresetInventory(preset, tier)
      const gear = calculateEquippedGearEffects(inventory, ["vernalUmbrella", "inkwellFan"])
      const result = calculateGlobalStatState(
        {},
        { weapons: ["vernalUmbrella", "inkwellFan"], breakthrough: tier === 96 ? "17" : "18", ping: 40 },
        { rawStat: gear.stats },
        preset.setup!,
        { food: "SimmeringFishSlices", script: "None", divinecraft: "Fire" },
        "silkbindJade",
      )
      expect(result.derivedStats.effectiveCrit).toBeGreaterThanOrEqual(0.79)
      expect(result.derivedStats.effectiveCrit).toBeLessThanOrEqual(0.8)
      expect(gear.stats.umbrellaDmgBoost).toBeGreaterThan(0)
      expect(gear.stats.hengBladeDmgBoost ?? 0).toBe(0)
    }
  })
})
