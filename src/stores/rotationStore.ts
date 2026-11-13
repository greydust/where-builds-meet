import { create } from "zustand"

import type { PathId } from "@/application/contracts"
import {
  activeRotationByPathStorageKey,
  activeRotationStorageKey,
  rotationListStorageKey,
} from "@/application/persistence/keys"
import { loadPathSelectionIds, withPathSelection, type PathSelectionIds } from "@/application/persistence/pathSelection"
import { loadRotationEntries } from "@/application/persistence/rotations"
import type { RotationSimulationBundle } from "@/calculations/rotationCalculator"
import {
  rotationCalculationCategories,
  type RotationCalculationCategory,
  type RotationCalculationCategoryStatus,
  type RotationCalculationStatus,
  type RotationMetrics,
} from "@/calculations/rotationMetrics"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { setPersistentItem } from "@/persistentStorage"
import { serializeRotationEntries, type RotationEntry } from "@/rotationTransfer"

/**
 * The rotation the rest of the application is showing, and the work currently under way for it.
 *
 * This store is read with selectors, unlike the calculation cache in `dpsStore`, and the two are
 * not interchangeable. `dpsStore` is non-reactive on purpose: its entries are the output of
 * dispatched work, so a component that subscribed to one would re-render whenever a calculation
 * it never asked for reported progress. What lives here is published state that the interface
 * genuinely mirrors — a headline number, a rotation name, a progress bar — so it is read
 * reactively. Reaching for a selector on `dpsStore` returns nothing because nothing subscribes.
 */
export type ActiveRotationResult = {
  pathId: PathId
  rotationId: string
  rotationName: string
  rotationIsDefault: boolean
  /** The rotation record itself, which the build list weighs a build against. */
  rotation: RotationRecord
  /** Held because the simulation tab replays it, not only reads totals from it. */
  bundle: RotationSimulationBundle
  bundleKey: string
  metrics: RotationMetrics
  graduation?: { fingerprint: string; dps?: number }
  /**
   * True when the rotation carries edits the editor has not saved, so what is shown is not the
   * stored record. The headline has always followed those edits, and a pull that published the
   * stored record over one would quietly stop that.
   */
  draft: boolean
}

const idleStatus = (): RotationCalculationStatus =>
  Object.fromEntries(
    rotationCalculationCategories.map(category => [
      category,
      { recalculating: false } satisfies RotationCalculationCategoryStatus,
    ]),
  ) as RotationCalculationStatus

export type RotationStore = {
  /**
   * Every rotation the user has, saved and preset alike. Owned here rather than by the editor so
   * that a rotation is still resolvable when the editor is not mounted, and so that writing one
   * and storing it are the same act.
   */
  entries: RotationEntry[]
  previewId: string | null
  setPreview: (previewId: string | null) => void
  activeRotationIdsByPath: PathSelectionIds
  /** Null until a rotation resolves, and again on a path switch, which invalidates it. */
  result: ActiveRotationResult | null
  status: RotationCalculationStatus
  /**
   * Reads the persisted rotations and selections, and forgets anything already published.
   *
   * The store is a module singleton, so reading storage while it is being defined would make its
   * contents depend on when the module happened to be imported — which a lazily loaded editor
   * decides. The application boots it explicitly instead, once per mount.
   */
  initialise: (pathId: PathId, previewId?: string | null) => void
  /** Applies a change to the rotation list and stores the result, which cannot drift apart. */
  updateEntries: (update: (entries: RotationEntry[]) => RotationEntry[]) => void
  /** Writes the list unchanged, for when something outside it is about to replace what loads it. */
  persistEntries: () => void
  selectRotationForPath: (id: string, pathId: PathId) => void
  /** Writes a whole selection map, which is what switching paths resolves. */
  setRotationsByPath: (ids: PathSelectionIds) => void
  publish: (result: ActiveRotationResult) => void
  /** Forgets the published rotation, which a path switch invalidates along with its cache. */
  clear: () => void
  startCategory: (category: RotationCalculationCategory) => void
  progressCategory: (category: RotationCalculationCategory, progress: number) => void
  settleCategory: (category: RotationCalculationCategory) => void
}

const persist = (ids: PathSelectionIds) => setPersistentItem(activeRotationByPathStorageKey, JSON.stringify(ids))

function previewState(state: RotationStore, previewId: string | null) {
  return {
    previewId,
    entries: loadRotationEntries(previewId, state.entries),
    result: state.result?.rotationIsDefault ? null : state.result,
  }
}

function loadRotationState(pathId: PathId, previewId: string | null) {
  return {
    previewId,
    entries: loadRotationEntries(previewId),
    activeRotationIdsByPath: loadActiveRotationIds(pathId),
    result: null,
    status: idleStatus(),
  }
}

export const useRotationStore = create<RotationStore>()((set, get) => ({
  entries: [],
  previewId: null,
  setPreview: previewId => set(state => previewState(state, previewId)),
  activeRotationIdsByPath: {},
  result: null,
  status: idleStatus(),

  initialise: (pathId, previewId = null) => set(loadRotationState(pathId, previewId)),

  updateEntries: update => {
    const next = update(get().entries)
    setPersistentItem(rotationListStorageKey, serializeRotationEntries(next))
    set({ entries: next })
  },

  persistEntries: () => setPersistentItem(rotationListStorageKey, serializeRotationEntries(get().entries)),

  selectRotationForPath: (id, pathId) => {
    const next = withPathSelection(get().activeRotationIdsByPath, pathId, id)
    if (next === get().activeRotationIdsByPath) return
    persist(next)
    set({ activeRotationIdsByPath: next })
  },

  setRotationsByPath: ids => {
    if (ids === get().activeRotationIdsByPath) return
    persist(ids)
    set({ activeRotationIdsByPath: ids })
  },

  publish: result => set({ result }),

  clear: () => set({ result: null, status: idleStatus() }),

  // No progress until something is measured: a category that has started but published no steps
  // is under way rather than stalled at the start, and reporting zero would claim a fraction
  // that was never taken.
  startCategory: category => set(state => ({ status: { ...state.status, [category]: { recalculating: true } } })),

  progressCategory: (category, progress) =>
    set(state => ({ status: { ...state.status, [category]: { recalculating: true, progress } } })),

  settleCategory: category => set(state => ({ status: { ...state.status, [category]: { recalculating: false } } })),
}))

/** The selection map as stored, promoted from the pre-per-path key on first read. */
const loadActiveRotationIds = (pathId: PathId) =>
  loadPathSelectionIds(activeRotationByPathStorageKey, activeRotationStorageKey, pathId)
