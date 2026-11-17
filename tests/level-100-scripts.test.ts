import buffs from "@gamedata/buff/general.json"
import scripts from "@gamedata/script.json"
import skills from "@gamedata/skill/general.json"
import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"
import { calculateDerivedStats } from "@/calculations/effectiveStats"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { buildRotationTimeline, type TimelineBuildInput } from "@/calculations/rotationTimeline"
import { emptyStats } from "@/data/statDefinitions"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

function fixture(
  script: "Voidsky" | "Soullink" | "Purewrath",
  times: number[],
  costs: number[] = [],
): TimelineBuildInput {
  return {
    rotation: { name: script, steps: [{ type: "skill", skill: "Probe" }], start: { step: 0 } },
    skills: {
      ...asSkillRecords(skills),
      Probe: {
        name: "Probe",
        castTime: Math.max(...times),
        tags: ["Mystic"],
        action: times.flatMap((time, index) => [
          ...(costs[index]
            ? [{ type: "consumeResource", value: "Vitality", amount: costs[index], time: time - 0.1 }]
            : []),
          { type: "damage", phyCoef: 1, time },
        ]),
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: asEffectDefinitions(buffs),
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [scripts[script].effect],
    weapons: [],
    maxHP: 1000,
  }
}
function stacks(input: TimelineBuildInput, name: string) {
  const row = buildRotationTimeline(input).find(row => row.id === "rotation-0")!
  return row.actions.flatMap((action, index) =>
    action.type === "damage" ? [row.actionStates[index].buffs.get(name)?.stack ?? 0] : [],
  )
}

describe("level 100 scripts", () => {
  it.each(["Voidsky", "Soullink"] as const)("%s triggers after damage, respects cooldown, caps and expires", name => {
    expect(stacks(fixture(name, [0, 1, 59.9, 60, 60.1, 120, 120.1, 180, 180.1, 301, 301.1]), name)).toEqual([
      0, 1, 1, 1, 2, 2, 3, 3, 3, 0, 1,
    ])
  })
  it.each([undefined, 1000, "infinite"] as const)(
    "Purewrath counts each 120 Vitality, preserves remainder and caps with meter %s",
    meter => {
      const input = fixture("Purewrath", [1, 2, 3, 4, 5, 126], [119, 2, 119, 240])
      if (typeof meter === "number") {
        input.initialResources = { Vitality: meter }
        input.resourceMaximums = { Vitality: meter }
      }
      if (meter === "infinite") input.infiniteResources = ["Vitality"]
      expect(stacks(input, "Purewrath")).toEqual([0, 1, 2, 3, 3, 0])
    },
  )
  it.each(["Voidsky", "Soullink", "Purewrath"] as const)(
    "%s increases calculated damage by its cumulative stack bonus",
    name => {
      const timeline = fixture(name, [1, 2], name === "Purewrath" ? [0, 360] : [])
      const stats = {
        ...emptyStats,
        minPhys: 1000,
        maxPhys: 1000,
        precision: 1,
        directCrit: name === "Voidsky" ? 0.2 : 0,
        directAffinity: name === "Soullink" ? 1 : 0,
        critDmgBonus: 0.5,
        affinityDmgBonus: 0.5,
        crit: name === "Voidsky" ? 1 : 0,
        affinity: 0,
      }
      const result = calculateRotationBaseline({
        timeline,
        startAnchor: { rowId: "rotation-0" },
        stats,
        attunement: emptyAttunementStats,
        enemy: {
          name: "Probe",
          level: 96,
          defense: 0,
          physicalResistance: 0,
          bellstrikeResistance: 0,
          stonesplitResistance: 0,
          silkbindResistance: 0,
          bamboocutResistance: 0,
          judgementResistance: 0,
        },
        derivedStats: calculateDerivedStats(stats, 0),
        weapons: [],
        statPriority: [],
        attunementPriority: [],
        innerWayPriority: [],
        setupComparisons: {},
      })
      const hits = Object.values(result.actionBreakdowns).filter(hit => hit.total > 0)
      expect(hits).toHaveLength(2)
      expect(hits[1]!.total).toBeGreaterThan(hits[0]!.total)
      const multiplier = name === "Purewrath" ? 1.12 : 1 + 0.035 / 1.5
      expect(hits[1]!.total / hits[0]!.total).toBeCloseTo(multiplier, 8)
    },
  )
})
