import breakthroughs from "@gamedata/breakthrough.json"
import { describe, expect, it } from "vitest"

import { calculateGlobalStatState } from "@/application/characterComposition"
import { buildPresetInventory, calculateEquippedGearEffects, defaultBuildPresets, maxGearRoll } from "@/gear"

describe("Jade starter builds", () => {
  it.each([
    [96, "jade-graduate", "jade-fully-relayed-max"],
    [100, "jade-graduate", "jade-fully-relayed-max"],
    [96, "jade-graduate-short", "jade-fully-relayed-max-bp"],
    [100, "jade-graduate-short", "jade-fully-relayed-max-bp"],
    [96, "jade-full-bp", "jade-bp-max"],
    [100, "jade-full-bp", "jade-bp-max"],
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
      const graduateFan = tier === 100 && item.definitionId === "fan" && graduateId !== "jade-graduate"
      const expectedKeys = [source.baseAffix!, ...source.additionalAffixes].map(affix =>
        graduateFan && affix.key === "crit" ? "agility" : affix.key,
      )
      expect(affixes.map(affix => affix.key)).toEqual(expectedKeys)
      for (const affix of affixes) expect(affix.value).toBe(maxGearRoll(affix.key, "affix", false, tier))
    }
  })
  it.each(["17", "18", "19"])("keeps every family near its rate caps at breakthrough %s", breakthrough => {
    const builds = defaultBuildPresets.filter(build => build.id.startsWith("jade-"))
    expect(builds).toHaveLength(9)
    for (const preset of builds) {
      const inventory = buildPresetInventory(preset, breakthrough === "17" ? 96 : 100)
      const gear = calculateEquippedGearEffects(inventory, ["vernalUmbrella", "inkwellFan"])
      const result = calculateGlobalStatState(
        {},
        { weapons: ["vernalUmbrella", "inkwellFan"], breakthrough, ping: 40 },
        { rawStat: gear.stats },
        preset.setup!,
        { food: "SimmeringFishSlices", script: "None", divinecraft: "Fire" },
        "silkbindJade",
      )
      const rates = result.derivedStats
      const reachableCrit = Math.min(0.8 + rates.directCrit, 1 - rates.finalAffinity)
      expect(rates.effectivePrecision).toBeCloseTo(1, 6)
      // Full-value rolls trade a small BT18 shortfall for almost exact BT19 rates.
      expect(rates.finalCrit).toBeGreaterThanOrEqual(reachableCrit - 0.02)
      expect(rates.finalCrit).toBeLessThanOrEqual(reachableCrit)
      const resistance = breakthroughs[breakthrough as keyof typeof breakthroughs].judgementResistance
      const precisionBudget = 0.65 + 0.35 * (1 + resistance)
      // Check the uncapped sheet, so a redundant Precision roll cannot hide behind 100%.
      expect(result.stats.precision).toBeLessThanOrEqual(precisionBudget + 0.041)
      const bp = preset.setup!.innerWays.some(way => way.innerWay === "BreakingPoint")
      const critBudget = (reachableCrit - rates.directCrit) * (1 + resistance)
      // Tier 100 Max BP trades one agility roll for crit to maximize BT18 rotation DPS.
      const extraCritRoll =
        breakthrough !== "17" && preset.relayed && bp && preset.name.includes(" Max ")
          ? maxGearRoll("crit", "affix", true, 100)!
          : 0
      expect(result.stats.crit).toBeLessThanOrEqual(critBudget + (bp ? 0.055 : 0.105) + extraCritRoll)
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
