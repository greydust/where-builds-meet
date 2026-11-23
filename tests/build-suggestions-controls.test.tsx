// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import type { BuildSuggestionResult } from "@/calculations/buildSuggestions"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import { useBuildSuggestions } from "@/features/build/useBuildSuggestions"
import type { BuildEntry, GearItem } from "@/gear"

it("does no automatic work, runs on request, and hides and cancels stale advice", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  class Worker {
    static instances: Worker[] = []
    onmessage?: (event: { data: { result: BuildSuggestionResult } }) => void
    terminate = vi.fn<() => void>()
    postMessage = vi.fn<(input: unknown) => void>()
    constructor() {
      Worker.instances.push(this)
    }
  }
  vi.stubGlobal("Worker", Worker)
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const build: BuildEntry = { id: "build", name: "Build" }
  const context = {} as MeasurementContext
  const gear: GearItem[] = []
  function View({ name, items = gear }: { name: string; items?: GearItem[] }) {
    const advice = useBuildSuggestions(build, items, context, { name, steps: [] })
    return createElement("button", { onClick: advice.run }, advice.result?.presetId ?? (advice.busy ? "busy" : "idle"))
  }
  try {
    await act(async () => root.render(createElement(View, { name: "first" })))
    expect(Worker.instances).toHaveLength(0)
    await act(async () => container.querySelector("button")!.click())
    expect(Worker.instances).toHaveLength(1)
    expect(container.textContent).toBe("busy")
    const first = Worker.instances[0]
    expect(first.postMessage).toHaveBeenCalledOnce()
    await act(async () => root.render(createElement(View, { name: "second" })))
    expect(first.terminate).toHaveBeenCalledOnce()
    expect(container.textContent).toBe("idle")
    await act(async () => first.onmessage!({ data: { result: { presetId: "stale", targets: [], items: [] } } }))
    expect(container.textContent).toBe("idle")
    await act(async () => container.querySelector("button")!.click())
    const second = Worker.instances[1]
    await act(async () => second.onmessage!({ data: { result: { presetId: "current", targets: [], items: [] } } }))
    expect(container.textContent).toBe("current")
    // Moving to another build and back, or remounting the tab, preserves completed advice.
    const alternateBuild = { ...build, id: "alternate" }
    function Alternate() {
      const advice = useBuildSuggestions(alternateBuild, gear, context, { name: "second", steps: [] })
      return createElement("span", {}, advice.result?.presetId ?? "alternate")
    }
    await act(async () => root.render(createElement(Alternate)))
    expect(container.textContent).toBe("alternate")
    await act(async () => root.render(createElement(View, { name: "second" })))
    expect(container.textContent).toBe("current")
    expect(Worker.instances).toHaveLength(2)
    await act(async () => root.render(createElement(View, { name: "third" })))
    expect(container.textContent).toBe("idle")
    await act(async () => root.render(createElement(View, { name: "second" })))
    expect(container.textContent).toBe("idle")
    expect(Worker.instances).toHaveLength(2)
    await act(async () => container.querySelector("button")!.click())
    const third = Worker.instances[2]
    await act(async () => third.onmessage!({ data: { result: { presetId: "before-retune", targets: [], items: [] } } }))
    expect(container.textContent).toBe("before-retune")
    const changedGear: GearItem[] = [
      {
        id: "changed",
        definitionId: "helmet",
        level: 100,
        rarity: "Gold",
        baseAffix: { key: "crit", value: 0.09 },
        additionalAffixes: [{ key: "minPhys", value: 85 }],
        turnedAffixIndex: 0,
      },
    ]
    await act(async () => root.render(createElement(View, { name: "second", items: changedGear })))
    expect(container.textContent).toBe("idle")
    await act(async () => root.render(createElement(View, { name: "second" })))
    expect(container.textContent).toBe("idle")
    expect(Worker.instances).toHaveLength(3)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
