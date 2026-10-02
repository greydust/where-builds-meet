// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from "vitest"

import type { SimulationSummary } from "@/calculations/simulationCalculator"
import { addCustomPercentile, loadCustomPercentiles } from "@/features/simulation/customPercentiles"
import { resultRowsHeal, simulationResultRows } from "@/features/simulation/simulationResults"

const storageKey = "wwm-simulation-percentiles-v1"

const stored = (value: string) => localStorage.setItem(storageKey, value)

beforeEach(() => {
  localStorage.clear()
})

describe("custom percentiles", () => {
  it("rejects a percentile the table already shows, and a different reason for each", () => {
    const preset = addCustomPercentile([], "95")
    const duplicate = addCustomPercentile([42], "42")
    expect(preset.ok).toBe(false)
    expect(duplicate.ok).toBe(false)
    expect(preset.ok === false && preset.error).not.toBe(duplicate.ok === false && duplicate.error)
  })

  it("rejects what is not a percentile, and accepts what is", () => {
    for (const draft of ["", "  ", "-1", "100", "101", "abc"]) {
      expect(addCustomPercentile([], draft).ok).toBe(false)
    }
    const added = addCustomPercentile([42], "7.5")
    expect(added.ok && added.percentiles).toEqual([42, 7.5])
  })

  it("keeps the list highest first when one is added", () => {
    const added = addCustomPercentile([10, 90], "60")
    expect(added.ok && added.percentiles).toEqual([90, 60, 10])
  })

  it("drops a stored percentile the table already shows or cannot show", () => {
    stored("[95, 42, 100, 42]")
    expect(loadCustomPercentiles()).toEqual([42])
  })

  it("treats unreadable storage, and storage the schema refuses, as no custom percentiles", () => {
    stored("not json")
    expect(loadCustomPercentiles()).toEqual([])
    stored("[42, 150]")
    expect(loadCustomPercentiles()).toEqual([])
  })
})

describe("simulation result rows", () => {
  const run = (totalDamage: number, totalHealing: number) => ({
    totalDamage,
    dps: totalDamage,
    hps: totalHealing,
    totalHealing,
    abrasionPercentage: 0,
    normalPercentage: 100,
    criticalPercentage: 0,
    affinityPercentage: 0,
    healingNormalPercentage: 100,
    healingCriticalPercentage: 0,
  })

  const summary = (result: ReturnType<typeof run>) =>
    ({
      runCount: 1,
      duration: 1,
      results: { best: result, p99: result, p95: result, p90: result, p75: result, median: result },
      runs: [],
    }) as unknown as SimulationSummary

  it("orders every row from the best case down to the lowest percentile", () => {
    const rows = simulationResultRows(summary(run(100, 0)), [20, 80])
    const percentiles = rows.map(row => row.percentile)
    expect(percentiles).toEqual([...percentiles].toSorted((left, right) => right - left))
    expect(percentiles).toContain(20)
    expect(percentiles).toContain(80)
  })

  it("asks the rows whether to show healing, so a run that never healed does not claim to", () => {
    expect(resultRowsHeal(simulationResultRows(summary(run(100, 50)), []))).toBe(true)
    expect(resultRowsHeal(simulationResultRows(summary(run(100, 0)), []))).toBe(false)
  })
})
