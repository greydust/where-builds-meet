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
    const allowedDelays = ["requirement"]
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
    let expectedPursuits = 0
    switch (fixture.rotation) {
      case "jade-flying":
        expectedFlowers = 3
        expectedPursuits = 4
        break
      case "jade-grounded":
        expectedFlowers = 7
        expectedPursuits = 7
        break
      case "jade-hybrid":
        expectedFlowers = 6
        expectedPursuits = 5
        break
    }
    expect(flowers).toHaveLength(expectedFlowers)

    const casts = rows.filter(row => row.kind === "rotation" && row.step.type === "skill")
    const pursuits = casts.filter(row => row.step.skill === "MoonShatterSpring")
    expect(pursuits).toHaveLength(expectedPursuits)
    for (const [index, pursuit] of pursuits.slice(1).entries())
      expect(pursuit.startTime - pursuits[index].startTime).toBeGreaterThanOrEqual(6 - 1e-9)
    for (const pursuit of pursuits) {
      expect(pursuit.debuffs.has("LingeringBone") || pursuit.debuffs.has("Airborne")).toBe(true)
      const enhanced = pursuit.buffs.has("Windrider")
      expect(pursuit.effectiveCastTime).toBeCloseTo(enhanced ? 2.433 : 1.557, 9)
      const hits = pursuit.actions.filter(
        (action, i) => action.type === "damage" && result.actionBreakdowns[`${pursuit.id}:${i}`],
      )
      expect(hits).toHaveLength(enhanced ? 5 : 3)
      const next = casts[casts.indexOf(pursuit) + 1]
      if (!next) continue
      expect(next.startTime).toBeGreaterThanOrEqual(pursuit.startTime + pursuit.effectiveCastTime - 1e-9)
    }
    const peaks = casts.filter(row =>
      ["PeaksSpringlessSilence", "PeaksSpringlessSilenceCancel"].includes(row.step.skill ?? ""),
    )
    for (const [index, peak] of peaks.slice(1).entries())
      expect(peak.startTime - peaks[index].startTime).toBeGreaterThanOrEqual(12 - 1e-9)
    for (const peak of peaks.filter(row => row.step.skill === "PeaksSpringlessSilenceCancel")) {
      const next = casts[casts.indexOf(peak) + 1]
      expect(next.step.skill).toBe("MoonShatterSpring")
      expect(next.startTime - peak.startTime - peak.effectiveCastTime).toBeLessThanOrEqual(0.040001)
    }
    // Both Fan Q variants and the precombat miss spend the same two sequential charges.
    const recoveries: number[] = []
    for (const row of casts.filter(row =>
      ["EmeraldBarrier", "EmeraldBarrierMiss", "EmeraldBarrierCancel"].includes(row.step.skill ?? ""),
    )) {
      while (recoveries.length && recoveries[0] <= row.startTime + 1e-9) recoveries.shift()
      expect(recoveries.length).toBeLessThan(2)
      recoveries.push(Math.max(row.startTime, recoveries.at(-1) ?? row.startTime) + 15)
    }
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
      expect(pursuits.every(row => row.buffs.has("Windrider"))).toBe(true)
      const exhaustedPursuit = pursuits.find(row => row.debuffs.has("Exhausted"))!
      const precedingCast = rows.findLast(row => row.kind === "rotation" && row.startTime < exhaustedPursuit.startTime)
      expect(precedingCast?.step.skill).toBe("EmeraldBarrier")
    },
  )
})
