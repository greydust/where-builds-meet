import * as v from "valibot"

import type { PreviewId } from "@/application/gameData/previews"
import {
  defaultRotationEntries,
  defaultRotationId,
  defaultRotation,
  formerDefaultRotationIds,
  migrateRotation,
  rotationAvailableForWeapons,
  rotationMartialArts,
  rotationEntriesForPreview,
} from "@/application/rotationCatalog"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { getPersistentItem } from "@/persistentStorage"
import type { RotationEntry } from "@/rotationTransfer"
import { parseJson } from "@/schemas/json"
import type { WeaponId } from "@/types"

import { rotationListStorageKey } from "./keys"
import { readLegacyRotation } from "./legacy"

export function loadRotationEntries(
  previewId: PreviewId | null = null,
  currentEntries?: RotationEntry[],
): RotationEntry[] {
  if (currentEntries)
    return rotationEntriesForPreview(
      [...defaultRotationEntries, ...currentEntries.filter(entry => !entry.isDefault)],
      previewId,
    )
  const bundledDefaults = (): RotationEntry[] =>
    rotationEntriesForPreview(defaultRotationEntries, previewId).map(entry =>
      Object.assign({}, entry, {
        martialArts: [...entry.martialArts],
        rotation: JSON.parse(JSON.stringify(entry.rotation)) as RotationRecord,
      }),
    )
  try {
    const saved = parseJson(v.array(v.unknown()), getPersistentItem(rotationListStorageKey) ?? "null")
    const customEntries: RotationEntry[] = []
    const bundledDefaultIds = new Set(defaultRotationEntries.map(entry => entry.id))
    const usedIds = new Set(bundledDefaultIds)
    const addCustom = (preferredId: string, rotation: RotationRecord, martialArts?: unknown) => {
      let id = preferredId
      let suffix = 2
      while (usedIds.has(id)) id = `${preferredId}:${suffix++}`
      usedIds.add(id)
      customEntries.push({ id, rotation, martialArts: rotationMartialArts(rotation, martialArts) })
    }
    const preserveFormerDefault = (rotation: RotationRecord) => {
      const migrated = migrateRotation(rotation)
      if (defaultRotationEntries.some(entry => JSON.stringify(migrated) === JSON.stringify(entry.rotation))) return
      addCustom("migrated-default-rotation", { ...migrated, name: `${migrated.name || defaultRotation.name} Copy` })
    }
    if (saved.success) {
      saved.output.forEach(entry => {
        if (!entry || typeof entry !== "object" || Array.isArray(entry)) return
        const candidate = entry as { id?: unknown; rotation?: unknown; isDefault?: unknown; martialArts?: unknown }
        if (
          typeof candidate.id !== "string" ||
          !candidate.id ||
          !candidate.rotation ||
          typeof candidate.rotation !== "object"
        )
          return
        const rotation = candidate.rotation as { steps?: unknown }
        if (!Array.isArray(rotation.steps)) return
        try {
          if (
            candidate.isDefault === true ||
            bundledDefaultIds.has(candidate.id) ||
            formerDefaultRotationIds.has(candidate.id)
          )
            preserveFormerDefault(candidate.rotation as RotationRecord)
          else addCustom(candidate.id, migrateRotation(candidate.rotation as RotationRecord), candidate.martialArts)
        } catch (error) {
          console.error(`[Rotation storage] Could not migrate saved rotation ${candidate.id}.`, error)
        }
      })
      return [...bundledDefaults(), ...customEntries]
    }
    const legacy = readLegacyRotation()
    if (legacy) preserveFormerDefault(legacy as RotationRecord)
    return [...bundledDefaults(), ...customEntries]
  } catch {
    return bundledDefaults()
  }
}

export function initialRotationId(entries: RotationEntry[], preferredId: string, weapons: [WeaponId, WeaponId]) {
  return (
    entries.find(entry => entry.id === preferredId && rotationAvailableForWeapons(entry, weapons))?.id ??
    entries.find(entry => rotationAvailableForWeapons(entry, weapons))?.id ??
    defaultRotationId
  )
}

export function initialRotationEditorState(
  devMode: boolean,
  preferredRotationId: string,
  weapons: [WeaponId, WeaponId],
  previewId: PreviewId | null = null,
) {
  const entries = loadRotationEntries(previewId)
  const selectableEntries = entries.filter(entry => devMode || !entry.test)
  const activeId = initialRotationId(selectableEntries, preferredRotationId, weapons)
  const activeRotation =
    selectableEntries.find(entry => entry.id === activeId)?.rotation ??
    selectableEntries[0]?.rotation ??
    defaultRotation
  const rotation = JSON.parse(JSON.stringify(activeRotation)) as RotationRecord
  const startAnchor = rotation.start
    ? { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action }
    : { rowId: "rotation-0" }
  return { entries, activeId, rotation, startAnchor }
}
