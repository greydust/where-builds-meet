import attunementJson from "../../data/attunement.json"
import type { AttunementStats } from "./damage"

export type AttunementOverrides = Partial<AttunementStats>

export type AttunementTagFilter = {
  /** All entries must match; a nested array matches any one of its tags. */
  tags?: Array<string | string[]>
  excludeTags?: string[]
}

type AttunementDefinition = { effect?: AttunementTagFilter & { stat?: Record<string, number> } }
const attunementDefinitions = attunementJson as Record<string, AttunementDefinition>

/**
 * Every attunement bonus at zero, keyed like `AttunementStats`.
 *
 * `matchingAttunementEntries` reads the keys off the object it is given, so an
 * absent bonus simply never matches. A caller that wants "no attunement" still
 * needs every key present to satisfy the type, and the shipped table carries
 * exactly those keys, so the zero value is derived from it.
 */
export const emptyAttunementStats = Object.fromEntries(
  Object.keys(attunementDefinitions).map(key => [key, 0]),
) as AttunementStats

type AttunementMatch = { key: keyof AttunementStats; stat: Record<string, number> | undefined }
const attunementMatchCache = new WeakMap<AttunementStats, Map<string, readonly AttunementMatch[]>>()

/** Worker attunement snapshots have immutable keys; values are read by the caller on every hit. */
export function matchingAttunementEntries(
  attunement: AttunementStats,
  skillTags: string[],
): readonly AttunementMatch[] {
  let byTags = attunementMatchCache.get(attunement)
  if (!byTags) {
    byTags = new Map()
    attunementMatchCache.set(attunement, byTags)
  }
  const signature = JSON.stringify(skillTags)
  let matches = byTags.get(signature)
  if (!matches) {
    matches = (Object.keys(attunement) as Array<keyof AttunementStats>).flatMap(key => {
      const effect = attunementDefinitions[key]?.effect
      return attunementMatchesSkill(effect, skillTags) ? [{ key, stat: effect?.stat }] : []
    })
    byTags.set(signature, matches)
  }
  return matches
}

export function attunementMatchesSkill(filter: AttunementTagFilter | undefined, skillTags: string[]) {
  const included =
    filter?.tags?.every(tag =>
      typeof tag === "string" ? skillTags.includes(tag) : tag.some(alternative => skillTags.includes(alternative)),
    ) ?? true
  return included && !filter?.excludeTags?.some(tag => skillTags.includes(tag))
}

/** Keep UI overrides final while hit calculation inputs exclude bonuses applied through character stats. */
export function resolveAttunementStats(
  defaults: AttunementStats,
  equipped: Partial<AttunementStats>,
  overrides: AttunementOverrides,
  characterStatBonuses: Partial<AttunementStats>,
) {
  const calculation = { ...defaults }
  const displayed = { ...defaults }

  for (const key of Object.keys(defaults) as Array<keyof AttunementStats>) {
    const bonus = characterStatBonuses[key] ?? 0
    const hasOverride = Object.prototype.hasOwnProperty.call(overrides, key)
    const displayedValue = hasOverride ? (overrides[key] ?? 0) : (equipped[key] ?? 0) + bonus
    displayed[key] = displayedValue
    calculation[key] = displayedValue - bonus
  }

  return { calculation, displayed }
}
