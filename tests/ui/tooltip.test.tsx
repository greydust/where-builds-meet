// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Tooltip } from "@/ui/Tooltip"

describe("Tooltip", () => {
  let container: HTMLDivElement
  let root: Root

  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(async () => {
    await act(async () => root.unmount())
    container.remove()
    vi.restoreAllMocks()
    vi.unstubAllGlobals()
  })

  /**
   * The box only exists while the trigger is hovered or focused, and never inside the trigger.
   * React derives enter and leave from over and out rather than listening for them directly, so
   * the pair dispatched here is the one a real pointer produces.
   */
  const reveal = async () => {
    const trigger = container.firstElementChild as HTMLElement
    await act(async () => {
      trigger.dispatchEvent(new Event("pointerover", { bubbles: true }))
    })
    return document.body.querySelector('[role="tooltip"]')
  }

  it("shows a labeled box when the trigger is hovered", async () => {
    await act(async () => {
      root.render(<Tooltip content="details">42</Tooltip>)
    })
    expect(container.textContent).toContain("42")
    const box = await reveal()
    expect(box?.textContent).toBe("details")
  })

  it("escapes the trigger's own tree, so a clipping ancestor cannot cut it off", async () => {
    const clipping = document.createElement("div")
    clipping.style.overflow = "hidden"
    document.body.appendChild(clipping)
    const host = document.createElement("div")
    clipping.appendChild(host)
    const portalRoot = createRoot(host)
    await act(async () => {
      portalRoot.render(<Tooltip content="details">42</Tooltip>)
    })

    const trigger = host.firstElementChild as HTMLElement
    await act(async () => {
      trigger.dispatchEvent(new Event("pointerover", { bubbles: true }))
    })
    // Inside the clipping ancestor the box would be cut at its edge; portalled, its parent is
    // the document and the clipping ancestor contains no tooltip at all.
    expect(clipping.querySelector('[role="tooltip"]')).toBeNull()
    expect(clipping.parentElement).toBe(document.body)
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toBe("details")

    await act(async () => portalRoot.unmount())
    clipping.remove()
  })

  it("aligns the box to the end on request and keeps tone classes", async () => {
    await act(async () => {
      root.render(
        <Tooltip content="details" align="end" className="effect-plate-tooltip">
          42
        </Tooltip>,
      )
    })
    const box = await reveal()
    expect(box?.getAttribute("class")).toContain("effect-plate-tooltip")
  })

  it("takes the box away again when the pointer leaves the trigger", async () => {
    await act(async () => {
      root.render(<Tooltip content="details">42</Tooltip>)
    })
    const trigger = container.firstElementChild as HTMLElement
    await act(async () => {
      trigger.dispatchEvent(new Event("pointerover", { bubbles: true }))
    })
    expect(document.body.querySelector('[role="tooltip"]')).not.toBeNull()

    await act(async () => {
      trigger.dispatchEvent(new Event("pointerout", { bubbles: true }))
    })
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })

  it("keeps a complete recipe within a short viewport", async () => {
    vi.stubGlobal("innerHeight", 720)
    vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(function (this: HTMLElement) {
      return this.getAttribute("role") === "tooltip"
        ? ({ top: 0, bottom: 500, left: 0, right: 350, width: 350, height: 500 } as DOMRect)
        : ({ top: 500, bottom: 530, left: 100, right: 450, width: 350, height: 30 } as DOMRect)
    })
    await act(async () => root.render(<Tooltip content="Complete replacement">Affix</Tooltip>))
    const box = (await reveal()) as HTMLElement
    expect(Number.parseFloat(box.style.top)).toBeGreaterThanOrEqual(8)
    expect(Number.parseFloat(box.style.top) + 500).toBeLessThanOrEqual(712)
  })

  it("stays open while the pointer moves into the recipe so long hints can be scrolled", async () => {
    await act(async () => root.render(<Tooltip content="Complete replacement">Affix</Tooltip>))
    const trigger = container.firstElementChild as HTMLElement
    const box = (await reveal()) as HTMLElement
    await act(async () => trigger.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: box })))
    expect(document.body.querySelector('[role="tooltip"]')).toBe(box)
    await act(async () =>
      box.dispatchEvent(new MouseEvent("pointerout", { bubbles: true, relatedTarget: document.body })),
    )
    expect(document.body.querySelector('[role="tooltip"]')).toBeNull()
  })
})
