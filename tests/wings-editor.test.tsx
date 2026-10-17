// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import App from "@/App"
import { calculateEditorTimeline } from "@/calculations/editorTimeline"
import { initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"
import { dpsResolves, resetDpsMock } from "./helpers/dpsStoreMock"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

it("shows worker Noble Will values for Wings", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  resetDpsMock()
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem("wwm-dev-mode-v1", "true")
  localStorage.setItem("wwm-path-session-v1", "silkbindWings")
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
  dpsResolves("editorTimeline", async request => {
    const result = calculateEditorTimeline(request.build().timeline)
    return {
      ...result,
      fingerprint: "wings-resource-display",
      timeline: result.timeline.map(row =>
        Object.assign({}, row, { resources: { ...row.resources, NobleWill: 57.25 } }),
      ),
    }
  })
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  try {
    await act(async () => root.render(<App />))
    const button = [...container.querySelectorAll("button")].find(
      node => node.textContent?.trim() === "Rotation Editor",
    )!
    expect(button).toBeDefined()
    await act(async () => button.click())
    await act(async () => {
      await import("@/features/rotations/RotationEditorTab")
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(300)
    })
    const cells = [...container.querySelectorAll('[data-mobile-label="Noble Will"]')]
    expect(cells.length).toBeGreaterThan(0)
    expect(cells.some(cell => cell.textContent === "57.25")).toBe(true)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.useRealTimers()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  }
})
