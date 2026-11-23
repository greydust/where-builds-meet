import type { GearItem } from "@/gear"

import type { AffixReplacement } from "./buildSuggestions"

export function applySuggestion(
  items: readonly GearItem[],
  change: AffixReplacement & { replacement?: GearItem },
): GearItem[] {
  if (change.replacement) return items.map(item => (item.id === change.itemId ? change.replacement! : item))
  return items.map(item =>
    item.id !== change.itemId
      ? item
      : {
          ...item,
          turnedAffixIndex: change.position > 0 ? change.position - 1 : item.turnedAffixIndex,
          // Only the replacement is hypothetical. Other affixes retain their actual values.
          baseAffix: change.position === 0 ? { key: change.to, value: change.value } : item.baseAffix,
          additionalAffixes: item.additionalAffixes.map((affix, index) =>
            index + 1 === change.position ? { key: change.to, value: change.value } : affix,
          ),
        },
  )
}
