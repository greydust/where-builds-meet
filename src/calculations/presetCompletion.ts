import type { GearItem } from "@/gear"

import { suggestionAffixCounts } from "./suggestionAffixes"

/** Exact affix-count allocation over legal whole-item recipes, independent of DPS. */
export function createPresetCompletion(
  domains: GearItem[][],
  targets: ReadonlyMap<string, number>,
  keyFor: (key: string) => string = key => key,
) {
  const keys = [...targets.keys()]
  const required = keys.map(key => targets.get(key)!)
  const vector = (item: GearItem) => {
    const counts = suggestionAffixCounts([item], keyFor)
    return keys.map(key => counts.get(key) ?? 0)
  }
  const recipes = domains.map(domain => domain.map(item => ({ item, counts: vector(item) })))
  const memo = new Map<string, GearItem[] | null>()
  const search = (mask: number, remaining: number[]): GearItem[] | null => {
    if (remaining.some(count => count < 0)) return null
    if (!mask) return remaining.every(count => count === 0) ? [] : null
    const cacheKey = `${mask}:${remaining.join(",")}`
    if (memo.has(cacheKey)) return memo.get(cacheKey)!
    let next = -1
    let choices: (typeof recipes)[number] = []
    const minimum = keys.map(() => 0)
    const maximum = keys.map(() => 0)
    for (let index = 0; index < recipes.length; index += 1) {
      if (!(mask & (1 << index))) continue
      const fitting = recipes[index].filter(recipe => recipe.counts.every((count, key) => count <= remaining[key]))
      if (!fitting.length) {
        memo.set(cacheKey, null)
        return null
      }
      if (next < 0 || fitting.length < choices.length) {
        next = index
        choices = fitting
      }
      for (let key = 0; key < keys.length; key += 1) {
        minimum[key] += Math.min(...fitting.map(recipe => recipe.counts[key]))
        maximum[key] += Math.max(...fitting.map(recipe => recipe.counts[key]))
      }
    }
    if (remaining.some((count, key) => count < minimum[key] || count > maximum[key])) {
      memo.set(cacheKey, null)
      return null
    }
    for (const recipe of choices) {
      const tail = search(
        mask & ~(1 << next),
        remaining.map((count, key) => count - recipe.counts[key]),
      )
      if (tail) {
        const result = [recipe.item, ...tail]
        memo.set(cacheKey, result)
        return result
      }
    }
    memo.set(cacheKey, null)
    return null
  }
  return (fixed: readonly GearItem[] = []): GearItem[] | undefined => {
    if (required.reduce((sum, count) => sum + count, 0) !== domains.length * 5) return undefined
    let mask = (1 << domains.length) - 1
    let remaining = required
    for (const item of fixed) {
      const index = domains.findIndex(domain => domain[0]?.id === item.id)
      if (index < 0 || !(mask & (1 << index))) return undefined
      mask &= ~(1 << index)
      const counts = vector(item)
      remaining = remaining.map((count, key) => count - counts[key])
    }
    const tail = search(mask, remaining)
    if (!tail) return undefined
    const result = new Map([...fixed, ...tail].map(item => [item.id, item]))
    return domains.map(domain => result.get(domain[0].id)!)
  }
}
