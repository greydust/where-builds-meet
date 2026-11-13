import type { BuildEntry, GearItem } from "@/gear"

const emptyItems: GearItem[] = []
const itemsByBuild = new WeakMap<BuildEntry, GearItem[]>()

/** Only equipped gear affects a calculation. Keep its identity across unrelated inventory edits. */
export function buildGearItems(build: BuildEntry | undefined, inventory: GearItem[]): GearItem[] {
  if (!build || build.isDefault) return emptyItems
  const ids = new Set(Object.values(build.equipped ?? {}))
  const items = inventory.filter(item => ids.has(item.id))
  const previous = itemsByBuild.get(build)
  if (previous && previous.length === items.length && previous.every((item, index) => item === items[index])) {
    return previous
  }
  itemsByBuild.set(build, items)
  return items
}
