import bp from "@gamedata/rotation/bamboocut-kite/dummy-1-min-iv-bp.json"
import { assert, describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { defaultGlobalDebuffs } from "@/globalDebuffs"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"
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
  it("all supported builds land four enhanced Ends with legal resource generators before cutoff", async () => {
    const cases = (await loadDpsSnapshotCases()).filter(
      entry => entry.pathId === "bamboocutKite" && entry.fixture.rotation !== "dummy-1-min-iv-bp-dh",
    )
    expect(cases.length).toBeGreaterThan(0)
    for (const { id, pathId, rotation, fixture } of cases) {
      const bundle = buildPresetRotationBundle(
        { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null },
        fixture.build,
      )!
      const result = calculateRotationBaseline(bundle)
      const casts = result.timeline.filter(
        row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill?.startsWith("VileCondemned"),
      )
      expect(casts).toHaveLength(4)
      for (const [index, row] of casts.entries()) {
        const hit = row.actions.find(action => action.phyCoef === 11.7527)
        expect(hit).toBeDefined()
        expect(hit!.type).toBe("damage")
        expect(row.startTime + Number(hit!.time) - result.anchorTime).toBeLessThan(result.duration)
        const damageIndex = row.actions.findIndex(action => action.type === "damage")
        const bonus = row.actionModifierEffects?.[damageIndex]?.some(effect => effect.baseDMGBonus === 0.3)
        assert(bonus === true, id + ": every End must carry the four-HW enhancement.")
        expect(row.resourceConsumption?.HeavensWill).toBe(4)
        expect(row.actionStates[damageIndex].debuffs.get("SoaringHighEndVulnerability")?.stack ?? 0).toBe(
          Math.min(index, 2),
        )
      }
      let declared = false
      for (const row of result.timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")) {
        switch (row.step.skill) {
          case "HeavenwillDeclared":
            declared = true
            break
          case "CelestialMandate":
            assert(declared, id + ": Mandate requires an unused Heavenwill Declared.")
            declared = false
            break
          case "RighteousReign5thHit":
            assert(row.buffs.get("HeavenwillLightCombo")?.stack === 5, id + ": A5 requires stage 5.")
            break
          case "RighteousReign6thHitCancel":
            assert(row.buffs.get("HeavenwillLightCombo")?.stack === 6, id + ": A6 requires stage 6.")
            break
        }
      }
    }
  })
})

it("Kite BP uses ordinary Dodge to cancel A6 and align with the first dummy attack", () => {
  const result = calculateKite({ ...bp, ping: 40 } as RotationRecord, "kite-fully-relayed-min-bp")
  const dodge = result.timeline.find(
    row => row.kind === "rotation" && row.step.type === "skill" && row.step.skill === "Dodge",
  )!
  const success = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "PerfectDodgeSuccess")!
  expect(dodge.startTime - result.anchorTime).toBeCloseTo(5.35)
  expect(dodge.startTime + dodge.effectiveCastTime - result.anchorTime).toBeCloseTo(5.75)
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
  expect(waits[0].effectiveCastTime).toBeCloseTo(0.3865)
})

it("Kite BP's final Qi break follows Soaring Spin and enables the last VC reset", () => {
  const result = calculateKite({ ...bp, ping: 40 } as RotationRecord, "kite-fully-relayed-min-bp")
  const qi = result.timeline.find(
    row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
  )!
  assert(qi.sourceRowId, "The Qi event must name the row it follows.")
  const spin = rowWithId(result.timeline, qi.sourceRowId)
  expect(spin.step).toMatchObject({ type: "skill", skill: "SoaringSpin1" })
  const firstHit = spin.actions.findIndex(action => action.type === "damage")
  expect(qi.startTime).toBeCloseTo(spin.startTime + Number(spin.actions[firstHit].time), 8)
  expect(spin.actionStates[firstHit].targetQiRatio).toBe(0)
  const ends = result.timeline.filter(row => row.kind === "rotation" && row.step.skill === "VileCondemnedEnd4")
  const third = ends[2]
  const thirdHit = third.actions.findIndex(action => action.type === "damage")
  expect(third.actionStates[thirdHit].debuffs.has("Exhausted")).toBe(true)
  expect(third.actionStates[thirdHit].buffs.get("Disintegration")?.stack).toBe(5)
  const falconHits = result.baseline.filter(
    entry =>
      entry.context.skillTags.includes("Falcon") &&
      (entry.timelineTime ?? 0) > third.startTime + Number(third.actions[thirdHit].time) &&
      (entry.timelineTime ?? 0) < ends[3].startTime,
  )
  expect(falconHits[0].activeDebuffStacks?.Exhausted).toBe(1)
  expect(falconHits[0].activeBuffStacks?.VileCondemnedEndCooldown).toBe(1)
  expect(falconHits.some(entry => !entry.activeBuffStacks?.VileCondemnedEndCooldown)).toBe(true)
})
