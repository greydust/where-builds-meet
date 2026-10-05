import { describe, expect, it } from "vitest"

import generalBuffsJson from "../data/buff/general.json"
const generalBuffs = asEffectDefinitions(generalBuffsJson)
import mysticBuffsJson from "../data/buff/mystic.json"
const mysticBuffs = asEffectDefinitions(mysticBuffsJson)
import mysticDebuffsJson from "../data/debuff/mystic.json"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
const mysticDebuffs = asEffectDefinitions(mysticDebuffsJson)
import mysticJson from "../data/skill/mystic.json"
const mystic = asSkillRecords(mysticJson)
import { buildRotationTimeline, type TimelineBuildInput } from "../src/calculations/rotationTimeline"

function castWithFollowup(skill: string, intoxicated = false) {
  const input: TimelineBuildInput = {
    rotation: {
      name: "Mystic timing",
      ping: 40,
      infiniteVitality: true,
      steps: [
        { type: "skill", skill },
        { type: "skill", skill: "Followup" },
      ],
    },
    skills: { ...mystic, Followup: { castTime: 0.5, action: [{ type: "damage", time: 0.5, phyCoef: 1 }] } },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { ...mysticBuffs, ...generalBuffs, ...mysticDebuffs },
    initialBuffs: intoxicated ? [{ name: "Intoxicated", stack: 1 }] : [],
    innerWayConditions: ["FuryHarvestT6"],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  }
  const rows = buildRotationTimeline(input)
  return { cast: rows.find(row => row.rotationIndex === 0)!, next: rows.find(row => row.rotationIndex === 1)! }
}

describe("Mystic cast timing with ping", () => {
  it.each([
    { skill: "SoaringSpin1", duration: 1.1818181818181817, hits: [0.7946970054545454] },
    { skill: "SoaringSpin2", duration: 2.02492899, hits: [0.7946970054545454, 2.02492899] },
    { skill: "DragonHeadTide", duration: 5.8, hits: [4.7375] },
    { skill: "BurstingNine", duration: 1.4, hits: Array(9).fill(1.1625) },
    { skill: "FluteOfTheTides", duration: 3.3, hits: [1.35, 3.275] },
  ])(
    "$skill preserves its hits, finishes at the selected boundary, and then pays the next ping",
    ({ skill, duration, hits }) => {
      const { cast, next } = castWithFollowup(skill)
      expect(cast.startTime).toBeCloseTo(0.04, 10)
      expect(cast.effectiveCastTime).toBeCloseTo(duration, 10)
      expect(next.startTime).toBeCloseTo(0.04 + duration + 0.04, 10)
      const damage = cast.actions.flatMap((action, index) => (action.type === "damage" ? [{ action, index }] : []))
      expect(damage).toHaveLength(hits.length)
      damage.forEach(({ action, index }, i) => {
        expect(action.time).toBeCloseTo(hits[i], 10)
        expect(cast.actionStates[index]).toBeDefined()
      })
      const turnaround = next.buffs.get("Turnaround")
      expect(turnaround?.appliedAt).toBeCloseTo(cast.startTime + duration, 10)
    },
  )

  it.each(
    ["DragonsBreath1", "DragonsBreathSmolder1", "DragonsBreath2", "DragonsBreathSmolder2"].flatMap(skill =>
      [false, true].map(intoxicated => ({ skill, intoxicated })),
    ),
  )("$skill resolves the complete selected route with intoxicated=$intoxicated", ({ skill, intoxicated }) => {
    const { cast, next } = castWithFollowup(skill, intoxicated)
    const times = intoxicated ? [0.6064791536363635, 1.6975969436363636] : [1.27292535, 2.72768958]
    const two = skill.endsWith("2"),
      duration = times[two ? 1 : 0]
    expect(cast.effectiveCastTime).toBeCloseTo(duration, 10)
    expect(next.startTime).toBeCloseTo(cast.startTime + duration + 0.04, 10)
    const damage = cast.actions.filter(action => action.type === "damage")
    expect(damage).toHaveLength(two ? 3 : 1)
    expect(damage[0].time).toBeCloseTo(times[0], 10)
    damage.slice(1).forEach(action => expect(action.time).toBeCloseTo(times[1], 10))
    const burn = skill.includes("Smolder") ? "Smolder" : "Combustion"
    cast.actions.forEach((action, index) => {
      if (action.value !== burn) return
      expect(action.time).toBeCloseTo(action.type === "extend" && index > 5 ? times[1] : times[0], 10)
      expect(cast.actionStates[index]).toBeDefined()
    })
    expect(next.buffs.get("Turnaround")?.appliedAt).toBeCloseTo(cast.startTime + duration, 10)
    expect(next.buffs.has("Intoxicated")).toBe(true)
  })
})
