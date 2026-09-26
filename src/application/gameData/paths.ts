import pathDefinitions from "../../../data/path.json"
import { t } from "../../i18n"
import type { WeaponId } from "../../types"
import type { PathId } from "../contracts"

export type PathDefinition = {
  name: string
  tag?: string
  status: "available" | "wip" | "devOnly" | "plannerOnly"
  buildGroup: string
  defaultBuild: string
  graduated: string[]
  defaultRotation: string
  lockedWeapons?: [WeaponId, WeaponId]
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
    id !== "mixed" && definition.status === "available" ? (definition.lockedWeapons ?? []) : [],
  ),
)

export function pathRequiresDev(definition: PathDefinition) {
  return definition.status !== "available"
}

export function pathStatusLabel(definition: PathDefinition) {
  switch (definition.status) {
    case "plannerOnly":
      return t("ui.app.plannerOnly")
    case "devOnly":
      return t("ui.app.dev")
    case "wip":
      return t("ui.app.wip")
    case "available":
      return ""
  }
}
