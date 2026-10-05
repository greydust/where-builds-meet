import assert from "node:assert/strict"

import { describe, it } from "vitest"

import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

import { assertClose } from "./helpers/floatEquality"
import { probeLoad } from "./helpers/probe-loader.js"

// Ported from script/probe/check-innerway-solo-level.mjs.
describe("innerway-solo-level", () => {
  it("Inner Way Solo Level selection, raw-stat formulas, overrides, and production worker bundle checks passed", async () => {
    const { innerWayDefinitionForSoloLevel, innerWayDefinitions } = await probeLoad<
      typeof import("../src/data/innerWayDefinitions")
    >("/src/data/innerWayDefinitions.ts")
    const { calculateStatsWithEffects, calculateStatsWithOverrides } = await probeLoad<
      typeof import("../src/calculations/statEffects")
    >("/src/calculations/statEffects.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")
    const { martialArtEffectsForRank } = await import("../src/data/martialArtTalents.ts")
    const close = (actual: number, expected: number, message: string) => assertClose(actual, expected, 1e-8, message)
    const definition = {
      name: "Level probe",
      tags: [],
      altersTimeline: false,
      effect: {
        ProbeT0: { trigger: [{ action: [{ type: "apply", value: "ProbeBuff" }] }] },
        ProbeT2: {
          effect: [{ rawStat: { minPhys: { bySoloLevel: [null, 10, 20] }, maxPhys: { bySoloLevel: [null, 20, 40] } } }],
        },
        ProbeT5: { effect: [{ rawStat: { critDmgBonus: 0.04 } }] },
      },
    }
    const original = structuredClone(definition)
    const talents = {
      skystrikeGauntlets: {
        talent: [
          [],
          [{ name: "Scaling", effect: [{ stat: { maxPhys: { formula: { source: "minPhys", multiplier: 2 } } } }] }],
        ],
      },
    }
    const effects = (level: number, rank: number) => [
      ...Object.values(innerWayDefinitionForSoloLevel(definition, level).effect).flatMap(tier => tier.effect ?? []),
      ...martialArtEffectsForRank(talents, ["skystrikeGauntlets"], rank),
    ]
    const lower = calculateStatsWithEffects(emptyStats, effects(1, 1), 0)
    const higher = calculateStatsWithEffects(emptyStats, effects(2, 1), 0)
    close(lower.rawStats.minPhys, 10, "Solo Level must select an exact raw contribution")
    close(higher.rawStats.minPhys, 20, "Changing Solo Level must replace, not sum, levels")
    close(lower.stats.maxPhys, 40, "Talent formulas must read the resolved raw level bonus")
    close(higher.stats.maxPhys, 80, "Level changes must propagate through the same talent rank")
    close(
      calculateStatsWithEffects(emptyStats, effects(2, 0), 0).rawStats.minPhys,
      20,
      "Talent rank must not select the Inner Way level",
    )
    close(higher.stats.critDmgBonus, lower.stats.critDmgBonus, "Fixed tier bonuses must not scale with level")
    close(
      calculateStatsWithEffects(emptyStats, effects(0, 1), 0).rawStats.minPhys,
      0,
      "An unavailable table slot must contribute no raw bonus",
    )
    for (const level of [1, 2]) {
      const overridden = calculateStatsWithOverrides(emptyStats, effects(level, 1), 0, { minPhys: 100 }, [])
      close(overridden.stats.minPhys, 100, "A saved final-stat override must remain exact when Solo Level changes")
    }
    assert.deepEqual(definition, original, "Resolving different Solo Levels must not mutate imported definitions")
    assert.deepEqual(
      innerWayDefinitionForSoloLevel(definition, 2).effect.ProbeT0,
      original.effect.ProbeT0,
      "Level resolution must preserve combat triggers",
    )
    assert.throws(
      () => innerWayDefinitionForSoloLevel(definition, 3),
      RangeError,
      "Missing levels must not silently reuse another level",
    )
    assert.throws(() => innerWayDefinitionForSoloLevel(definition, 1.5), RangeError)

    const profiles = (await import("../data/breakthrough.json")).default
    for (const profile of Object.values(profiles)) {
      for (const entry of Object.values(innerWayDefinitions)) {
        const resolved = innerWayDefinitionForSoloLevel(entry, profile.soloLevel)
        for (const tier of Object.values(resolved.effect)) {
          for (const effect of tier.effect ?? []) {
            for (const amount of Object.values(effect.rawStat ?? {}))
              assert.ok(
                typeof amount === "number" && Number.isFinite(amount),
                "Worker effects must contain resolved numeric stats",
              )
          }
        }
      }
    }

    const { buildPresetRotationBundle } = await import("../src/application/graduation")
    const path = (await import("../data/path.json")).default.bamboocutKite
    const build = (breakthrough: string) =>
      buildPresetRotationBundle(
        {
          pathId: "bamboocutKite",
          martialArts: ["heavenwill", "skygrasp"],
          breakthrough,
          rotation: { name: "Solo Level probe", steps: [{ type: "skill", skill: "HeavenShaker" }] },
          food: "None",
          divinecraft: "None",
          script: "None",
          globalDebuffs: defaultGlobalDebuffs,
          skillOverrides: {},
          previewId: null,
        },
        path.defaultBuild,
      )
    const bundles = ["16", "17"].map(build)
    const t2Rules = (bundle: RotationSimulationBundle) =>
      bundle.timeline.innerWayRules.filter(rule => rule.tier === 2 && "rawStat" in rule.effect)
    const [lowerBreakthrough, higherBreakthrough] = bundles
    assert(lowerBreakthrough && higherBreakthrough, "Both breakthroughs must build a preset bundle.")
    assert.notDeepEqual(
      t2Rules(lowerBreakthrough),
      t2Rules(higherBreakthrough),
      "The production preset worker bundle must resolve the selected Solo Level",
    )
    assert.deepEqual(
      lowerBreakthrough.timeline.setupEffects.filter(effect => effect.statStage === "talent"),
      higherBreakthrough.timeline.setupEffects.filter(effect => effect.statStage === "talent"),
      "Breakthroughs with the same talent rank must retain identical martial-art talents",
    )
  })
})
