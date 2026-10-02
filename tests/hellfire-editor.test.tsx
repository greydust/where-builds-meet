// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { assert, afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import type { EditorTimelineResult } from "@/calculations/editorTimeline"
import type { RotationStep } from "@/calculations/rotationTimeline"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"
import { dpsBundles, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

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
async function fill(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(input, value)
    input.dispatchEvent(new Event("input", { bubbles: true }))
  })
}
async function commit(input: HTMLInputElement, trigger: "enter" | "blur" = "blur") {
  await act(async () => {
    if (trigger === "enter") input.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true }))
    else input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
  })
}
it("adds a timed Hellfire event, edits signed amounts, and saves it", async () => {
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await click("Duplicate")
  const selects = [...container.querySelectorAll<HTMLSelectElement>('select[aria-label="Skill or event"]')]
  expect(selects.length).toBeGreaterThan(1)
  const select = selects[1]
  const groups = [...select.querySelectorAll("optgroup")]
  const groupLabels = groups.map(group => group.label)
  expect(groupLabels.slice(-2)).toEqual(["Events", "Action"])
  expect(groupLabels).toContain("Mystic")
  expect(groupLabels).toContain("General")
  for (const skillGroup of groups.slice(0, -2)) expect(skillGroup.querySelectorAll("option").length).toBeGreaterThan(0)
  expect([...groups[groups.length - 1].querySelectorAll("option")].map(option => option.textContent)).toEqual([
    "Action: Delay",
    "Action: Switch Martial Art",
  ])
  await act(async () => {
    select.value = "__event:Hellfire"
    select.dispatchEvent(new Event("change", { bubbles: true }))
  })
  const amount = container.querySelector<HTMLInputElement>(
    'input[aria-label="Hellfire change (+ adds / - subtracts)"]',
  )!
  expect(amount).not.toBeNull()
  await fill(amount, "-12.5")
  await commit(amount)
  expect(amount.value).toBe("-12.5")
  const time = amount.closest(".rotation-table-row")!.querySelector<HTMLInputElement>("input.rotation-event-time")!
  await fill(time, "3.25")
  await commit(time)
  await click("Save")
  const entries = JSON.parse(localStorage.getItem("wwm-rotation-list-session-v1")!)
  expect(entries.flatMap((entry: { rotation: { steps: unknown[] } }) => entry.rotation.steps)).toContainEqual({
    type: "event",
    event: "Hellfire",
    startTime: 3.25,
    amount: -12.5,
  })
  await fill(amount, "25")
  await commit(amount)
  await act(async () => {
    await vi.advanceTimersByTimeAsync(300)
  })
  expect(
    dpsBundles("editorTimeline").some(bundle =>
      bundle.timeline.rotation.steps.some(
        (step: RotationStep) => step.type === "event" && step.event === "Hellfire" && step.amount === 25,
      ),
    ),
  ).toBe(true)
})

it("allows a Delay action in a one-skill rotation", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "one-skill" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "one-skill",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "One skill",
          eventTimeReference: "battleStart",
          start: { step: 0 },
          steps: [{ type: "skill", skill: "Defense" }],
        },
      },
    ]),
  )
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await act(async () => vi.advanceTimersByTimeAsync(200))
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')!
  expect(select).not.toBeNull()
  await act(async () => {
    select.value = "__event:Delay"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
  })
  const bundle = dpsBundles("editorTimeline")
    .reverse()
    .find(value => value?.timeline?.rotation?.name === "One skill")
  expect(bundle?.timeline.rotation.steps[0]).toMatchObject({ type: "event", event: "Delay" })
})

it("keeps a sole ordered skill when replacing it with a fixed-time event", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "one-skill-fixed" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "one-skill-fixed",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "One skill fixed replacement",
          eventTimeReference: "battleStart",
          start: { step: 0 },
          steps: [{ type: "skill", skill: "Defense" }],
        },
      },
    ]),
  )
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await act(async () => vi.advanceTimersByTimeAsync(200))
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')!
  await act(async () => {
    select.value = "__event:Hellfire"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
  })
  const bundle = dpsBundles("editorTimeline")
    .reverse()
    .find(value => value?.timeline?.rotation?.name === "One skill fixed replacement")
  expect(bundle?.timeline.rotation.steps).toEqual([{ type: "skill", skill: "Defense" }])
})

it("clears an action start anchor when replacing its skill with an actionless skill", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "action-anchor" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "action-anchor",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "Action anchor replacement",
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "SereneBreeze" }],
        },
      },
    ]),
  )
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await act(async () => vi.advanceTimersByTimeAsync(200))
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')!
  await act(async () => {
    select.value = "Dodge"
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
  })
  const bundle = dpsBundles("editorTimeline")
    .reverse()
    .find(value => value?.timeline?.rotation?.name === "Action anchor replacement")
  expect(bundle?.timeline.rotation.start).toEqual({ step: 0 })
  expect(bundle?.timeline.rotation.steps).toEqual([{ type: "skill", skill: "Dodge" }])
})

it("retains generated rows until the latest complete editor revision arrives", async () => {
  const { pendingEditorTimeline } = await import("@/editorTimelinePreview")
  type Result = EditorTimelineResult
  const requests: { result: Result; resolve: (result: Result) => void }[] = []
  dpsResolves(
    "editorTimeline",
    request =>
      new Promise(resolve => {
        const bundle = request.build()
        const timeline = pendingEditorTimeline(bundle.timeline).map(row =>
          Object.assign({}, row, { pendingCalculation: false }),
        )
        timeline.push({
          ...timeline[0],
          id: "generated-wait",
          rotationIndex: undefined,
          startTime: 0.5,
          step: { type: "event", event: "Delay", duration: 2, automatic: "cooldown" },
        })
        requests.push({
          resolve,
          result: { rotation: bundle.timeline.rotation, timeline, fingerprint: `revision-${requests.length}` },
        })
      }),
  )
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await click("Duplicate")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  await act(async () => {
    requests[0].resolve(requests[0].result)
  })
  const rows = () => [...container.querySelectorAll(".rotation-table-row")]
  const originalRows = rows()
  const select = container.querySelector<HTMLSelectElement>('select[aria-label="Skill or event"]')!
  const originalValue = select.value
  const alternate = [...select.options].find(
    option => !option.value.startsWith("__") && option.value !== originalValue,
  )!
  await act(async () => {
    select.value = alternate.value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(rows()).toEqual(originalRows)
  expect(select.isConnected).toBe(true)
  expect(select.value).toBe(originalValue)
  await act(async () => {
    select.value = alternate.value
    select.dispatchEvent(new Event("change", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(100)
  })
  expect(requests).toHaveLength(3)
  await act(async () => {
    requests[1].resolve(requests[1].result)
  })
  expect(select.value).toBe(originalValue)
  expect(rows()).toEqual(originalRows)
  await act(async () => {
    requests[2].resolve(requests[2].result)
  })
  expect(select.value).toBe(alternate.value)
})

it.each([0, 1, 3])("preserves the neighboring row's viewport position when deleting item %i", async deletePosition => {
  const { pendingEditorTimeline } = await import("@/editorTimelinePreview")
  type Result = EditorTimelineResult
  const requests: { result: Result; resolve: (result: Result) => void }[] = []
  dpsResolves(
    "editorTimeline",
    request =>
      new Promise(resolve => {
        const bundle = request.build()
        const timeline = pendingEditorTimeline(bundle.timeline).map(row =>
          Object.assign({}, row, { pendingCalculation: false }),
        )
        requests.push({
          resolve,
          result: { rotation: bundle.timeline.rotation, timeline, fingerprint: `delete-${requests.length}` },
        })
      }),
  )
  await act(async () => root.render(<App />))
  await openRotationEditor()
  await click("Duplicate")
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100)
  })
  await act(async () => {
    requests[0].resolve(requests[0].result)
  })
  const scroll = container.querySelector<HTMLElement>(".rotation-scroll-content")!
  const rows = [...scroll.querySelectorAll<HTMLElement>(".rotation-table-row[data-rotation-step-index]")].filter(
    row => row.querySelector<HTMLButtonElement>('button[aria-label="Delete step"]')?.disabled === false,
  )
  expect(rows.length).toBeGreaterThan(deletePosition)
  const deleted = rows[deletePosition]
  const rowIndexes = rows.map(row => Number(row.dataset.rotationStepIndex))
  const deletedIndex = rowIndexes[deletePosition]
  let layoutShift = 0
  const bounds = vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (
    this: HTMLElement,
  ) {
    const index = this.classList.contains("rotation-table-row") ? Number(this.dataset.rotationStepIndex) : undefined
    return { top: 100 + (index === undefined ? 0 : index * 40 + layoutShift) } as DOMRect
  })
  try {
    scroll.scrollTop = 300
    await act(async () => {
      deleted.querySelector<HTMLButtonElement>('button[aria-label="Delete step"]')!.click()
      await vi.advanceTimersByTimeAsync(100)
    })
    expect(scroll.scrollTop).toBe(300)
    expect(requests).toHaveLength(2)
    const deletedCount = requests[0].result.rotation.steps.length - requests[1].result.rotation.steps.length
    const deletionStart = deletedIndex - deletedCount + 1
    const anchorIndex =
      rowIndexes
        .slice(0, deletePosition)
        .reverse()
        .find(index => index < deletionStart) ??
      rowIndexes.slice(deletePosition + 1).find(index => index > deletedIndex)!
    const newAnchorIndex = anchorIndex > deletedIndex ? anchorIndex - deletedCount : anchorIndex
    layoutShift = 60
    await act(async () => {
      requests[1].resolve(requests[1].result)
    })
    expect(scroll.scrollTop).toBe(300 + 60 + (newAnchorIndex - anchorIndex) * 40)
  } finally {
    bounds.mockRestore()
  }
})
