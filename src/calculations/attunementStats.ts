import attunementJson from "@gamedata/attunement.json"

import type { AttunementStats } from "./damage"

export type AttunementOverrides = Partial<AttunementStats>

/** Two official affix IDs describe the same Vernal projectile bonus. */
export function canonicalAttunementKey(key: string) {
  return key === "vernalProjectile280305Boost" ? "vernalProjectile280304Boost" : key
}

/** Preserve additive bonuses from saved sheets and profiles when merging the retired key. */
export function migrateAttunementValues(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {}
  const migrated: Record<string, number> = {}
  for (const [key, amount] of Object.entries(value)) {
    if (typeof amount !== "number" || !Number.isFinite(amount)) continue
    const canonical = canonicalAttunementKey(key)
    migrated[canonical] = (migrated[canonical] ?? 0) + amount
  }
  return migrated
}

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

type AttunementDivisors = Pick<
  import("@/types").EnemyProfile,
  "specificSkillDamageDivisor" | "correctablePenetrationDivisor"
>

export function correctedAttunement(key: keyof AttunementStats, raw: number, profile: AttunementDivisors) {
  if (key === "physicalPenetration" || key === "formlessPenetration")
    return raw / (profile.correctablePenetrationDivisor ?? 1)
  if (attunementJson[key].tags.includes("Armor")) return raw / (profile.specificSkillDamageDivisor ?? 1)
  return raw
}
export function resolveAttunementStats(
  defaults: AttunementStats,
  equipped: Partial<AttunementStats>,
  overrides: AttunementOverrides,
  characterStatBonuses: Partial<AttunementStats>,
  profile: AttunementDivisors = {},
) {
  const input = { ...defaults }
  const calculation = { ...defaults }
  const displayed = { ...defaults }

  for (const key of Object.keys(defaults) as Array<keyof AttunementStats>) {
    const bonus = characterStatBonuses[key] ?? 0
    input[key] = overrides[key] ?? equipped[key] ?? defaults[key]
    calculation[key] = correctedAttunement(key, input[key], profile)
    displayed[key] = calculation[key] + bonus
  }

  return { input, calculation, displayed }
}

/** Only pure damage multipliers can use the fixed-timeline affine response. */
export function attunementDamageMultiplier(key: keyof AttunementStats): number | undefined {
  const stat = attunementDefinitions[key]?.effect?.stat
  const multiplier = stat?.attunementDMGBonus
  return stat && Object.keys(stat).length === 1 && typeof multiplier === "number" && Number.isFinite(multiplier)
    ? multiplier
    : undefined
}

/** Penetration responses support one positive, data-defined stat multiplier. */
export function attunementPenetrationMultiplier(
  key: keyof AttunementStats,
): { field: "physicalPenetration" | "formlessPenetration"; multiplier: number } | undefined {
  const stat = attunementDefinitions[key]?.effect?.stat
  if (!stat || Object.keys(stat).length !== 1) return undefined
  const field = Object.keys(stat)[0]
  if (field !== "physicalPenetration" && field !== "formlessPenetration") return undefined
  const multiplier = stat[field]
  return Number.isFinite(multiplier) && multiplier > 0 ? { field, multiplier } : undefined
}
