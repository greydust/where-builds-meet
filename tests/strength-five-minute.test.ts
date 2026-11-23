import { describe, expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

describe("Strength five-minute presets", () => {
  it("completes both supplied rotations with the default event cap", async () => {
    const fixtures = (await loadDpsSnapshotFixtures()).filter(entry =>
      ["stonesplitStrength/mhysa-5-min", "stonesplitStrength/mhysa-pure-5-min"].includes(entry.id),
    )
    expect(fixtures).toHaveLength(2)
    for (const { pathId, rotation, fixture } of fixtures) {
      const environment = { pathId, ...fixture, rotation, skillOverrides: {}, previewId: null }
      const capped = buildPresetRotationBundle(environment, fixture.build)!
      const unlimited = buildPresetRotationBundle({ ...environment, rotationEventLimit: 0 }, fixture.build)!
      const result = calculateRotationBaseline(capped)
      expect(result.duration).toBeCloseTo(300, 8)
      expect(result.metrics.dps).toBeGreaterThan(0)
      expect(result).toEqual(calculateRotationBaseline(unlimited))
    }
  })
})
