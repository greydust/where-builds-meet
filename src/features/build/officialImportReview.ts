import type { PathId } from "@/application/contracts"
import { pathIsSelectable, typedPathDefinitions } from "@/application/gameData/paths"
import { innerWayAvailableForTag } from "@/data/innerWayDefinitions"
import { sameWeaponPair } from "@/gear"
import type { OfficialGearExportValue } from "@/officialGearImport"
import type { WeaponId } from "@/types"

/** Inner Ways do not determine destinations; incompatible selections are cleared on review. */
export function officialImportPaths(weapons: [WeaponId, WeaponId], devMode: boolean): PathId[] {
  return (Object.keys(typedPathDefinitions) as PathId[]).filter(id => {
    const definition = typedPathDefinitions[id]
    return (
      pathIsSelectable(definition, devMode) &&
      (!definition.lockedWeapons || sameWeaponPair(definition.lockedWeapons, weapons))
    )
  })
}

export function officialImportForPath(value: OfficialGearExportValue, pathId: PathId): OfficialGearExportValue {
  const tag = typedPathDefinitions[pathId].tag
  return {
    ...value,
    builds: value.builds.map(build => ({
      ...build,
      setup: {
        ...build.setup,
        innerWays: build.setup.innerWays.map(row =>
          innerWayAvailableForTag(row.innerWay, tag) ? row : { innerWay: "", tier: "T0" },
        ),
      },
    })),
  }
}
