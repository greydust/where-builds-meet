import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDamageBreakdown, type DamageContext } from "@/calculations/damage"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { EditableObject, TimelineBuildInput } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"

const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
const context: DamageContext = {
  stats,
  derivedStats: calculateDerivedStats(stats, 0),
  attunement: emptyAttunementStats,
  enemy: {
    name: "Target",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  },
  weapons: [],
  effects: [],
  buffs: [],
  skillTags: [],
}

describe("damage effect preparation", () => {
  it("ignores unrelated fields without discarding a mixed object's live damage values", () => {
    const effect = { trigger: { event: "damage" }, dmgBonus: { function: "multiply", param1: "distance", param2: 0.1 } }
    const effects = [{}, { resourceCostMultiplier: { Endurance: 0.9 } }, effect]
    for (const distance of [1, 3, 2]) {
      const actual = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects, distance })
      const expected = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [{ dmgBonus: distance * 0.1 }] })
      expect(actual).toEqual(expected)
    }
  })

  it("retains grouped reductions when unrelated effects are skipped", () => {
    const effects = [
      { trigger: {} },
      { reductionGroup: "shared", physicalResistance: -10 },
      { reductionGroup: "shared", physicalResistance: -20 },
    ]
    expect(calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects })).toEqual(
      calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [{ physicalResistance: -20 }] }),
    )
  })

  function rotation(conditional: boolean) {
    const modify: EditableObject = { target: "Bonus", modify: { effect: [{ effect: { hpDMGBonus: 0.05 } }] } }
    const timeline: TimelineBuildInput = {
      rotation: { name: "Refresh and expire", steps: [{ type: "skill", skill: "Hits" }] },
      skills: {
        Hits: {
          castTime: 3,
          action: [
            { type: "apply", target: "self", value: "Bonus", time: 0 },
            { type: "damage", phyCoef: 1, time: 0.1 },
            { type: "apply", target: "self", value: "Bonus", time: 0.5 },
            { type: "consume", target: "self", value: "Gate", stack: "all", time: 1 },
            { type: "damage", phyCoef: 1, time: 1.1 },
            { type: "damage", phyCoef: 1, time: 2.1 },
          ],
        },
      },
      initialBuffs: [{ name: "Gate" }],
      effectDefinitions: {
        Gate: {},
        Bonus: { duration: 1, refresh: true, effect: [{ effect: { hpDMGBonus: 0.05 } }] },
      },
      dots: {},
      eventDefinitions: {},
      weapons: [],
      innerWayConditions: [],
      setupEffects: [modify],
      innerWayRules: conditional
        ? [
            {
              source: "Conditional",
              tier: 1,
              effect: {},
              target: "Bonus",
              requirement: [{ target: "self", value: "Gate" }],
              modify: { effect: [{ effect: { hpDMGBonus: 0.1 } }] },
            },
          ]
        : [],
    }
    return calculateRotationBaseline({
      ...context,
      timeline,
      startAnchor: { rowId: "rotation-0" },
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    })
  }

  it.each([false, true])(
    "preserves modified buff refresh, expiry and live requirements (conditional=%s)",
    conditional => {
      const result = rotation(conditional)
      const damage = result.baseline.map(entry => result.actionBreakdowns[entry.id!].total)
      expect(damage).toHaveLength(3)
      expect(damage[0]).toBeCloseTo(conditional ? 120 : 110, 12)
      expect(damage[1]).toBeCloseTo(110, 12)
      expect(damage[2]).toBe(100)
    },
  )
})
