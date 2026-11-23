import { expect, it } from "vitest"

import type { ItemSuggestion, SuggestionOption } from "@/calculations/buildSuggestions"
import { annotateSuggestionGains } from "@/calculations/suggestionGains"
import type { GearItem } from "@/gear"

const gear = (id: string): GearItem => ({
  id,
  definitionId: "helmet",
  level: 100,
  rarity: "Gold",
  baseAffix: { key: "maxHp", value: 1 },
  additionalAffixes: [{ key: "power", value: 1 }],
})
const has = (items: GearItem[], id: string) => items.find(item => item.id === id)!.additionalAffixes[0].key === "crit"
const option = (id: string, gain: number): SuggestionOption => ({
  itemId: id,
  position: 1,
  action: "newItem",
  from: "power",
  to: "crit",
  value: 0.09776,
  gain,
  replacement: { ...gear(id), additionalAffixes: [{ key: "crit", value: 0.09776 }] },
  changes: [],
  additions: [{ key: "crit", count: 1 }],
})
const row = (id: string, gain: number): ItemSuggestion => ({ itemId: id, position: 1, options: [option(id, gain)] })
const step = (measure: (items: GearItem[]) => number) => (before: GearItem[], after: GearItem[]) =>
  measure(after) >= measure(before) * 1.003

it("shows the threshold contribution for either eligible location and measures combined gain directly", () => {
  const original = [gear("a"), gear("b"), gear("alternative")]
  const items = [row("a", 0.1), row("b", 40 / 110), row("alternative", 0.1)]
  const measure = (gear: GearItem[]) =>
    [100, 110, 150][gear.filter(item => item.additionalAffixes[0].key === "crit").length]
  const combined = annotateSuggestionGains({
    original,
    items,
    order: ["a", "b"],
    measure,
    canApply: step(measure),
    compatibleAlternative: (_option, applied) => applied.length < 2,
  })
  expect(combined).toBeCloseTo(0.5, 12)
  for (const item of items) {
    expect(item.options[0].gainRange!.min).toBeCloseTo(0.1, 12)
    expect(item.options[0].gainRange!.max).toBeCloseTo(40 / 110, 12)
  }
  expect(combined).not.toBeCloseTo(items[0].options[0].gain + items[1].options[0].gain, 6)
})

it("does not include unsafe or sub-threshold orders in the range", () => {
  const original = [gear("a"), gear("b")]
  const items = [row("a", 0.1), row("b", 40 / 110)]
  const measure = (gear: GearItem[]) => (has(gear, "a") ? (has(gear, "b") ? 150 : 110) : has(gear, "b") ? 100.1 : 100)
  annotateSuggestionGains({
    original,
    items,
    order: ["a", "b"],
    measure,
    canApply: (before, after, change) => step(measure)(before, after) && (change.itemId !== "b" || has(before, "a")),
    compatibleAlternative: () => true,
  })
  expect(items[0].options[0].gainRange).toEqual({ min: 0.1, max: 0.1 })
  expect(items[1].options[0].gainRange).toEqual({ min: 40 / 110, max: 40 / 110 })
})

it("excludes reachable dead-end prefixes that cannot finish the plan", () => {
  const original = [gear("a"), gear("b"), gear("c")]
  const items = [row("a", 0.1), row("b", 20 / 110), row("c", 50 / 130)]
  const measure = (gear: GearItem[]) =>
    100 + (has(gear, "a") ? 10 : 0) + (has(gear, "b") ? 20 : 0) + (has(gear, "c") ? 50 : 0)
  annotateSuggestionGains({
    original,
    items,
    order: ["a", "b", "c"],
    measure,
    canApply: (before, after) => !has(before, "c") && step(measure)(before, after),
    compatibleAlternative: () => true,
  })
  expect(items[2].options[0].gainRange!.min).toBeCloseTo(50 / 130, 12)
  expect(items[2].options[0].gainRange!.max).toBeCloseTo(50 / 130, 12)
})

it("keeps a cheaper partial alternative out of the combined primary-plan gain", () => {
  const original = [gear("a"), gear("b")]
  const items = [row("a", 0.1), row("b", 45 / 110)]
  items[1].options[0].replacement!.additionalAffixes.push({ key: "minPhys", value: 85 })
  const retune: SuggestionOption = { ...option("b", 40 / 110), action: "retune", replacement: undefined }
  items[1].retuneAlternative = { position: 1, options: [retune] }
  const measure = (gear: GearItem[]) => {
    const critical = gear.filter(item => item.additionalAffixes[0].key === "crit").length
    return [100, 110, 150][critical] + (gear[1].additionalAffixes.some(affix => affix.key === "minPhys") ? 5 : 0)
  }
  const combined = annotateSuggestionGains({
    original,
    items,
    order: ["a", "b"],
    measure,
    canApply: step(measure),
    compatibleAlternative: () => true,
  })
  expect(combined).toBeCloseTo(0.55, 12)
  expect(retune.gainRange!.min).toBeCloseTo(0.1, 12)
  expect(retune.gainRange!.max).toBeCloseTo(40 / 110, 12)
})
