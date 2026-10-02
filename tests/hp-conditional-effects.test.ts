import assert from "node:assert/strict"

import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { emptyStats } from "../src/data/statDefinitions"

describe("HP-conditional effects", () => {
  it("removes and restores conditional stats and damage/healing bonuses as HP changes", () => {
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      precision: 1,
      critDmgBonus: 0.5,
      criticalHealingBonus: 0.5,
    }
    const enemy = {
      name: "Fixture",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    }
    const result = calculateRotationBaseline({
      timeline: {
        rotation: {
          name: "HP transitions",
          steps: [10000, 5000, 10000].flatMap(currentHP => [
            { type: "event", event: "SelfHP", before: { action: "start" }, currentHP },
            { type: "skill", skill: "Probe" },
          ]),
        },
        skills: {
          Probe: {
            name: "Probe",
            castTime: 1,
            tags: [],
            action: [
              { type: "damage", phyCoef: 1, time: 0.2 },
              { type: "heal", phyCoef: 1, time: 0.3 },
            ],
          },
        },
        eventDefinitions: { SelfHP: { name: "Self HP", castTime: 0, action: [{ type: "setHP", time: 0 }] } },
        effectDefinitions: {},
        dots: {},
        innerWayRules: [],
        innerWayConditions: [],
        weapons: [],
        maxHP: 10000,
        setupEffects: [
          { rawStat: { crit: 0.1 } },
          {
            requirement: [{ target: "selfHPPercentage", comparison: ">=", amount: 100 }],
            effect: { stat: { crit: 0.2 }, critDmgBonus: 0.3, criticalHealingBonus: 0.4 },
          },
        ],
      },
      startAnchor: { rowId: "rotation-1" },
      stats,
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: [],
      attunement: emptyAttunementStats,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
    const samples = [1, 3, 5].map(index => ({
      damage: result.actionBreakdowns[`rotation-${index}:0`],
      healing: result.actionBreakdowns[`rotation-${index}:1`].healing,
    }))
    for (const [index, sample] of [
      [0, samples[0]],
      [2, samples[2]],
    ] as const) {
      assert(sample?.damage && sample.healing, `Sample ${index} must resolve both a hit and a heal.`)
      expect(sample.damage.outcomeRates?.critical).toBeCloseTo(0.3)
      expect(sample.healing?.criticalRate).toBeCloseTo(0.3)
      expect(sample.damage.total).toBeCloseTo(124)
      expect(sample.healing?.total).toBeCloseTo(127)
    }
    expect(samples[1]?.damage.outcomeRates?.critical).toBeCloseTo(0.1)
    expect(samples[1]?.healing?.criticalRate).toBeCloseTo(0.1)
    expect(samples[1]?.damage.total).toBeCloseTo(105)
    expect(samples[1]?.healing?.total).toBeCloseTo(105)
  })
})
