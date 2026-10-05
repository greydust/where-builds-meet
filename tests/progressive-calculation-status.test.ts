import { beforeEach, describe, expect, it } from "vitest"

import { rotationCalculationCategories } from "@/calculations/rotationMetrics"
import { useRotationStore } from "@/stores/rotationStore"

const status = () => useRotationStore.getState().status
const recalculating = () => rotationCalculationCategories.filter(category => status()[category].recalculating)

describe("calculation status", () => {
  beforeEach(() => useRotationStore.getState().clear())

  it("orders the categories so the baseline is measured before anything it is compared against", () => {
    expect(rotationCalculationCategories[0]).toBe("baseline")
    expect(new Set(rotationCalculationCategories).size).toBe(rotationCalculationCategories.length)
  })

  it("reports a started category as busy without a progress it has not measured", () => {
    useRotationStore.getState().startCategory("statPriority")
    expect(status().statPriority).toEqual({ recalculating: true })
    expect(recalculating()).toEqual(["statPriority"])
  })

  it("keeps progress to the category that reported it", () => {
    useRotationStore.getState().startCategory("statPriority")
    useRotationStore.getState().progressCategory("statPriority", 0.5)
    expect(status().statPriority.progress).toBe(0.5)
    expect(status().attunementPriority).toEqual({ recalculating: false })
  })

  it("leaves a settled category idle and carrying no progress", () => {
    useRotationStore.getState().startCategory("statPriority")
    useRotationStore.getState().progressCategory("statPriority", 0.5)
    useRotationStore.getState().settleCategory("statPriority")
    expect(status().statPriority).toEqual({ recalculating: false })
  })

  it("runs categories independently, so one settling does not clear another", () => {
    useRotationStore.getState().startCategory("statPriority")
    useRotationStore.getState().startCategory("innerWays")
    useRotationStore.getState().settleCategory("statPriority")
    expect(recalculating()).toEqual(["innerWays"])
  })

  it("reports every category idle again once the calculation is forgotten", () => {
    for (const category of rotationCalculationCategories) useRotationStore.getState().startCategory(category)
    useRotationStore.getState().clear()
    expect(recalculating()).toEqual([])
  })
})
