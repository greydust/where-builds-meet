import { assert, describe, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"

// Ported from script/probe/check-stat-conversion.mjs.
describe("stat-conversion", () => {
  it("Generic stat conversion and Soaring High T4 checks passed", async () => {
    const { applyStatConversions, calculateStatsWithEffects } = await probeLoad<
      typeof import("../src/calculations/statEffects")
    >("/src/calculations/statEffects.ts")
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const soaringHigh = (await import("../data/innerway/soaring-high.json")).default
    const breakthroughProfiles = (await import("../data/breakthrough.json")).default

    const generic = applyStatConversions({ source: 0.2, target: 0.05, untouched: 3 }, [
      { convert: { from: "source", to: "target", ratio: 2, max: 0.1 } },
    ])
    assertClose(generic.source, 0.1, 1e-9, "Conversion must subtract the capped amount from its named source.")
    assertClose(generic.target, 0.25, 1e-9, "Conversion must add the ratio-adjusted amount to its named target.")
    assertClose(generic.untouched, 3, 1e-9, "Conversion must preserve unrelated stats.")

    const cappedDirectCrit = applyStatConversions({ finalAffinity: 0.2, directCrit: 0.15 }, [
      { convert: { from: "finalAffinity", to: "directCrit", ratio: 1, max: 0.12 } },
    ])
    assertClose(cappedDirectCrit.finalAffinity, 0.15, 1e-9, "Conversion must leave unconverted Affinity in its source.")
    assertClose(cappedDirectCrit.directCrit, 0.2, 1e-9, "Conversion must stop at the 20% Direct Critical cap.")

    const cappedCharacter = calculateStatsWithEffects(
      { ...emptyStats, directCrit: 0.18 },
      [{ stat: { directCrit: 0.05 } }],
      breakthroughProfiles["16"].judgementResistance,
    )
    assertClose(cappedCharacter.stats.directCrit, 0.2, 1e-9, "Character Direct Critical must stop at its 20% cap.")
    assertClose(cappedCharacter.derivedStats.directCrit, 0.2, 1e-9, "Derived Direct Critical must preserve the cap.")

    const t4Rule = soaringHigh.effect.SoaringHighT4.effect[0]
    const conversion = t4Rule.effect.convert
    assert(
      t4Rule.requirement.some(
        requirement => requirement.target === "skillTag" && requirement.value === "VileCondemned",
      ) ||
        conversion.from !== "finalAffinity" ||
        conversion.to !== "directCrit" ||
        conversion.ratio !== 1 ||
        conversion.max !== 0.12,
      "Soaring High T4 must convert up to 12% Final Affinity into Direct Critical for Vile Condemned.",
    )

    const derivedStats = {
      effectiveMinPhys: 0,
      effectiveMaxPhys: 0,
      effectiveMinBellstrike: 0,
      effectiveMaxBellstrike: 0,
      effectiveMinSilkbind: 0,
      effectiveMaxSilkbind: 0,
      effectiveMinStonesplit: 0,
      effectiveMaxStonesplit: 0,
      effectiveMinBamboocut: 0,
      effectiveMaxBamboocut: 0,
      effectivePrecision: 1,
      effectiveCrit: 0.4,
      effectiveAffinity: 0.2,
      effectiveCritDmgBonus: 0,
      directCrit: 0.1,
      finalCrit: 0.5,
      finalAffinity: 0.2,
      abrasionRate: 0,
      normalRate: 0.3,
      critRate: 0.5,
      affinityRate: 0.2,
    }
    const breakdown = calculateDamageBreakdown(
      { phyCoef: 0, attrCoef: 0, phyBonus: 0, attrBonus: 0 },
      {
        stats: emptyStats,
        attunement: emptyAttunementStats,
        skillTags: ["VileCondemned"],
        weapons: ["heavenwill", "skygrasp"],
        buffs: [],
        enemy: breakthroughProfiles["16"],
        derivedStats,
        effects: [t4Rule.effect],
      },
    )
    const rates = breakdown.outcomeRates
    assert(rates, "The converted hit must resolve its outcome rates.")
    assertClose(rates.affinity, 0.1, 1e-9, "T4 must leave Affinity that cannot fit under the Direct Critical cap.")
    assertClose(rates.critical, 0.6, 1e-9, "T4 must stop converted Direct Critical at 20%.")
    assertClose(rates.normal, 0.3, 1e-9, "T4 must preserve the remaining outcome probability.")
  })
})
