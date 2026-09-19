// @vitest-environment jsdom
import { act, type ChangeEvent } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { Checkbox } from "../../src/ui/Checkbox"
import { Select } from "../../src/ui/Select"

describe("Select", () => {
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

  it("renders options and reports selection", async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLSelectElement>) => void>()
    await act(async () => {
      root.render(
        <Select aria-label="level" value="96" onChange={onChange}>
          <option value="96">96</option>
          <option value="91">91</option>
        </Select>,
      )
    })
    const select = container.querySelector("select")
    if (!select) throw new Error("Select did not render a select element.")
    expect(select.getAttribute("aria-label")).toBe("level")
    expect(select.querySelectorAll("option")).toHaveLength(2)
    await act(async () => {
      select.value = "91"
      select.dispatchEvent(new Event("change", { bubbles: true }))
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})

describe("Checkbox", () => {
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

  it("renders a checkbox and reports toggles", async () => {
    const onChange = vi.fn<(event: ChangeEvent<HTMLInputElement>) => void>()
    await act(async () => {
      root.render(<Checkbox checked={false} onChange={onChange} aria-label="relayed" />)
    })
    const checkbox = container.querySelector('input[type="checkbox"]')
    if (!(checkbox instanceof HTMLInputElement)) throw new Error("Checkbox did not render.")
    expect(checkbox.getAttribute("aria-label")).toBe("relayed")
    expect(checkbox.checked).toBe(false)
    await act(async () => {
      checkbox.click()
    })
    expect(onChange).toHaveBeenCalledTimes(1)
  })
})
