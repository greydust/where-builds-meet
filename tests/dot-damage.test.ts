import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import type { EditableObject } from "@/calculations/rotationTimeline"

/** One Soul-Shaken stack rule as this spec reads it: a gate plus its damage sheet. */
type StackRule = { requirement?: unknown; effect?: EditableObject }

import { effectState } from "../src/calculations/trackedEffectState"
import { isClose } from "./helpers/floatEquality"

// Ported from script/probe/check-dot-damage.mjs.
describe("dot-damage", () => {
  it("DOT damage and Soul-Shaken checks passed", async () => {
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts")
    const soulShaken = (await import("../data/debuff/bellstrike-umbra.json")).default.SoulShaken as {
      stackEffects: StackRule[][]
    }
    const closeTo = (actual: number | undefined, expected: number) => isClose(actual, expected, 1e-9)
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const baseContext = {
      stats,
      attunement: emptyAttunementStats,
      skillTags: [],
      weapons: [],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    }
    const damage = (effects: EditableObject[], isDot: boolean, skillTags: string[] = []) =>
      calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...baseContext, skillTags, effects, isDot })
    const baselineDirect = damage([], false)
    const physicalOnly = calculateDamageBreakdown({ phyCoef: 0.02 }, { ...baseContext, isDot: true })
    const physicalOnlyRolled = calculateSimulatedDamageBreakdown(
      { phyCoef: 0.02 },
      { ...baseContext, isDot: true },
      () => 0.5,
    )
    for (const result of [physicalOnly, physicalOnlyRolled]) {
      expect(
        closeTo(result.physical, 2) && closeTo(result.total, 2),
        "Physical-only DOT must ignore attribute attack when attrCoef is omitted.",
      ).toBeTruthy()
    }
    const independent = calculateDamageBreakdown({ phyCoef: 0.02, attrCoef: 0.5 }, baseContext)
    expect(
      closeTo(independent.physical, 2) && closeTo(independent.bellstrike, 50),
      "Physical and attribute coefficients must resolve independently.",
    ).toBeTruthy()
    const baselineDot = damage([], true)
    const directWithBonus = damage([{ dotDamage: 0.25 }], false)
    const dotWithBonus = damage([{ dotDamage: 0.25 }], true)
    const dotWithTwoBonuses = damage([{ dotDamage: 0.25 }, { dotDamage: 0.25 }], true)

    expect(
      closeTo(directWithBonus.total, baselineDirect.total),
      "dotDamage must not affect direct damage.",
    ).toBeTruthy()
    expect(
      closeTo(dotWithBonus.total / baselineDot.total, 1.25),
      "dotDamage must multiply every DOT damage component.",
    ).toBeTruthy()
    expect(
      closeTo(dotWithTwoBonuses.total / baselineDot.total, 1.5),
      "Multiple dotDamage effects must add within the DOT category.",
    ).toBeTruthy()
    const simulatedBaseline = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext, isDot: true },
      () => 0.5,
    )
    const simulatedWithBonus = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext, effects: [{ dotDamage: 0.25 }], isDot: true },
      () => 0.5,
    )
    expect(
      closeTo(simulatedWithBonus.total / simulatedBaseline.total, 1.25),
      "The simulator must use the same DOT multiplier.",
    ).toBeTruthy()

    const fifthStack = soulShaken.stackEffects[4]
    const umbraRule = fifthStack[1]
    expect(
      requirementsPass(umbraRule.requirement, effectState([]), effectState([]), ["HeavenQuakerSpear"], new Set()),
      "Heavenquaker Spear must satisfy Soul-Shaken's Umbra requirement.",
    ).toBeTruthy()
    expect(
      requirementsPass(umbraRule.requirement, effectState([]), effectState([]), ["StrategicSword"], new Set()),
      "Strategic Sword must satisfy Soul-Shaken's Umbra requirement.",
    ).toBeTruthy()
    expect(
      !requirementsPass(umbraRule.requirement, effectState([]), effectState([]), ["SnowpartingBlade"], new Set()),
      "Non-Umbra martial arts must not receive Soul-Shaken's conditional bonus.",
    ).toBeTruthy()

    for (const [tags, multiplier] of [
      [["StrategicSword", "DOT", "HighBleed"], 2],
      [["Other", "DOT", "HighBleed"], 1.75],
      [["HeavenQuakerSpear", "DOT"], 1.5],
      [["Other", "DOT"], 1.25],
    ] as Array<[string[], number]>) {
      const selected = fifthStack
        .filter(rule => requirementsPass(rule.requirement, effectState([]), effectState([]), tags, new Set()))
        .map(rule => rule.effect ?? rule)
      expect(
        closeTo(damage(selected, true).total / baselineDot.total, multiplier),
        "Soul-Shaken's High Bleed bonus adds once and respects source tags",
      ).toBeTruthy()
    }
  })

  it("resolves DOT flat physical and attribute bonuses exactly like a direct hit", async () => {
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 }
    const context: DamageContext = {
      stats,
      attunement: emptyAttunementStats,
      skillTags: [],
      weapons: ["strategicSword"],
      buffs: [],
      enemy: {
        name: "Probe",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    }
    const tick = { phyCoef: 0.3, attrCoef: 0.3, phyBonus: 40, attrBonus: 10 }
    const bonusless = { phyCoef: 0.3, attrCoef: 0.3 }
    const expectedPhysical = 0.3 * 100 + 40
    const expectedBellstrike = (0.3 * 100 + 10) * 1.5

    for (const isDot of [false, true]) {
      const result = calculateDamageBreakdown(tick, { ...context, isDot })
      expect(result.physical).toBeCloseTo(expectedPhysical, 9)
      expect(result.bellstrike).toBeCloseTo(expectedBellstrike, 9)

      const withoutBonus = calculateDamageBreakdown(bonusless, { ...context, isDot })
      expect(result.physical).toBeGreaterThan(withoutBonus.physical)
      expect(result.bellstrike).toBeGreaterThan(withoutBonus.bellstrike)

      const rolled = calculateSimulatedDamageBreakdown(tick, { ...context, isDot }, () => 0.5)
      expect(rolled.total).toBeCloseTo(expectedPhysical + expectedBellstrike, 9)
    }
  })
})
