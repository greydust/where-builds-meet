// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Tooltip } from "../../src/ui/Tooltip"

describe("Tooltip", () => {
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

  it("renders the trigger with a labeled tooltip box", async () => {
    await act(async () => {
      root.render(<Tooltip content="details">42</Tooltip>)
    })
    const box = container.querySelector('[role="tooltip"]')
    expect(box?.textContent).toBe("details")
    expect(container.textContent).toContain("42")
  })

  it("aligns the box to the end on request and keeps tone classes", async () => {
    await act(async () => {
      root.render(
        <Tooltip content="details" align="end" className="effect-plate-tooltip">
          42
        </Tooltip>,
      )
    })
    const box = container.querySelector('[role="tooltip"]')
    expect(box?.getAttribute("class")).toContain("effect-plate-tooltip")
  })
})
