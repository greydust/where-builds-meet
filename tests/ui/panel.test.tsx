// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Panel, PanelHeading } from "../../src/ui/Panel"

describe("Panel", () => {
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

  it("renders a section that keeps application modifier classes", async () => {
    await act(async () => {
      root.render(
        <Panel className="settings-panel">
          <span>body</span>
        </Panel>,
      )
    })
    const panel = container.querySelector("section")
    expect(panel?.textContent).toBe("body")
    expect(panel?.getAttribute("class")).toContain("settings-panel")
    expect(panel?.getAttribute("class")).not.toBe("settings-panel")
  })

  it("renders without modifiers and forwards extra props", async () => {
    await act(async () => {
      root.render(
        <Panel aria-label="stats" data-testid="stats-panel">
          <span>body</span>
        </Panel>,
      )
    })
    const panel = container.querySelector("section")
    expect(panel?.getAttribute("aria-label")).toBe("stats")
    expect(panel?.getAttribute("data-testid")).toBe("stats-panel")
  })

  it("renders headings as plain divs", async () => {
    await act(async () => {
      root.render(
        <Panel>
          <PanelHeading>
            <h2>title</h2>
          </PanelHeading>
        </Panel>,
      )
    })
    const heading = container.querySelector("section > div")
    expect(heading?.querySelector("h2")?.textContent).toBe("title")
  })
})
