import assert from "node:assert/strict"

import { it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

it("keeps preset Qi depletion outside Exhausted and its four-second recovery immunity", async () => {
  for (const { id, pathId, rotation, fixture } of await loadDpsSnapshotFixtures()) {
    const bundle = buildPresetRotationBundle(
      { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null },
      fixture.build,
    )!
    const { timeline, duration } = calculateRotationBaseline(bundle)
    const battleStart = timeline[0].battleStartTime ?? 0
    let immuneUntil = -Infinity
    for (const row of timeline) {
      if (row.step.type !== "event" || row.step.event !== "Qi") continue
      const time = row.startTime - battleStart
      assert(time < duration, id + ": Qi event must precede Battle End")
      assert(time + 1e-8 >= immuneUntil, id + ": Qi depletion during recovery immunity")
      if (row.step.targetQiRatio === 0) {
        const nextState = timeline
          .flatMap(next => Object.values(next.actionStates))
          .find(state => {
            const exhausted = state.debuffs.get("Exhausted")
            return exhausted?.appliedAt !== undefined && Math.abs(exhausted.appliedAt - row.startTime) < 1e-8
          })
        assert(nextState, id + ": Qi break must apply Exhausted")
        immuneUntil = nextState!.debuffs.get("Exhausted")!.expiresAt! - battleStart + 4
      }
    }
  }
})
