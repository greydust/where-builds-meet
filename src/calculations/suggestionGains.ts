import type { GearItem } from "@/gear"

import type { ItemSuggestion, SuggestionOption } from "./buildSuggestions"
import { applySuggestion } from "./suggestionActions"

/** Exact marginal ranges over the subset graph, rather than enumerating n! orders. */
export function annotateSuggestionGains(input: {
  original: GearItem[]
  items: ItemSuggestion[]
  order: string[]
  measure: (items: GearItem[]) => number
  canApply: (before: GearItem[], after: GearItem[], option: SuggestionOption) => boolean
  compatibleAlternative: (option: SuggestionOption, applied: string[], before: GearItem[]) => boolean
}) {
  const primary = input.order.map(id => input.items.find(item => item.itemId === id)!.options[0])
  const full = (1 << primary.length) - 1
  const states = new Map<number, GearItem[]>([[0, input.original]])
  const stateFor = (mask: number): GearItem[] => {
    const cached = states.get(mask)
    if (cached) return cached
    const bit = mask & -mask
    const index = Math.log2(bit)
    const result = applySuggestion(stateFor(mask ^ bit), primary[index])
    states.set(mask, result)
    return result
  }
  const marginal = (before: GearItem[], after: GearItem[]) =>
    (input.measure(after) - input.measure(before)) / input.measure(before)
  const addRange = (option: SuggestionOption, gain: number) => {
    const range = option.gainRange
    option.gainRange = range
      ? { min: Math.min(range.min, gain), max: Math.max(range.max, gain) }
      : { min: gain, max: gain }
  }
  const reachable = new Set([0])
  const edges = new Map<number, Array<{ next: number; index: number; gain: number }>>()
  for (let mask = 0; mask <= full; mask += 1) {
    if (!reachable.has(mask)) continue
    const before = stateFor(mask)
    const outgoing: Array<{ next: number; index: number; gain: number }> = []
    for (let index = 0; index < primary.length; index += 1) {
      const bit = 1 << index
      if (mask & bit) continue
      const next = mask | bit
      const after = stateFor(next)
      if (!input.canApply(before, after, primary[index])) continue
      reachable.add(next)
      outgoing.push({ next, index, gain: marginal(before, after) })
    }
    edges.set(mask, outgoing)
  }
  if (!reachable.has(full)) throw new Error("Suggested plan has no valid application order")
  // Exclude reachable dead ends: every primary bound belongs to a complete,
  // safe, qualifying order of the same numbered plan.
  const canFinish = new Set([full])
  for (let mask = full - 1; mask >= 0; mask -= 1) {
    for (const edge of edges.get(mask) ?? []) {
      if (!canFinish.has(edge.next)) continue
      canFinish.add(mask)
      addRange(primary[edge.index], edge.gain)
    }
  }
  for (const item of input.items) {
    const index = input.order.indexOf(item.itemId)
    const options = index < 0 ? item.options : []
    for (const option of [...options, ...(item.retuneAlternative?.options ?? [])]) {
      for (const mask of canFinish) {
        if (index >= 0 && mask & (1 << index)) continue
        const before = stateFor(mask)
        const after = applySuggestion(before, option)
        if (!input.canApply(before, after, option)) continue
        const applied = input.order.filter((_id, index) => mask & (1 << index))
        if (!input.compatibleAlternative(option, applied, before)) continue
        addRange(option, marginal(before, after))
      }
      // The originally offered context is always a valid marginal comparison
      // for a partial alternative; choosing it invalidates the remainder of the plan.
      addRange(option, option.gain)
    }
  }
  return marginal(input.original, stateFor(full))
}
