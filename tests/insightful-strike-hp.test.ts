import { describe, expect, it } from "vitest"

import { innerWayConditionsFor, innerWayEffectRulesFor } from "@/application/characterComposition"
import { rotationEventDefinitions } from "@/application/gameData/rotationEffects"
import { effectDefinitions } from "@/application/gameData/skills"
import { emptyAttunementStats } from "@/calculations/attunementStats"
import {
  calculateRotationBaseline,
  calculateSimulatedRotationRun,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { emptyStats } from "@/data/statDefinitions"
import type { BuildSetup } from "@/gear"

function bundle(hp: number, tier: "T0" | "T1" = "T1"): RotationSimulationBundle {
  const ways: BuildSetup["innerWays"] = [{ innerWay: "InsightfulStrike", tier }]
  return {
    timeline: {
      rotation: {
        name: "Concentration HP",
        ping: 0,
        steps: [
          { type: "event", event: "SelfHP", before: { action: "start" }, currentHP: hp },
          { type: "skill", skill: "Probe" },
        ],
      },
      skills: {
        Probe: {
          name: "Probe",
          castTime: 12,
          tags: ["DirectDamage"],
          action: [
            ...[0, 0.1, 0.2, 0.3, 0.4, 0.5].map(time => ({ type: "damage", phyCoef: 1, time })),
            { type: "takeDamage", damage: 100, time: 1 },
            { type: "damage", phyCoef: 0, time: 1.1 },
            { type: "takeDamage", damage: 100, time: 11 },
            { type: "damage", phyCoef: 0, time: 11.1 },
          ],
        },
      },
      dots: {},
      effectDefinitions,
      eventDefinitions: rotationEventDefinitions,
      setupEffects: [],
      innerWayConditions: [...innerWayConditionsFor(ways, undefined, "bellstrikeSplendor")],
      innerWayRules: innerWayEffectRulesFor(ways, 21, "bellstrikeSplendor"),
      maxHP: 1000,
      weapons: ["namelessSword", "namelessSpear"],
    },
    stats: { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, directAffinity: 1, maxHp: 1000 },
    enemy: {
      name: "Test",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
    weapons: ["namelessSword", "namelessSpear"],
    attunement: emptyAttunementStats,
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  }
}

describe("Insightful Strike HP effects", () => {
  it.each([500, 750])("recovers HP at %s only after Concentration activates", hp => {
    const result = calculateRotationBaseline(bundle(hp))
    const row = result.timeline.find(row => row.step.skill === "Probe")!
    expect(row.actionStates[5].currentHP).toBe(hp)
    expect(row.actionStates[7].currentHP).toBeCloseTo(hp + result.actionBreakdowns[`${row.id}:5`].total * 0.015 - 98, 8)
  })

  it("does not leech above 75% HP or before T1", () => {
    for (const input of [bundle(751), bundle(500, "T0")]) {
      const result = calculateRotationBaseline(input)
      const row = result.timeline.find(row => row.step.skill === "Probe")!
      expect(row.actionStates[7].currentHP).toBe(row.actionStates[0].currentHP - 98)
    }
  })

  it("weights incoming mitigation while Concentration is active and stops at expiry", () => {
    const result = calculateRotationBaseline(bundle(1000, "T0"))
    const row = result.timeline.find(row => row.step.skill === "Probe")!
    expect(row.actions[6].damage).toBe(98)
    expect(row.actions[8].damage).toBe(100)
    expect(row.actionStates[9].currentHP).toBe(802)
  })

  it.each([
    { roll: 0, hp: 940 },
    { roll: 0.9, hp: 900 },
  ])("samples the incoming proc at roll $roll", ({ roll, hp }) => {
    const result = calculateSimulatedRotationRun(bundle(1000, "T0"), () => roll)
    const afterHit = result.resolvedSequence.find(({ entry }) => entry.timelineTime === 1.1)!
    expect(afterHit.entry.context.currentHPRatio).toBe(hp / 1000)
  })
})
