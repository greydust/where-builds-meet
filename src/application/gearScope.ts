import type { PathId } from "@/application/contracts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { gearScopeStorageKey } from "@/application/persistence/keys"
import { migrateWingsPathId } from "@/application/persistence/legacy/wingsPath"
import {
  buildEntryAvailableForPath,
  buildEntryIsTestPreset,
  type BuildEntry,
  type BuildState,
  type GearItem,
} from "@/gear"
import { getPersistentItem, setPersistentItem } from "@/persistentStorage"
import { parseJson } from "@/schemas/json"
import { gearScopeSchema } from "@/schemas/storage"
import type { WeaponId } from "@/types"

/**
 * Which builds and which inventory each path can see.
 *
 * One record holds both settings and both maps, because they are one decision: a map is
 * meaningless while its setting is shared, and turning a setting off writes a map in the same
 * act. Sharing is the default and a session with no stored scope shares both, so an existing
 * session keeps seeing one inventory and one build list on every path without a migration.
 *
 * The maps record exclusivity and nothing else. A shared build or item has no entry, because
 * "every path can see this" and "each of the eleven arrays names this" are two encodings of one
 * fact that could disagree, and only the first survives a path being added. Turning a setting
 * back on therefore keeps the map it had, so an excursion into sharing stays reversible.
 */
export type GearScope = {
  /** One inventory for every path. While true, `itemIdsByPath` is not read. */
  sharedInventory: boolean
  /** One build list for every path. While true, `buildIdsByPath` is not read. */
  sharedBuilds: boolean
  /** Path to the gear ids it can see. Consulted only while `sharedInventory` is false. */
  itemIdsByPath: Partial<Record<PathId, string[]>>
  /** Path to the build ids it can see. Consulted only while `sharedBuilds` is false. */
  buildIdsByPath: Partial<Record<PathId, string[]>>
}

export type ScopeTarget = "inventory" | "builds"

export const sharedGearScope: GearScope = {
  sharedInventory: true,
  sharedBuilds: true,
  itemIdsByPath: {},
  buildIdsByPath: {},
}

export function loadGearScope(): GearScope {
  migrateWingsPathId()
  const parsed = parseJson(gearScopeSchema, getPersistentItem(gearScopeStorageKey) ?? "null")
  if (!parsed.success) return { ...sharedGearScope }
  const saved = parsed.output
  return {
    // A stored session written before a setting existed was sharing it, which is what it did.
    sharedInventory: saved.sharedInventory ?? true,
    sharedBuilds: saved.sharedBuilds ?? true,
    itemIdsByPath: pathIdListMap(saved.itemIdsByPath),
    buildIdsByPath: pathIdListMap(saved.buildIdsByPath),
  }
}

export function persistGearScope(scope: GearScope) {
  setPersistentItem(gearScopeStorageKey, JSON.stringify(scope))
}

/** Forgets ids nothing refers to any more, so a deleted build or item does not linger. */
export function gearScopeWithoutIds(scope: GearScope, removed: { buildIds?: string[]; itemIds?: string[] }): GearScope {
  const gone = {
    buildIds: (removed.buildIds ?? []).filter(id => placedSomewhere(scope, "builds", id)),
    itemIds: (removed.itemIds ?? []).filter(id => placedSomewhere(scope, "inventory", id)),
  }
  if (!gone.buildIds.length && !gone.itemIds.length) return scope
  return {
    ...scope,
    buildIdsByPath: withoutIds(scope.buildIdsByPath, gone.buildIds),
    itemIdsByPath: withoutIds(scope.itemIdsByPath, gone.itemIds),
  }
}

/**
 * Puts ids on the paths the answer named, leaving every other path's list as it was.
 *
 * This is what answers the question a setting asks when it is turned off: the ids have no path
 * yet, and they either go to every path so that no path loses anything, or to one path so that
 * the rest start clean. An id that already had a path keeps it, so a setting turned off, on and
 * off again only asks about the ones still unplaced.
 */
export function gearScopeWithIds(
  scope: GearScope,
  target: ScopeTarget,
  ids: string[],
  placement: { target: "all" | "path"; pathId: PathId },
): GearScope {
  const key = target === "inventory" ? "itemIdsByPath" : "buildIdsByPath"
  const placed = new Set(ids)
  const next: Partial<Record<PathId, string[]>> = {}
  for (const pathId of allPathIds()) {
    // A path keeps the ids it already had and gains the newly placed ones, so a build tagged
    // here before the setting was turned off does not lose its tag to the question.
    const existing = (scope[key][pathId] ?? []).filter(id => !placed.has(id))
    next[pathId] = placement.target === "all" || pathId === placement.pathId ? [...existing, ...ids] : existing
  }
  return { ...scope, [key]: next }
}

/** The ids this target has not yet placed, which is what the question is about. */
export function unplacedIds(scope: GearScope, target: ScopeTarget, ids: string[]): string[] {
  const key = target === "inventory" ? "itemIdsByPath" : "buildIdsByPath"
  const placed = new Set(allPathIds().flatMap(pathId => scope[key][pathId] ?? []))
  return ids.filter(id => !placed.has(id))
}

export type VisibleBuildsInput = {
  buildState: BuildState
  scope: GearScope
  pathId: PathId
  buildGroup: string
  weapons: [WeaponId, WeaponId]
  devMode: boolean
}

/**
 * The builds one path can see, in stored order.
 *
 * A shipped preset is never scoped. `loadBuildState` rebuilds the preset list from the game data
 * on every load instead of storing it, and `defaultBuildIdForPath` resolves each path's active
 * build to one of them, so hiding a preset from the path that owns it would leave that path with
 * no build at all. The test-preset and availability rules therefore still decide presets in
 * every mode, and the test-preset rule cannot reach a user build anyway, since it requires
 * `isDefault`.
 *
 * A user build is a different case. While builds are shared, the existing rules decide it, which
 * is what makes a build visible on a path whose weapons match it. Once builds are private the
 * path's own list decides instead and those rules do not apply: the user placed the build here,
 * so it belongs here whether or not its weapons match, and it does not follow them to the next
 * path.
 */
export function visibleBuilds(input: VisibleBuildsInput): BuildEntry[] {
  const { buildState, scope, pathId, buildGroup, weapons, devMode } = input
  const owned = scope.sharedBuilds ? undefined : new Set(scope.buildIdsByPath[pathId] ?? [])
  return buildState.entries.filter(entry => {
    if (!devMode && buildEntryIsTestPreset(entry)) return false
    if (entry.isDefault) return buildEntryAvailableForPath(entry, buildGroup, weapons)
    // A private build is placed, not matched, so the weapon and group rules do not apply to it.
    if (owned) return owned.has(entry.id)
    return buildEntryAvailableForPath(entry, buildGroup, weapons)
  })
}

/** The inventory setting alone decides visibility; shared builds cannot expose another path's gear. */
export function visibleGearItems(input: { buildState: BuildState; scope: GearScope; pathId: PathId }): GearItem[] {
  const { buildState, scope, pathId } = input
  if (scope.sharedInventory) return buildState.gearItems
  const named = new Set(scope.itemIdsByPath[pathId] ?? [])
  return buildState.gearItems.filter(item => named.has(item.id))
}

/** The build ids a scope has to account for. Presets are excluded because they are never scoped. */
export function scopedBuildIds(buildState: BuildState): string[] {
  return buildState.entries.filter(entry => !entry.isDefault).map(entry => entry.id)
}

export function scopedItemIds(buildState: BuildState): string[] {
  return buildState.gearItems.map(item => item.id)
}

/**
 * Brings the scope back in line with a change to the build list or the inventory.
 *
 * A build or item that has just appeared is placed on the path the change was made on, so a new
 * one starts on the path the user is looking at instead of nowhere, and only when its setting is
 * private: while the setting is shared there is nothing to place. A build or item that has just
 * gone is forgotten, so a later record reusing the id does not inherit a scope it never chose.
 *
 * This lives beside the scope rather than in the caller because the two halves have to be
 * applied together, and a caller that placed new ids without forgetting removed ones would leave
 * a record whose scope describes records that no longer exist.
 */
export function gearScopeReconciled(
  scope: GearScope,
  before: BuildState,
  after: BuildState,
  pathId: PathId,
): GearScope {
  const beforeBuilds = scopedBuildIds(before)
  const afterBuilds = scopedBuildIds(after)
  const beforeItems = scopedItemIds(before)
  const afterItems = scopedItemIds(after)
  // A change that only moves the active selection appears here as nothing new and nothing gone,
  // and must return the same scope value so the store does not store it again.
  const freshBuilds = scope.sharedBuilds ? [] : afterBuilds.filter(id => !beforeBuilds.includes(id))
  const freshItems = scope.sharedInventory ? [] : afterItems.filter(id => !beforeItems.includes(id))
  let reconciled = gearScopeWithoutIds(scope, {
    buildIds: beforeBuilds.filter(id => !afterBuilds.includes(id)),
    itemIds: beforeItems.filter(id => !afterItems.includes(id)),
  })
  // Imports and duplication can add both records in one update; neither placement may skip the other.
  if (freshBuilds.length > 0) {
    reconciled = gearScopeWithIds(reconciled, "builds", freshBuilds, { target: "path", pathId })
  }
  if (freshItems.length > 0) {
    reconciled = gearScopeWithIds(reconciled, "inventory", freshItems, { target: "path", pathId })
  }
  return reconciled
}

function allPathIds(): PathId[] {
  return Object.keys(typedPathDefinitions) as PathId[]
}

function placedSomewhere(scope: GearScope, target: ScopeTarget, id: string) {
  const key = target === "inventory" ? "itemIdsByPath" : "buildIdsByPath"
  return allPathIds().some(pathId => scope[key][pathId]?.includes(id))
}

function pathIdListMap(value: Record<string, string[]> | undefined) {
  return Object.fromEntries(
    Object.entries(value ?? {}).filter(([path, ids]) => path in typedPathDefinitions && Array.isArray(ids)),
  ) as Partial<Record<PathId, string[]>>
}

function withoutIds(map: Partial<Record<PathId, string[]>>, removed: string[] | undefined) {
  if (!removed?.length) return map
  const drop = new Set(removed)
  return Object.fromEntries(
    Object.entries(map).map(([path, ids]) => [path, ids.filter(id => !drop.has(id))]),
  ) as Partial<Record<PathId, string[]>>
}
