// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import App from "@/App"
import { buildShareLink } from "@/application/buildShare"
import { exportSharedBuild } from "@/gear"
import { initializeI18n } from "@/i18n"
import { getNotices } from "@/notices"
import { useGearStore } from "@/stores/gearStore"
import { useLoadoutStore } from "@/stores/loadoutStore"

import english from "../public/locales/en.json"

vi.mock("@/stores/dpsStore", async () => {
  const { mockDpsStore } = await import("./helpers/dpsStoreMock")
  return mockDpsStore()
})

globalThis.IS_REACT_ACT_ENVIRONMENT = true

it("offers links in an open tab and waits for Dev mode before importing a dev-path build", async () => {
  localStorage.clear()
  sessionStorage.clear()
  history.replaceState(null, "", location.pathname + location.search)
  vi.stubGlobal("matchMedia", () => ({ matches: false, addEventListener() {}, removeEventListener() {} }))
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => ({
      ok: true,
      json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    })),
  )
  HTMLDialogElement.prototype.showModal = function () {
    this.setAttribute("open", "")
  }
  HTMLDialogElement.prototype.close = function () {
    this.removeAttribute("open")
  }
  await initializeI18n()
  const container = document.createElement("div")
  document.body.appendChild(container)
  const root = createRoot(container)

  try {
    await act(async () => root.render(<App />))
    const dialog = container.querySelector<HTMLDialogElement>(".shared-build-dialog")!
    expect(dialog.open).toBe(false)

    await act(async () => {
      history.pushState(null, "", "#build=example")
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(dialog.open).toBe(true)

    await act(async () => dialog.querySelector<HTMLButtonElement>(".dialog-actions button")!.click())
    expect(dialog.open).toBe(false)
    expect(location.hash).toBe("")

    const before = useGearStore.getState().buildState
    const pathBefore = useLoadoutStore.getState().pathId
    const exported = exportSharedBuild(
      { id: "shared-mixed", name: "Mixed build", martialArts: ["vernalUmbrella", "namelessSword"] },
      { items: [], equipped: {} },
      "Mixed build",
    )
    const link = new URL(await buildShareLink(exported))
    await act(async () => {
      history.pushState(null, "", link.hash)
      window.dispatchEvent(new HashChangeEvent("hashchange"))
    })
    expect(dialog.open).toBe(true)

    await act(async () => {
      dialog.querySelector<HTMLButtonElement>(".dialog-actions button:last-child")!.click()
      await vi.waitFor(() => expect(getNotices().some(notice => notice.id === "build-share")).toBe(true))
    })
    expect(dialog.open).toBe(false)
    expect(useGearStore.getState().buildState.entries).toEqual(before.entries)
    expect(useGearStore.getState().buildState.gearItems).toEqual(before.gearItems)
    expect(useLoadoutStore.getState().pathId).toBe(pathBefore)
    expect(location.hash).toBe(link.hash)
    expect(container.textContent).toContain("This build requires Dev mode")

    await act(async () => container.querySelector<HTMLButtonElement>(".dev-mode-button")!.click())
    expect(dialog.open).toBe(true)
    await act(async () => {
      dialog.querySelector<HTMLButtonElement>(".dialog-actions button:last-child")!.click()
      await vi.waitFor(() =>
        expect(useGearStore.getState().buildState.entries.some(entry => entry.name === "Mixed build")).toBe(true),
      )
    })
    expect(useGearStore.getState().buildState.entries.some(entry => entry.name === "Mixed build")).toBe(true)
    expect(useLoadoutStore.getState().pathId).toBe("mixed")
    expect(location.hash).toBe("")
  } finally {
    await act(async () => root.unmount())
    container.remove()
    vi.unstubAllGlobals()
    history.replaceState(null, "", location.pathname + location.search)
  }
})
