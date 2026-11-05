import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

const cases = (await loadDpsSnapshotCases()).filter(
  entry => entry.pathId === "silkbindJade" && entry.fixture.rotation !== "jade-three-rounds",
)

describe("Jade one-minute preset continuity", () => {
  it.each(cases)("$id attacks through cooldown and UF recovery windows", ({ pathId, fixture, rotation }) => {
    const bundle = buildPresetRotationBundle(
      { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null },
      fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    const end = result.timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")!
    const rows = result.timeline.filter(row => row.startTime < end.startTime)
    expect(result.duration).toBe(60)
    const delays = rows.filter(row => row.step.type === "event" && row.step.event === "Delay")
    expect(delays).toHaveLength(fixture.rotation === "jade-grounded" ? 1 : 0)
    const expectedDelays = fixture.rotation === "jade-grounded" ? [0.199610808] : []
    expect(delays.map(row => row.effectiveCastTime)).toEqual(expectedDelays)
    for (const row of delays) {
      expect(row.step).not.toHaveProperty("automatic")
      expect(row.buffs.has("UnfadingFlowerMode")).toBe(true)
    }
    expect(rows.filter(row => row.skipped)).toEqual([])
    const flowers = rows.filter(row => row.step.type === "skill" && row.step.skill === "UnfadingFlowerCancel")
    for (const row of flowers) expect(row.resources.Blossoms).toBeCloseTo(100, 6)
    let expectedFlowers = 0
    switch (fixture.rotation) {
      case "jade-flying":
        expectedFlowers = 2
        break
      case "jade-grounded":
        expectedFlowers = 6
        break
      case "jade-hybrid":
        expectedFlowers = 4
        break
    }
    expect(flowers).toHaveLength(expectedFlowers)
  })
  it.each(cases.filter(entry => entry.fixture.rotation === "jade-grounded"))(
    "$id preserves buffs, refills and final exhaustion timing",
    ({ pathId, fixture, rotation }) => {
      const bundle = buildPresetRotationBundle(
        { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null },
        fixture.build,
      )!
      const result = calculateRotationBaseline(bundle)
      const end = result.timeline.find(row => row.step.type === "event" && row.step.event === "BattleEnd")!
      const rows = result.timeline.filter(row => row.startTime < end.startTime)
      const flowers = rows.filter(row => row.step.type === "skill" && row.step.skill === "UnfadingFlowerCancel")
      for (const flower of flowers) {
        const next = rows.find(row => row.kind === "rotation" && row.rotationIndex === flower.rotationIndex! + 1)!
        expect(next.step.skill).toBe("Deflect")
        expect(next.startTime).toBeCloseTo(flower.startTime + flower.effectiveCastTime, 9)
      }
      expect(flowers.at(-1)!.startTime - result.anchorTime).toBeCloseTo(51.687, 3)
      expect(result.metrics.breakdown.groupedSkills.find(skill => skill.id === "UnfadingFlowerProjectile")!.hits).toBe(
        153,
      )
      for (const [index, step] of rotation.steps.entries()) {
        if (step.type !== "skill") continue
        expect(rows.some(row => row.kind === "rotation" && row.rotationIndex === index)).toBe(true)
      }
      {
        const casts = rows.filter(row => row.kind === "rotation" && row.step.type === "skill")
        const qs = casts.filter(row => row.step.skill === "SpringSorrow")
        const toad = casts.find(row => row.step.skill === "LeapingToad")!
        expect(toad.resources.Vitality).toBeGreaterThanOrEqual(25)
        expect(casts[casts.indexOf(toad) - 1].step.skill).toBe("ForsakenFameCancel")
        const fan = casts[casts.indexOf(toad) + 1]
        expect(fan.step.skill).toBe("EmeraldBarrierCancel")
        expect(fan.startTime).toBeCloseTo(toad.startTime + toad.effectiveCastTime + 0.04, 9)
        expect(fan.debuffs.has("ToadVenom")).toBe(true)
        for (const index of toad.actions.flatMap((action, index) => (action.type === "damage" ? [index] : [])))
          expect(result.actionBreakdowns[`${toad.id}:${index}`]).toBeDefined()
        for (const row of qs.slice(1)) expect(row.debuffs.has("JadeCombo")).toBe(true)
        // After the initial mark, LB and Jadebreak must form continuous intervals.
        const states = rows.flatMap(row => [row, ...Object.values(row.actionStates)])
        for (const name of ["Jadebreak", "LingeringBone"] as const) {
          const intervals = states
            .flatMap(state => {
              const effect = (name === "Jadebreak" ? state.buffs : state.debuffs).get(name)
              return effect?.appliedAt !== undefined && effect.expiresAt !== undefined
                ? [[effect.appliedAt, effect.expiresAt] as const]
                : []
            })
            .sort((a, b) => a[0] - b[0])
          expect(intervals.length).toBeGreaterThan(0)
          let coveredUntil = intervals[0][1]
          for (const [start, expiry] of intervals.slice(1)) {
            if (start >= end.startTime) break
            expect(start).toBeLessThanOrEqual(coveredUntil + 1e-8)
            coveredUntil = Math.max(coveredUntil, expiry)
          }
          expect(coveredUntil).toBeGreaterThanOrEqual(end.startTime)
        }
        const refillSkills = new Set([
          "SpringSorrow",
          "VernalHeavy",
          "ColorfulPhoenix35Blossoms",
          "UnfadingFlowerCancel",
        ])
        for (const row of casts.filter(
          row => row.startTime > flowers[0].startTime && !row.buffs.has("UnfadingFlowerMode"),
        )) {
          const previous = casts[casts.indexOf(row) - 1]
          const completesStartedCancel =
            row.step.skill === "Deflect" &&
            previous?.step.skill === "ForsakenFameCancel" &&
            previous.buffs.has("UnfadingFlowerMode")
          expect(refillSkills.has(row.step.skill!) || completesStartedCancel).toBe(true)
        }
        for (const row of rows.filter(
          row => row.step.skill === "UnfadingFlowerProjectile" && row.startTime >= flowers[1].startTime,
        ))
          expect(row.debuffs.has("LingeringBone")).toBe(true)
        const tide = casts.find(row => row.step.skill === "DragonHeadTide")!
        const hit = tide.actions.findIndex(action => action.type === "damage")
        expect(tide.resources.Vitality).toBeGreaterThanOrEqual(80)
        expect(result.actionBreakdowns[`${tide.id}:${hit}`]).toBeDefined()
        expect(tide.actionStates[hit].debuffs.has("Exhausted")).toBe(true)
      }
    },
  )
})
