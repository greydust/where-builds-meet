import bleedJson from "@gamedata/dot/bellstrike-umbra.json"
import dotsJson from "@gamedata/dot/mystic.json"
import skillsJson from "@gamedata/skill/mystic.json"
import { describe, expect, it } from "vitest"

import { buildRotationTimeline } from "@/calculations/rotationTimeline"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const dots = asEffectDefinitions(dotsJson)

describe("timer-wheel burn cadence", () => {
  it.each([
    { skill: "DragonsBreath1", effect: "Combustion", count: 16 },
    { skill: "DragonsBreath2", effect: "Combustion", count: 22 },
    { skill: "DragonsBreathSmolder1", effect: "Smolder", count: 8 },
    { skill: "DragonsBreathSmolder2", effect: "Smolder", count: 23 },
  ])("$skill retains $count ticks with an immediate first tick", ({ skill, effect, count }) => {
    for (const sampled of [false, true]) {
      const rows = buildRotationTimeline(
        {
          rotation: {
            name: "Single burn",
            ping: 0,
            infiniteVitality: true,
            steps: [
              { type: "skill", skill },
              { type: "event", event: "Delay", duration: 20 },
            ],
          },
          skills: asSkillRecords(skillsJson),
          dots: asSkillRecords(dotsJson),
          effectDefinitions: dots,
          eventDefinitions: {},
          innerWayConditions: [],
          innerWayRules: [],
          setupEffects: [],
          weapons: [],
        },
        sampled ? () => 0.5 : undefined,
      )
      const ticks = rows.filter(row => row.kind === "dot" && row.step.skill === effect)
      expect(ticks).toHaveLength(count)
      expect(ticks[0].startTime).toBeCloseTo(1.27292535, 10)
      ticks.forEach((row, index) => expect(row.startTime).toBeCloseTo(1.27292535 + index * 0.528, 10))
    }
  })
})

it.each([
  { effect: "Smolder", count: 114 },
  { effect: "Combustion", count: 114 },
  { effect: "UmbraBleeding", count: 59 },
])("$effect produces $count ticks in a sustained 60-second window", ({ effect, count }) => {
  const definitions = { ...dotsJson, ...bleedJson }
  for (const sampled of [false, true]) {
    const rows = buildRotationTimeline(
      {
        rotation: { name: "Sustained burn", ping: 0, steps: [{ type: "skill", skill: "Apply" }] },
        skills: {
          Apply: { castTime: 60, action: [{ type: "apply", target: "target", value: effect, duration: 60, time: 0 }] },
        },
        dots: asSkillRecords(definitions),
        effectDefinitions: asEffectDefinitions(definitions),
        eventDefinitions: {},
        innerWayConditions: [],
        innerWayRules: [],
        setupEffects: [],
        weapons: [],
      },
      sampled ? () => 0.5 : undefined,
    )
    expect(rows.filter(row => row.kind === "dot" && row.step.skill === effect)).toHaveLength(count)
  }
})
