// @vitest-environment jsdom
import { act } from "react"
import { createRoot } from "react-dom/client"
import { expect, it, vi } from "vitest"

import { GlobalBuffOption } from "@/features/character/GlobalBuffOption"

globalThis.IS_REACT_ACT_ENVIRONMENT = true

it("explains averaged Deluge on hover and preserves option selection", async () => {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  const select = vi.fn<() => void>()
  try {
    await act(async () =>
      root.render(<GlobalBuffOption buff="floatingGrace" value="deluge" label="Deluge" onClick={select} />),
    )
    const button = host.querySelector("button")!
    await act(async () => button.dispatchEvent(new Event("pointerover", { bubbles: true })))
    const content = document.body.querySelector('[role="tooltip"]')?.textContent
    expect(content).toContain("12 seconds every 30 seconds")
    expect(content).toContain("9.6%")
    expect(content).toContain("Increases damage dealt by 24% while active.")
    expect(content).toContain("Assuming 40% uptime")
    expect(document.body.querySelectorAll('[role="tooltip"] br')).toHaveLength(2)
    await act(async () => button.click())
    expect(select).toHaveBeenCalledOnce()
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("explains disabled external effects when an option receives keyboard focus", async () => {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<GlobalBuffOption buff="floatingGrace" value="none" label="None" />))
    await act(async () => host.querySelector("button")!.focus())
    expect(document.body.querySelector('[role="tooltip"]')?.textContent).toContain(
      "Effects applied by the rotation still work",
    )
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})

it("shows the full Mixed buff separately from its averaged contribution", async () => {
  const host = document.createElement("div")
  document.body.appendChild(host)
  const root = createRoot(host)
  try {
    await act(async () => root.render(<GlobalBuffOption buff="floatingGrace" value="mixed" label="Mixed" />))
    await act(async () => host.querySelector("button")!.focus())
    const content = document.body.querySelector('[role="tooltip"]')?.textContent
    expect(content).toContain("10% while active")
    expect(content).toContain("Assuming 40% uptime")
    expect(content).toContain("Adds 4% damage bonus")
  } finally {
    await act(async () => root.unmount())
    host.remove()
  }
})
