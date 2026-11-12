import type { PathId } from "@/application/contracts"
import type { ThroughputReading } from "@/calculations/rotationWorkerTransport"
import { attunementData, gearData, maxGearRoll, type BuildEntry, type GearItem, type GearSlot } from "@/gear"
import { retuneCandidates, type RetuneCandidate } from "@/gearRetuning"

import { normalizeDraftValue, type GearDraft } from "./GearEditor"
import type { ThroughputTarget } from "./useBuildThroughputs"

export function retuneTargetKey(candidate: RetuneCandidate, state: "max" | "relayed") {
  return `gear-retune-${candidate.index}-${candidate.key}-${state}`
}

/** Both states must be measured before choosing; ties retain the unrelayed item. */
export function preferredGearState(current?: ThroughputReading, relayed?: ThroughputReading) {
  if (!current || !relayed) return undefined
  return relayed.dps > current.dps ? { reading: relayed, relayed: true } : { reading: current, relayed: false }
}

export function rankRetuneSuggestions(
  candidates: readonly RetuneCandidate[],
  readings: Record<string, ThroughputReading | undefined>,
) {
  const scored = []
  for (const candidate of candidates) {
    const preferred = preferredGearState(
      readings[retuneTargetKey(candidate, "max")],
      readings[retuneTargetKey(candidate, "relayed")],
    )
    if (!preferred) return undefined
    scored.push({ ...candidate, ...preferred })
  }
  return scored.toSorted((a, b) => b.reading.dps - a.reading.dps)
}

export function gearSuggestionTargets(input: {
  build: BuildEntry
  item: GearItem
  slot: GearSlot
  gearItems: GearItem[]
  editingItemId?: string
  pathId?: PathId
}): ThroughputTarget[] {
  const { build, item, slot, gearItems, editingItemId } = input
  const previewBuild: BuildEntry = {
    ...build,
    equipped: {
      ...Object.fromEntries(Object.entries(build.equipped ?? {}).filter(([, id]) => id !== editingItemId)),
      [slot]: item.id,
    },
  }
  const targets: ThroughputTarget[] = [
    { key: "gear-suggestion-current", build: previewBuild, gearItems: [...gearItems, item] },
    { key: "gear-suggestion-relay", build: previewBuild, gearItems: [...gearItems, fullyRelayedItem(item)] },
  ]
  for (const candidate of input.pathId ? retuneCandidates(item, input.pathId) : []) {
    for (const state of ["max", "relayed"] as const) {
      const outcomeItem = state === "relayed" ? fullyRelayedItem(candidate.item) : candidate.item
      targets.push({
        key: retuneTargetKey(candidate, state),
        build: previewBuild,
        gearItems: [...gearItems, outcomeItem],
      })
    }
  }
  return targets
}

/** A draft is equipped in the inspected slot for every preview, including unsaved inventory items. */
export function suggestionItem(draft: GearDraft, definitionId: string, slot: GearSlot): GearItem | undefined {
  const definition = gearData.gear[definitionId]
  if (!definition) return undefined
  const baseAffix = normalizeDraftValue(draft.baseAffix, gearData.affixes, "affix", draft.relayed, draft.level)
  if (!baseAffix) return undefined
  const additionalDrafts = draft.additionalAffixes.filter(affix => affix.key || affix.value.trim())
  const additionalAffixes = additionalDrafts.map(affix =>
    normalizeDraftValue(affix, gearData.affixes, "affix", draft.relayed, draft.level),
  )
  if (additionalAffixes.some(affix => !affix)) return undefined
  const attunement = normalizeDraftValue(draft.attunement, attunementData, "attunement", draft.relayed, draft.level)
  if ((draft.attunement.key || draft.attunement.value.trim()) && !attunement) return undefined
  return {
    id: "gear-suggestion-draft",
    definitionId,
    ...(definition.weapon ? {} : { slot }),
    level: draft.level,
    rarity: draft.rarity,
    relayed: draft.relayed,
    baseAffix,
    additionalAffixes: additionalAffixes.filter(affix => affix !== undefined),
    ...(draft.turnedAffixIndex !== undefined && draft.additionalAffixes[draft.turnedAffixIndex]?.key
      ? { turnedAffixIndex: additionalDrafts.indexOf(draft.additionalAffixes[draft.turnedAffixIndex]) }
      : {}),
    ...(attunement ? { attunement } : {}),
  }
}

/** Full modulation caps base and additional rolls at 94%; attunements keep their ordinary cap. */
export function fullyRelayedItem(item: GearItem): GearItem {
  const fullAffix = (affix: GearItem["baseAffix"]) => ({
    key: affix.key,
    value: maxGearRoll(affix.key, "affix", true, item.level) ?? affix.value,
  })
  return {
    ...item,
    relayed: true,
    baseAffix: fullAffix(item.baseAffix),
    additionalAffixes: item.additionalAffixes.map(fullAffix),
    // Modulation applies to affixes; it does not retune or improve the attunement.
  }
}

export function relayAffixChanges(item: GearItem) {
  const relayed = fullyRelayedItem(item)
  const current = [item.baseAffix, ...item.additionalAffixes]
  return [relayed.baseAffix, ...relayed.additionalAffixes].map((affix, index) => ({
    position: index,
    key: affix.key,
    difference: affix.value - current[index].value,
  }))
}
