import internalSettings from "@gamedata/internal-settings.json"

import { typedPathDefinitions } from "@/application/gameData/paths"
import { breakthroughProfile } from "@/application/gameData/setup"
import {
  affixOptionsForGearDefinition,
  buildPresetInventory,
  defaultBuildPresets,
  gearData,
  gearSlots,
  maxGearRoll,
  resolveBuildInventory,
  sameWeaponPair,
  type BuildPreset,
  type GearItem,
  type GearLevel,
} from "@/gear"
import { legalAdditionalAffixes, retuneCandidates } from "@/gearRetuning"
import type { WeaponId } from "@/types"

import { createGearCandidateEvaluator } from "./gearCandidateEvaluator"
import type { GearSearchInput } from "./gearOptimization"
import { createPresetCompletion } from "./presetCompletion"
import { buildMeasurement } from "./rotationCalculationBundle"
import { applySuggestion } from "./suggestionActions"
import { suggestionAffixCounts, suggestionAffixKey } from "./suggestionAffixes"
import { annotateSuggestionGains } from "./suggestionGains"

export { applySuggestion } from "./suggestionActions"

export type AffixReplacement = {
  itemId: string
  /** Zero is the base affix; additional rows start at one. */
  position: number
  from: string
  to: string
  value: number
  action: "retune" | "newItem"
}
export type AffixCount = { key: string; count: number }
export type SuggestionOption = AffixReplacement & {
  gain: number
  /** Marginal gain across compatible earlier changes, stored as ratios. */
  gainRange?: { min: number; max: number }
  /** A new-item outcome replaces every affix at once. Retunes omit this. */
  replacement?: GearItem
  changes: AffixReplacement[]
  /** Net positive counts after removing the old item's affixes. */
  additions: AffixCount[]
}
export type ItemSuggestion = {
  itemId: string
  position: number
  options: SuggestionOption[]
  /** A cheaper choice for the same physical item, never a second planned change. */
  retuneAlternative?: { position: number; options: SuggestionOption[] }
}
export type BuildSuggestionResult = {
  presetId?: string
  targets: Array<{ key: string; count: number }>
  items: ItemSuggestion[]
  /** One legal completed allocation supporting the canonical suggestions. */
  completion?: GearItem[]
  /** Canonical actions are measured in this order; other items are alternative locations. */
  order?: string[]
  /** Actual primary actions only, measured from the unchanged original build. */
  combinedGain?: number
}

const countsFor = suggestionAffixCounts

/** Affix locations are interchangeable; count distance does not compare preset slot layouts. */
export function closestSuggestionPreset(
  items: readonly GearItem[],
  presets: readonly BuildPreset[],
  tier: GearLevel,
  keyFor: (key: string) => string = key => key,
) {
  const current = countsFor(items, keyFor)
  let closest: { preset: BuildPreset; counts: Map<string, number>; distance: number } | undefined
  for (const preset of presets) {
    if (!preset.gearByTier[String(tier)]) continue
    const counts = countsFor(buildPresetInventory(preset, tier).items, keyFor)
    const distance = [...new Set([...current.keys(), ...counts.keys()])].reduce(
      (sum, key) => sum + Math.abs((current.get(key) ?? 0) - (counts.get(key) ?? 0)),
      0,
    )
    if (!closest || distance < closest.distance) closest = { preset, counts, distance }
  }
  return closest
}

/** Retuning remains a one-row operation using the shared legal outcome pool. */
export function retuneSuggestionCandidates(
  item: GearItem,
  targets: readonly string[],
  pathId: GearSearchInput["context"]["environment"]["pathId"],
  keyFor: (key: string) => string = key => key,
): AffixReplacement[] {
  return retuneCandidates(item, pathId).flatMap(candidate => {
    const value = maxGearRoll(candidate.key, "affix", true, item.level)
    if (!targets.includes(keyFor(candidate.key)) || value === undefined) return []
    return [
      {
        itemId: item.id,
        position: candidate.index + 1,
        from: item.additionalAffixes[candidate.index].key,
        to: candidate.key,
        value,
        action: "retune",
      },
    ]
  })
}

const minimumGain = internalSettings.optimizationSuggestionMinimumGain
const qualifies = (before: number, after: number) => before > 0 && after >= before + before * minimumGain
const gainFor = (before: number, after: number) => (after - before) / before

function positiveCountDifference(
  before: readonly GearItem[],
  after: readonly GearItem[],
  keyFor: (key: string) => string = key => key,
): AffixCount[] {
  const oldCounts = countsFor(before, keyFor)
  return [...countsFor(after, keyFor)].flatMap(([key, count]) =>
    count > (oldCounts.get(key) ?? 0) ? [{ key, count: count - (oldCounts.get(key) ?? 0) }] : [],
  )
}

/** Complete, legal item recipes; base/additional duplicates are permitted, additional duplicates are not. */
export function* fullItemCandidates(
  item: GearItem,
  targetCounts: ReadonlyMap<string, number>,
  otherItems: readonly GearItem[],
  keyFor: (key: string) => string = key => key,
): Generator<GearItem> {
  const definition = gearData.gear[item.definitionId]
  if (!definition) return
  const outside = countsFor(otherItems, keyFor)
  const local = countsFor([item], keyFor)
  // Preserve an existing allocation while other items still oversupply that stat. This
  // permits sequential improvements without requiring simultaneous multi-item rerolls.
  const available = new Map(
    [...targetCounts].map(([key, count]) => [
      key,
      Math.max(0, count - (outside.get(key) ?? 0), Math.min(local.get(key) ?? 0, count)),
    ]),
  )
  const allowed = (category: "baseAffixes" | "additionalAffixes") => {
    const legal = affixOptionsForGearDefinition(definition, category, item.level, true).filter(
      key => (available.get(keyFor(key)) ?? 0) > 0 && maxGearRoll(key, "affix", true, item.level) !== undefined,
    )
    const existing = category === "baseAffixes" ? [item.baseAffix] : item.additionalAffixes
    return [...new Set(legal.map(keyFor))].map(
      key =>
        existing.find(affix => keyFor(affix.key) === key && legal.includes(affix.key))?.key ??
        (legal.includes(key) ? key : legal.find(candidate => keyFor(candidate) === key)!),
    )
  }
  const additionalKeys = allowed("additionalAffixes")
  const roll = (key: string) => ({ key, value: maxGearRoll(key, "affix", true, item.level)! })
  for (const base of allowed("baseAffixes")) {
    const chosen: string[] = []
    function* combinations(start: number): Generator<GearItem> {
      if (chosen.length === 4) {
        // Retain matching rows in place; affix order must not generate duplicate candidates.
        const remaining = new Set(chosen)
        const arranged = item.additionalAffixes
          .slice(0, 4)
          .map(affix => (remaining.delete(affix.key) ? affix.key : undefined))
        while (arranged.length < 4) arranged.push(undefined)
        const unused = [...remaining]
        const { turnedAffixIndex: _turned, ...original } = item
        yield {
          ...original,
          relayed: true,
          baseAffix: roll(base),
          additionalAffixes: arranged.map(key => roll(key ?? unused.shift()!)),
        }
        return
      }
      for (let index = start; index <= additionalKeys.length - (4 - chosen.length); index += 1) {
        const key = additionalKeys[index]
        if (
          (available.get(keyFor(key)) ?? 0) < (keyFor(key) === keyFor(base) ? 2 : 1) ||
          !legalAdditionalAffixes([...chosen, key])
        )
          continue
        chosen.push(key)
        yield* combinations(index + 1)
        chosen.pop()
      }
    }
    yield* combinations(0)
  }
}

function betterOption(left: SuggestionOption | undefined, right: SuggestionOption) {
  if (!left) return right
  if (Math.abs(right.gain - left.gain) > 1e-10) return right.gain > left.gain ? right : left
  if (right.action !== left.action) return right.action === "retune" ? right : left
  return left.position === 0 && right.position > 0 ? right : left
}

type ItemChoices = {
  full?: SuggestionOption
  retune?: SuggestionOption
  completion?: GearItem[]
  completedDps?: number
}

/** Commit only recipes supported by an exact completed preset allocation; retunes are partial alternatives. */
export function planBuildSuggestions(input: {
  items: GearItem[]
  targetCounts: ReadonlyMap<string, number>
  pathId: GearSearchInput["context"]["environment"]["pathId"]
  measure: (items: GearItem[]) => number
  weapons?: WeaponId[]
}): Omit<BuildSuggestionResult, "presetId"> {
  const original = input.items
  const keyFor = suggestionAffixKey(input.weapons ?? typedPathDefinitions[input.pathId].lockedWeapons ?? [])
  const countsFor = (items: readonly GearItem[]) => suggestionAffixCounts(items, keyFor)
  const targetCounts = new Map<string, number>()
  for (const [key, count] of input.targetCounts)
    targetCounts.set(keyFor(key), (targetCounts.get(keyFor(key)) ?? 0) + count)
  const readings = new Map<string, number>()
  const measure = (items: GearItem[]) => {
    const key = JSON.stringify(items)
    const held = readings.get(key)
    if (held !== undefined) return held
    const dps = input.measure(items)
    readings.set(key, dps)
    return dps
  }
  const initialDps = measure(original)
  if (!(initialDps > 0)) return { targets: [], items: [] }
  const distanceTo = (counts: ReadonlyMap<string, number>, target: ReadonlyMap<string, number>) =>
    [...new Set([...counts.keys(), ...target.keys()])].reduce(
      (sum, key) => sum + Math.abs((counts.get(key) ?? 0) - (target.get(key) ?? 0)),
      0,
    )
  const permitsCounts = (
    before: ReadonlyMap<string, number>,
    after: ReadonlyMap<string, number>,
    action: AffixReplacement["action"],
  ) =>
    distanceTo(after, targetCounts) <= distanceTo(before, targetCounts) &&
    [...targetCounts].every(([key, target]) => {
      const floor =
        action === "retune" ? Math.min(before.get(key) ?? 0, target) : (before.get(key) ?? 0) >= target ? target : 0
      return (after.get(key) ?? 0) >= floor
    })
  const domains = original.map(item => {
    const old = [item.baseAffix, ...item.additionalAffixes]
    const edits = (recipe: GearItem) =>
      [recipe.baseAffix, ...recipe.additionalAffixes].filter((affix, position) => affix.key !== old[position]?.key)
        .length
    return [...fullItemCandidates(item, targetCounts, [], keyFor)].sort((left, right) => edits(left) - edits(right))
  })
  const complete = createPresetCompletion(domains, targetCounts, keyFor)
  const initialCompletion = complete()
  if (!initialCompletion) return { targets: [], items: [] }
  let completion = initialCompletion

  const avoidLosses = new Set<string>()
  const originalCounts = countsFor(original)
  const choicesFor = (
    item: GearItem,
    current: GearItem[],
    limits: ReadonlyMap<string, number>,
    fixed: GearItem[] = [],
    standalone = false,
  ): ItemChoices => {
    const before = measure(current)
    const counts = countsFor(current)
    // Partial and standalone changes cannot spend a needed copy elsewhere.
    // Coordinated rerolls additionally validate their actual combined result.
    const preservesProgress = (candidateCounts: ReadonlyMap<string, number>) =>
      [...targetCounts].every(
        ([key, target]) => (candidateCounts.get(key) ?? 0) >= Math.min(counts.get(key) ?? 0, target),
      )
    let full: SuggestionOption | undefined
    let fullDistance = Infinity
    let completedDps = -Infinity
    let supportedCompletion: GearItem[] | undefined
    let retune: SuggestionOption | undefined
    const local = countsFor([item])
    const beforeDistance = distanceTo(counts, targetCounts)
    for (const replacement of fullItemCandidates(item, limits, [], keyFor)) {
      const oldRows = [item.baseAffix, ...item.additionalAffixes]
      const changes = [replacement.baseAffix, ...replacement.additionalAffixes].flatMap(
        (affix, position): AffixReplacement[] => {
          const old = oldRows[position]
          // The complete recipe assumes relayed maxima. A retained affix's value
          // increase is not a reason to reroll that affix (or the whole item).
          if (old && keyFor(old.key) === keyFor(affix.key)) return []
          return [
            { itemId: item.id, position, from: old?.key ?? "", to: affix.key, value: affix.value, action: "newItem" },
          ]
        },
      )
      if (!changes.length) continue
      const replacementCounts = countsFor([replacement])
      // Base/additional placement is interchangeable. Rearranging identical
      // counts only to raise values is a relay improvement, not a reroll goal.
      if (distanceTo(local, replacementCounts) === 0) continue
      if ([...avoidLosses].some(key => (replacementCounts.get(key) ?? 0) < (local.get(key) ?? 0))) continue
      const candidate = current.map(existing => (existing.id === item.id ? replacement : existing))
      const candidateCounts = countsFor(candidate)
      if (!permitsCounts(counts, candidateCounts, "newItem")) continue
      if (standalone && !preservesProgress(candidateCounts)) continue
      if (
        standalone &&
        [...targetCounts].some(
          ([key, target]) => Math.min(candidateCounts.get(key) ?? 0, target) > (limits.get(key) ?? 0),
        )
      )
        continue
      const distance = distanceTo(candidateCounts, targetCounts)
      if (distance > beforeDistance) continue
      const finished = complete([...fixed, replacement])
      if (!finished) continue
      const after = measure(candidate)
      if (!qualifies(before, after)) continue
      const finishedDps = measure(finished)
      const gain = gainFor(before, after)
      if (
        !full ||
        finishedDps > completedDps + 1e-10 ||
        (Math.abs(finishedDps - completedDps) <= 1e-10 &&
          (distance < fullDistance || (distance === fullDistance && gain > full.gain + 1e-10)))
      ) {
        full = {
          ...changes[0],
          changes,
          replacement,
          additions: positiveCountDifference([item], [replacement], keyFor),
          gain,
        }
        fullDistance = distance
        completedDps = finishedDps
        supportedCompletion = finished
      }
    }
    const needed = [...limits].filter(([key, count]) => count > (counts.get(key) ?? 0)).map(([key]) => key)
    const destinationCompletion = supportedCompletion ?? complete(fixed)
    const destination = destinationCompletion?.find(recipe => recipe.id === item.id)
    const destinationCounts = destination ? countsFor([destination]) : new Map<string, number>()
    for (const change of retuneSuggestionCandidates(item, needed, input.pathId, keyFor)) {
      // A cheap partial upgrade must add an affix that this item's completed recipe keeps.
      if (
        !destination?.additionalAffixes.some(affix => keyFor(affix.key) === keyFor(change.to)) ||
        (destinationCounts.get(keyFor(change.to)) ?? 0) <= (local.get(keyFor(change.to)) ?? 0)
      )
        continue
      const candidate = applySuggestion(current, change)
      if (!permitsCounts(counts, countsFor(candidate), "retune")) continue
      // A partial choice must approach this item's recipe, not discard an affix
      // it would have to restore in the eventual full replacement.
      if (
        distanceTo(countsFor(candidate.filter(candidate => candidate.id === item.id)), destinationCounts) >=
        distanceTo(local, destinationCounts)
      )
        continue
      const after = measure(candidate)
      if (!qualifies(before, after)) continue
      retune = betterOption(retune, {
        ...change,
        changes: [change],
        additions: [{ key: keyFor(change.to), count: 1 }],
        gain: gainFor(before, after),
      })
    }
    if (full && retune) {
      const retuned = applySuggestion([item], retune)[0]
      const recipe = full.replacement!
      const actual = countsFor([retuned])
      const planned = countsFor([recipe])
      if (
        keyFor(retuned.baseAffix.key) === keyFor(recipe.baseAffix.key) &&
        actual.size === planned.size &&
        [...actual].every(([key, count]) => planned.get(key) === count)
      )
        full = undefined
    }
    return {
      full,
      retune,
      completion: destinationCompletion,
      completedDps: destinationCompletion ? measure(destinationCompletion) : completedDps,
    }
  }
  const observations = new Map<string, ItemChoices>()
  const selected = new Map<string, ItemChoices>()
  const fixed: GearItem[] = []
  let current = original
  // A hypothetical completion may require unshown actions below the gain
  // threshold. Validate the actually selected result, then replan while retaining
  // any needed stat that was lost. Each retry protects at least one new stat.
  while (true) {
    selected.clear()
    observations.clear()
    fixed.length = 0
    current = original
    completion = initialCompletion
    while (selected.size < original.length) {
      let best: SuggestionOption | undefined
      let bestChoices: ItemChoices | undefined
      for (const item of current) {
        if (selected.has(item.id)) continue
        const choices = choicesFor(item, current, targetCounts, fixed)
        if (!observations.has(item.id)) observations.set(item.id, choices)
        const candidate = choices.full ?? choices.retune
        if (
          candidate &&
          (!best ||
            (choices.completedDps ?? -Infinity) > (bestChoices?.completedDps ?? -Infinity) + 1e-10 ||
            (choices.completedDps === bestChoices?.completedDps && betterOption(best, candidate) === candidate))
        ) {
          best = candidate
          bestChoices = choices
        }
      }
      if (!best || !bestChoices) break
      selected.set(best.itemId, bestChoices)
      if (bestChoices.completion) completion = bestChoices.completion
      const plannedItem = completion.find(item => item.id === best!.itemId)!
      fixed.push(plannedItem)
      current = applySuggestion(current, best)
    }
    const actual = countsFor(current)
    const lost = [...targetCounts].filter(
      ([key, target]) => (actual.get(key) ?? 0) < Math.min(originalCounts.get(key) ?? 0, target),
    )
    if (!lost.length) break
    for (const [key] of lost) avoidLosses.add(key)
  }
  const finalCounts = countsFor(current)
  // Relocations can temporarily add surplus copies. Those are not missing
  // affixes the user should fill again at every alternative location.
  const targets = [...targetCounts].flatMap(([key, count]) => {
    const added = Math.min(finalCounts.get(key) ?? 0, count) - Math.min(originalCounts.get(key) ?? 0, count)
    return added > 0 ? [{ key, count: added }] : []
  })
  // Unselected items are alternative locations. They may not add more than the shared net target.
  const alternativeLimits = new Map(
    [...targetCounts].map(([key, count]) => [
      key,
      Math.min(count, (originalCounts.get(key) ?? 0) + (targets.find(target => target.key === key)?.count ?? 0)),
    ]),
  )
  const items = original.flatMap((item): ItemSuggestion[] => {
    let choices = selected.get(item.id)
    if (!choices) {
      const observed = observations.get(item.id)
      if (!observed?.full && !observed?.retune) return []
      choices = choicesFor(item, original, alternativeLimits, [], true)
    }
    const primary = choices.full ?? choices.retune
    if (!primary) return []
    const result: ItemSuggestion = { itemId: item.id, position: primary.position, options: [primary] }
    if (primary.action === "newItem" && choices.retune)
      result.retuneAlternative = { position: choices.retune.position, options: [choices.retune] }
    return [result]
  })
  const order = [...selected.keys()]
  const targetBudget = new Map(targets.map(row => [row.key, row.count]))
  const combinedGain = annotateSuggestionGains({
    original,
    items,
    order,
    measure,
    canApply: (before, after, option) =>
      permitsCounts(countsFor(before), countsFor(after), option.action) && qualifies(measure(before), measure(after)),
    compatibleAlternative: (option, applied, before) => {
      const after = countsFor(applySuggestion(before, option))
      const prior = countsFor(before)
      if (
        [...targetCounts].some(
          ([key, target]) =>
            (originalCounts.get(key) ?? 0) < target &&
            (after.get(key) ?? 0) > Math.min(target, (originalCounts.get(key) ?? 0) + (targetBudget.get(key) ?? 0)) &&
            (after.get(key) ?? 0) > (prior.get(key) ?? 0),
        )
      )
        return false
      const fixed = applied.map(id => completion.find(item => item.id === id)!)
      if (option.replacement) return complete([...fixed, option.replacement]) !== undefined
      const index = original.findIndex(item => item.id === option.itemId)
      const old = countsFor([original[index]])
      const retuned = countsFor(applySuggestion([original[index]], option))
      return domains[index].some(recipe => {
        const goal = countsFor([recipe])
        return (
          (goal.get(keyFor(option.to)) ?? 0) > (old.get(keyFor(option.to)) ?? 0) &&
          distanceTo(retuned, goal) < distanceTo(old, goal) &&
          complete([...fixed, recipe]) !== undefined
        )
      })
    },
  })
  return { targets, items, completion, order, combinedGain }
}

export function calculateBuildSuggestions(input: GearSearchInput): BuildSuggestionResult {
  const { settings, pathId } = input.context.environment
  const tier = breakthroughProfile(settings).gearTier
  const inventory = resolveBuildInventory(input.build, input.items, settings.weapons, tier)
  const equipped = new Set(gearSlots.map(slot => inventory.equipped[slot]).filter(Boolean))
  const items = inventory.items.filter(item => equipped.has(item.id))
  const path = typedPathDefinitions[pathId]
  const presets = defaultBuildPresets.filter(
    preset =>
      !preset.test &&
      !path.graduated.includes(preset.id) &&
      preset.buildGroup === path.buildGroup &&
      sameWeaponPair(preset.martialArts, settings.weapons),
  )
  const closest = closestSuggestionPreset(items, presets, tier, suggestionAffixKey(settings.weapons))
  if (!closest) return { targets: [], items: [] }
  const build = { ...input.build, isDefault: false, equipped: inventory.equipped }
  const bundleFor = (gearItems: GearItem[]) =>
    buildMeasurement({ build, gearItems, context: input.context, rotation: input.rotation }).bundle
  const evaluator = createGearCandidateEvaluator(bundleFor(items))
  const result = planBuildSuggestions({
    items,
    targetCounts: closest.counts,
    pathId,
    weapons: settings.weapons,
    measure: gearItems => evaluator.evaluate(bundleFor(gearItems)).reading.dps,
  })
  return { presetId: closest.preset.id, ...result }
}
