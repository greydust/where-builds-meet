import { expect, it } from "vitest"

import { applySuggestion, fullItemCandidates, planBuildSuggestions } from "@/calculations/buildSuggestions"
import { suggestionAffixCounts, suggestionAffixKey } from "@/calculations/suggestionAffixes"
import { maxGearRoll, buildPresetInventory, defaultBuildPresets, type GearItem, type GearLevel } from "@/gear"
import { legalAdditionalAffixes, retuneCandidates } from "@/gearRetuning"

const roll = (key: string) => ({ key, value: maxGearRoll(key, "affix", true, 100)! })
const make = (id: string, definitionId: string, keys: string[]): GearItem => ({
  id,
  definitionId,
  level: 100,
  rarity: "Gold",
  relayed: true,
  baseAffix: roll(keys[0]),
  additionalAffixes: keys.slice(1).map(roll),
})
const keyFor = suggestionAffixKey(["snowparting", "phalanxbane"])
const counts = (gear: readonly GearItem[]) => suggestionAffixCounts(gear, keyFor)
const distance = (left: ReadonlyMap<string, number>, right: ReadonlyMap<string, number>) =>
  [...new Set([...left.keys(), ...right.keys()])].reduce(
    (sum, key) => sum + Math.abs((left.get(key) ?? 0) - (right.get(key) ?? 0)),
    0,
  )

it("replays varied plans without losing needed copies, inventing quotas, or misreporting measured gains", () => {
  const goal = [
    make("a", "hengBlade", ["minPhys", "minPhys", "agility", "crit", "maxStonesplit"]),
    make("b", "moBlade", ["minPhys", "minPhys", "agility", "precision", "maxStonesplit"]),
    make("c", "bracer", ["crit", "minPhys", "agility", "precision", "vsBossDmg"]),
  ]
  const targets = counts(goal)
  const domains = goal.map(item => Array.from(fullItemCandidates(item, targets, [], keyFor)))
  for (let seed = 1; seed <= 80; seed += 1) {
    let state = seed
    const pick = (size: number) => {
      state = (Math.imul(state, 1664525) + 1013904223) >>> 0
      return state % size
    }
    const original = domains.map(domain => structuredClone(domain[pick(domain.length)]))
    for (const item of original) {
      for (let attempt = 0; attempt < 2; attempt += 1) {
        const index = pick(4)
        const changed = item.additionalAffixes.map((affix, position) =>
          position === index ? roll(["power", "minBellstrike", "maxPhys"][pick(3)]) : affix,
        )
        if (legalAdditionalAffixes(changed.map(affix => affix.key))) item.additionalAffixes = changed
      }
      item.relayed = pick(2) === 1
      item.turnedAffixIndex = item.relayed ? undefined : pick(4)
    }
    const weights = new Map([...targets.keys()].map(key => [key, 1 + pick(20)]))
    const measure = (gear: GearItem[]) =>
      1000 +
      gear.reduce(
        (sum, item, index) =>
          sum +
          [...counts([item])].reduce(
            (subtotal, [key, count]) => subtotal + count * (weights.get(key) ?? 0) * (index + 1),
            0,
          ),
        0,
      )
    const snapshot = structuredClone(original)
    const result = planBuildSuggestions({
      items: original,
      targetCounts: targets,
      pathId: "stonesplitStrength",
      measure,
    })
    expect(counts(result.completion!)).toEqual(targets)
    let current = original
    const checkOption = (context: GearItem[], option: (typeof result.items)[number]["options"][number]) => {
      const next = applySuggestion(context, option)
      const beforeCounts = counts(context)
      const afterCounts = counts(next)
      expect(option.gain).toBeCloseTo((measure(next) - measure(context)) / measure(context), 12)
      expect(option.gain).toBeGreaterThanOrEqual(0.003)
      expect(distance(afterCounts, targets)).toBeLessThanOrEqual(distance(beforeCounts, targets))
      const localBefore = counts(context.filter(item => item.id === option.itemId))
      const localAfter = counts(next.filter(item => item.id === option.itemId))
      expect(new Map(option.additions.map(row => [row.key, row.count]))).toEqual(
        new Map(
          [...localAfter].flatMap(([key, count]) =>
            count > (localBefore.get(key) ?? 0) ? [[key, count - (localBefore.get(key) ?? 0)]] : [],
          ),
        ),
      )
      const item = context.find(item => item.id === option.itemId)!
      const legalRetune =
        option.action !== "retune" ||
        retuneCandidates(item, "stonesplitStrength").some(
          candidate => candidate.index + 1 === option.position && candidate.key === option.to,
        )
      expect(legalRetune).toBe(true)
      expect(
        option.action !== "retune" ||
          next.find(item => item.id === option.itemId)!.turnedAffixIndex === option.position - 1,
      ).toBe(true)
      return next
    }
    for (const id of result.order!) {
      const row = result.items.find(row => row.itemId === id)!
      for (const option of row.retuneAlternative?.options ?? []) checkOption(current, option)
      current = checkOption(current, row.options[0])
    }
    const final = counts(current)
    const initial = counts(original)
    for (const [key, target] of targets) {
      const floor = Math.min(initial.get(key) ?? 0, target)
      expect({ seed, key, kept: final.get(key) ?? 0 }).toEqual({
        seed,
        key,
        kept: Math.max(floor, final.get(key) ?? 0),
      })
    }
    expect(new Map(result.targets.map(row => [row.key, row.count]))).toEqual(
      new Map(
        [...targets].flatMap(([key, target]) => {
          const gain = Math.min(final.get(key) ?? 0, target) - Math.min(initial.get(key) ?? 0, target)
          return gain > 0 ? [[key, gain]] : []
        }),
      ),
    )
    for (const row of result.items.filter(row => !result.order!.includes(row.itemId))) {
      for (const option of [...row.options, ...(row.retuneAlternative?.options ?? [])]) {
        const next = checkOption(original, option)
        for (const [key, target] of targets) {
          expect(counts(next).get(key) ?? 0).toBeGreaterThanOrEqual(Math.min(initial.get(key) ?? 0, target))
          const filled = Math.min(counts(next).get(key) ?? 0, target) - Math.min(initial.get(key) ?? 0, target)
          expect(filled).toBeLessThanOrEqual(result.targets.find(row => row.key === key)?.count ?? 0)
        }
      }
    }
    expect(original).toEqual(snapshot)
  }
})

it("preserves needed copies when replaying damaged legal Default presets across supported gear tiers", () => {
  let checked = 0
  for (const tier of [91, 96, 100, 105, 110, 115] as GearLevel[]) {
    for (const preset of defaultBuildPresets.filter(preset => !preset.test && preset.gearByTier[String(tier)])) {
      const goal = buildPresetInventory(preset, tier).items
      if (!goal.every(item => legalAdditionalAffixes(item.additionalAffixes.map(affix => affix.key)))) continue
      const normalize = suggestionAffixKey(preset.martialArts)
      const target = suggestionAffixCounts(goal, normalize)
      const original = structuredClone(goal)
      const first = original[0]
      const damaged = first.additionalAffixes.map((affix, index) => (index === 0 ? { key: "body", value: 1 } : affix))
      if (!legalAdditionalAffixes(damaged.map(affix => affix.key))) continue
      first.additionalAffixes = damaged
      const measure = (items: GearItem[]) =>
        100 +
        [...suggestionAffixCounts(items, normalize)].reduce(
          (sum, [key, count]) => sum + count * (target.has(key) ? 2 : 0),
          0,
        )
      const result = planBuildSuggestions({
        items: original,
        targetCounts: target,
        pathId: "mixed",
        weapons: preset.martialArts,
        measure,
      })
      expect(suggestionAffixCounts(result.completion!, normalize)).toEqual(target)
      let actual = original
      for (const id of result.order!) {
        const row = result.items.find(row => row.itemId === id)!
        const baseline = measure(actual)
        const next = applySuggestion(actual, row.options[0])
        expect(row.options[0].gain).toBeCloseTo((measure(next) - baseline) / baseline, 12)
        expect(distance(suggestionAffixCounts(next, normalize), target)).toBeLessThanOrEqual(
          distance(suggestionAffixCounts(actual, normalize), target),
        )
        actual = next
      }
      const final = suggestionAffixCounts(actual, normalize)
      const before = suggestionAffixCounts(original, normalize)
      for (const [key, count] of target)
        expect(final.get(key) ?? 0).toBeGreaterThanOrEqual(Math.min(before.get(key) ?? 0, count))
      checked += 1
    }
  }
  expect(checked).toBeGreaterThan(20)
})
