// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it } from "vitest"

import { Chip } from "../../src/ui/Chip"

describe("Chip", () => {
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

  it("renders a span that keeps application tone classes", async () => {
    await act(async () => {
      root.render(<Chip className="effect-plate-dot">12</Chip>)
    })
    const chip = container.querySelector("span")
    expect(chip?.textContent).toBe("12")
    expect(chip?.getAttribute("class")).toContain("effect-plate-dot")
    expect(chip?.getAttribute("class")).not.toBe("effect-plate-dot")
  })

  it("renders toneless content and forwards extra props", async () => {
    await act(async () => {
      root.render(<Chip title="stacks">3</Chip>)
    })
    const chip = container.querySelector("span")
    expect(chip?.getAttribute("title")).toBe("stacks")
  })
})
