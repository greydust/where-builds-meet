import { describe, expect, it } from "vitest"

import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { breakthroughProfile, foodAvailableForPath, foodSelectionForPath } from "@/application/gameData/setup"
import {
  buildRotationCalculationBundle,
  measurementSubject,
  type MeasurementContext,
} from "@/calculations/rotationCalculationBundle"
import { calculateRotationBaseline, calculateRotationComparisons } from "@/calculations/rotationCalculator"
import { buildRotationComparisonBundle } from "@/calculations/rotationComparisonBundle"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

async function foodSubject(enduranceFood: string, pathId: PathId = "bellstrikeSplendor", food = "SimmeringFishSlices") {
  const entry = (await loadDpsSnapshotFixtures()).find(row => row.pathId === "bellstrikeSplendor")!
  const settings = {
    weapons: entry.fixture.martialArts,
    breakthrough: entry.fixture.breakthrough,
    ping: entry.fixture.ping,
  }
  const context: MeasurementContext = {
    environment: {
      pathId,
      settings,
      setupSelections: { food, enduranceFood, script: "None", divinecraft: "Fire" },
      skillOverrides: {},
      previewId: null,
      globalDebuffs: entry.fixture.globalDebuffs,
      enemy: breakthroughProfile(settings),
    },
    statOverrides: {},
    attunementOverrides: {},
  }
  return measurementSubject({
    build: { id: "food-test", name: "Food test", isDefault: true, presetId: entry.fixture.build },
    gearItems: [],
    context,
    rotation: entry.rotation,
  })
}

describe("food selection and Endurance", () => {
  it.each(Object.keys(typedPathDefinitions) as PathId[])("limits Endurance food availability on %s", async pathId => {
    const allowed = pathId === "bellstrikeSplendor" || pathId === "bellstrikeUmbra"
    expect(foodAvailableForPath("SwallowsAgility", pathId)).toBe(allowed)
    expect(foodSelectionForPath("SwallowsAgility", pathId)).toBe(allowed ? "SwallowsAgility" : "None")
    const none = await foodSubject("None", pathId)
    const food = await foodSubject("SwallowsAgility", pathId)
    expect(food.build.stats.maxEndurance - none.build.stats.maxEndurance).toBe(allowed ? 20 : 0)
    const bundle = buildRotationCalculationBundle(food)
    expect(bundle.timeline.initialResources?.Endurance).toBe(food.build.stats.maxEndurance)
    expect(bundle.timeline.resourceMaximums?.Endurance).toBe(food.build.stats.maxEndurance)
    const options = buildRotationComparisonBundle(none).setupComparisons.enduranceFood.map(row => row.label)
    expect(options.includes("SwallowsAgility")).toBe(allowed)
  })

  it.each([
    ["None", "SwallowsAgility"],
    ["SwallowsAgility", "None"],
  ])("compares %s to %s using the replacement Endurance pool", async (from, to) => {
    const bundle = buildRotationComparisonBundle(await foodSubject(from))
    const replacement = bundle.setupComparisons.enduranceFood.find(row => row.label === to)!
    expect(replacement.timeline).toBeDefined()
    bundle.statPriority = []
    bundle.attunementPriority = []
    bundle.innerWayPriority = []
    bundle.setupComparisons = { enduranceFood: [replacement] }
    const baseline = calculateRotationBaseline(bundle)
    const actual = calculateRotationBaseline(buildRotationCalculationBundle(await foodSubject(to)))
    const comparison = calculateRotationComparisons(bundle, baseline).setupComparisons.enduranceFood[0]
    expect(comparison.dpsDifference).toBeCloseTo(actual.metrics.dps - baseline.metrics.dps, 8)
  })
})

it("compares Physical Attack independently while preserving Endurance food", async () => {
  const subject = await foodSubject("SwallowsAgility")
  const bundle = buildRotationComparisonBundle(subject)
  const replacement = bundle.setupComparisons.food.find(row => row.label === "None")!
  expect(replacement.timeline).toBeUndefined()
  bundle.statPriority = []
  bundle.attunementPriority = []
  bundle.innerWayPriority = []
  bundle.setupComparisons = { food: [replacement] }
  const baseline = calculateRotationBaseline(bundle)
  const withoutFish = await foodSubject("SwallowsAgility", "bellstrikeSplendor", "None")
  expect(withoutFish.build.stats.maxEndurance).toBe(subject.build.stats.maxEndurance)
  const actual = calculateRotationBaseline(buildRotationCalculationBundle(withoutFish))
  expect(actual.metrics.dps).toBeLessThan(baseline.metrics.dps)
  const comparison = calculateRotationComparisons(bundle, baseline).setupComparisons.food[0]
  expect(comparison.dpsDifference).toBeCloseTo(actual.metrics.dps - baseline.metrics.dps, 8)
})
