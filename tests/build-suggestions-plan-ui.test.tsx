// @vitest-environment jsdom
import { act, createElement } from "react"
import { createRoot } from "react-dom/client"
import { renderToStaticMarkup } from "react-dom/server"
import { afterAll, beforeAll, expect, it, vi } from "vitest"

import { planBuildSuggestions } from "@/calculations/buildSuggestions"
import { GearCard } from "@/features/build/GearCard"
import { BuildSuggestionSummary } from "@/features/build/OptimizationSuggestion"
import { buildPresetInventory, defaultBuildPresets, gearData, type GearItem } from "@/gear"
import { gameText, initializeI18n } from "@/i18n"

import english from "../public/locales/en.json"

beforeAll(async () => {
  vi.stubGlobal("fetch", async (url: string) => ({
    ok: true,
    status: 200,
    json: async () => (url.endsWith("manifest.json") ? { default: "en", locales: ["en"] } : english),
    text: async () => "{}",
  }))
  await initializeI18n()
})
afterAll(() => vi.unstubAllGlobals())

it("shows canonical action order even when gear-grid order differs, and numbers the corresponding affix hints", async () => {
  const preset = defaultBuildPresets.find(preset => preset.id === "mixed-fully-relayed-min")!
  const inventory = buildPresetInventory(preset, 100)
  const original = inventory.items.slice(0, 2)
  const target = new Map<string, number>()
  for (const item of original)
    for (const affix of [item.baseAffix, ...item.additionalAffixes])
      target.set(affix.key, (target.get(affix.key) ?? 0) + 1)
  original[0].additionalAffixes[0] = { key: "power", value: 1 }
  original[1].additionalAffixes[0] = { key: "momentum", value: 1 }
  const count = (gear: GearItem[], key: string) =>
    gear.reduce(
      (sum, item) => sum + [item.baseAffix, ...item.additionalAffixes].filter(affix => affix.key === key).length,
      0,
    )
  const plan = planBuildSuggestions({
    items: original,
    targetCounts: target,
    pathId: "stonesplitStrength",
    measure: gear => 100 + count(gear, "minPhys") * 5,
  })
  const result = { presetId: preset.id, ...plan, combinedGain: 0.0982 }
  result.items[0].options[0].gainRange = { min: 0.0181, max: 0.0549 }
  result.items[1].options[0].gainRange = { min: 0.041, max: 0.041 }
  // Display order must come from the planner, not the gear-grid array.
  result.order = [...result.order!].reverse()
  const summary = document.createElement("div")
  summary.innerHTML = renderToStaticMarkup(createElement(BuildSuggestionSummary, { result }))
  expect(summary.textContent).toContain("Combined numbered plan: +9.82% DPS.")
  expect(summary.textContent).toContain("+1.81–5.49% DPS")
  expect(summary.textContent).toContain("+4.10% DPS")
  expect(summary.textContent).not.toContain("4.10–4.10")
  const rows = [...summary.querySelectorAll("[data-suggestion-step]")]
  expect(rows).toHaveLength(result.order.length)
  for (const [index, id] of result.order.entries()) {
    const item = result.completion!.find(item => item.id === id)!
    expect(rows[index].textContent).toContain(`${index + 1}. ${gameText(gearData.gear[item.definitionId].name)}`)
  }
  const item = original.find(item => item.id === result.order![0])!
  const suggestion = result.items.find(row => row.itemId === item.id)!
  globalThis.IS_REACT_ACT_ENVIRONMENT = true
  const card = document.createElement("div")
  document.body.appendChild(card)
  const root = createRoot(card)
  try {
    await act(async () =>
      root.render(
        createElement(GearCard, {
          item,
          name: "Gear",
          suggestion: { ...suggestion, targets: result.targets, alternatives: new Map(), step: 1 },
        }),
      ),
    )
    const anchor = card.querySelector<HTMLElement>('.gear-attribute[tabindex="0"]')!
    expect(anchor).not.toBeNull()
    await act(async () => anchor.focus())
    const tooltip = document.querySelector('[role="tooltip"]')!
    expect(tooltip.querySelector("strong")?.textContent).toBe("1.")
  } finally {
    await act(async () => root.unmount())
    card.remove()
  }
})
