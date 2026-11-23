import { gearSlots, isGearItemCompatible, type BuildEntry, type GearItem, type GearSlot } from "@/gear"

import { createGearCandidateEvaluator } from "./gearCandidateEvaluator"
import {
  buildRotationCalculationBundle,
  measurementSubject,
  type MeasurementContext,
} from "./rotationCalculationBundle"
import { rotationGearTimelineKey } from "./rotationCalculator"
import type { RotationRecord } from "./rotationTimeline"
import type { ThroughputReading } from "./rotationWorkerTransport"

export const gearSearchLimits = { combinations: 100_000 }
export type EquippedGear = Partial<Record<GearSlot, string>>
export type GearSearchInput = {
  /** Zero disables both estimated and elapsed time limits. Defaults to two minutes. */
  timeLimitMinutes?: number
  build: BuildEntry
  items: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord
}
export type GearSearchProgress = {
  phase: "preparing" | "searching" | "completed"
  completed: number
  total: number
  fast: number
  rebuild: number
  estimatedMs?: number
  equipped: EquippedGear
  reading?: ThroughputReading
}
export type GearSearchFailure = "tooMany" | "tooLong" | "noCombinations"
export class GearSearchError extends Error {
  readonly reason: GearSearchFailure
  constructor(reason: GearSearchFailure) {
    super(reason)
    this.reason = reason
  }
}

/** Names and ids do not affect damage; affix order does affect floating-point addition. */
export function gearCalculationIdentity(item: GearItem) {
  return JSON.stringify([
    item.definitionId,
    item.slot,
    item.level,
    item.rarity,
    item.relayed === true,
    item.baseAffix,
    item.additionalAffixes,
    item.attunement,
  ])
}

/** Equivalent weapons retain their multiplicity so two physical copies may fill two slots. */
export function gearCombinationCandidates(input: GearSearchInput): EquippedGear[] {
  const groups = new Map<string, GearItem[]>()
  for (const item of input.items) {
    const key = gearCalculationIdentity(item)
    const group = groups.get(key) ?? []
    group.push(item)
    groups.set(key, group)
  }
  const weapons = input.context.environment.settings.weapons
  const choices = gearSlots.map(slot =>
    [...groups.values()].filter(group => isGearItemCompatible(group[0], slot, weapons)),
  )
  const used = new Map<GearItem[], number>()
  const equipped: EquippedGear = {}
  const results: EquippedGear[] = []
  const visit = (index: number) => {
    if (index === gearSlots.length) {
      results.push({ ...equipped })
      if (results.length > gearSearchLimits.combinations) throw new GearSearchError("tooMany")
      return
    }
    const slot = gearSlots[index]
    if (choices[index].length === 0) {
      visit(index + 1)
      return
    }
    for (const group of choices[index]) {
      const count = used.get(group) ?? 0
      if (count >= group.length) continue
      equipped[slot] = group[count].id
      used.set(group, count + 1)
      visit(index + 1)
      used.set(group, count)
    }
    delete equipped[slot]
  }
  visit(0)
  if (!results.length) throw new GearSearchError("noCombinations")
  return results
}

/** Runs entirely in its own worker; only compact progress and best-so-far gear cross the boundary. */
export function optimizeGear(
  input: GearSearchInput,
  report: (progress: GearSearchProgress) => void,
  now: () => number = () => performance.now(),
) {
  const minutes = input.timeLimitMinutes ?? 2
  const timeLimitMs = minutes === 0 ? Infinity : minutes * 60_000
  const started = now()
  const candidates = gearCombinationCandidates(input)
  const bundleFor = (equipped: EquippedGear) =>
    buildRotationCalculationBundle(
      measurementSubject({
        build: { ...input.build, equipped },
        gearItems: input.items,
        context: input.context,
        rotation: input.rotation,
      }),
    )
  const original = bundleFor(input.build.equipped ?? {})
  const { baseline, originalKey, evaluate } = createGearCandidateEvaluator(original)
  let best = { ...input.build.equipped }
  let reading: ThroughputReading = {
    dps: baseline.metrics.dps,
    hps: baseline.metrics.hps,
    totalDamage: baseline.metrics.totalDamage,
  }
  let lastReport = -Infinity
  let progress: GearSearchProgress = {
    phase: "preparing",
    completed: 0,
    total: candidates.length,
    fast: 0,
    rebuild: 0,
    equipped: best,
    reading,
  }
  const publish = (force = false) => {
    if (!force && now() - lastReport < 100) return
    lastReport = now()
    report({ ...progress, equipped: best, reading })
  }
  publish(true)
  const assertBudget = () => {
    if (now() - started > timeLimitMs) {
      publish(true)
      throw new GearSearchError("tooLong")
    }
  }
  const measure = (equipped: EquippedGear) => {
    const bundle = bundleFor(equipped)
    const before = now()
    const result = evaluate(bundle)
    return { ...result, ms: now() - before }
  }
  // The same single-item swaps shown in the inventory rank the exhaustive search; they never prune it.
  const scores = new Map<string, number>()
  for (const slot of gearSlots) {
    for (const id of new Set(candidates.map(candidate => candidate[slot]))) {
      if (!id) continue
      assertBudget()
      const equipped = Object.fromEntries(
        Object.entries(input.build.equipped ?? {}).filter(([, itemId]) => itemId !== id),
      )
      const result = measure({ ...equipped, [slot]: id })
      scores.set(`${slot}:${id}`, result.reading.dps - baseline.metrics.dps)
      publish()
    }
  }
  const samples = { fast: [] as number[], rebuild: [] as number[] }
  const ranked = candidates.map(equipped => {
    assertBudget()
    const bundle = bundleFor(equipped)
    const fast = originalKey !== undefined && rotationGearTimelineKey(bundle, baseline) === originalKey
    if (fast) progress.fast += 1
    else progress.rebuild += 1
    const sample = fast ? samples.fast : samples.rebuild
    if (sample.length < 3) sample.push(measure(equipped).ms)
    publish()
    return { equipped, score: gearSlots.reduce((sum, slot) => sum + (scores.get(`${slot}:${equipped[slot]}`) ?? 0), 0) }
  })
  const conservativeCost = (samples: number[]) => (samples.length ? Math.max(...samples, 0.01) * 1.5 : 0)
  // Include another sheet-resolution pass as well as measured damage evaluation costs.
  const preparationMs = now() - started
  progress.estimatedMs =
    preparationMs * 2 +
    progress.fast * conservativeCost(samples.fast) +
    progress.rebuild * conservativeCost(samples.rebuild)
  if (progress.estimatedMs > timeLimitMs) throw new GearSearchError("tooLong")
  ranked.sort((a, b) => b.score - a.score)
  progress = { ...progress, phase: "searching" }
  publish(true)
  for (const candidate of ranked) {
    assertBudget()
    const result = measure(candidate.equipped)
    if (result.reading.dps > reading.dps) {
      best = candidate.equipped
      reading = result.reading
    }
    progress.completed += 1
    publish()
  }
  progress = { ...progress, phase: "completed" }
  publish(true)
}
