// @vitest-environment jsdom
import { act } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { emptyStats } from "../src/data/statDefinitions"
import { CalculatedStatField } from "../src/features/character/CalculatedStatField"
import { StatPair } from "../src/features/character/StatPair"

const minPhysical = { key: "minPhys", label: "Min Physical Attack" } as const
const maxPhysical = { key: "maxPhys", label: "Max Physical Attack" } as const

const sharedProps = {
  stats: emptyStats,
  statOverrides: {},
  onStatChange: vi.fn<(key: keyof typeof emptyStats, value: number) => void>(),
  onStatReset: vi.fn<(key: keyof typeof emptyStats) => void>(),
}

describe("StatPair", () => {
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
  })

  it("renders both stat fields and their derived values as a pair", async () => {
    await act(async () => {
      root.render(
        <StatPair>
          <CalculatedStatField
            {...sharedProps}
            definition={minPhysical}
            derivedLabel="Eff. Min Physical ATK"
            derivedValue={120}
          />
          <CalculatedStatField
            {...sharedProps}
            definition={maxPhysical}
            derivedLabel="Eff. Max Physical ATK"
            derivedValue={220}
          />
        </StatPair>,
      )
    })

    const row = container.querySelector<HTMLElement>(".stat-row")
    expect(row).not.toBeNull()
    expect(row?.querySelectorAll("label.field")).toHaveLength(2)
    expect([...row!.querySelectorAll<HTMLElement>(".inline-derived-value")].map(node => node.textContent)).toEqual([
      "120",
      "220",
    ])
  })

  it("keeps the second grid slot available for a single stat", async () => {
    await act(async () => {
      root.render(
        <StatPair>
          <CalculatedStatField {...sharedProps} definition={minPhysical} />
        </StatPair>,
      )
    })

    const row = container.querySelector<HTMLElement>(".stat-row")
    expect(row?.querySelectorAll("label.field")).toHaveLength(1)
    expect(row?.children).toHaveLength(2)
    expect(row?.children[1].getAttribute("aria-hidden")).toBe("true")
  })
})
