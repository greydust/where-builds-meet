import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import type { RotationRecord } from "@/calculations/rotationTimeline"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

// Ported from script/probe/check-default-rotation.mjs.
describe("default-rotation", () => {
  it("Infinite Vitality default rotation sequence and calculation checks passed", async () => {
    const rotation = (await import("../data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json"))
      .default
    const snowparting = (await import("../data/skill/snowparting-blade.json")).default
    const phalanxbane = (await import("../data/skill/phalanxbane-blade.json")).default
    const mystic = (await import("../data/skill/mystic.json")).default
    const general = (await import("../data/skill/general.json")).default
    const mysticBuffs = (await import("../data/buff/mystic.json")).default
    const generalBuffs = (await import("../data/buff/general.json")).default
    const dots = (await import("../data/dot/mystic.json")).default
    const { calculateRotationBaseline } = await import("../src/calculations/rotationCalculator.ts")
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts")
    const { emptyStats } = await import("../src/data/statDefinitions.ts")

    const startSkillIndex = rotation.steps.findIndex(
      step => step.type === "skill" && step.skill === "SnowpartingSpecial",
    )

    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1500, precision: 1 }
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 405,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0.65,
    }
    const result = calculateRotationBaseline({
      timeline: {
        rotation: { ...rotation, targetType: "Dummy" } as RotationRecord,
        skills: asSkillRecords({ ...snowparting, ...phalanxbane, ...mystic, ...general }),
        eventDefinitions: {
          Qi: {
            name: "Qi",
            castTime: 0,
            action: [
              { type: "setQi", time: 0 },
              { type: "apply", target: "target", value: "Exhausted", time: 0 },
            ],
          },
          Move: { name: "Move", castTime: 0, action: [{ type: "move", time: 0 }] },
          BattleEnd: { name: "Battle End", castTime: 0, action: [] },
        },
        dots: asSkillRecords(dots),
        effectDefinitions: asEffectDefinitions({ ...mysticBuffs, ...generalBuffs, ...dots }),
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: ["snowparting", "phalanxbane"],
      },
      startAnchor: { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action },
      stats,
      attunement: emptyAttunementStats,
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: ["snowparting", "phalanxbane"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    expect(
      result.actionBreakdowns[`rotation-${startSkillIndex}:${rotation.start.action}`],
      "The configured Fleeting Trace starting action must calculate damage.",
    ).toBeTruthy()
    expect(
      result.metrics.totalDamage > 0 && result.duration > 0,
      "The new default rotation must produce a valid calculation.",
    ).toBeTruthy()
    const ghostlyCast = result.metrics.breakdown.casts.find(row => row.skillId === "GhostlySteps")
    expect(
      (ghostlyCast?.damageWithBuff ?? 0) > (ghostlyCast?.damage ?? 0),
      "Perfect Dodge should activate Mystery DMG Boost from its synthetic dodge.",
    ).toBeTruthy()
  })
})
