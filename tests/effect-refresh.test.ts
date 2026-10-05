import { describe, expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import { buildRotationTimeline } from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { rowCasting } from "./helpers/timelineRows"

describe("effect lifecycle", () => {
  it.each([
    { refresh: false, reapply: true, expected: [2, 0, 0] },
    { refresh: true, reapply: true, expected: [2, 2, 0] },
    { refresh: true, reapply: false, expected: [1, 0, 0] },
  ])("respects stack refresh and reapplication policy: %j", ({ refresh, reapply, expected }) => {
    const timeline = buildRotationTimeline({
      rotation: { name: "Refresh policy", steps: [{ type: "skill", skill: "Probe" }] },
      skills: {
        Probe: {
          name: "Probe",
          castTime: 10,
          tags: [],
          action: [
            { type: "apply", target: "self", value: "Stacking", stack: 1, time: 0 },
            { type: "apply", target: "self", value: "Stacking", stack: 1, reapply, time: 2 },
            ...[6.9, 7.1, 9.1].map(time => ({ type: "damage", phyCoef: 0, time })),
          ],
        },
      },
      effectDefinitions: { Stacking: { duration: 7, maxStack: 3, refresh, effect: [] } },
      eventDefinitions: {},
      dots: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: [],
    })
    const row = rowCasting(timeline, "Probe")!
    const stacks = row.actions.flatMap((action, index) =>
      action.type === "damage" ? [row.actionStates[index].buffs.get("Stacking")?.stack ?? 0] : [],
    )
    expect(stacks).toEqual(expected)
  })

  it.each([true, false])(
    "evaluates a buff's target-debuff and skill-tag requirements at each hit (matching=%s)",
    matching => {
      const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 }
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
          rotation: { name: "Hit-time requirements", steps: [{ type: "skill", skill: "Probe" }] },
          skills: {
            Probe: {
              name: "Probe",
              castTime: 4,
              tags: matching ? ["TestDamage"] : [],
              action: [
                { type: "apply", target: "self", value: "Empowered", time: 0 },
                { type: "damage", phyCoef: 1, time: 0.2 },
                { type: "apply", target: "target", value: "Mark", time: 0.5 },
                { type: "damage", phyCoef: 1, time: 1 },
                { type: "damage", phyCoef: 1, time: 3 },
              ],
            },
          },
          effectDefinitions: {
            Empowered: {
              duration: 5,
              maxStack: 1,
              effect: [
                {
                  requirement: [
                    { target: "skillTag", value: "TestDamage" },
                    { target: "target", value: "Mark" },
                  ],
                  effect: { baseDMGBonus: 1 },
                },
              ],
            },
            Mark: { duration: 2, maxStack: 1, effect: [] },
          },
          eventDefinitions: {},
          dots: {},
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects: [],
          weapons: [],
        },
        startAnchor: { rowId: "rotation-0" },
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
      const damage = [1, 3, 4].map(index => result.actionBreakdowns[`rotation-0:${index}`].total)
      expect(damage).toEqual(matching ? [100, 200, 100] : [100, 100, 100])
    },
  )
})
