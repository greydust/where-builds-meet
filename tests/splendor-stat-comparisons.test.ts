import { expect, it } from "vitest"

import { buildPresetRotationBundle } from "@/application/graduation"
import { calculateRotationBaseline, calculateRotationComparisons } from "@/calculations/rotationCalculator"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

it("matches fresh Splendor simulations for stat comparisons, including neutral stats", async () => {
  const entry = (await loadDpsSnapshotFixtures()).find(row => row.pathId === "bellstrikeSplendor")!
  const { pathId, rotation, fixture } = entry
  const bundle = buildPresetRotationBundle(
    { pathId, ...fixture, rotation: { ...rotation, ping: fixture.ping }, skillOverrides: {}, previewId: null },
    fixture.build,
  )!
  const baseline = calculateRotationBaseline(bundle)
  const keys = ["body", "defense", "affinity", "singleTargetMysticDmgBoost"] as const
  bundle.statPriority = keys.map(key => ({
    label: key,
    stats: {
      ...bundle.baseStats!,
      [key]: bundle.baseStats![key] + (key === "affinity" || key === "singleTargetMysticDmgBoost" ? 0.01 : 10),
    },
  }))
  const compared = calculateRotationComparisons(bundle, baseline)
  for (const variant of bundle.statPriority) {
    const fresh = calculateRotationComparisons(
      { ...bundle, statPriority: [{ ...variant, timeline: bundle.timeline }] },
      baseline,
    )
    const actual = compared.statPriority.find(row => row.label === variant.label)!.dpsDifference
    const expected = fresh.statPriority[0].dpsDifference
    expect(actual).toBeCloseTo(expected, 8)
    expect(actual).toBeGreaterThanOrEqual(0)
  }
  for (const label of ["body", "defense"]) {
    expect(compared.statPriority.find(row => row.label === label)!.dpsDifference).toBe(0)
  }
})
