import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotCases } from "./helpers/dps-snapshot-fixtures"

describe("Splendor 84-wave preset", () => {
  it("lands every wave with funded releases and preserves the middle Qi Imbalance refresh", async () => {
    const cases = (await loadDpsSnapshotCases()).filter(entry => entry.pathId === "bellstrikeSplendor")
    expect(cases).toHaveLength(4)
    for (const entry of cases) {
      const bundle = buildPresetRotationBundle(
        { pathId: entry.pathId, ...entry.fixture, rotation: entry.rotation, skillOverrides: {}, previewId: null },
        entry.fixture.build,
      )
      expect(bundle).toBeDefined()
      const result = calculateRotationBaseline(bundle!)
      const hits = result.timeline.flatMap(row =>
        row.step.skill === "VagrantSword2"
          ? row.actions.flatMap((action, index) => {
              const time = row.startTime + Number(action.time ?? 0) - result.anchorTime
              return action.type === "damage" && time >= 0 && time <= result.duration
                ? [{ time, state: row.actionStates[index] }]
                : []
            })
          : [],
      )
      expect(result.duration).toBe(60)
      expect(hits).toHaveLength(84)
      expect(hits.at(-1)!.time).toBeCloseTo(59.837, 6)
      const endurance = result.timeline.flatMap(row =>
        Object.values(row.actionStates).map(state => state.resources.Endurance),
      )
      expect(Math.min(...endurance)).toBeGreaterThan(4)
      const uncovered = hits.filter(hit => !hit.state.debuffs.has("QiImbalance"))
      expect(uncovered.filter(hit => hit.time > 1.057 && hit.time < 57.16)).toHaveLength(0)
      expect(uncovered.filter(hit => hit.time > 57.16)).toHaveLength(5)
    }
  })
})
