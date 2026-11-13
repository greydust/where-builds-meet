import effects from "@gamedata/buff/stonesplit-strength.json"
import previewEffects from "@gamedata/preview/cn-2.8.5/buff/stonesplit-strength.json"
import preview from "@gamedata/preview/cn-2.8.5/skill/Snowparting.json"
import skills from "@gamedata/skill/snowparting-blade.json"
import { describe, expect, it } from "vitest"

import { buildRotationTimeline, type TimelineBuildInput, type RotationStep } from "@/calculations/rotationTimeline"

import { asEffectDefinitions, asSkillRecords } from "./helpers/shippedData"

const cast = (skill: string): RotationStep => ({ type: "skill", skill })
const vc = cast("SnowpartingHeavyVC")
const lc = cast("SnowpartingLightCharged")
const delay = (duration: number): RotationStep => ({ type: "event", event: "Delay", duration })
function run(steps: RotationStep[], exhausted = false, usePreview = false) {
  const input: TimelineBuildInput = {
    rotation: { name: "Forgetfulness", ping: 0, steps },
    skills: asSkillRecords(usePreview ? { ...skills, ...preview } : skills),
    eventDefinitions: {},
    dots: {},
    effectDefinitions: asEffectDefinitions({
      ...effects,
      ...(usePreview ? previewEffects : {}),
      Exhausted: { duration: 30, maxStack: 1 },
    }),
    innerWayConditions: ["FrostCladNightT6"],
    innerWayRules: [],
    setupEffects: [],
    weapons: ["snowparting", "phalanxbane"],
    initialDebuffs: exhausted ? [{ name: "Exhausted", stack: 1, expiresAt: 30 }] : [],
  }
  return buildRotationTimeline(input).filter(row => row.step.type === "skill")
}

describe.each([false, true])("Forgetfulness cooldown (preview=%s)", usePreview => {
  it("starts cooldown when Grave Frost consumes Forgetfulness and blocks the next grant", () => {
    const rows = run([vc, lc, vc, lc], false, usePreview)
    expect(rows[1].effectiveCastTime).toBeCloseTo(0.955, 8)
    expect(Object.values(rows[1].actionStates).at(-1)!.buffs.has("Forgetfulness")).toBe(false)
    expect(Object.values(rows[1].actionStates).at(-1)!.buffs.has("ForgetfulnessCooldown")).toBe(true)
    expect(rows[3].effectiveCastTime).toBeCloseTo(1.605, 8)
  })
  it("does not start cooldown when an unused grant expires", () => {
    const rows = run([vc, delay(4.1), vc, lc], false, usePreview)
    expect(rows[2].effectiveCastTime).toBeCloseTo(0.955, 8)
  })
  it("allows a new grant after the cooldown expires", () => {
    const rows = run([vc, lc, delay(6), vc, lc], false, usePreview)
    expect(rows[3].effectiveCastTime).toBeCloseTo(0.955, 8)
  })
  it("allows the Global preview to regrant between 5.5 and 6 seconds after consumption", () => {
    const rows = run([vc, lc, delay(4), vc, lc], false, usePreview)
    expect(rows[3].effectiveCastTime).toBeCloseTo(usePreview ? 0.955 : 1.605, 8)
  })
  it("removes the cooldown before granting Forgetfulness on an exhausted target", () => {
    const rows = run([vc, lc, vc, lc], true, usePreview)
    expect(rows[3].actionStates[0].buffs.has("ForgetfulnessCooldown")).toBe(false)
    expect(rows[3].actionStates[0].buffs.has("Forgetfulness")).toBe(true)
    expect(rows[3].effectiveCastTime).toBeCloseTo(0.955, 8)
  })
  it("does not start cooldown for an unenhanced Grave Frost", () => {
    const rows = run([lc, vc, lc], false, usePreview)
    expect(Object.values(rows[0].actionStates).at(-1)!.buffs.has("ForgetfulnessCooldown")).toBe(false)
    expect(rows[2].effectiveCastTime).toBeCloseTo(0.955, 8)
  })
})
