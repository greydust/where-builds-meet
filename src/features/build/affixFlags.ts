import { maximumUsefulRawRate } from "@/calculations/effectiveStats"
import type { RotationPriority } from "@/calculations/rotationMetrics"
import {
  buildPresetInventory,
  gearSlots,
  maxGearRoll,
  summarizeGearAffixes,
  type BuildPreset,
  type GearItem,
  type GearLevel,
} from "@/gear"
import type { CharacterStats } from "@/types"

/** The three rates whose effective value is capped and can waste affixes. */
export const RATE_AFFIX_KEYS = ["precision", "crit", "affinity"] as const
export type RateAffixKey = (typeof RATE_AFFIX_KEYS)[number]

/**
 * A quarter of a roll is enough waste to justify removing an affix. Real capped builds sit near
 * a quarter roll past the useful raw value, so a whole-roll threshold never fired on any of them.
 */
export const OVER_CAP_THRESHOLD = 0.25
/** A stat must deliver at least this share of Max Void Attack's DPS to earn its slot. */
export const LOW_VALUE_RATIO = 0.9
/** A graduate affix this common is a defining part of the build. */
export const GRADUATE_COMMON_MIN = 7
/** How far the current count may sit from a defining graduate affix before it is urgent. */
export const GRADUATE_DIVERGENCE = 2

export type AffixFlag =
  | { kind: "overCap"; statKey: RateAffixKey; excessAffixes: number; reduceBy: number }
  | { kind: "lowValue"; statKey: string; dpsDifference: number; maxVoidDps: number }
  | {
      kind: "graduationGap"
      statKey: string
      graduateCount: number
      currentCount: number
      direction: "tooMany" | "tooFew"
    }
  | { kind: "attunementMismatch"; statKey: string; current: string; expected: string }
  | { kind: "attunementUnderrolled"; statKey: string; current: number; maximum: number }

export type AffixFlagMap = ReadonlyMap<string, readonly AffixFlag[]>
/** Per-item flags, keyed by gear id, for checks that differ between slots. */
export type ItemAttunementFlags = ReadonlyMap<string, readonly AffixFlag[]>

function addFlags(target: Map<string, AffixFlag[]>, key: string, flag: AffixFlag) {
  const existing = target.get(key)
  if (existing) existing.push(flag)
  else target.set(key, [flag])
}

/**
 * Affixes whose raw stat sits above what the capped rate can use. The excess is measured in
 * maximum rolls so the advice counts affixes to remove, not percentage points to trim.
 */
export function overCapAffixFlags(input: {
  stats: CharacterStats
  judgementResistance: number
  gearTier: GearLevel
}): AffixFlagMap {
  const flags = new Map<string, AffixFlag[]>()
  for (const key of RATE_AFFIX_KEYS) {
    const perRoll = maxGearRoll(key, "affix", false, input.gearTier)
    if (!perRoll || perRoll <= 0) continue
    const useful = maximumUsefulRawRate(key, input.judgementResistance, input.stats.effectiveCritBonus)
    const excessAffixes = (input.stats[key] - useful) / perRoll
    if (excessAffixes < OVER_CAP_THRESHOLD) continue
    addFlags(flags, key, {
      kind: "overCap",
      statKey: key,
      excessAffixes,
      reduceBy: Math.max(1, Math.round(excessAffixes)),
    })
  }
  return flags
}

/**
 * Stats worth less than a share of Max Void Attack's marginal DPS. The three capped rates are
 * deliberately excluded: their excess is reported by `overCapAffixFlags` instead, where the
 * remedy is to lower a count rather than to remove the stat entirely.
 */
/**
 * Momentum and Agility feed conversions that already appear in other stats, so they can be weak
 * per roll without the build carrying too many of them. Only ask to remove them when the build
 * actually has more copies than the graduate; otherwise the advice would say to both add and
 * remove the same stat.
 */
const GRADUATE_GATED_REMOVAL = new Set(["momentum", "agility"])

export function lowValueAffixFlags(input: {
  statPriority: readonly RotationPriority[]
  currentCounts: ReadonlyMap<string, number>
  graduateCounts: ReadonlyMap<string, number>
  maxVoidKey?: string
}): AffixFlagMap {
  const flags = new Map<string, AffixFlag[]>()
  const maxVoidKey = input.maxVoidKey ?? "maxVoidAttack"
  const maxVoid = input.statPriority.find(row => row.statKey === maxVoidKey)
  if (!maxVoid || maxVoid.dpsDifference <= 0) return flags
  const threshold = maxVoid.dpsDifference * LOW_VALUE_RATIO
  for (const row of input.statPriority) {
    if (!row.statKey || row.statKey === maxVoidKey || RATE_AFFIX_KEYS.some(key => key === row.statKey)) continue
    if (row.dpsDifference >= threshold) continue
    if (GRADUATE_GATED_REMOVAL.has(row.statKey)) {
      const current = input.currentCounts.get(row.statKey) ?? 0
      const graduate = input.graduateCounts.get(row.statKey) ?? 0
      if (current <= graduate) continue
    }
    addFlags(flags, row.statKey, {
      kind: "lowValue",
      statKey: row.statKey,
      dpsDifference: row.dpsDifference,
      maxVoidDps: maxVoid.dpsDifference,
    })
  }
  return flags
}

export function affixCountsForItems(items: readonly (GearItem | undefined)[]): Map<string, number> {
  const summary = summarizeGearAffixes(items)
  return new Map(summary.affixes.map(({ key, count }) => [key, count]))
}

/**
 * Defining graduate affixes the current build is far from. Only counts at or above the common
 * threshold produce advice, so a graduate's incidental stats do not generate noise.
 */
export function graduationGapAffixFlags(input: {
  currentCounts: ReadonlyMap<string, number>
  graduateCounts: ReadonlyMap<string, number>
}): AffixFlagMap {
  const flags = new Map<string, AffixFlag[]>()
  for (const [statKey, graduateCount] of input.graduateCounts) {
    if (graduateCount < GRADUATE_COMMON_MIN) continue
    const currentCount = input.currentCounts.get(statKey) ?? 0
    if (Math.abs(currentCount - graduateCount) <= GRADUATE_DIVERGENCE) continue
    addFlags(flags, statKey, {
      kind: "graduationGap",
      statKey,
      graduateCount,
      currentCount,
      direction: currentCount > graduateCount ? "tooMany" : "tooFew",
    })
  }
  return flags
}

export function combineAffixFlags(...maps: readonly AffixFlagMap[]): AffixFlagMap {
  const combined = new Map<string, AffixFlag[]>()
  for (const map of maps) for (const [key, flags] of map) for (const flag of flags) addFlags(combined, key, flag)
  return combined
}

/** Which attack range a build favours, from the equipped affixes rather than its name. */
export function physPriorityOfItems(items: readonly (GearItem | undefined)[]): "min" | "max" | undefined {
  let minimum = 0
  let maximum = 0
  for (const item of items) {
    if (!item) continue
    for (const affix of [item.baseAffix, ...item.additionalAffixes]) {
      if (affix.key === "minPhys") minimum += affix.value
      if (affix.key === "maxPhys") maximum += affix.value
    }
  }
  if (minimum === 0 && maximum === 0) return undefined
  return maximum >= minimum ? "max" : "min"
}

export function presetGearItems(preset: BuildPreset, gearTier: GearLevel): (GearItem | undefined)[] {
  try {
    const inventory = buildPresetInventory(preset, gearTier)
    return gearSlots.map(slot => {
      const id = inventory.equipped[slot]
      return id ? inventory.items.find(item => item.id === id) : undefined
    })
  } catch {
    return []
  }
}

export function physPriorityOfPreset(preset: BuildPreset, gearTier: GearLevel): "min" | "max" | undefined {
  return physPriorityOfItems(presetGearItems(preset, gearTier))
}

export function affixCountsForPreset(preset: BuildPreset, gearTier: GearLevel): Map<string, number> {
  return affixCountsForItems(presetGearItems(preset, gearTier))
}

/**
 * Attunement checks are per slot: a wrong attunement is measured against the graduate's item in
 * the same slot, and a correct one is still worth upgrading if its roll is below the tier maximum.
 */
export function attunementFlags(input: {
  equippedItems: readonly (GearItem | undefined)[]
  graduateItems: readonly (GearItem | undefined)[]
  gearTier: GearLevel
}): ItemAttunementFlags {
  const flags = new Map<string, AffixFlag[]>()
  input.equippedItems.forEach((item, index) => {
    if (!item?.attunement) return
    const graduate = input.graduateItems[index]
    const expected = graduate?.attunement?.key
    if (expected && expected !== item.attunement.key)
      addFlags(flags, item.id, {
        kind: "attunementMismatch",
        statKey: item.attunement.key,
        current: item.attunement.key,
        expected,
      })
    const maximum = maxGearRoll(item.attunement.key, "attunement", false, input.gearTier)
    if (maximum && item.attunement.value < maximum * 0.999)
      addFlags(flags, item.id, {
        kind: "attunementUnderrolled",
        statKey: item.attunement.key,
        current: item.attunement.value,
        maximum,
      })
  })
  return flags
}

/**
 * The graduate to compare against. A build favouring Max Physical Attack is matched to a
 * max-phys graduate where one exists, because a min-phys graduate would advise the wrong rolls;
 * otherwise the highest-DPS declared graduate remains the reference.
 */
export function selectGraduationBuild(input: {
  graduateIds: readonly string[]
  presets: readonly BuildPreset[]
  candidateDps: Readonly<Record<string, number>>
  currentPriority: "min" | "max" | undefined
  gearTier: GearLevel
}): BuildPreset | undefined {
  const candidates = input.graduateIds.flatMap(id => {
    const preset = input.presets.find(candidate => candidate.id === id)
    return preset ? [{ preset, dps: input.candidateDps[id] ?? Number.NEGATIVE_INFINITY }] : []
  })
  if (candidates.length === 0) return undefined
  const matching = input.currentPriority
    ? candidates.filter(({ preset }) => physPriorityOfPreset(preset, input.gearTier) === input.currentPriority)
    : []
  const pool = matching.length > 0 ? matching : candidates
  return pool.reduce((best, candidate) => (candidate.dps > best.dps ? candidate : best)).preset
}
