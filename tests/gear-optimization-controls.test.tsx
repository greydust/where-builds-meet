// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { breakthroughProfile } from "@/application/gameData/setup"
import { cancelGearOptimization } from "@/application/gearOptimization"
import type { GearSearchProgress } from "@/calculations/gearOptimization"
import BuildTab from "@/features/build/BuildTab"
import { defaultBuildPresets, normalizeBuildSetup } from "@/gear"
import { defaultGlobalDebuffs } from "@/globalDebuffs"
import { useGearStore } from "@/stores/gearStore"

import { weaponPair } from "./helpers/weaponPair"

vi.mock("@/features/build/useBuildThroughputs", () => ({
  useBuildThroughputs: () => ({
    viewed: { dps: 200, hps: 0, totalDamage: 2000 },
    active: { dps: 100, hps: 0, totalDamage: 1000 },
  }),
}))
// This test drives the gear optimizer's worker directly; affix advice has no part in it.
vi.mock("@/features/build/useBuildStatPriorities", () => ({ useBuildStatPriorities: () => [] }))
vi.mock("@/notices", () => ({ publishNotice: () => {}, dismissNotice: () => {} }))
vi.mock("@/i18n", () => ({
  getLocale: () => "en",
  t: (key: string, parameters: Record<string, string | number> = {}) => [key, ...Object.values(parameters)].join(" "),
  gameText: (value: string) => value,
  dataText: (_key: string, value: string) => value,
}))

it("shows progress in the build list, locks editing, and turns the action into Cancel", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  class Worker {
    static current: Worker
    onmessage?: (event: { data: { progress: GearSearchProgress } }) => void
    constructor() {
      Worker.current = this
    }
    postMessage() {}
    terminate() {}
  }
  vi.stubGlobal("Worker", Worker)
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  const preset = defaultBuildPresets[0]
  const weapons = weaponPair(preset.martialArts)
  const settings = { weapons, breakthrough: "17", ping: 40 }
  const builds = [
    { id: "mine", name: "My Build", martialArts: [...weapons], equipped: {}, setup: normalizeBuildSetup({}) },
    { id: "other", name: "Other Build", martialArts: [...weapons], equipped: {}, setup: normalizeBuildSetup({}) },
  ]
  useGearStore.setState({ buildState: { entries: builds, gearItems: [], activeBuildId: "mine" } })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(button => button.textContent === label)!
  const show = async (rotationName: string) =>
    act(async () =>
      root.render(
        createElement(BuildTab, {
          pathId: "stonesplitStrength",
          builds,
          visibleItems: [],
          weapons,
          martialArtTags: [],
          graduatedBuildIds: [],
          onActiveBuildChange: () => {},
          onSelectBuildWeapons: () => true,
          activeRotation: { name: rotationName, steps: [] },
          measurement: {
            environment: {
              pathId: "stonesplitStrength",
              settings,
              enemy: breakthroughProfile(settings),
              globalDebuffs: defaultGlobalDebuffs,
              setupSelections: { food: "None", script: "None", divinecraft: "None" },
              skillOverrides: {},
              previewId: null,
            },
            statOverrides: {},
            attunementOverrides: {},
          },
        }),
      ),
    )
  try {
    await show("Snapshot")
    await act(async () => button("ui.buildTab.findBestCombination").click())
    expect(container.textContent).toContain("ui.app.preview")
    expect(container.textContent).toContain("ui.buildTab.optimizationPreviewHint")
    expect(container.textContent).toContain("ui.buildTab.optimizationRotation Snapshot")
    await show("Different rotation")
    expect(container.textContent).toContain("ui.buildTab.optimizationRotation Snapshot")
    expect(container.textContent).not.toContain("ui.buildTab.optimizationRotation Different rotation")
    expect(button("ui.buildTab.cancel")).toBeDefined()
    expect(container.querySelector("progress")).not.toBeNull()
    expect(container.querySelector<HTMLButtonElement>('[aria-label="ui.buildTab.editBuildName"]')!.disabled).toBe(true)
    expect([...container.querySelectorAll("select")].every(select => select.disabled)).toBe(true)
    await act(async () =>
      Worker.current.onmessage!({
        data: {
          progress: {
            phase: "searching",
            completed: 3,
            total: 10,
            fast: 8,
            rebuild: 2,
            equipped: {},
            reading: { dps: 1234, hps: 0, totalDamage: 12340 },
          },
        },
      }),
    )
    expect(container.querySelector("progress")!.value).toBe(3)
    expect(container.querySelector("progress")!.max).toBe(10)
    expect(container.querySelector("output")!.textContent).toContain("1234")
    await act(async () => container.querySelectorAll<HTMLButtonElement>(".build-select-button")[1].click())
    expect(container.textContent).not.toContain("ui.buildTab.optimizationPreviewHint")
    expect(button("ui.buildTab.findBestCombination").disabled).toBe(true)
    expect(container.querySelector(".build-detail-dps")!.textContent).toContain("+100")
    expect(container.querySelector(".build-detail-dps")!.textContent).not.toContain("1234")
    await act(async () => container.querySelectorAll<HTMLButtonElement>(".build-select-button")[0].click())
    await act(async () => button("ui.buildTab.cancel").click())
    expect(container.textContent).not.toContain("ui.buildTab.optimizationPreviewHint")
    expect(container.querySelector("progress")).toBeNull()
    expect(button("ui.buildTab.findBestCombination").disabled).toBe(false)
  } finally {
    await act(async () => {
      cancelGearOptimization()
      root.unmount()
    })
    container.remove()
    vi.unstubAllGlobals()
  }
})
