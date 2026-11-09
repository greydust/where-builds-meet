import pathDefinitions from "@gamedata/path.json"

import type { PathId } from "@/application/contracts"
import { t } from "@/i18n"
import type { WeaponId } from "@/types"

export type PathDefinition = {
  name: string
  tag?: string
  status: "available" | "preview" | "wip" | "devOnly" | "plannerOnly"
  buildGroup: string
  defaultBuild: string
  graduated: string[]
  defaultRotation: string
  lockedWeapons?: [WeaponId, WeaponId]
  /** Arsenal covering this path's attribute; the Mixed path has none. */
  arsenal?: string
}

export const typedPathDefinitions = pathDefinitions as Record<PathId, PathDefinition>

export function defaultBuildIdForPath(pathId: PathId) {
  return typedPathDefinitions[pathId].defaultBuild
}

export function defaultRotationIdForPath(pathId: PathId) {
  return typedPathDefinitions[pathId].defaultRotation
}

export const productionWeaponIds = new Set<WeaponId>(
  (Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).flatMap(([id, definition]) =>
    id !== "mixed" && !pathRequiresDev(definition) ? (definition.lockedWeapons ?? []) : [],
  ),
)

export function pathRequiresDev(definition: PathDefinition) {
  return definition.status !== "available" && definition.status !== "preview"
}

export function pathIsSelectable(definition: PathDefinition, devMode: boolean) {
  return !pathRequiresDev(definition) || devMode
}

export function pathStatusLabel(definition: PathDefinition) {
  switch (definition.status) {
    case "plannerOnly":
      return t("ui.app.plannerOnly")
    case "devOnly":
      return t("ui.app.dev")
    case "preview":
      return t("ui.app.preview")
    case "wip":
      return t("ui.app.wip")
    case "available":
      return ""
  }
}
