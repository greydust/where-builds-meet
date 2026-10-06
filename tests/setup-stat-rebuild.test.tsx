// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import { rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import type { ResolvedStats } from "@/calculations/statEffects"
import { initializeI18n } from "@/i18n"
import { useLoadoutStore } from "@/stores/loadoutStore"
import { useRotationStore } from "@/stores/rotationStore"

import english from "../public/locales/en.json"
import { dpsDispatches, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

dpsResolves("baseline", async request => {
  const bundle = request.build()
  if (bundle.timeline.rotation.name !== "Setup regression") return new Promise<never>(() => {})
  return calculateRotationBaseline(bundle)
})
dpsResolves("editorTimeline", async request => {
  const bundle = request.build()
  return { ...calculateEditorTimeline(bundle.timeline), fingerprint: rotationBundleFingerprint(bundle) }
})

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  resetDpsMock()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "setup-regression" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "setup-regression",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "Setup regression",
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "SoaringSpin1" }],
        },
      },
    ]),
  )
  vi.useFakeTimers()
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    })),
  )
  await initializeI18n()
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

async function settle() {
  await act(async () => vi.advanceTimersByTimeAsync(150))
  await act(async () => vi.advanceTimersByTimeAsync(300))
}

/**
 * Chooses an option by the panel it belongs to and the option's own name, rather than by a
 * styling class, so a group can be restyled or replaced without rewriting every choice. An
 * option only has to be a button: the panels that show an image rather than a name and a
 * note render their own options, and both kinds have to be choosable the same way.
 */
async function choose(panelName: string, optionName: string) {
  const panel = [...container.querySelectorAll<HTMLElement>("[data-panel]")].find(
    node => node.querySelector("h2")?.textContent?.trim() === panelName,
  )
  expect(panel, `no panel headed ${panelName}`).toBeDefined()
  const option = [...panel!.querySelectorAll<HTMLButtonElement>("button")].find(node =>
    node.textContent?.startsWith(optionName),
  )
  expect(option, `no option ${optionName} in ${panelName}`).toBeDefined()
  await act(async () => option!.click())
  await settle()
}

/**
 * The bundle for the rotation this test drives. Graduation also calculates baselines
 * for the same rotation, but builds them without the user's stat overrides, so they
 * are excluded by their own key prefix rather than by anything in the bundle.
 */
function latestBundle() {
  const bundles = dpsDispatches("baseline")
    .filter(request => !request.cacheKey.startsWith("graduation:"))
    .map(request => request.build())
  expect(bundles.length).toBeGreaterThan(0)
  return bundles.at(-1)!
}

it("rebuilds food stats before publishing DPS and restores the cached original on a round trip", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const fishBundle = latestBundle()
  const fishDps = useRotationStore.getState().result!.metrics.dps
  expect(fishDps).toBeGreaterThan(0)

  await choose("Food", "None")
  const noneBundle = latestBundle()
  expect(rotationBundleFingerprint(noneBundle)).not.toBe(rotationBundleFingerprint(fishBundle))
  expect(noneBundle.stats.minPhys).toBe(fishBundle.stats.minPhys)
  expect((noneBundle.stats as ResolvedStats).effectiveMinPhys).toBeLessThan(
    (fishBundle.stats as ResolvedStats).effectiveMinPhys,
  )
  expect((noneBundle.stats as ResolvedStats).effectiveMaxPhys).toBeLessThan(
    (fishBundle.stats as ResolvedStats).effectiveMaxPhys,
  )
  expect(useRotationStore.getState().result!.metrics.dps).toBeLessThan(fishDps)
  expect(localStorage.getItem("wwm-food-session-v1")).toBe("None")

  const dispatchesBeforeReturn = dpsDispatches("baseline").length
  await choose("Food", "Simmering Fish Slices")
  expect(dpsDispatches("baseline")).toHaveLength(dispatchesBeforeReturn)
  expect(useRotationStore.getState().result!.metrics.dps).toBeCloseTo(fishDps, 8)
})

it("keeps Script and Divinecraft selections in the same calculation as the character sheet", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const originalStats = latestBundle().stats
  const fireDps = useRotationStore.getState().result!.metrics.dps
  await choose("Divinecraft", "None")
  const noneDps = useRotationStore.getState().result!.metrics.dps
  expect(noneDps).toBeLessThan(fireDps)
  expect(latestBundle().stats).toEqual(originalStats)
  await choose("Script", "Insight Script")
  expect(useRotationStore.getState().result!.metrics.dps).toBeGreaterThan(noneDps)
  expect(latestBundle().stats).toEqual(originalStats)
  await choose("Script", "None")
  expect(useRotationStore.getState().result!.metrics.dps).toBeCloseTo(noneDps, 8)
  await choose("Divinecraft", "Fire")
  expect(useRotationStore.getState().result!.metrics.dps).toBeCloseTo(fireDps, 8)
})

it.each([
  { name: "breakthrough", selector: ".breakthrough-control select", value: "16" },
  { name: "Inner Way tier", selector: ".inner-way-row select:nth-of-type(2)", value: "T0" },
])("rebuilds character stats when $name changes", async ({ selector, value }) => {
  await act(async () => root.render(<App />))
  await settle()
  const before = latestBundle()
  const beforeDps = useRotationStore.getState().result!.metrics.dps
  const select = container.querySelector<HTMLSelectElement>(selector)!
  const original = select.value
  expect(original).not.toBe(value)
  await act(async () => {
    select.value = value
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await settle()
  expect(latestBundle().stats).not.toEqual(before.stats)
  expect(useRotationStore.getState().result!.metrics.dps).not.toBe(beforeDps)
  await act(async () => {
    select.value = original
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  await settle()
  expect(useRotationStore.getState().result!.metrics.dps).toBeCloseTo(beforeDps, 8)
})

it("rebuilds edited stats and preserves final-value overrides across food changes", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const beforeDps = useRotationStore.getState().result!.metrics.dps
  const beforeStats = latestBundle().stats
  const input = [...container.querySelectorAll<HTMLLabelElement>("label.field")]
    .find(label => label.textContent?.startsWith("Min Physical Attack"))!
    .querySelector<HTMLInputElement>("input")!
  const target = Math.ceil(beforeStats.minPhys + 1000)
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, String(target))
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
  await act(async () => input.dispatchEvent(new FocusEvent("focusout", { bubbles: true })))
  await settle()
  expect(latestBundle().stats.minPhys).toBe(target)
  expect(useRotationStore.getState().result!.metrics.dps).toBeGreaterThan(beforeDps)
  const fishDps = useRotationStore.getState().result!.metrics.dps
  await choose("Food", "None")
  expect(latestBundle().stats.minPhys).toBe(target)
  expect(useRotationStore.getState().result!.metrics.dps).toBeLessThan(fishDps)
  expect(JSON.parse(localStorage.getItem("wwm-stat-overrides-v1")!).minPhys).toBe(target)
})

it("migrates legacy Endurance food and keeps both food controls independent", async () => {
  localStorage.setItem("wwm-path-session-v1", "bellstrikeSplendor")
  localStorage.setItem("wwm-food-session-v1", "SwallowsAgility")
  await act(async () => root.render(<App />))
  await settle()
  expect(useLoadoutStore.getState().setupSelections).toMatchObject({ food: "None", enduranceFood: "SwallowsAgility" })
  expect(localStorage.getItem("wwm-food-session-v1")).toBe("None")
  expect(localStorage.getItem("wwm-endurance-food-session-v1")).toBe("SwallowsAgility")
  await choose("Food", "Simmering Fish Slices")
  expect(useLoadoutStore.getState().setupSelections).toMatchObject({
    food: "SimmeringFishSlices",
    enduranceFood: "SwallowsAgility",
  })
  const heading = [...container.querySelectorAll(".setup-category-row > span")].find(
    node => node.textContent === "Endurance",
  )!
  const none = [...heading.parentElement!.querySelectorAll("button")].find(node =>
    node.textContent?.startsWith("None"),
  )!
  await act(async () => none.click())
  expect(useLoadoutStore.getState().setupSelections).toMatchObject({
    food: "SimmeringFishSlices",
    enduranceFood: "None",
  })
  await act(async () => useLoadoutStore.getState().initialise(false))
  expect(useLoadoutStore.getState().setupSelections).toMatchObject({
    food: "SimmeringFishSlices",
    enduranceFood: "None",
  })
})
