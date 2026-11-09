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
import type { ResolvedStats } from "@/calculations/statEffects"

import { loadDpsSnapshotFixtures } from "./helpers/dps-snapshot-fixtures"

async function foodSubject(
  enduranceFood: string,
  pathId: PathId = "bellstrikeSplendor",
  food = "SimmeringFishSlices",
  breakthrough?: string,
) {
  const entry = (await loadDpsSnapshotFixtures()).find(row => row.pathId === "bellstrikeSplendor")!
  const settings = {
    weapons: entry.fixture.martialArts,
    breakthrough: breakthrough ?? entry.fixture.breakthrough,
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
  it.each([
    ["18", 140, 280],
    ["19", 140, 280],
    ["20", 160, 320],
    ["21", 160, 320],
    ["22", 200, 400],
    ["23", 200, 400],
    ["24", 240, 480],
    ["25", 240, 480],
  ])("adds level %s Food to effective attack through the shared pipeline", async (level, minimum, maximum) => {
    const without = await foodSubject("None", "bellstrikeSplendor", "None", level)
    const withFood = await foodSubject("None", "bellstrikeSplendor", "SimmeringFishSlices", level)
    const foodStats = withFood.build.stats as ResolvedStats
    const baseStats = without.build.stats as ResolvedStats
    expect(foodStats.effectiveMinPhys - baseStats.effectiveMinPhys).toBeCloseTo(minimum, 8)
    expect(foodStats.effectiveMaxPhys - baseStats.effectiveMaxPhys).toBeCloseTo(maximum, 8)
    expect(foodStats.minPhys).toBe(baseStats.minPhys)
    expect(foodStats.maxPhys).toBe(baseStats.maxPhys)
  })

  it("applies the replacement attack food through the shared stat pipeline", async () => {
    const without = await foodSubject("None", "bellstrikeSplendor", "None")
    const withFood = await foodSubject("None")
    const foodStats = withFood.build.stats as ResolvedStats
    const baseStats = without.build.stats as ResolvedStats
    expect(foodStats.effectiveMinPhys - baseStats.effectiveMinPhys).toBeCloseTo(140, 8)
    expect(foodStats.effectiveMaxPhys - baseStats.effectiveMaxPhys).toBeCloseTo(280, 8)
    expect(withFood.build.stats.maxEndurance).toBe(without.build.stats.maxEndurance)
  })

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
