import { martialArtDefinitions } from "@/application/gameData/martialArts"
import { typedPathDefinitions } from "@/application/gameData/paths"
import { sameWeaponPair } from "@/gear"
import { gameText } from "@/i18n"
import type { WeaponId } from "@/types"

export function transferItemGroup(martialArts: WeaponId[]) {
  const paths = Object.values(typedPathDefinitions)
  const index = paths.findIndex(path => path.lockedWeapons && sameWeaponPair(martialArts, path.lockedWeapons))
  if (index >= 0) return { group: gameText(paths[index].name), groupOrder: index }
  const names = [...martialArts]
    .sort()
    .map(weapon => gameText(martialArtDefinitions[weapon].name))
    .join(" / ")
  return {
    group: `${gameText(typedPathDefinitions.mixed.name)}${names ? ` · ${names}` : ""}`,
    groupOrder: paths.length,
  }
}
