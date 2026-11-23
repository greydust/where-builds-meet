import { summarizeGearAffixes, type GearItem } from "@/gear"
import type { WeaponId } from "@/types"

import { mainAttributeForWeapons } from "./effectiveStats"

/** Match affix composition using the same primary attribute as the damage pipeline. */
export function suggestionAffixKey(weapons: WeaponId[]) {
  const attribute = mainAttributeForWeapons(weapons)
  const suffix = attribute ? attribute[0].toUpperCase() + attribute.slice(1) : undefined
  return (key: string) => {
    if (!suffix) return key
    switch (key) {
      case "minVoidAttack":
        return `min${suffix}`
      case "maxVoidAttack":
        return `max${suffix}`
      default:
        return key
    }
  }
}

export function suggestionAffixCounts(items: readonly GearItem[], keyFor: (key: string) => string = key => key) {
  const counts = new Map<string, number>()
  for (const affix of summarizeGearAffixes(items).affixes) {
    const key = keyFor(affix.key)
    counts.set(key, (counts.get(key) ?? 0) + affix.count)
  }
  return counts
}
