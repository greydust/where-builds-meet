import defaultSetup from "@gamedata/default-setup.json"

import type { CalculatorSettings, DisplaySizing, LayoutMode, PathId } from "@/application/contracts"
import { isWeaponId } from "@/application/gameData/martialArts"
import { pathIsSelectable, typedPathDefinitions } from "@/application/gameData/paths"
import {
  defaultBreakthrough,
  defaultSettings,
  typedDivinecraftDefinitions,
  typedFoodDefinitions,
  typedScriptDefinitions,
} from "@/application/gameData/setup"
import { resolvePing } from "@/calculations/combatDefaults"
import { getPersistentItem } from "@/persistentStorage"
import { parseJson } from "@/schemas/json"
import { settingsSchema } from "@/schemas/storage"

import {
  developmentModeStorageKey,
  displaySizingStorageKey,
  gearSearchMinutesStorageKey,
  divinecraftStorageKey,
  foodStorageKey,
  enduranceFoodStorageKey,
  layoutPreviewStorageKey,
  pathStorageKey,
  scriptStorageKey,
  settingsStorageKey,
} from "./keys"
import { migrateWingsPathId } from "./legacy/wingsPath"

export function loadDevMode() {
  return getPersistentItem(developmentModeStorageKey) === "true"
}

export function loadDisplaySizing(): DisplaySizing {
  switch (getPersistentItem(displaySizingStorageKey)) {
    case "screen":
      return "screen"
    case "window":
    case "fit": // Preserve the earlier two-option selector's saved choice.
      return "window"
    case "default":
    case "browser":
      return "default"
    default:
      return "default"
  }
}

export const compactLayoutQuery = "(max-width: 48em)"

export function subscribeToCompactLayout(callback: () => void) {
  const query = window.matchMedia(compactLayoutQuery)
  query.addEventListener("change", callback)
  return () => query.removeEventListener("change", callback)
}

export function compactLayoutSnapshot() {
  return window.matchMedia(compactLayoutQuery).matches
}

export function loadLayoutPreview(compact: boolean): LayoutMode {
  const saved = getPersistentItem(layoutPreviewStorageKey)
  return saved === "pc" || saved === "mobile" ? saved : compact ? "mobile" : "pc"
}

export function loadSelectedPath(devMode = loadDevMode()): PathId {
  migrateWingsPathId()
  const saved = getPersistentItem(pathStorageKey)
  const definition = saved ? typedPathDefinitions[saved as PathId] : undefined
  return definition && pathIsSelectable(definition, devMode) ? (saved as PathId) : "stonesplitStrength"
}

export function loadFood() {
  const saved = getPersistentItem(foodStorageKey)
  if (!saved || !typedFoodDefinitions[saved]) return defaultSetup.food
  return typedFoodDefinitions[saved].category === "enduranceFood" ? "None" : saved
}

export function loadEnduranceFood() {
  const saved = getPersistentItem(enduranceFoodStorageKey) ?? getPersistentItem(foodStorageKey)
  return saved && typedFoodDefinitions[saved]?.category === "enduranceFood" ? saved : "None"
}

export function loadDivinecraft() {
  const saved = getPersistentItem(divinecraftStorageKey)
  return saved && typedDivinecraftDefinitions[saved]?.available !== false ? saved : defaultSetup.divinecraft
}

export function loadScript() {
  const saved = getPersistentItem(scriptStorageKey)
  return saved && typedScriptDefinitions[saved] ? saved : "None"
}

export function loadSettings(): CalculatorSettings {
  const parsed = parseJson(settingsSchema, getPersistentItem(settingsStorageKey) ?? "null")
  if (!parsed.success) return { ...defaultSettings }
  const saved = parsed.output
  const savedWeapons = Array.isArray(saved.weapons) ? saved.weapons.filter(isWeaponId) : []
  const legacyWeapon = saved.weapon === "phalanxbane" ? "phalanxbane" : "snowparting"
  const weapons: [string, string] =
    savedWeapons.length === 2
      ? [savedWeapons[0], savedWeapons[1]]
      : [legacyWeapon, legacyWeapon === "snowparting" ? "phalanxbane" : "snowparting"]
  return {
    weapons: weapons as CalculatorSettings["weapons"],
    breakthrough: defaultBreakthrough,
    ping: resolvePing(saved.ping),
  }
}

export function loadGearSearchMinutes() {
  const saved = getPersistentItem(gearSearchMinutesStorageKey)
  const minutes = saved === null ? 2 : Number(saved)
  return Number.isFinite(minutes) && minutes >= 0 ? minutes : 2
}
