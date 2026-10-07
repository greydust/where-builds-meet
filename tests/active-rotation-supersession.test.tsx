// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { useActiveRotationResult } from "@/features/rotations/useActiveRotationResult"

const state = vi.hoisted(() => ({
  supersede: vi.fn<() => void>(),
  baseline: vi.fn<() => Promise<never>>(() => new Promise<never>(() => {})),
  entries: [{ id: "rotation", rotation: { name: "Test", steps: [] } }],
}))
vi.mock("@/stores/dpsStore", () => ({
  useDpsStore: { getState: () => ({ supersede: state.supersede, peek: () => undefined }) },
}))
vi.mock("@/stores/rotationStore", () => ({
  useRotationStore: Object.assign((select: (s: unknown) => unknown) => select({ entries: state.entries }), {
    getState: () => ({ startCategory() {}, settleCategory() {} }),
  }),
}))
vi.mock("@/application/rotationCatalog", () => ({
  rotationAvailableForWeapons: () => true,
  rotationRecordForEntry: (entry: any) => entry.rotation,
}))
vi.mock("@/application/graduation", () => ({
  buildGraduationBundleSet: () => undefined,
  selectHighestGraduationResult: vi.fn<() => void>(),
}))
vi.mock("@/application/resolveRotationMetrics", () => ({
  resolveBaseline: state.baseline,
  resolveComparisonMetrics: vi.fn<() => void>(),
}))
vi.mock("@/calculations/rotationCalculationBundle", () => ({
  measurementSubject: (input: any) => input,
  buildRotationCalculationBundle: (subject: any) => subject.context,
}))
vi.mock("@/calculations/rotationComparisonBundle", () => ({
  buildRotationComparisonBundle: (subject: any) => subject.context,
}))
vi.mock("@/calculations/calculationFingerprint", () => ({ rotationBundleFingerprint: JSON.stringify }))

it("supersedes pending rotation work on input changes but keeps equivalent inputs and tab changes", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const root = createRoot(document.createElement("div"))
  const input = {
    comparisonsActive: true,
    pathId: "stonesplitStrength",
    build: {},
    gearItems: [],
    measurement: { environment: { settings: { weapons: ["a", "b"] }, setupSelections: {}, globalDebuffs: [] } },
    activeRotationId: "rotation",
    defaultRotationId: "rotation",
    devMode: false,
    weapons: ["a", "b"],
  } as any
  function Harness({ value }: { value: any }) {
    useActiveRotationResult(value)
    return null
  }
  const render = (value: any) => act(async () => root.render(createElement(Harness, { value })))
  try {
    await render(input)
    expect(state.supersede).not.toHaveBeenCalled()
    await render({ ...input, comparisonsActive: false })
    await render({ ...input, measurement: structuredClone(input.measurement) })
    expect(state.supersede).not.toHaveBeenCalled()
    const updated = {
      ...input,
      measurement: { environment: { ...input.measurement.environment, globalDebuffs: ["Debuff"] } },
    }
    await render(updated)
    expect(state.supersede).toHaveBeenCalledTimes(1)
    await render({
      ...updated,
      measurement: { environment: { ...updated.measurement.environment, globalDebuffs: [] } },
    })
    expect(state.supersede).toHaveBeenCalledTimes(2)
    expect(state.supersede.mock.invocationCallOrder[0]).toBeLessThan(state.baseline.mock.invocationCallOrder[3])
  } finally {
    await act(async () => root.unmount())
  }
})
