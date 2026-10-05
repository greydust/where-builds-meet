import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { OutcomeCooldownTracker } from "@/calculations/outcomeTriggeredBuffs"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"
import type { BuildSetup } from "@/gear"

const stats = {
  ...emptyStats,
  minPhys: 100,
  maxPhys: 200,
  minBellstrike: 100,
  maxBellstrike: 200,
  precision: 0.5,
  maxEndurance: 200,
}
const weapons = ["namelessSword", "namelessSpear"] as const
const enemy = {
  name: "Test",
  level: 96,
  defense: 0,
  physicalResistance: 0,
  bellstrikeResistance: 0,
  stonesplitResistance: 0,
  silkbindResistance: 0,
  bamboocutResistance: 0,
  judgementResistance: 0,
}
function run(ways: BuildSetup["innerWays"], skills: string[], endurance = 200, exhausted = false) {
  const rotation: RotationRecord = { name: "Test", steps: skills.map(skill => ({ type: "skill", skill })) }
  return calculateRotationBaseline({
    timeline: {
      rotation,
      skills: allSkillDefinitions,
      effectDefinitions,
      eventDefinitions: rotationEventDefinitions,
      dots: {},
      setupEffects: [],
      weapons: [...weapons],
      innerWayConditions: [...innerWayConditionsFor(ways, undefined, "bellstrikeSplendor")],
      innerWayRules: innerWayEffectRulesFor(ways, 21, "bellstrikeSplendor"),
      initialBuffs: [{ name: "Shield", stack: 1, appliedAt: 0 }],
      initialDebuffs: exhausted ? [{ name: "Exhausted", stack: 1, appliedAt: 0 }] : [],
      initialResources: { Endurance: endurance },
      resourceMaximums: { Endurance: 200 },
    },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    enemy,
    weapons: [...weapons],
    attunement: {},
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  })
}

describe("Splendor Inner Way behavior", () => {
  it("guarantees only the third wave's Affinity and removes Abrasion against Exhausted", () => {
    const result = run([{ innerWay: "SwordMorph", tier: "T3" }], ["VagrantSword2"], 200, true)
    const hits = result.timeline[0].actions.flatMap((action, index) =>
      action.type === "damage" ? [result.actionBreakdowns[`rotation-0:${index}`]] : [],
    )
    expect(hits).toHaveLength(3)
    for (const hit of hits) expect(hit.outcomeRates?.abrasion).toBe(0)
    expect(hits[0].outcomeRates?.affinity).toBeLessThan(1)
    expect(hits[2].outcomeRates?.affinity).toBe(1)
    const plain = run([{ innerWay: "SwordMorph", tier: "T3" }], ["VagrantSword2"])
    expect(plain.actionBreakdowns["rotation-0:3"].outcomeRates?.affinity).toBeLessThan(1)
  })

  it("restores Endurance on either Spear Q route and caps the meter", () => {
    for (const skill of ["QiankunsLock", "QiankunsLockCancel"]) {
      expect(
        run([{ innerWay: "MountainsMight", tier: "T3" }], [skill], 20).timeline[0].timelineResourceSummary?.Endurance
          .final,
      ).toBe(80)
      expect(
        run([{ innerWay: "MountainsMight", tier: "T3" }], [skill], 180).timeline[0].timelineResourceSummary?.Endurance
          .final,
      ).toBe(200)
      expect(
        run([{ innerWay: "MountainsMight", tier: "T2" }], [skill], 20).timeline[0].timelineResourceSummary?.Endurance
          .final,
      ).toBe(50)
    }
  })

  it("scales sword-energy damage from the actual extra Endurance paid", () => {
    const ways: BuildSetup["innerWays"] = [{ innerWay: "SwordMorph", tier: "T0" }]
    const noExtra = run(ways, ["VagrantSword2"], 20)
    const partial = run(ways, ["VagrantSword2"], 30)
    const full = run(ways, ["VagrantSword2"], 40)
    expect(partial.metrics.totalDamage / noExtra.metrics.totalDamage).toBeCloseTo(
      (1 + 10.001 * 0.015) / (1 + 0.001 * 0.015),
      8,
    )
    expect(full.metrics.totalDamage / noExtra.metrics.totalDamage).toBeCloseTo(1.3 / (1 + 0.001 * 0.015), 8)
  })

  it("restores Battle Anthem Endurance on a guaranteed Affinity hit", () => {
    const base: BuildSetup["innerWays"] = [
      { innerWay: "SwordMorph", tier: "T3" },
      { innerWay: "BattleAnthem", tier: "T2" },
    ]
    const upgraded: BuildSetup["innerWays"] = [
      { innerWay: "SwordMorph", tier: "T3" },
      { innerWay: "BattleAnthem", tier: "T3" },
    ]
    const before = run(base, ["VagrantSword2", "VagrantSword2"], 100, true)
    const after = run(upgraded, ["VagrantSword2", "VagrantSword2"], 100, true)
    expect(
      after.timeline[0].timelineResourceSummary!.Endurance.final -
        before.timeline[0].timelineResourceSummary!.Endurance.final,
    ).toBeCloseTo(10, 8)
  })

  it("does not give Battle Anthem T6's charged bonus to Spear Q", () => {
    const before = run([{ innerWay: "BattleAnthem", tier: "T5" }], ["QiankunsLock"], 0)
    const after = run([{ innerWay: "BattleAnthem", tier: "T6" }], ["QiankunsLock"], 0)
    expect(after.metrics.totalDamage).toBe(before.metrics.totalDamage)
  })

  it.each([
    { gale: false, upgraded: false, cost: 22 },
    { gale: true, upgraded: false, cost: 17.6 },
    { gale: true, upgraded: true, cost: 16 },
  ])("charges $cost Endurance with Gale=$gale, upgraded=$upgraded", ({ gale, upgraded, cost }) => {
    const ways: BuildSetup["innerWays"] = [
      { innerWay: "SwordMorph", tier: "T0" },
      { innerWay: "BattleAnthem", tier: "T4" },
    ]
    if (upgraded) ways.push({ innerWay: "MountainsMight", tier: "T0" })
    const result = run(ways, [...(gale ? ["QiankunsLockCancel"] : []), "VagrantSword2"], 200)
    const charged = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "VagrantSword2")!
    expect(charged.resourceConsumption?.Endurance).toBeCloseTo(cost, 8)
    expect(result.timeline[0].timelineResourceSummary!.Endurance.consumed).toBeCloseTo(2 * cost - 0.001, 6)
  })

  it("grants Insightful Strike's HP bonus only after Concentration activates", () => {
    const base: BuildSetup["innerWays"] = [
      { innerWay: "SwordMorph", tier: "T3" },
      { innerWay: "InsightfulStrike", tier: "T0" },
    ]
    const upgraded: BuildSetup["innerWays"] = [
      { innerWay: "SwordMorph", tier: "T3" },
      { innerWay: "InsightfulStrike", tier: "T1" },
    ]
    const skills = Array.from({ length: 10 }, () => "VagrantSword2")
    const before = run(base, skills, 200, true)
    const after = run(upgraded, skills, 200, true)
    expect(after.actionBreakdowns["rotation-0:1"].total).toBe(before.actionBreakdowns["rotation-0:1"].total)
    expect(after.metrics.totalDamage).toBeGreaterThan(before.metrics.totalDamage)
  })

  it("uses Energy Surge once and reduces its cooldown by at most eight seconds", () => {
    const result = run(
      [{ innerWay: "SwordMorph", tier: "T6" }],
      Array.from({ length: 15 }, () => "VagrantSword2"),
      200,
    )
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(casts[0].effectiveCastTime).toBeCloseTo(2.05, 8)
    expect(casts[1].effectiveCastTime).toBeCloseTo(1.05, 8)
    expect(casts[2].effectiveCastTime).toBeCloseTo(2.05, 8)
    const grants = result.timeline.filter(
      row => row.step.type === "skill" && row.step.skill === "SwordMorphEnergySurge" && !row.skipped,
    )
    expect(grants.length).toBeGreaterThan(1)
    expect(grants[1].startTime - grants[0].startTime).toBeGreaterThanOrEqual(12)
    expect(grants[1].startTime - grants[0].startTime).toBeLessThan(15)
  })

  it("does not refresh a resource proc's cooldown on a failed outcome", () => {
    const tracker = new OutcomeCooldownTracker()
    expect(tracker.resolve(0, 0.5, 12)).toBe(0.5)
    expect(tracker.resolve(1, 1, 12)).toBe(0.5)
    expect(tracker.resolve(2, 1, 12)).toBe(0)
    expect(tracker.resolve(12, 1, 12)).toBe(0.5)
    expect(tracker.resolve(13, 1, 12)).toBe(0.5)
  })
})
