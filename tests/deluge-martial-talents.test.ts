import assert from "node:assert/strict"

import { describe, it } from "vitest"

import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { DamageBreakdown } from "@/calculations/damage"
import type { StatFormula } from "@/calculations/statEffects"

import { effectState } from "../src/calculations/trackedEffectState"
import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"
import { asTalentEffects } from "./helpers/shippedData"

// Ported from script/probe/check-deluge-martial-talents.mjs.
describe("deluge-martial-talents", () => {
  it("Deluge talents: datamined stats, healing caps/tag gating, Mystic bonus, and conditional Mystic Precision passed", async () => {
    const close = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-9, message)
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    const { calculateStatsWithEffects, resolveFormulaValue } = await probeLoad<
      typeof import("../src/calculations/statEffects")
    >("/src/calculations/statEffects.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const arts = {
      panaceaFan: martialArtDefinitions.panaceaFan,
      soulshadeUmbrella: martialArtDefinitions.soulshadeUmbrella,
    }
    for (const weapon of Object.keys(arts) as Array<keyof typeof arts>) {
      const effects = asTalentEffects(martialArtEffectsForRank(arts, [weapon], 13)).filter(e => !e.requirement)
      const stats = calculateStatsWithEffects({ ...emptyStats, agility: 280, minSilkbind: 230 }, effects, 0).stats
      close(stats.minSilkbind, 328, "Attribute talent enters raw minimum")
      close(stats.maxSilkbind, 196, "Attribute talent enters raw maximum")
      switch (weapon) {
        case "panaceaFan":
          close(stats.crit, 0.08512, "Panacea Critical Rate cap")
          close(stats.silkbindDmgBonus, 0.11, "Panacea attribute damage cap")
          close(stats.silkbindHealingBonus, 0.11, "Panacea attribute healing cap")
          break
        case "soulshadeUmbrella":
          close(stats.minPhys, 73.92, "Soulshade Physical Attack cap")
          close(stats.silkbindPenetration, 22, "Soulshade penetration cap")
          break
      }
    }
    const effectsFor = (weapons: Array<keyof typeof arts>, tags: string[]) =>
      asTalentEffects(martialArtEffectsForRank(arts, weapons, 13))
        .filter(e =>
          requirementsPass(e.requirement, effectState([]), effectState([]), tags, new Set<string>(), weapons),
        )
        .map(e => e.effect ?? e)
    for (const [minPhys, bonus] of [
      [0, 0.05],
      [375, 0.175],
      [750, 0.3],
      [1000, 0.3],
    ]) {
      for (const [weapon, tag, otherTag, key] of [
        ["panaceaFan", "Heavy", "Light", "healingBonus"],
        ["soulshadeUmbrella", "Special", "Heavy", "criticalHealingBonus"],
      ] as Array<[keyof typeof arts, string, string, string]>) {
        const value = (tags: string[]) =>
          effectsFor([weapon], tags).reduce((sum, e) => {
            const sheet = e[key] as number | { formula?: StatFormula }
            switch (typeof sheet) {
              case "number":
                return sum + sheet
              case "object": {
                if (!sheet) return sum
                const { formula } = sheet as { formula?: StatFormula }
                if (!formula) return sum
                // An unresolvable source contributes nothing rather than NaN.
                return sum + (resolveFormulaValue(formula, { minPhys }) ?? 0)
              }
              default:
                return sum
            }
          }, 0)
        close(value([tag]), bonus, "Base and scaling healing bonuses sum and cap")
        close(value([otherTag]), 0, "Healing bonus requires its attack tag")
      }
    }
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 0.8 }
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
    const damage = (weapons: Array<keyof typeof arts>, tags: string[] = ["Mystic"], includePrecision = true) =>
      calculateDamageBreakdown(
        { phyCoef: 1 },
        {
          stats,
          derivedStats: calculateDerivedStats(stats, 0),
          enemy,
          attunement: emptyAttunementStats,
          weapons,
          skillTags: tags,
          buffs: [],
          effects: effectsFor(weapons, tags).filter(effect => includePrecision || !effect.convert),
        },
      )
    const outcomeRates = (breakdown: DamageBreakdown) => {
      const rates = breakdown.outcomeRates
      assert(rates, "A damage breakdown must resolve its outcome rates.")
      return rates
    }
    const alone = damage(["soulshadeUmbrella"])
    const paired = damage(["soulshadeUmbrella", "panaceaFan"])
    close(
      damage(["soulshadeUmbrella", "panaceaFan"], ["Mystic"], false).total / alone.total,
      1.2,
      "Paired Mystic damage bonus remains 20% independently of Precision",
    )
    close(outcomeRates(paired).abrasion, 0, "Mystic Precision removes Abrasion with both martial arts equipped")
    close(outcomeRates(paired).normal, 1, "Mystic Precision transfers Abrasion probability to Normal")
    close(outcomeRates(damage(["panaceaFan"])).abrasion, 0.2, "Panacea alone does not grant Mystic Precision")
    close(
      outcomeRates(damage(["soulshadeUmbrella", "panaceaFan"], ["Light"])).abrasion,
      0.2,
      "Mystic Precision does not affect non-Mystic attacks",
    )
  })
})
