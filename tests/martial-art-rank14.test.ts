import { describe, expect, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, calculateSimulatedDamageBreakdown, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { calculateStatsWithEffects } from "@/calculations/statEffects"
import { splitStaticDamageEffect } from "@/calculations/unconditionalDamageEffects"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"

const enemy = {
  name: "Probe",
  level: 96,
  defense: 20,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}
const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 50, maxBellstrike: 50, precision: 1 }
const context: DamageContext = {
  stats,
  derivedStats: calculateDerivedStats(stats, 0),
  enemy,
  weapons: ["namelessSword", "namelessSpear"],
  skillTags: ["MartialArts", "NamelessSword"],
  effects: [],
  buffs: [],
  attunement: emptyAttunementStats,
}

describe("rank-14 martial-art talents", () => {
  it("scales flat attack separately from coefficients in expected, sampled, and aggregated damage", () => {
    const action = { phyCoef: 2, attrCoef: 3, phyBonus: 40, attrBonus: 20 }
    const effect = { flatAttackBonus: 0.0725, coefficientBonusWithoutFlatAttack: 0.00725 }
    const expected = { physical: 2 * 80 + 40 * 1.0725, bellstrike: (3 * 50 + 20 * 1.0725) * 1.5 }
    const split = splitStaticDamageEffect(effect, context.weapons)
    for (const modified of [
      { ...context, effects: [effect] },
      { ...context, unconditionalDamageEffects: split.aggregated, effects: split.remaining ? [split.remaining] : [] },
    ]) {
      const damage = calculateDamageBreakdown(action, modified)
      const sampled = calculateSimulatedDamageBreakdown(action, modified, () => 0.5)
      expect(damage.physical).toBeCloseTo(expected.physical, 10)
      expect(damage.bellstrike).toBeCloseTo(expected.bellstrike, 10)
      expect(sampled.total).toBeCloseTo(damage.total, 10)
      const coefficientOnly = calculateDamageBreakdown({ phyCoef: 2, attrCoef: 3, phyBonus: 0, attrBonus: 0 }, modified)
      expect(coefficientOnly.physical).toBeCloseTo(2 * 80 * 1.00725, 10)
      expect(coefficientOnly.bellstrike).toBeCloseTo(3 * 50 * 1.00725 * 1.5, 10)
      const mixed = calculateDamageBreakdown({ phyCoef: 2, attrCoef: 3, phyBonus: 0, attrBonus: 20 }, modified)
      expect(mixed.physical).toBeCloseTo(2 * 80, 10)
    }
    const flatOnly = calculateDamageBreakdown({ phyCoef: 2 }, { ...context, effects: [{ flatAttackBonus: 0.0725 }] })
    expect(flatOnly.physical).toBeCloseTo(2 * 80, 10)
  })

  it("selects upgraded raw attack and conversion caps without stacking prior ranks", () => {
    const calculate = (rank: number, agility: number) =>
      calculateStatsWithEffects(
        { ...emptyStats, agility, minBamboocut: 1000 },
        martialArtEffectsForRank(martialArtDefinitions, ["heavenwill", "heavenwill"], rank).filter(
          effect => !effect.requirement,
        ),
        0,
        ["heavenwill"],
      )
    const old = calculate(13, 1000)
    const next = calculate(14, 1000)
    expect(next.rawStats.minBamboocut).toBe(1106)
    expect(next.rawStats.maxBamboocut).toBe(212)
    expect(old.stats.minPhys).toBeCloseTo(73.92, 10)
    expect(next.stats.minPhys).toBeCloseTo(79.2, 10)
    expect(calculate(14, 299).stats.minPhys).toBeCloseTo(299 * 0.264, 10)
    expect(next.stats.bamboocutDmgBonus).toBeCloseTo(0.118, 10)
    expect(calculate(13, 1000)).toEqual(old)
  })

  it("applies shipped additional-attack talents only to their art through the worker pipeline", () => {
    const makeBundle = (rank: number): RotationSimulationBundle => {
      // Isolate the new talent from the independently verified raw-stat upgrades.
      const definitions = Object.fromEntries(
        Object.entries(martialArtDefinitions).map(([key, art]) => [
          key,
          {
            ...art,
            talent: art.talent.map(talents => talents.filter(talent => /Additional Attack/i.test(talent.name))),
          },
        ]),
      )
      const weapons = ["namelessSword", "heavenwill"] as const
      const setupEffects = martialArtEffectsForRank(definitions, weapons, rank)
      return {
        timeline: {
          rotation: {
            name: "Scope",
            steps: [
              { type: "skill", skill: "Sword" },
              { type: "skill", skill: "Falcon" },
              { type: "skill", skill: "Mystic" },
              { type: "skill", skill: "OtherArt" },
            ],
          },
          skills: {
            Sword: {
              castTime: 1,
              tags: ["MartialArts", "NamelessSword"],
              action: [{ type: "damage", phyCoef: 1, phyBonus: 40, attrCoef: 1, attrBonus: 20, time: 0 }],
            },
            Falcon: {
              castTime: 1,
              tags: ["MartialArts", "HeavenwillGauntlets", "Triggered", "Falcon"],
              action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 0 }],
            },
            Mystic: {
              castTime: 1,
              tags: ["Mystic"],
              action: [{ type: "damage", phyCoef: 1, phyBonus: 40, attrCoef: 1, attrBonus: 20, time: 0 }],
            },
            OtherArt: {
              castTime: 1,
              tags: ["MartialArts", "StrategicSword"],
              action: [{ type: "damage", phyCoef: 1, phyBonus: 40, time: 0 }],
            },
          },
          eventDefinitions: {},
          dots: {},
          effectDefinitions: {},
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects,
          weapons: [...weapons],
        },
        startAnchor: { rowId: "rotation-0" },
        stats,
        derivedStats: calculateDerivedStats(stats, 0),
        enemy,
        attunement: emptyAttunementStats,
        weapons: [...weapons],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      }
    }
    const old = calculateRotationBaseline(makeBundle(13))
    const next = calculateRotationBaseline(makeBundle(14))
    // Only Sword's 40 physical / 20 primary-path flat attack and Falcon's coefficients change.
    const expectedDelta = (40 + 20 * 1.5) * 0.0725 + (80 + 50 * 1.5) * 0.00725
    expect(next.metrics.totalDamage - old.metrics.totalDamage).toBeCloseTo(expectedDelta, 10)
    const sampled = calculateSimulatedRotationRun(makeBundle(14), () => 0.5)
    expect(sampled.resolvedSequence.reduce((total, hit) => total + hit.breakdown.total, 0)).toBeCloseTo(
      next.metrics.totalDamage,
      10,
    )
  })
})
