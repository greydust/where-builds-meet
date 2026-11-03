import { migrateAttunementValues, type AttunementOverrides } from "@/calculations/attunementStats"
import type { AttunementStats } from "@/calculations/damage"
import { attunementData } from "@/gear"
import { getPersistentItem } from "@/persistentStorage"
import { parseJson } from "@/schemas/json"
import { attunementMapSchema } from "@/schemas/storage"

import { attunementOverrideStorageKey, attunementStorageKey } from "./keys"
import { readLegacyAttunementStats } from "./legacy"

export const defaultAttunementStats = Object.fromEntries(
  Object.keys(attunementData).map(key => [key, 0]),
) as AttunementStats
export const percentageAttunementKeys = new Set<keyof AttunementStats>(
  Object.entries(attunementData)
    .filter(([, definition]) => definition.percentage)
    .map(([key]) => key as keyof AttunementStats),
)

export function loadAttunementStats() {
  const currentSaved = getPersistentItem(attunementStorageKey)
  const isLegacy = currentSaved === null
  let saved: Record<string, unknown> | undefined
  if (isLegacy) {
    saved = readLegacyAttunementStats()
  } else {
    const parsed = parseJson(attunementMapSchema, currentSaved)
    saved = parsed.success ? (parsed.output as Record<string, unknown>) : undefined
  }
  if (!saved) return { ...defaultAttunementStats }
  saved = migrateAttunementValues(saved)
  return Object.fromEntries(
    Object.keys(defaultAttunementStats).map(key => {
      const statKey = key as keyof AttunementStats
      const value = typeof saved[key] === "number" && Number.isFinite(saved[key]) ? saved[key] : 0
      return [key, isLegacy && percentageAttunementKeys.has(statKey) ? value / 100 : value]
    }),
  ) as typeof defaultAttunementStats
}

export function loadAttunementOverrides(): AttunementOverrides {
  const currentSaved = getPersistentItem(attunementOverrideStorageKey)
  if (currentSaved !== null) {
    const values = parseJson(attunementMapSchema, currentSaved)
    if (!values.success) return {}
    const migrated = migrateAttunementValues(values.output)
    return Object.fromEntries(
      Object.keys(defaultAttunementStats).flatMap(key => {
        const value = migrated[key]
        return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : []
      }),
    ) as AttunementOverrides
  }
  return Object.fromEntries(
    Object.entries(loadAttunementStats()).filter(([, value]) => value !== 0),
  ) as AttunementOverrides
}
