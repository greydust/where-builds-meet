import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageContext } from "@/calculations/damage"
import type { CharacterStats } from "@/types"

import { effectState } from "../src/calculations/trackedEffectState"
import { isClose } from "./helpers/floatEquality"
import { rankTalentEffects } from "./helpers/shippedData"

// Ported from script/probe/check-nameless-spear-talents.mjs.
describe("nameless-spear-talents", () => {
  it("Nameless Spear talent calculation checks passed", async () => {
    const namelessSpear = (await import("../data/martial-art/nameless-spear.json")).default
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts")
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")

    /**
     * Rank 13's authored numbers are whole values reached through float maths, so
     * compare them at float precision. `isClose` owns the comparison, so the
     * tolerance and its "an absent value never agrees" rule stay in one place.
     */
    const close = (actual: number | undefined, expected: number, message: string) =>
      assert.ok(isClose(actual, expected, 1e-9), `${message}: ${actual} != ${expected}`)

    // Rank 13's effects, tagged as a talent stage so their formulas resolve against the raw
    // sheet rather than the action sheet, which is what the shipped builder's rank read does.
    const effects = martialArtEffectsForRank(martialArtDefinitions, ["namelessSpear"], 13)
    const statResult = calculateStatsWithEffects(
      { ...emptyStats, momentum: 280, affinity: 0.25744, maxBellstrike: 459 },
      effects,
      0,
    )
    close(statResult.stats.affinity, 0.3, "Momentum scaling must grant at most 4.256% Affinity Rate.")
    close(
      statResult.stats.maxEndurance,
      17,
      "Max Endurance Up must use raw Affinity before the talent's Affinity conversion.",
    )
    close(statResult.stats.minBellstrike, 98, "Bellstrike Attribute Up must grant Min Bellstrike Attack.")
    close(statResult.stats.maxBellstrike, 655, "Bellstrike Attribute Up must grant Max Bellstrike Attack.")
    close(
      statResult.stats.bellstrikeDmgBonus,
      0.11,
      "Bellstrike DMG Bonus must reach its cap at 655 Max Bellstrike Attack.",
    )

    // The conditional damage sheet the app's declared talent type does not model.
    const affinityRule = rankTalentEffects(namelessSpear.talent[13]).find(
      rule => rule.effect && "affinityDmgBonus" in rule.effect,
    )
    if (!affinityRule?.effect) throw new Error("Nameless Spear Affinity damage talent rule was not found.")
    if (
      !requirementsPass(
        affinityRule.requirement,
        effectState([{ name: "EndlessGale" }]),
        effectState([]),
        [],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        {},
      ) ||
      requirementsPass(
        affinityRule.requirement,
        effectState([]),
        effectState([]),
        [],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        {},
      )
    )
      throw new Error("Affinity DMG Up must work with Endless Gale while low Endurance remains unsimulated.")

    const damageStats: CharacterStats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, affinity: 1 }
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
    const context: DamageContext = {
      stats: damageStats,
      attunement: emptyAttunementStats,
      skillTags: [],
      weapons: ["namelessSword", "namelessSpear"],
      buffs: ["EndlessGale"],
      effects: [],
      enemy,
      derivedStats: calculateDerivedStats(damageStats, 0),
    }
    const baseline = calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...context, effects: [] })
    const enhanced = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, effects: [affinityRule.effect] },
    )
    close(
      enhanced.physical / baseline.physical,
      1 + (baseline.outcomeRates?.affinity ?? 0) * 0.18,
      "Affinity DMG Up must cap at 18% above 30% Affinity Rate.",
    )
  })
})
