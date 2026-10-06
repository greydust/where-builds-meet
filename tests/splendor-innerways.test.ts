import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { allSkillDefinitions, effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
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
function run(
  ways: BuildSetup["innerWays"],
  skills: string[],
  endurance = 200,
  exhausted = false,
  gale = false,
  surge = false,
) {
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
      initialBuffs: [
        { name: "Shield", stack: 1, appliedAt: 0 },
        ...(gale ? [{ name: "EndlessGale", stack: 1, appliedAt: 0 }] : []),
        ...(surge ? [{ name: "EnergySurge", stack: 1, appliedAt: 0 }] : []),
      ],
      initialDebuffs: exhausted ? [{ name: "Exhausted", stack: 1, appliedAt: 0 }] : [],
      initialResources: { Endurance: endurance },
      resourceMaximums: { Endurance: 200 },
    },
    stats,
    derivedStats: calculateDerivedStats(stats, 0),
    enemy,
    weapons: [...weapons],
    attunement: emptyAttunementStats,
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  })
}

it("Daunting Strike cancel lands the flying sword and applies Qi Imbalance on hit", () => {
  const plain = run([], ["DauntingStrikeCancel", "ShadowStepCancel"])
  const empowered = run([{ innerWay: "MountainsMight", tier: "T1" }], ["DauntingStrikeCancel", "ShadowStepCancel"])
  const row = empowered.timeline[0]
  expect(row.effectiveCastTime).toBeCloseTo(0.293)
  expect(row.actions.filter(action => action.type === "damage").map(action => action.time)).toEqual([0.293])
  expect(empowered.actionBreakdowns[row.id + ":0"].total).toBeGreaterThan(0)
  expect(row.actionStates[0].debuffs.has("QiImbalance")).toBe(false)
  expect(empowered.timeline[1].startTime).toBeCloseTo(0.293)
  expect(empowered.timeline[1].debuffs.get("QiImbalance")?.appliedAt).toBeCloseTo(0.293)
  expect(plain.timeline[1].debuffs.has("QiImbalance")).toBe(false)
})

describe("Splendor Inner Way behavior", () => {
  it.each([false, true])("charges instant Vagrant separately from its damage boost with Gale=%s", gale => {
    const ways: BuildSetup["innerWays"] = [{ innerWay: "SwordMorph", tier: "T0" }]
    const result = run(ways, ["VagrantSword2", "VagrantSword2"], 200, false, gale, true)
    const first = result.timeline[0]
    expect(first.effectiveCastTime).toBeCloseTo(0.85, 8)
    expect(first.actions.filter(action => action.type === "damage").map(action => action.time)).toEqual([
      0.101, 0.267, 0.755,
    ])
    expect(first.resourceConsumption?.Endurance).toBeCloseTo(gale ? 16.8 : 21, 8)
    expect(first.baseResourceConsumption?.Endurance).toBeCloseTo(20, 8)
    expect(result.timeline[1].effectiveCastTime).toBeCloseTo(2.25, 8)
    expect(result.timeline[1].buffs.has("EnergySurge")).toBe(false)
  })

  it("does not credit the instant cast cost toward Sword Morph damage when Endurance is limited", () => {
    const ways: BuildSetup["innerWays"] = [{ innerWay: "SwordMorph", tier: "T0" }]
    const empty = run(ways, ["VagrantSword2"], 1, false, false, true)
    const partial = run(ways, ["VagrantSword2"], 11, false, false, true)
    const full = run(ways, ["VagrantSword2"], 21, false, false, true)
    expect(empty.timeline[0].baseResourceConsumption?.Endurance).toBe(0)
    expect(partial.timeline[0].baseResourceConsumption?.Endurance).toBe(10)
    expect(partial.metrics.totalDamage / empty.metrics.totalDamage).toBeCloseTo(1.15, 8)
    expect(full.metrics.totalDamage / empty.metrics.totalDamage).toBeCloseTo(1.3, 8)
  })

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
    const lastHit = plain.timeline[0].actions.findLastIndex(action => action.type === "damage")
    expect(plain.actionBreakdowns[`rotation-0:${lastHit}`].outcomeRates?.affinity).toBeLessThan(1)
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
    const noExtra = run(ways, ["VagrantSword2"], 24)
    const partial = run(ways, ["VagrantSword2"], 34)
    const full = run(ways, ["VagrantSword2"], 44)
    expect(partial.metrics.totalDamage / noExtra.metrics.totalDamage).toBeCloseTo(
      (1 + 10.0012 * 0.015) / (1 + 0.0012 * 0.015),
      8,
    )
    expect(full.metrics.totalDamage / noExtra.metrics.totalDamage).toBeCloseTo(1.3 / (1 + 0.0012 * 0.015), 8)
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
    { tier: "T4", gale: false, upgraded: false, cost: 26.4 },
    { tier: "T4", gale: true, upgraded: false, cost: 21.12 },
    { tier: "T4", gale: true, upgraded: true, cost: 19.2 },
    { tier: "T5", gale: false, upgraded: false, cost: 26.4 },
    { tier: "T5", gale: true, upgraded: true, cost: 19.2 },
    { tier: "T6", gale: false, upgraded: false, cost: 24 },
    { tier: "T6", gale: true, upgraded: false, cost: 19.2 },
    { tier: "T6", gale: true, upgraded: true, cost: 17.28 },
  ] as const)(
    "charges $cost Endurance at $tier with Gale=$gale, upgraded=$upgraded",
    ({ tier, gale, upgraded, cost }) => {
      const ways: BuildSetup["innerWays"] = [
        { innerWay: "SwordMorph", tier: "T0" },
        { innerWay: "BattleAnthem", tier },
      ]
      if (upgraded) ways.push({ innerWay: "MountainsMight", tier: "T0" })
      const result = run(ways, [...(gale ? ["QiankunsLockCancel"] : []), "VagrantSword2"], 200)
      const charged = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "VagrantSword2")!
      const releaseCost = gale ? 16 : 20
      expect(charged.resourceConsumption?.Endurance).toBeCloseTo(releaseCost, 8)
      expect(result.timeline[0].timelineResourceSummary!.Endurance.consumed).toBeCloseTo(cost + releaseCost - 0.0012, 6)
    },
  )

  it("preserves the full release bonus when Gale discounts its payment", () => {
    const ways: BuildSetup["innerWays"] = [{ innerWay: "SwordMorph", tier: "T0" }]
    const plain = run(ways, ["VagrantSword2"])
    const discounted = run(ways, ["QiankunsLockCancel", "VagrantSword2"])
    expect(plain.timeline[0].resourceConsumption?.Endurance).toBe(20)
    expect(discounted.timeline[1].resourceConsumption?.Endurance).toBe(16)
    expect(discounted.metrics.totalDamage).toBe(plain.metrics.totalDamage)
  })

  it("credits a partial discounted payment proportionally instead of granting the full bonus", () => {
    const ways: BuildSetup["innerWays"] = [{ innerWay: "SwordMorph", tier: "T0" }]
    const plain = run(ways, ["VagrantSword2"], 30)
    // Account for the charge's 0.0012 regeneration when leaving the same paid fraction.
    const discounted = run(ways, ["VagrantSword2"], 23.99976, false, true)
    expect(discounted.timeline[0].resourceConsumption!.Endurance).toBeCloseTo(
      plain.timeline[0].resourceConsumption!.Endurance * 0.8,
      8,
    )
    expect(discounted.metrics.totalDamage).toBeCloseTo(plain.metrics.totalDamage, 8)
    expect(discounted.metrics.totalDamage).toBeLessThan(
      run(ways, ["VagrantSword2"], 200, false, true).metrics.totalDamage,
    )
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
    const firstHit = before.timeline[0].actions.findIndex(action => action.type === "damage")
    expect(after.actionBreakdowns[`rotation-0:${firstHit}`].total).toBe(
      before.actionBreakdowns[`rotation-0:${firstHit}`].total,
    )
    expect(after.metrics.totalDamage).toBeGreaterThan(before.metrics.totalDamage)
  })

  it("uses Energy Surge once and reduces its cooldown by at most eight seconds", () => {
    const result = run(
      [{ innerWay: "SwordMorph", tier: "T6" }],
      Array.from({ length: 15 }, () => "VagrantSword2"),
      200,
    )
    const casts = result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
    expect(casts[0].effectiveCastTime).toBeCloseTo(2.25, 8)
    expect(casts[1].effectiveCastTime).toBeCloseTo(0.85, 8)
    expect(casts[2].effectiveCastTime).toBeCloseTo(2.25, 8)
    const grants = result.timeline.filter(
      row => row.step.type === "skill" && row.step.skill === "SwordMorphEnergySurge" && !row.skipped,
    )
    expect(grants[0].startTime).toBeCloseTo(casts[0].startTime + 1.4, 8)
    const firstHit = casts[0].actions.findIndex(action => action.type === "damage")
    expect(casts[0].actionStates[firstHit].resources?.Endurance).toBeCloseTo(176.001301, 8)
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
