// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, expect, it, vi } from "vitest"

import App from "@/App"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import type { RotationStep } from "@/calculations/rotationTimeline"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"
import { dpsBundles, dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"
import { openRotationEditorTab } from "./helpers/rotationEditorTab"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

dpsResolves("editorTimeline", async request => ({
  ...calculateEditorTimeline(request.build().timeline),
  fingerprint: "editor-test",
}))

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

async function click(text: string) {
  const button = [...container.querySelectorAll("button")].find(node => node.textContent?.trim() === text)
  expect(button).toBeDefined()
  await act(async () => button!.click())
}

it("keeps the rendered gear bookmarklet executable when saved and run on the dashboard", async () => {
  await act(async () => root.render(<App />))
  await click("Build")
  await act(async () => vi.dynamicImportSettled())
  const bookmarklet = container.querySelector<HTMLAnchorElement>(".official-bookmarklet")
  expect(bookmarklet).not.toBeNull()
  const url = bookmarklet!.getAttribute("href")!
  expect(url.startsWith("javascript:")).toBe(true)
  const roleInfo = { name: "Bookmarklet test", wearEquipsDetailed: [{ id: "test-gear" }] }
  localStorage.setItem("getAreaServer", JSON.stringify(roleInfo))
  const writeText = vi.fn<(value: string) => Promise<void>>(async () => {})
  vi.stubGlobal("navigator", { clipboard: { writeText } })
  vi.stubGlobal("alert", vi.fn())
  const runBookmarklet = new Function(decodeURIComponent(url.slice("javascript:".length)))
  await act(async () => runBookmarklet())
  expect(writeText).toHaveBeenCalledTimes(1)
  expect(JSON.parse(writeText.mock.calls[0][0]).roleInfo).toEqual(roleInfo)
})

it("opens action anchors on selection but allows their rows to remain collapsed", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "anchor-a" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify(
      ["a", "b"].map(id => ({
        id: `anchor-${id}`,
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: `Anchor ${id}`,
          eventTimeReference: "battleStart",
          start: { step: 0, action: 0 },
          steps: [{ type: "skill", skill: "SereneBreeze" }],
        },
      })),
    ),
  )
  await act(async () => root.render(<App />))
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await act(async () => vi.advanceTimersByTimeAsync(150))
  const expandButton = () => container.querySelector<HTMLButtonElement>(".rotation-expand-button")!
  expect(expandButton().getAttribute("aria-expanded")).toBe("true")
  await act(async () => expandButton().click())
  expect(expandButton().getAttribute("aria-expanded")).toBe("false")
  await act(async () => vi.advanceTimersByTimeAsync(300))
  expect(expandButton().getAttribute("aria-expanded")).toBe("false")
  await click("Anchor b")
  expect(expandButton().getAttribute("aria-expanded")).toBe("true")
  await act(async () => expandButton().click())
  expect(expandButton().getAttribute("aria-expanded")).toBe("false")
  await click("Anchor a")
  expect(expandButton().getAttribute("aria-expanded")).toBe("true")
})

it("moves an after-start Qi event to the adjacent action instead of the first damage target", async () => {
  localStorage.setItem("wwm-path-session-v1", "silkbindDeluge")
  localStorage.setItem("wwm-active-rotation-by-path-v1", JSON.stringify({ silkbindDeluge: "after-start" }))
  localStorage.setItem(
    "wwm-rotation-list-session-v1",
    JSON.stringify([
      {
        id: "after-start",
        martialArts: ["panaceaFan", "soulshadeUmbrella"],
        rotation: {
          name: "After start",
          eventTimeReference: "battleStart",
          start: { step: 1 },
          steps: [
            { type: "event", event: "Qi", after: { action: "start" }, targetQiRatio: 0 },
            { type: "skill", skill: "Defense" },
            { type: "skill", skill: "SereneBreeze" },
          ],
        },
      },
    ]),
  )
  await act(async () => root.render(<App />))
  await openRotationEditorTab(container, () => click("Rotation Editor"))
  await act(async () => vi.advanceTimersByTimeAsync(200))
  const eventRow = container.querySelector<HTMLElement>('[data-rotation-step-index="0"]')!
  const timeInput = eventRow.querySelector<HTMLInputElement>('input[aria-label="Start Time"]')!
  expect(timeInput).not.toBeNull()
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!.call(timeInput, "3.25")
    timeInput.dispatchEvent(new Event("input", { bubbles: true }))
    timeInput.dispatchEvent(new FocusEvent("focusout", { bubbles: true }))
    await vi.advanceTimersByTimeAsync(200)
  })
  const fixedRow = container.querySelector<HTMLElement>('[data-rotation-step-index="0"]')!
  expect(fixedRow.classList.contains("rotation-fixed-time-event")).toBe(true)
  expect(fixedRow.querySelector('[data-fixed-time="true"]')).not.toBeNull()
  const nextButton = fixedRow.querySelector<HTMLButtonElement>('button[aria-label="Move event to next action"]')!
  expect(nextButton.disabled).toBe(false)
  await act(async () => {
    nextButton.click()
    await vi.advanceTimersByTimeAsync(200)
  })
  const latestBundle = dpsBundles("editorTimeline").at(-1)!
  const movedQi = latestBundle.timeline.rotation.steps.find(
    (step: RotationStep) => step.type === "event" && step.event === "Qi",
  )
  expect(movedQi).toMatchObject({ after: { action: "start" } })
  expect(movedQi).not.toHaveProperty("startTime")
})
