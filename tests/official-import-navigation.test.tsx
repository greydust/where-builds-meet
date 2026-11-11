// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import App from "@/App"
import { developmentModeStorageKey } from "@/application/persistence/keys"
import { initializeI18n } from "@/i18n"
import { useGearStore } from "@/stores/gearStore"
import { useLoadoutStore } from "@/stores/loadoutStore"

import english from "../public/locales/en.json"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

it("activates an import on explicitly selected Mixed rather than its matching named path", async () => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  localStorage.clear()
  sessionStorage.clear()
  localStorage.setItem(developmentModeStorageKey, "true")
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn<() => Promise<unknown>>(async () => ({ ok: true, json: async () => english })),
  )
  HTMLDialogElement.prototype.showModal = function () {
    this.open = true
  }
  HTMLDialogElement.prototype.close = function () {
    this.open = false
  }
  await initializeI18n()
  await import("@/features/build/BuildTab")
  await import("@/officialGearImport")
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)
  const button = (label: string) =>
    [...container.querySelectorAll("button")].find(button => button.textContent === label)!
  try {
    await act(async () => root.render(<App />))
    await act(async () => button(english["ui.app.build"]).click())
    await act(async () => button(english["ui.buildTab.importFromOfficial"]).click())
    const textarea = container.querySelector(".official-import-dialog textarea")!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(
        textarea,
        JSON.stringify({
          source: "wwm-dashboard",
          v: 2,
          roleInfo: { roleName: "Mixed Review", kongfuMain: 20501, kongfuSub: 20701, wearEquipsDetailed: {} },
        }),
      )
      textarea.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await act(async () => button(english["ui.buildTab.importGear"]).click())
    const review = container.querySelector<HTMLDialogElement>(
      `[aria-label="${english["ui.buildTab.officialImportPreview"]}"]`,
    )!
    const destination = review.querySelector<HTMLSelectElement>("label select")!
    await act(async () => {
      destination.value = "mixed"
      destination.dispatchEvent(new Event("change", { bubbles: true }))
      review.querySelector<HTMLInputElement>('input[type="checkbox"]')!.click()
    })
    await act(async () => review.querySelector<HTMLButtonElement>(".dialog-actions button:last-child")!.click())
    const state = useGearStore.getState()
    const imported = state.buildState.entries.find(entry => entry.name === "Mixed Review Import")!
    expect(imported).toBeDefined()
    expect(useLoadoutStore.getState().pathId).toBe("mixed")
    expect(useLoadoutStore.getState().settings.weapons).toEqual(["infernalTwinblades", "mortalRopeDart"])
    expect(state.activeBuildIdsByPath.mixed).toBe(imported.id)
    expect(state.buildState.activeBuildId).toBe(imported.id)
    expect(review.open).toBe(false)
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
  }
})
