import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { innerWayDefinitions, innerWayDefinitionForSoloLevel, innerWayEntriesForTag } from "@/data/innerWayDefinitions"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"
import type { WeaponId } from "@/types"

import { asTalentEffects } from "./helpers/shippedData"

const weapons: WeaponId[] = ["museflowWaistDrum", "willowbendFan"]
describe("Wings talent calculations", () => {
  it("applies independent rank conversions with caps and keeps Fan penetration distinct from ribbon damage", () => {
    for (const [rank, attack, cap, critCap, physicalCap] of [
      [13, 98, 22, 0.08512, 73.92],
      [14, 106, 23.6, 0.0912, 79.2],
    ]) {
      const effects = martialArtEffectsForRank(martialArtDefinitions, weapons, rank)
      const stats = calculateStatsWithEffects(
        { ...emptyStats, agility: 10000, minSilkbind: 10000 },
        effects,
        0,
        weapons,
      ).stats
      expect(stats.minPhys).toBeCloseTo(physicalCap)
      expect(stats.crit).toBeCloseTo(critCap)
      expect(stats.silkbindPenetration).toBeCloseTo(cap)
      expect(stats.silkbindDmgBonus).toBeCloseTo(rank === 13 ? 0.11 : 0.118)
      expect(stats.minSilkbind).toBe(10000 + attack * 2)
    }
    const stats = calculateStatsWithEffects(
      { ...emptyStats, agility: 100 },
      martialArtEffectsForRank(martialArtDefinitions, weapons, 13),
      0,
      weapons,
    ).stats
    expect(stats.minPhys).toBeCloseTo(26.4)
    expect(stats.crit).toBeCloseTo(0.0304)
    expect(stats.silkbindPenetration).toBeCloseTo(196 * 0.0672)
  })

  function hit(weapon: WeaponId, talent: number, buff?: string, drum = true, minPhys = 750, crit = 0) {
    const stats = { ...emptyStats, minPhys, maxPhys: 1000, minSilkbind: 100, maxSilkbind: 100, precision: 1, crit }
    const effects = asTalentEffects(martialArtDefinitions[weapon].talent[13][talent].effect)
    return calculateRotationBaseline({
      startAnchor: { rowId: "rotation-0" },
      timeline: {
        rotation: { name: "Talent fixture", steps: [{ type: "skill", skill: "Hit" }] },
        skills: {
          Hit: {
            castTime: 1,
            tags: [martialArtDefinitions[weapon].tag, ...(drum ? ["DrumSeries"] : [])],
            action: [
              ...(buff ? [{ type: "apply", target: "self", value: buff, time: 0 }] : []),
              { type: "damage", phyCoef: 1, attrCoef: 1, time: 0.1 },
            ],
          },
        },
        effectDefinitions: { Tailwind: { duration: 24, maxStack: 1 }, RadiantDrum: { duration: 6.5, maxStack: 1 } },
        eventDefinitions: {},
        dots: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: effects,
        weapons,
      },
      stats,
      derivedStats: calculateDerivedStats(stats, 0, {}, weapons),
      enemy: {
        name: "Dummy",
        level: 100,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      attunement: emptyAttunementStats,
      weapons,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }).metrics.totalDamage
  }
  it("gates drum base damage on its tag and either active buff", () => {
    const plain = hit("museflowWaistDrum", 0)
    expect(hit("museflowWaistDrum", 0, "Tailwind")).toBeCloseTo(plain * 1.4)
    expect(hit("museflowWaistDrum", 0, "RadiantDrum")).toBeCloseTo(plain * 1.4)
    expect(hit("museflowWaistDrum", 0, "Tailwind", false)).toBeCloseTo(plain)
  })
  it("scales drum Critical damage from sheet Critical and isolates it from other skills", () => {
    for (const crit of [0.2, 0.6]) {
      const plain = hit("museflowWaistDrum", 2, undefined, false, 750, crit)
      expect(hit("museflowWaistDrum", 2, undefined, true, 750, crit)).toBeCloseTo(
        plain * (1 + crit * Math.min(crit * 0.5, 0.3)),
      )
    }
  })
  it("requires Tailwind and the paired ribbon martial art for the Fan attack enhancement", () => {
    const plain = hit("willowbendFan", 0)
    expect(hit("willowbendFan", 0, "RadiantDrum")).toBeCloseTo(plain)
    expect(hit("willowbendFan", 0, "Tailwind")).toBeGreaterThan(plain)
  })
  it("scales the Fan damage bonus to its cap without double counting both damage channels", () => {
    for (const min of [375, 750, 1500]) {
      const plain = hit("willowbendFan", 2, undefined, true, min)
      expect(hit("willowbendFan", 2, "Tailwind", true, min)).toBeCloseTo(plain * (1 + Math.min(min * 0.00016, 0.12)))
    }
  })
})

describe("Wings Inner Way stat tiers", () => {
  it("resolves level tables once and accumulates T2 and T5 through the shared stat pipeline", () => {
    expect(innerWayEntriesForTag("SilkbindWings").map(([id]) => id)).toEqual(
      expect.arrayContaining(["HarmonySong", "ZephyrWhispers", "InkAndStrings", "BladesWill"]),
    )
    const expected = {
      HarmonySong: { minPhys: 97.8, directCrit: 0.046 },
      ZephyrWhispers: { crit: 0.101, critDmgBonus: 0.04 },
      InkAndStrings: { minPhys: 29.3, maxPhys: 58.7, physDmgBonus: 0.025 },
      BladesWill: { minVoidAttack: 18.5, maxVoidAttack: 36.9, formlessPenetration: 6 },
    }
    for (const [id, values] of Object.entries(expected)) {
      const definition = innerWayDefinitionForSoloLevel(innerWayDefinitions[id as keyof typeof innerWayDefinitions], 20)
      const effects = asTalentEffects(Object.values(definition.effect).flatMap(t => t.effect ?? []))
      const stats = calculateStatsWithEffects(emptyStats, effects, 0, weapons).rawStats
      for (const [key, value] of Object.entries(values)) expect(stats[key as keyof typeof stats]).toBeCloseTo(value)
    }
    for (const level of [5, 10, 17, 20]) {
      const effects = (key: "BladesWill" | "CelestialVigor") =>
        asTalentEffects(
          Object.values(innerWayDefinitionForSoloLevel(innerWayDefinitions[key], level).effect).flatMap(
            t => t.effect ?? [],
          ),
        )
      const a = calculateStatsWithEffects(emptyStats, effects("BladesWill"), 0, weapons).rawStats
      const b = calculateStatsWithEffects(emptyStats, effects("CelestialVigor"), 0, weapons).rawStats
      expect(a.minVoidAttack).toBe(b.minVoidAttack)
      expect(a.maxVoidAttack).toBe(b.maxVoidAttack)
    }
  })
})
