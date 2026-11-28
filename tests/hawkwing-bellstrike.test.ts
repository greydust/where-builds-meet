import buffs from "@gamedata/buff/general.json"
import sets from "@gamedata/gear-set.json"
import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import {
  calculateRotationBaseline,
  calculateRotationDamageSequence,
  type RotationSimulationBundle,
} from "@/calculations/rotationCalculator"
import { effectForSoloLevel } from "@/data/soloLevelEffects"
import { emptyStats } from "@/data/statDefinitions"

import { asEffectDefinitions } from "./helpers/shippedData"

it.each([0, 100])(
  "applies shipped Hawkwing stacks after converting %s Void Attack in expected and sampled combat",
  voidAttack => {
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 100,
      minBellstrike: 100 - voidAttack,
      maxBellstrike: 100 - voidAttack,
      minVoidAttack: voidAttack,
      maxVoidAttack: voidAttack,
      minSilkbind: 100,
      maxSilkbind: 100,
      precision: 1,
      directAffinity: 1,
    }
    const input: RotationSimulationBundle = {
      timeline: {
        rotation: { name: "Hawkwing channel probe", steps: [{ type: "skill", skill: "Hit" }] },
        skills: {
          Hit: {
            castTime: 7,
            tags: ["DirectDamage"],
            action: [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 6].map(time => ({
              type: "damage",
              time,
              phyCoef: 1,
              attrCoef: 1,
            })),
          },
        },
        effectDefinitions: asEffectDefinitions(buffs),
        setupEffects: [effectForSoloLevel(sets.Hawkwing.options["4"].effect, 17, "Hawkwing")],
        eventDefinitions: {},
        dots: {},
        innerWayRules: [],
        innerWayConditions: [],
        weapons: ["namelessSword"],
      },
      stats,
      derivedStats: calculateDerivedStats(stats, 0, {}, ["namelessSword"]),
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
      startAnchor: { rowId: "rotation-0" },
      weapons: ["namelessSword"],
      attunement: emptyAttunementStats,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }
    const result = calculateRotationBaseline(input)
    const hits = calculateRotationDamageSequence(result.baseline)
    const sampled = calculateRotationDamageSequence(result.baseline, () => 0.5)
    const first = hits[0].breakdown
    for (const [index, stack] of [0, 1, 2, 3, 4, 5, 5, 0].entries()) {
      expect(hits[index].expectedBuffStacks?.Hawkwing).toBe(stack)
      expect(sampled[index].expectedBuffStacks?.Hawkwing).toBe(stack)
      expect(hits[index].breakdown.physical / first.physical).toBeCloseTo(1 + stack * 0.018, 12)
      expect(hits[index].breakdown.bellstrike / first.bellstrike).toBeCloseTo(1 + stack * 0.018, 12)
      expect(hits[index].breakdown.silkbind).toBe(first.silkbind)
      expect(sampled[index].breakdown.total).toBe(Math.ceil(hits[index].breakdown.total))
    }
  },
)
