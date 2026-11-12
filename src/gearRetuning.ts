import retuningJson from "@gamedata/retuning.json"

import type { PathId } from "@/application/contracts"
import { affixOptionsForGearDefinition, gearData, type GearItem } from "@/gear"

export type RetuneOutcome = { key: string; min: number; max: number }
type RetuningData = {
  items: Record<string, string>
  pools: Record<string, Partial<Record<PathId, RetuneOutcome[]>>>
  exclusiveAffixGroups: string[][]
}
const data = retuningJson as RetuningData

export function retunePool(item: GearItem, pathId: PathId): readonly RetuneOutcome[] | undefined {
  const group = data.items[`${item.level}/${item.rarity}/${item.definitionId}`]
  return data.pools[group]?.[pathId]
}

/** Base affixes may repeat an additional affix; exclusivity applies within the additional rows. */
export function legalAdditionalAffixes(keys: readonly string[]) {
  return (
    new Set(keys).size === keys.length &&
    data.exclusiveAffixGroups.every(group => keys.filter(key => group.includes(key)).length <= 1)
  )
}

export type RetuneCandidate = RetuneOutcome & { index: number; item: GearItem }

export function retuneCandidates(item: GearItem, pathId: PathId): RetuneCandidate[] {
  if (item.relayed) return []
  const pool = retunePool(item, pathId)
  const definition = gearData.gear[item.definitionId]
  if (!pool || !definition) return []
  const allowed = affixOptionsForGearDefinition(definition, "additionalAffixes", item.level)
  return item.additionalAffixes.flatMap((source, index) => {
    if (item.turnedAffixIndex !== undefined && item.turnedAffixIndex !== index) return []
    return pool.flatMap(outcome => {
      if (outcome.key === source.key || !allowed.includes(outcome.key)) return []
      const additionalAffixes = item.additionalAffixes.map((affix, position) =>
        position === index ? { key: outcome.key, value: outcome.max } : affix,
      )
      if (!legalAdditionalAffixes(additionalAffixes.map(affix => affix.key))) return []
      return [{ ...outcome, index, item: { ...item, additionalAffixes, turnedAffixIndex: index } }]
    })
  })
}
