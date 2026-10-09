// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { assert, afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"
import { dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

let container: HTMLDivElement
let root: Root
globalThis.IS_REACT_ACT_ENVIRONMENT = true
beforeEach(async () => {
  resetDpsMock()
  localStorage.clear()
  sessionStorage.clear()
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
/** Finds a button by its visible text, or by its accessible name when it carries only an icon. */
async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(
    node => node.textContent?.trim() === text || node.getAttribute("aria-label") === text,
  )
  assert(button !== undefined, text)
  await act(async () => button!.click())
}

/**
 * Waits for the rotation editor, which is loaded on demand when its tab is first opened.
 *
 * Its module resolves on the real event loop, which the fake clock these tests run on does not
 * drive, so loading it here is what lets the suspended render finish. Anything that opens the
 * editor has to await this rather than assume the editor is already on screen.
 */
async function openRotationEditor() {
  await click("Rotation Editor")
  await act(async () => {
    await import("@/features/rotations/RotationEditorTab")
  })
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0)
  })
  assert(container.querySelector(".rotation-editor-panel") !== null, "the rotation editor did not finish loading")
}

it("displays the resolved composite duration instead of an editable zero-second wrapper", async () => {
  localStorage.setItem("wwm-dev-mode-v1", "true")
  localStorage.setItem("wwm-path-session-v1", "bellstrikeUmbra")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ bellstrikeUmbra: "composite-timing" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "composite-timing",
        martialArts: ["strategicSword", "heavenquakerSpear"],
        rotation: {
          name: "Composite timing",
          ping: 0,
          start: { step: 0 },
          steps: [
            { type: "skill", skill: "InnerBalanceStrikeIII2" },
            { type: "skill", skill: "SweepAll" },
            { type: "skill", skill: "InnerBalanceStrikeIII1" },
          ],
        },
      },
    ]),
  )
  dpsResolves("editorTimeline", async request => ({
    ...calculateEditorTimeline(request.build().timeline),
    fingerprint: "composite-timing",
  }))
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await act(async () => vi.advanceTimersByTimeAsync(300))
  const rows = [...container.querySelectorAll(".rotation-table-row")]
  for (const [name, duration] of [
    ["InnerBalanceStrikeIII2", "1.31s"],
    ["SweepAll", "0.3s"],
  ]) {
    const row = rows.find(
      node => node.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')?.value === name,
    )!
    expect(row).toBeDefined()
    const cell = row.querySelector('[data-mobile-label="Cast Time"]')!
    expect(cell.textContent).toBe(duration)
    expect(cell.querySelector("input")).toBeNull()
  }
  const single = rows.find(
    node =>
      node.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')?.value === "InnerBalanceStrikeIII1",
  )!
  expect(single.querySelector("input.rotation-event-time")).not.toBeNull()
})
