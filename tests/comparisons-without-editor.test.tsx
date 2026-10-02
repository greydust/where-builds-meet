// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import { rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { emptyRotationBreakdown, type RotationMetrics } from "@/calculations/rotationMetrics"
import { duplicateBuildState } from "@/gear"
import { initializeI18n } from "@/i18n"
import { useGearStore } from "@/stores/gearStore"
import { useRotationStore } from "@/stores/rotationStore"

import english from "../public/locales/en.json"
import { dpsDispatches, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { openRotationEditorTab } from "./helpers/rotationEditorTab"

/**
 * A rotation's comparisons are data about the rotation rather than a view of it, so the
 * character sheet's priority panels are filled without the rotation editor ever being mounted.
 * These fail if the editor is what produces them again, which is what the panels used to wait for.
 */

const rotationId = "comparison-probe"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

/** One measured stat, identified by the variant the worker was handed. */
function comparisonMetrics(request: { build: () => { statPriority?: Array<{ label: string }> } }): {
  metrics: RotationMetrics
} {
  const variant = request.build().statPriority?.[0]
  return {
    metrics: {
      totalDamage: 1,
      dps: 1,
      unscaledTotalDamage: 1,
      unscaledDps: 1,
      totalHealing: 0,
      hps: 0,
      breakdown: emptyRotationBreakdown(),
      statPriority: variant
        ? [{ label: variant.label, maxRoll: 10, dpsDifference: 100, increase: 1, hpsDifference: 0, healingIncrease: 0 }]
        : [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    },
  }
}

dpsResolves("baseline", async request => calculateRotationBaseline(request.build()))
dpsResolves("comparisons", async request => comparisonMetrics(request as never))
dpsResolves("editorTimeline", async request => {
  const bundle = request.build()
  return { ...calculateEditorTimeline(bundle.timeline), fingerprint: rotationBundleFingerprint(bundle) }
})
dpsResolves("throughput", async request => {
  const { metrics } = calculateRotationBaseline(request.build())
  return { dps: metrics.dps, hps: metrics.hps, totalDamage: metrics.totalDamage } as never
})

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  resetDpsMock()
  dpsResolves("comparisons", async request => comparisonMetrics(request as never))
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-path-session-v1", "stonesplitStrength")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ stonesplitStrength: rotationId }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: rotationId,
        martialArts: ["snowparting", "phalanxbane"],
        rotation: {
          name: "Comparison probe",
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [
            { type: "skill", skill: "SnowpartingQ" },
            { type: "skill", skill: "SnowpartingQ2" },
          ],
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
      status: 200,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
      text: async () => "{}",
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
  vi.restoreAllMocks()
})

async function settle() {
  await Array.from({ length: 25 }).reduce(
    (previous: Promise<unknown>) => previous.then(() => act(async () => vi.advanceTimersByTimeAsync(400))),
    Promise.resolve(),
  )
}

it("resolves a rotation's comparisons without the rotation editor being mounted", async () => {
  await act(async () => root.render(<App />))
  await settle()

  expect(container.querySelector(".rotation-editor-panel")).toBeNull()
  expect(dpsDispatches("comparisons").length).toBeGreaterThan(0)
  const metrics = useRotationStore.getState().result?.metrics
  expect(metrics?.statPriority.length).toBeGreaterThan(0)
})

it("shows the character sheet's priority rows without the rotation editor", async () => {
  await act(async () => root.render(<App />))
  await settle()

  // The panel's own placeholder told the reader to open the editor, which is no longer true and
  // would be the visible symptom of comparisons resolving only inside it.
  expect(container.textContent).not.toContain("Open the Rotation Editor")
  const rows = [...container.querySelectorAll(".priority-row")].map(row => row.textContent?.trim() ?? "")
  expect(rows.length).toBeGreaterThan(0)
  expect(rows.some(row => row.includes("Comparison probe") || row.length > 0)).toBe(true)
})

async function click(label: string) {
  const button = [...document.querySelectorAll<HTMLButtonElement>("button")].find(
    node => node.textContent?.trim() === label || node.getAttribute("aria-label") === label,
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
  await settle()
}

async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}

async function openBuild() {
  await click("Build")
  await act(async () => {
    await import("@/features/build/BuildTab")
  })
  await settle()
}

async function activateEditableBuild() {
  const originalId = useGearStore.getState().buildState.activeBuildId
  await act(async () => {
    useGearStore
      .getState()
      .updateBuildState("stonesplitStrength", state =>
        duplicateBuildState(state, originalId, { id: "editable-build", name: "Editable build" }),
      )
    useGearStore.getState().selectBuildForPath("editable-build", "stonesplitStrength")
  })
  await settle()
}

it("refreshes shared damage after a gear save but defers variants until returning to Main", async () => {
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  await act(async () => root.render(<App />))
  await settle()
  await activateEditableBuild()
  await openBuild()
  expect(container.querySelector(".rotation-editor-panel")).toBeNull()
  const before = useRotationStore.getState().result!
  expect(before.metrics.dps).toBeGreaterThan(0)
  const comparisonCount = dpsDispatches("comparisons").length
  const buildBefore = container.querySelector(".build-detail-dps-active")?.textContent

  await click("Edit")
  await fill(document.querySelector<HTMLInputElement>('input[aria-label="Base affix value"]')!, "0")
  await click("Save Changes")
  const after = useRotationStore.getState().result!
  expect(after.bundleKey).not.toBe(before.bundleKey)
  expect(after.bundle.stats.minPhys).toBeLessThan(before.bundle.stats.minPhys)
  expect(after.metrics.dps).toBeLessThan(before.metrics.dps)
  expect(after.metrics.breakdown.skills.length).toBeGreaterThan(0)
  expect(container.querySelector(".build-detail-dps-active")?.textContent).not.toBe(buildBefore)
  expect(after.metrics.statPriority).toEqual([])
  expect(dpsDispatches("comparisons")).toHaveLength(comparisonCount)

  await click("Main")
  expect(useRotationStore.getState().result?.bundleKey).toBe(after.bundleKey)
  expect(useRotationStore.getState().result?.metrics.dps).toBe(after.metrics.dps)
  expect(useRotationStore.getState().result?.metrics.statPriority.length).toBeGreaterThan(0)
  expect(dpsDispatches("comparisons").length).toBeGreaterThan(comparisonCount)
  const resolvedCount = dpsDispatches("comparisons").length
  await openBuild()
  await click("Main")
  expect(dpsDispatches("comparisons")).toHaveLength(resolvedCount)
})

it("keeps editor timelines and draft damage current without variants, then compares that draft on Main", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const comparisonCount = dpsDispatches("comparisons").length
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await settle()
  const before = useRotationStore.getState().result!
  const ping = container.querySelector<HTMLInputElement>(".rotation-ping-field input")!
  expect(ping.disabled).toBe(false)
  await fill(ping, "250")
  await act(async () => ping.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
  await settle()

  const draft = useRotationStore.getState().result!
  expect(draft.draft).toBe(true)
  expect(draft.rotation.ping).toBe(250)
  expect(draft.bundleKey).not.toBe(before.bundleKey)
  expect(draft.metrics.dps).not.toBe(before.metrics.dps)
  expect(draft.metrics.breakdown.skills.length).toBeGreaterThan(0)
  expect(dpsDispatches("editorTimeline").some(request => request.build().timeline.rotation.ping === 250)).toBe(true)
  expect(container.querySelector(".rotation-results")?.textContent).not.toContain("Recalculating")
  expect(dpsDispatches("comparisons")).toHaveLength(comparisonCount)

  await click("Main")
  const compared = useRotationStore.getState().result!
  expect(compared.bundleKey).toBe(draft.bundleKey)
  expect(compared.rotation.ping).toBe(250)
  expect(compared.metrics.dps).toBe(draft.metrics.dps)
  expect(compared.metrics.statPriority.length).toBeGreaterThan(0)
  expect(dpsDispatches("comparisons").length).toBeGreaterThan(comparisonCount)
})

it("refreshes equipment against an unsaved rotation after leaving the editor", async () => {
  await act(async () => root.render(<App />))
  await settle()
  await activateEditableBuild()
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await settle()
  const ping = container.querySelector<HTMLInputElement>(".rotation-ping-field input")!
  await fill(ping, "250")
  await act(async () => ping.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true })))
  await settle()
  await openBuild()
  const before = useRotationStore.getState().result!
  const comparisonCount = dpsDispatches("comparisons").length
  await act(async () =>
    useGearStore
      .getState()
      .updateBuildState("stonesplitStrength", state => ({
        ...state,
        gearItems: state.gearItems.map(item => ({ ...item, baseAffix: { ...item.baseAffix, value: 0 } })),
      })),
  )
  await settle()
  const after = useRotationStore.getState().result!
  expect(after.rotation.ping).toBe(250)
  expect(after.bundle.timeline.rotation.ping).toBe(250)
  expect(after.bundleKey).not.toBe(before.bundleKey)
  expect(after.metrics.dps).toBeLessThan(before.metrics.dps)
  expect(dpsDispatches("comparisons")).toHaveLength(comparisonCount)
  await click("Main")
  expect(useRotationStore.getState().result?.bundleKey).toBe(after.bundleKey)
  expect(useRotationStore.getState().result?.metrics.statPriority.length).toBeGreaterThan(0)
})

it("does not publish old comparisons after leaving Main and changing equipment", async () => {
  const finishComparisons: Array<() => void> = []
  dpsResolves(
    "comparisons",
    request =>
      new Promise(resolve => {
        finishComparisons.push(() => resolve(comparisonMetrics(request as never)))
      }),
  )
  await act(async () => root.render(<App />))
  await settle()
  expect(finishComparisons.length).toBeGreaterThan(0)
  expect(useRotationStore.getState().status.statPriority.recalculating).toBe(true)
  await openBuild()
  await activateEditableBuild()
  await act(async () =>
    useGearStore
      .getState()
      .updateBuildState("stonesplitStrength", state => ({
        ...state,
        gearItems: state.gearItems.map(item => ({ ...item, baseAffix: { ...item.baseAffix, value: 0 } })),
      })),
  )
  await settle()
  const current = useRotationStore.getState().result!
  await act(async () => {
    for (const finish of finishComparisons) finish()
  })
  await settle()
  expect(useRotationStore.getState().result?.bundleKey).toBe(current.bundleKey)
  expect(useRotationStore.getState().result?.metrics.dps).toBe(current.metrics.dps)
  expect(useRotationStore.getState().result?.metrics.statPriority).toEqual([])
  expect(useRotationStore.getState().status.statPriority.recalculating).toBe(false)
})
