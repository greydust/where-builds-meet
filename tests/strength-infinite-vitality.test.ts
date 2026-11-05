import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

it("Infinite Vitality starts on Fleeting Trace's final hit and dodges the second dummy attack", async () => {
  const fixture = (await loadDpsSnapshotFixtures()).find(
    entry => entry.id === "stonesplitStrength/mixed-dummy-infinite-vitality-1-min",
  )!
  const bundle = buildPresetRotationBundle(
    { pathId: fixture.pathId, ...fixture.fixture, rotation: fixture.rotation, skillOverrides: {}, previewId: null },
    fixture.fixture.build,
  )!
  const result = calculateRotationBaseline(bundle)
  const firstTrace = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SnowpartingSpecial")!
  const lastHit = firstTrace.actions.findLast(action => action.type === "damage")!
  expect(result.anchorTime).toBeCloseTo(firstTrace.startTime + Number(lastHit.time), 8)
  expect(result.duration).toBeCloseTo(60, 8)
  const success = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "PerfectDodgeSuccess")
  expect(success).toBeDefined()
  expect(success!.startTime - result.anchorTime).toBeCloseTo(11.5, 8)
  const spin = result.timeline.find(row => row.step.type === "skill" && row.step.skill === "SoaringSpin2")!
  expect(success!.sourceRowId).toBe(spin.id)
  const hits = spin.actions.flatMap((action, index) => (action.type === "damage" ? [index] : []))
  expect(hits.length).toBeGreaterThan(0)
  for (const index of hits) expect(spin.actionStates[index].buffs.has("MysteryDMGBoost")).toBe(true)
})
