import type { PathId } from "@/application/contracts"
import { pathIsSelectable, typedPathDefinitions } from "@/application/gameData/paths"
import { sameWeaponPair } from "@/gear"
import type { WeaponId } from "@/types"

export function officialImportPaths(weapons: [WeaponId, WeaponId], devMode: boolean): PathId[] {
  return (Object.keys(typedPathDefinitions) as PathId[]).filter(id => {
    const definition = typedPathDefinitions[id]
    return (
      pathIsSelectable(definition, devMode) &&
      (!definition.lockedWeapons || sameWeaponPair(definition.lockedWeapons, weapons))
    )
  })
}
