import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

it("keeps all 81 Splendor waves within one minute without Peerless Stance on the dummy", async () => {
  const cases = (await loadDpsSnapshotCases()).filter(entry => entry.pathId === "bellstrikeSplendor")
  expect(cases).toHaveLength(4)
  for (const entry of cases) {
    const bundle = buildPresetRotationBundle(
      { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
      entry.fixture.build,
    )!
    const result = calculateRotationBaseline(bundle)
    const hits = result.timeline.flatMap(row =>
      row.step.skill === "VagrantSword2"
        ? row.actions.flatMap(action => {
            const time = row.startTime + Number(action.time ?? 0) - result.anchorTime
            return action.type === "damage" && time >= 0 && time <= result.duration ? [time] : []
          })
        : [],
    )
    expect(hits).toHaveLength(81)
    expect(hits.at(-1)).toBeCloseTo(58.272, 6)
    expect(result.duration).toBe(60)
    for (const row of result.timeline) {
      expect(row.buffs.has("PeerlessStance")).toBe(false)
      for (const state of Object.values(row.actionStates)) expect(state.buffs.has("PeerlessStance")).toBe(false)
    }
  }
})
