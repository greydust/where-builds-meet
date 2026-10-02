import { expect, it } from "vitest"

import { emptyAttunementStats } from "@/calculations/attunementStats"

import buffs from "../data/buff/stonesplit-strength.json"
import skills from "../data/skill/thundercry-blade.json"
import { calculateDamageBreakdown } from "../src/calculations/damage"
import { calculateDerivedStats } from "../src/calculations/effectiveStats"
import { buildRotationTimeline } from "../src/calculations/rotationTimeline"
import { emptyStats } from "../src/data/statDefinitions"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
import { rowCasting } from "./helpers/timelineRows"
it.each([
  ["Avalanche", 1.85, 1.545, [0.318, 1]],
  ["Avalanche1", 2, 0.318, [0.318]],
] as const)(
  "%s removes only its charge when Riposte is consumed",
  (skill, chargeDuration, releaseDuration, hitOffsets) => {
    const timeline = buildRotationTimeline({
      rotation: {
        name: "Avalanche charge",
        ping: 40,
        steps: [
          { type: "skill", skill: "Prepare" },
          { type: "skill", skill },
          { type: "skill", skill },
          { type: "skill", skill: "Observe" },
        ],
      },
      skills: asSkillRecords({
        ...skills,
        Prepare: { castTime: 0, action: [{ type: "apply", target: "self", value: "Riposte", time: 0 }] },
        Observe: { castTime: 0, action: [] },
      }),
      effectDefinitions: asEffectDefinitions(buffs),
      eventDefinitions: {},
      dots: {},
      weapons: ["thundercry"],
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
    })
    const [fast, slow] = timeline.filter(row => row.step.skill === skill)
    expect(fast.effectiveCastTime).toBeCloseTo(releaseDuration)
    expect(slow.effectiveCastTime).toBeCloseTo(chargeDuration + releaseDuration)
    expect(fast.actionStates[0].buffs.has("Riposte")).toBe(true)
    for (const [i, offset] of hitOffsets.entries()) {
      expect(fast.actions[i + 1].time).toBeCloseTo(offset)
      expect(slow.actions[i + 1].time).toBeCloseTo(offset + chargeDuration)
      expect(fast.actionStates[i + 1].buffs.has("Riposte")).toBe(false)
      expect(slow.actionStates[i + 1]).toBeDefined()
    }
    expect(slow.startTime).toBeCloseTo(fast.startTime + releaseDuration + 0.04)
    expect(rowCasting(timeline, "Observe")!.startTime).toBeCloseTo(
      slow.startTime + releaseDuration + chargeDuration + 0.04,
    )
  },
)
it("resolves Avalanche hit damage from the corrected datamined coefficients and bonuses", () => {
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, minStonesplit: 1000, maxStonesplit: 1000, precision: 1 }
  const context = {
    stats,
    attunement: emptyAttunementStats,
    weapons: ["thundercry" as const],
    skillTags: skills.Avalanche.tags,
    buffs: [],
    effects: [],
    derivedStats: calculateDerivedStats(stats, 0),
    enemy: {
      name: "Dummy",
      level: 96,
      defense: 0,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    },
  }
  const hits = skills.Avalanche.action
    .filter(action => action.type === "damage")
    .map(action => calculateDamageBreakdown(action, context))
  expect(hits[0].physical).toBeCloseTo(2487.38, 6)
  expect(hits[0].stonesplit).toBeCloseTo(3363.045, 6)
  expect(hits[1].physical).toBeCloseTo(3672.08356, 6)
  expect(hits[1].stonesplit).toBeCloseTo(4964.81529, 6)
  const canceled = calculateDamageBreakdown(skills.Avalanche1.action[1], context)
  expect(canceled.total).toBeCloseTo(hits[0].total, 6)
})
