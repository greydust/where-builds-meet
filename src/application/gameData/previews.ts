import previewManifest from "@gamedata/preview/previews.json"

import type { EffectDefinition } from "@/calculations/rotationTimeline"
import { innerWayDefinitions, type InnerWayDefinition, type InnerWayTierEffect } from "@/data/innerWayDefinitions"
import type { SkillCategory, SkillMap } from "@/skillOverrides"
import type { WeaponId } from "@/types"

import { martialArtDefinitions, type MartialArtDefinition } from "./martialArts"
import { defaultSkillMaps, dotDefinitions, effectDefinitions } from "./skills"

export type PreviewId = string

/**
 * Every combat-data registry a preview may overlay. A preview supplies records; it never
 * introduces a record the shipped data does not already define, so the selection UI, the
 * Skill Editor, and the rotation step picker keep enumerating the same set of names.
 */
export type CombatDefinitions = {
  skillMaps: Record<SkillCategory, SkillMap>
  effectDefinitions: Record<string, EffectDefinition>
  dotDefinitions: SkillMap
  innerWayDefinitions: Record<string, InnerWayDefinition>
  martialArtDefinitions: Record<WeaponId, MartialArtDefinition>
}

/**
 * A preview's own records, before they are laid over the shipped registries. Skill records
 * are already grouped by category and inner-way contributions are per tier, matching how
 * each registry is keyed; the flat effect registries merge by record id.
 */
type PreviewOverlay = {
  skillMaps: Partial<Record<SkillCategory, SkillMap>>
  effectDefinitions: Record<string, EffectDefinition>
  dotDefinitions: SkillMap
  innerWayTiers: Record<string, Record<string, InnerWayTierEffect>>
  martialArtDefinitions: Partial<Record<WeaponId, MartialArtDefinition>>
}

/**
 * The shipped data, which every preview is resolved against. Merge depth follows the shape
 * of the registry: a skill category merges record by record, an Inner Way merges tier by
 * tier, and everything else replaces the whole record so a previewed record reads exactly
 * as it would in `data/`.
 */
export const currentCombatDefinitions: CombatDefinitions = {
  skillMaps: defaultSkillMaps,
  effectDefinitions,
  dotDefinitions,
  innerWayDefinitions,
  martialArtDefinitions,
}

export const previewCatalog: readonly { id: PreviewId; name: string }[] = previewManifest.previews
const previewIds = new Set(previewCatalog.map(preview => preview.id))

export function isPreviewId(value: unknown): value is PreviewId {
  return typeof value === "string" && previewIds.has(value)
}

export function previewName(id: PreviewId): string {
  return previewCatalog.find(preview => preview.id === id)?.name ?? id
}

// Vite does not resolve aliases inside glob patterns, so this stays relative to data/.
const previewFiles = import.meta.glob("../../../data/preview/*/*/*.json", { eager: true, import: "default" }) as Record<
  string,
  unknown
>

function emptyOverlay(): PreviewOverlay {
  return { skillMaps: {}, effectDefinitions: {}, dotDefinitions: {}, innerWayTiers: {}, martialArtDefinitions: {} }
}

/** `../../../data/preview/<previewId>/<registry>/<key>.json` */
function previewFileParts(path: string) {
  const segments = path.split("/")
  return {
    previewId: segments[segments.length - 3],
    registry: segments[segments.length - 2],
    key: (segments[segments.length - 1] ?? "").replace(/\.json$/, ""),
  }
}

function buildOverlay(previewId: PreviewId): PreviewOverlay {
  const overlay = emptyOverlay()
  for (const [path, records] of Object.entries(previewFiles)) {
    const { previewId: filePreviewId, registry, key } = previewFileParts(path)
    if (filePreviewId !== previewId || !records || typeof records !== "object") continue
    const entries = records as Record<string, unknown>
    switch (registry) {
      case "skill":
        overlay.skillMaps[key as SkillCategory] = entries as SkillMap
        break
      case "buff":
      case "debuff":
        Object.assign(overlay.effectDefinitions, entries)
        break
      case "dot":
        Object.assign(overlay.dotDefinitions, entries)
        Object.assign(overlay.effectDefinitions, entries)
        break
      case "innerway":
        for (const [definitionId, definition] of Object.entries(entries as Record<string, { effect?: unknown }>)) {
          const tiers = (overlay.innerWayTiers[definitionId] ??= {})
          if (definition?.effect && typeof definition.effect === "object") Object.assign(tiers, definition.effect)
        }
        break
      case "martial-art":
        overlay.martialArtDefinitions[key as WeaponId] = entries as MartialArtDefinition
        break
    }
  }
  return overlay
}

function applyOverlay(base: CombatDefinitions, overlay: PreviewOverlay): CombatDefinitions {
  // A registry the preview does not contribute to is passed through by identity, so a
  // consumer that memos on a definitions map is invalidated only by a registry that actually
  // changed rather than by every selection change.
  const skillMaps = { ...base.skillMaps }
  for (const [category, records] of Object.entries(overlay.skillMaps) as Array<[SkillCategory, SkillMap]>) {
    skillMaps[category] = { ...base.skillMaps[category], ...records }
  }
  const innerWayDefinitions = { ...base.innerWayDefinitions }
  let innerWaysChanged = false
  for (const [definitionId, tiers] of Object.entries(overlay.innerWayTiers)) {
    const definition = base.innerWayDefinitions[definitionId]
    if (!definition) continue
    innerWayDefinitions[definitionId] = { ...definition, effect: { ...definition.effect, ...tiers } }
    innerWaysChanged = true
  }
  const martialArtDefinitions = { ...base.martialArtDefinitions }
  for (const [weaponId, definition] of Object.entries(overlay.martialArtDefinitions) as Array<
    [WeaponId, MartialArtDefinition]
  >) {
    martialArtDefinitions[weaponId] = { ...base.martialArtDefinitions[weaponId], ...definition }
  }
  return {
    skillMaps,
    effectDefinitions: Object.keys(overlay.effectDefinitions).length
      ? { ...base.effectDefinitions, ...overlay.effectDefinitions }
      : base.effectDefinitions,
    dotDefinitions: Object.keys(overlay.dotDefinitions).length
      ? { ...base.dotDefinitions, ...overlay.dotDefinitions }
      : base.dotDefinitions,
    innerWayDefinitions: innerWaysChanged ? innerWayDefinitions : base.innerWayDefinitions,
    martialArtDefinitions: Object.keys(overlay.martialArtDefinitions).length
      ? martialArtDefinitions
      : base.martialArtDefinitions,
  }
}

const resolvedPreviews = new Map<PreviewId, CombatDefinitions>()

/**
 * The shipped data for no selection, or the shipped data with one preview laid over it. An
 * unrecognized id resolves to the shipped data rather than throwing, so a stored selection
 * from a build that shipped a preview this build does not have cannot break calculation.
 */
export function combatDefinitionsFor(previewId: PreviewId | null): CombatDefinitions {
  if (!previewId || !isPreviewId(previewId)) return currentCombatDefinitions
  const cached = resolvedPreviews.get(previewId)
  if (cached) return cached
  const resolved = applyOverlay(currentCombatDefinitions, buildOverlay(previewId))
  resolvedPreviews.set(previewId, resolved)
  return resolved
}
