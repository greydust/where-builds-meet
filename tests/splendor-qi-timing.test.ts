import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

it("aligns Splendor Qi thresholds with the third wave before the second full Spear Q", async () => {
  const { pathId, rotation, fixture } = (await loadDpsSnapshotFixtures()).find(
    entry => entry.pathId === "bellstrikeSplendor",
  )!
  const bundle = buildPresetRotationBundle(
    { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null },
    fixture.build,
  )!
  const { timeline } = calculateRotationBaseline(bundle)
  const battleStart = timeline[0].battleStartTime!
  const casts = timeline.filter(row => row.kind === "rotation" && row.step.type === "skill")
  const secondQ = casts.filter(row => row.step.type === "skill" && row.step.skill === "QiankunsLock")[1]
  const sword = casts[casts.indexOf(secondQ) - 1]
  expect(sword.step).toMatchObject({ skill: "VagrantSword2" })
  const hits = sword.actions.filter(action => action.type === "damage")
  expect(hits).toHaveLength(3)
  const breakTime = sword.startTime + Number(hits[2].time) - battleStart
  const qiRows = timeline.filter(row => row.step.type === "event" && row.step.event === "Qi")
  const firstBreak = qiRows.find(
    row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === 0,
  )
  expect(firstBreak!.startTime - battleStart).toBeCloseTo(breakTime, 8)
  const recoveryTime = secondQ.debuffs.get("Exhausted")!.expiresAt! - battleStart
  expect(recoveryTime - breakTime).toBeCloseTo(10, 8)
  for (const [ratio, fraction] of [
    [0.5999, 0.4],
    [0.3999, 0.6],
  ]) {
    const thresholds = qiRows.filter(
      row => row.step.type === "event" && row.step.event === "Qi" && row.step.targetQiRatio === ratio,
    )
    expect(thresholds).toHaveLength(2)
    expect(thresholds[0].startTime - battleStart).toBeCloseTo(breakTime * fraction, 8)
    expect(thresholds[1].startTime - battleStart).toBeCloseTo(recoveryTime + 4 + breakTime * fraction, 8)
  }
})
