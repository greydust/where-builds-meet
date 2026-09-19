// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Tab } from "../../src/ui/Tab"

describe("Tab", () => {
  let container: HTMLDivElement
  let root: Root

  globalThis.IS_REACT_ACT_ENVIRONMENT = true

  beforeEach(() => {
    container = document.createElement("div")
    document.body.appendChild(container)
    root = createRoot(container)
  })

  afterEach(() => {
    root.unmount()
    container.remove()
  })

  async function renderTab(props: Parameters<typeof Tab>[0]) {
    await act(async () => {
      root.render(<Tab {...props} />)
    })
    const tab = container.querySelector("button")
    if (!tab) throw new Error("Tab did not render a button element.")
    return tab
  }

  it("renders a button that is inactive and unmodified by default", async () => {
    const tab = await renderTab({ children: "Main", onClick: () => {} })
    expect(tab.getAttribute("type")).toBe("button")
    expect(tab.getAttribute("class")).not.toContain("active")
    expect(tab.getAttribute("class")).not.toContain("modified")
  })

  it("exposes active and modified state for application styling", async () => {
    const tab = await renderTab({ children: "Skills", active: true, modified: true, onClick: () => {} })
    expect(tab.getAttribute("class")).toContain("active")
    expect(tab.getAttribute("class")).toContain("modified")
  })

  it("keeps application tone classes and reports selection", async () => {
    const onClick = vi.fn<() => void>()
    const tab = await renderTab({ children: "Mystic", className: "category-tab", onClick })
    expect(tab.getAttribute("class")).toContain("category-tab")
    await act(async () => {
      tab.click()
    })
    expect(onClick).toHaveBeenCalledTimes(1)
  })
})
