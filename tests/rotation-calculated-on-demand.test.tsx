// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import { rotationBundleFingerprint } from "@/calculations/calculationFingerprint"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import { calculateRotationBaseline } from "@/calculations/rotationCalculator"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"
import { dpsHeldKeys, dpsRequests, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { openRotationEditorTab } from "./helpers/rotationEditorTab"

/**
 * A path with several rotations, so this fails if the editor calculates rotations the
 * user has not asked for. Only the active one is needed on first render; the rest are
 * calculated when selected.
 */
const rotations = [
  "dummy-1-min",
  "dummy-1-min-wts",
  "dummy-1-min-wts-team",
  "dummy-infinite-vitality-1-min",
  "dummy-smolder-poet-1-min",
]

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

dpsResolves("editorTimeline", async request => {
  const bundle = request.build()
  return {
    rotation: bundle.timeline.rotation,
    timeline: calculateEditorTimeline(bundle.timeline).timeline,
    fingerprint: rotationBundleFingerprint(bundle),
  }
})

/**
 * A baseline that never arrives leaves the editor showing a calculation that has not
 * finished, which is the state the toolbar's placeholder exists for.
 */
let baselinePending = false
dpsResolves("baseline", async request => {
  if (baselinePending) return new Promise(() => {})
  return calculateRotationBaseline(request.build())
})

/**
 * Comparisons only need to resolve for the batch to publish; their numbers are not what
 * this test measures, and calculating every variant for real would dominate the runtime.
 */
const emptyMetrics = () => ({
  totalDamage: 1,
  dps: 1,
  unscaledTotalDamage: 1,
  unscaledDps: 1,
  totalHealing: 0,
  hps: 0,
  breakdown: { skills: [], casts: [], categories: [], damageTypes: [] },
  statPriority: [],
  attunementPriority: [],
  innerWayPriority: [],
  setupComparisons: {},
})
dpsResolves("comparisons", async () => ({ metrics: emptyMetrics() as never }))

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true

beforeEach(async () => {
  await initializeI18n()
  resetDpsMock()
  baselinePending = false
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-path-session-v1", "stonesplitStrength")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ stonesplitStrength: "dummy-1-min-wts" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify(
      rotations.map(id => ({
        id,
        martialArts: ["stonecleaverHalberd", "stonecleaverGlaive"],
        rotation: {
          name: id,
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "MountainCleaver" }],
        },
      })),
    ),
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
  container = document.createElement("div")
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(async () => {
  await act(async () => root.unmount())
  container.remove()
})

async function settle() {
  await Array.from({ length: 25 }).reduce(
    (previous: Promise<unknown>) => previous.then(() => act(async () => vi.advanceTimersByTimeAsync(400))),
    Promise.resolve(),
  )
}

/**
 * Rotation names a baseline was actually built for. A graduation preset is a separate kind
 * of request now, so asking for baselines already excludes them.
 */
function calculatedRotations() {
  return dpsRequests("baseline").map(request => (request.build().timeline.rotation.name as string).trim())
}

async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    node => node.textContent?.trim() === text || node.getAttribute("aria-label") === text,
  )
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

/** Display names in the rotation list, and which one is active. */
function listedRotations() {
  const items = [...container.querySelectorAll<HTMLElement>(".rotation-list-item")]
  return items.map(item => ({
    name: item.querySelector(".rotation-select-button")?.textContent?.trim() ?? "",
    active: item.classList.contains("active"),
  }))
}

it("resolves only the active rotation before the editor is opened", async () => {
  await act(async () => root.render(<App />))
  await settle()

  expect(container.querySelector(".rotation-editor-panel")).toBeNull()
  // Only the active rotation, which every surface shows. The editor is what needs the rest, and
  // it is not on screen yet.
  expect(calculatedRotations()).toHaveLength(1)
})

it("does not calculate every rotation when the editor is opened", async () => {
  await act(async () => root.render(<App />))
  await settle()
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await settle()

  // Stored entries merge with the path's bundled presets, so the list is longer than what
  // this test stores. Only the active rotation and the one being edited are ever needed;
  // the rest are calculated when selected.
  const listed = listedRotations()
  expect(listed.length).toBeGreaterThanOrEqual(rotations.length)
  const calculated = new Set(calculatedRotations())
  expect(
    calculated.size,
    `expected at most the active and edited rotations, got ${[...calculated].join(", ")}`,
  ).toBeLessThanOrEqual(2)
  expect(calculated.size).toBeLessThan(listed.length)
})

it("calculates a rotation when it is selected", async () => {
  await act(async () => root.render(<App />))
  await settle()
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await settle()
  const before = calculatedRotations()

  const idleName = listedRotations().find(entry => !entry.active)?.name ?? ""
  const target = [...container.querySelectorAll<HTMLButtonElement>(".rotation-select-button")].find(
    button => button.textContent?.trim() === idleName,
  )
  expect(target).toBeDefined()
  await act(async () => target!.click())
  await settle()

  const after = calculatedRotations()
  expect(after.length).toBeGreaterThan(before.length)
  expect(after).toContain(idleName)
})

it("forgets a path's cached calculations when another path is selected", async () => {
  await act(async () => root.render(<App />))
  await settle()
  const firstPath = dpsHeldKeys()
  expect(firstPath.length).toBeGreaterThan(0)

  const otherPath = [...container.querySelectorAll<HTMLButtonElement>(".path-selector-options button")].find(
    button => button.getAttribute("aria-pressed") === "false" && !button.disabled,
  )
  expect(otherPath).toBeDefined()
  await act(async () => otherPath!.click())
  await settle()

  const retained = firstPath.filter(key => dpsHeldKeys().includes(key))
  expect(retained, `still holding ${retained.length} calculations from the previous path`).toEqual([])
})

/** The results row of the rotation toolbar, as its rendered text. */
function rotationResults() {
  return container.querySelector(".rotation-results")?.textContent ?? ""
}

it("reports a pending calculation instead of a zeroed result", async () => {
  baselinePending = true
  await act(async () => root.render(<App />))
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await settle()

  const results = rotationResults()
  expect(results).toContain("Recalculating")
  expect(results).not.toMatch(/0\.00/)
  expect(container.querySelector(".rotation-results [data-calculation-status]")).not.toBeNull()
})

it("shows the calculated result once it arrives", async () => {
  await act(async () => root.render(<App />))
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await settle()

  const results = rotationResults()
  expect(results).toContain("DPS")
  expect(results).not.toContain("Recalculating")
  expect(container.querySelector(".rotation-results [data-calculation-status]")).toBeNull()
})
