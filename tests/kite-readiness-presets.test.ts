import { assert, describe, expect, it } from "vitest"

import { defaultGlobalDebuffs } from "@/globalDebuffs"

import regular from "../data/rotation/bamboocut-kite/dummy-1-min-infinite-vitality.json"
import bp from "../data/rotation/bamboocut-kite/dummy-1-min-iv-bp.json"
import { buildPresetRotationBundle } from "../src/application/graduation"
import { calculateRotationBaseline } from "../src/calculations/rotationCalculator"
import type { RotationRecord } from "../src/calculations/rotationTimeline"
import { rowWithId } from "./helpers/timelineRows"

export function calculateKite(rotation: RotationRecord, build: string) {
  const bundle = buildPresetRotationBundle(
    {
      pathId: "bamboocutKite",
      martialArts: ["heavenwill", "skygrasp"],
      rotation,
      breakthrough: "17",
      food: "SimmeringFishSlices",
      divinecraft: "Fire",
      script: "None",
      globalDebuffs: { ...defaultGlobalDebuffs },
      skillOverrides: {},
      previewId: null,
    },
    build,
  )
  expect(bundle).toBeDefined()
  return calculateRotationBaseline(bundle!)
}
describe("Kite preset release readiness", () => {
  it.each([
    { preset: regular, build: "kite-fully-relayed-min", completed: 4 },
    { preset: bp, build: "kite-fully-relayed-min-bp", completed: 4 },
  ])("$build respects release requirements and the encounter cutoff", ({ preset, build, completed }) => {
    const result = calculateKite({ ...preset, ping: 40 } as RotationRecord, build)
    const casts = result.timeline.filter(
      row => row.step.type === "skill" && row.step.skill?.startsWith("VileCondemned"),
    )
    expect(casts).toHaveLength(completed)
    for (const [index, row] of casts.entries()) {
      const hit = row.actions.find(action => action.phyCoef === 11.7527)
      expect(hit).toBeDefined()
      expect(hit!.type).toBe("damage")
      expect(row.startTime + Number(hit!.time) - result.anchorTime).toBeLessThan(result.duration)
      const damageIndex = row.actions.findIndex(action => action.type === "damage")
      const bonus = row.actionModifierEffects?.[damageIndex]?.some(effect => effect.baseDMGBonus === 0.3)
      if (index < 3) assert(bonus === true, "First three casts must carry the 0.3 base damage bonus.")
      expect(row.resourceConsumption?.HeavensWill).toBe(index < 3 ? 4 : 3)
    }
  })
})

it("Kite BP uses Perfect Dodge to cancel A6 and align with the first dummy attack", () => {
  const result = calculateKite({ ...bp, ping: 40 } as RotationRecord, "kite-fully-relayed-min-bp")
  const dodge = result.timeline.find(
    row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "PerfectDodge",
  )!
  const success = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "PerfectDodgeSuccess")!
  expect(dodge.startTime - result.anchorTime).toBeCloseTo(5.1)
  expect(dodge.startTime + dodge.effectiveCastTime - result.anchorTime).toBeCloseTo(5.6)
  expect(success.startTime - result.anchorTime).toBeCloseTo(5.5)
  expect(success.sourceRowId).toBe(dodge.id)
  const attacks = result.timeline.filter(
    row =>
      row.step.type === "event" &&
      row.step.event === "TakeDamage" &&
      Math.abs(row.startTime - result.anchorTime - 5.5) < 1e-8,
  )
  expect(attacks).toHaveLength(2)
  expect(attacks.every(row => row.actions.find(action => action.type === "takeDamage")?.damage === 0)).toBe(true)
  const waits = result.timeline.filter(
    row =>
      row.startTime < dodge.startTime &&
      row.step.type === "event" &&
      row.step.event === "Delay" &&
      row.step.automatic === "attack",
  )
  expect(waits).toHaveLength(1)
  expect(waits[0].effectiveCastTime).toBeCloseTo(0.0585)
})

it("Kite BP's final Qi break follows Soaring Spin and enables the last VC reset", () => {
  const result = calculateKite({ ...bp, ping: 40 } as RotationRecord, "kite-fully-relayed-min-bp")
  const qi = result.timeline.find(
    row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
  )!
  assert(qi.sourceRowId, "The Qi event must name the row it follows.")
  const spin = rowWithId(result.timeline, qi.sourceRowId)
  expect(spin.step).toMatchObject({ type: "skill", skill: "SoaringSpin2" })
  const firstHit = spin.actions.findIndex(action => action.type === "damage")
  expect(qi.startTime).toBeCloseTo(spin.startTime + Number(spin.actions[firstHit].time), 8)
  expect(spin.actionStates[firstHit].targetQiRatio).toBe(0)
  const mandate = result.timeline.findLast(row => row.step.type === "skill" && row.step.skill === "CelestialMandate")!
  const hits = mandate.actions.flatMap((action, index) => (action.type === "damage" ? [index] : []))
  expect(mandate.actionStates[hits[0]].debuffs.has("Exhausted")).toBe(true)
  expect(mandate.actionStates[hits[0]].buffs.has("VileCondemnedEndCooldown")).toBe(true)
  expect(mandate.actionStates[hits[1]].buffs.has("VileCondemnedEndCooldown")).toBe(false)
})
