import { describe, expect, it } from "vitest"

import generalBuffsJson from "../data/buff/general.json"
const generalBuffs = asEffectDefinitions(generalBuffsJson)
import generalJson from "../data/skill/general.json"
import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"
const general = asSkillRecords(generalJson)
import { buildRotationTimeline, type RotationStep, type TimelineBuildInput } from "../src/calculations/rotationTimeline"

function input(steps: RotationStep[], targetType?: "Dummy" | "DummyAttack" | "Boss"): TimelineBuildInput {
  return {
    rotation: { name: "Rising Momentum", ping: 40, steps, ...(targetType ? { targetType } : {}) },
    skills: {
      ...general,
      Lead: { castTime: 1, ignorePing: true, action: [] },
      Strike: { name: "Strike", castTime: 2, action: [{ type: "damage", phyCoef: 1, attrCoef: 1, time: 1 }] },
    },
    eventDefinitions: {
      BattleEnd: { action: [] },
      Delay: { action: [] },
      TakeDamage: { action: [{ type: "takeDamage", time: 0 }] },
    },
    dots: {},
    effectDefinitions: generalBuffs,
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    maxHP: 10000,
  }
}

const successes = (rows: ReturnType<typeof buildRotationTimeline>) =>
  rows.filter(row => row.step.type === "skill" && row.step.skill === "DeflectSuccess")

describe("Rising Momentum", () => {
  it("stacks one application per successful deflection", () => {
    const rows = buildRotationTimeline(
      input(
        [
          { type: "skill", skill: "Lead" },
          { type: "skill", skill: "DeflectSuccessful" },
          { type: "skill", skill: "DeflectSuccessful" },
          { type: "skill", skill: "Strike" },
          { type: "event", event: "BattleEnd", startTime: 12 },
        ],
        "Boss",
      ),
    )
    const first = successes(rows)[0]
    const second = successes(rows)[1]
    expect(first.buffs.get("RisingMomentum")).toBeUndefined()
    expect(second.buffs.get("RisingMomentum")?.stack).toBe(1)
    expect(second.buffs.get("RisingMomentum")?.maxStack).toBe(10)
    const strike = rows.find(row => row.step.type === "skill" && row.step.skill === "Strike")
    expect(strike?.buffs.get("RisingMomentum")?.stack).toBe(2)
  })

  it("expires five seconds after the last deflection", () => {
    const rows = buildRotationTimeline(
      input(
        [
          { type: "skill", skill: "DeflectSuccessful" },
          { type: "event", event: "Delay", duration: 7 },
          { type: "event", event: "BattleEnd", startTime: 10 },
        ],
        "Boss",
      ),
    )
    const deflect = successes(rows)[0]
    const active = rows.find(row => row.buffs.has("RisingMomentum"))
    expect(active?.buffs.get("RisingMomentum")?.stack).toBe(1)
    expect((active?.buffs.get("RisingMomentum")?.expiresAt ?? 0) - deflect.startTime).toBeCloseTo(5)
    expect(rows.at(-1)?.buffs.has("RisingMomentum")).toBe(false)
  })

  it.each(["Dummy", "DummyAttack", "Boss"] as const)(
    "applies only when the practice target is a boss (%s)",
    targetType => {
      const rows = buildRotationTimeline(
        input(
          [
            { type: "skill", skill: "Lead" },
            { type: "skill", skill: "DeflectSuccessful" },
            { type: "event", event: "Delay", duration: 8 },
            { type: "event", event: "BattleEnd", startTime: 14 },
          ],
          targetType,
        ),
      )
      expect(successes(rows).length).toBe(1)
      expect(rows.some(row => row.buffs.has("RisingMomentum"))).toBe(targetType === "Boss")
    },
  )

  it("supplies the cumulative 2% per stack through ten stacks", () => {
    const definition = asEffectDefinitions(generalBuffs).RisingMomentum
    expect(definition.duration).toBe(5)
    expect(definition.maxStack).toBe(10)
    const stacks = definition.stackEffects ?? []
    expect(stacks).toHaveLength(10)
    expect(stacks.map(entry => (entry[0] as { effect?: { dmgBonus?: number } } | undefined)?.effect?.dmgBonus)).toEqual(
      [0.02, 0.04, 0.06, 0.08, 0.1, 0.12, 0.14, 0.16, 0.18, 0.2],
    )
  })
})
