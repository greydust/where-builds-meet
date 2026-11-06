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
    const allowedDelays = fixture.rotation === "jade-flying" ? [] : ["cooldown", "requirement", "attack"]
    for (const delay of delays)
      expect(allowedDelays).toContain(delay.step.event === "Delay" ? delay.step.automatic : undefined)
    expect(rows.filter(row => row.skipped)).toEqual([])
    const flowers = rows.filter(row => row.step.type === "skill" && row.step.skill === "UnfadingFlowerCancel")
    for (const [index, row] of flowers.entries()) {
      const partial = fixture.rotation !== "jade-flying" && (index === 4 || index === 6)
      expect(row.resources.Blossoms).toBeGreaterThanOrEqual(partial ? 60 : 100 - 0.0000005)
      expect(row.resources.Blossoms).toBeLessThan(partial ? 61 : 100 + 0.0000005)
    }
    let expectedFlowers = 0
    switch (fixture.rotation) {
      case "jade-flying":
        expectedFlowers = 3
        break
      case "jade-grounded":
        expectedFlowers = 7
        break
      case "jade-hybrid":
        expectedFlowers = 6
        break
    }
    expect(flowers).toHaveLength(expectedFlowers)
  })
  it.each(cases.filter(entry => entry.fixture.rotation === "jade-grounded"))(
    "$id resolves the fourth UF break, Qi recovery and pursuit routes",
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
      const qi = rows.filter(row => row.step.event === "Qi")
      const breaks = qi.filter(row => row.step.event === "Qi" && row.step.targetQiRatio === 0)
      expect(breaks).toHaveLength(1)
      expect(breaks[0].sourceRowId).toBe(flowers[3].id)
      expect(breaks[0].startTime).toBeCloseTo(flowers[3].startTime + Number(flowers[3].actions[0].time), 9)
      const breakTime = breaks[0].startTime - result.anchorTime
      const thresholds = [
        0.4 * breakTime,
        0.6 * breakTime,
        0.7 * breakTime,
        breakTime,
        14 + 1.4 * breakTime,
        14 + 1.6 * breakTime,
      ].filter(time => time < result.duration)
      expect(qi).toHaveLength(thresholds.length)
      for (const [i, time] of thresholds.entries()) expect(qi[i].startTime - result.anchorTime).toBeCloseTo(time, 8)
      for (const [index, step] of rotation.steps.entries()) {
        if (step.type !== "skill") continue
        expect(rows.some(row => row.kind === "rotation" && row.rotationIndex === index)).toBe(true)
      }

      const thirdFlowerShots = rows.filter(
        row =>
          row.step.skill === "UnfadingFlowerProjectile" &&
          row.startTime >= flowers[2].startTime &&
          row.startTime < flowers[3].startTime,
      )
      expect(
        thirdFlowerShots.some(row =>
          row.actions.some(
            (action, i) =>
              action.type === "damage" &&
              row.actionStates[i].buffs.has("StarReacherBoneEnhanced") &&
              !row.actionStates[i].debuffs.has("Exhausted"),
          ),
        ),
      ).toBe(true)
      const secondQ = rows.filter(row => row.step.skill === "SpringSorrow")[1]
      const secondQHit = secondQ.actions.findIndex(action => action.type === "damage")
      const wearsMistwillow = fixture.build === "jade-bp-max"
      const hasMistwillow = secondQ.actionStates[secondQHit].buffs.has("Mistwillow")
      expect(wearsMistwillow && !hasMistwillow).toBe(false)
      const lastQ = rows.findLast(row => row.step.skill === "SpringSorrow")!
      const refillWindow = rows.filter(row => row.startTime > flowers[5].startTime && row.startTime < lastQ.startTime)
      expect(refillWindow.some(row => row.step.event === "Delay" && row.step.automatic === "cooldown")).toBe(false)
      const pursuits = rows.filter(row => row.step.skill === "MoonShatterSpring")
      expect(pursuits.map(row => row.buffs.has("Windrider"))).toEqual([false, true])
      expect(pursuits[0].debuffs.has("ToadVenom")).toBe(true)
    },
  )
})
