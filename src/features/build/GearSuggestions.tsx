import { useMemo } from "react"

import { formatThroughputDelta, throughputDeltaClass } from "@/application/formatting"
import type { MeasurementContext } from "@/calculations/rotationCalculationBundle"
import type { RotationRecord } from "@/calculations/rotationTimeline"
import { gearData, type BuildEntry, type GearItem, type GearSlot } from "@/gear"
import { retuneCandidates, retunePool } from "@/gearRetuning"
import { gameText, t } from "@/i18n"

import { GearDelta } from "./GearDelta"
import type { GearDraft } from "./GearEditor"
import {
  gearSuggestionTargets,
  preferredGearState,
  rankRetuneSuggestions,
  relayAffixChanges,
  suggestionItem,
} from "./gearSuggestionItems"
import { useBuildThroughputs, type ThroughputTarget } from "./useBuildThroughputs"

export function GearSuggestions(input: {
  draft: GearDraft
  definitionId: string
  slot: GearSlot
  build: BuildEntry | undefined
  gearItems: GearItem[]
  context: MeasurementContext
  rotation: RotationRecord | undefined
  editingItemId?: string
}) {
  const { draft, definitionId, slot, build, gearItems, context, rotation, editingItemId } = input
  const item = useMemo(() => suggestionItem(draft, definitionId, slot), [draft, definitionId, slot])
  const pathId = context.environment.pathId
  const candidates = useMemo(() => (item ? retuneCandidates(item, pathId) : []), [item, pathId])
  const targets = useMemo<ThroughputTarget[]>(() => {
    if (!build || build.isDefault || draft.relayed) return []
    if (!item) return []
    return gearSuggestionTargets({ build, item, slot, gearItems, editingItemId, pathId })
  }, [draft.relayed, item, pathId, slot, build, gearItems, editingItemId])
  const readings = useBuildThroughputs({ targets, gearItems, context, rotation, editorSweep: true })
  const current = readings["gear-suggestion-current"]
  const relay = readings["gear-suggestion-relay"]
  const reference = preferredGearState(current, relay)?.reading
  const ranked = rankRetuneSuggestions(candidates, readings)
  const best = ranked?.at(0)
  const relayChanges = (item ? relayAffixChanges(item) : [])
    .map(({ position, key, difference: rawDifference }) => {
      const percentage = gearData.affixes[key]?.percentage === true
      const difference = rawDifference * (percentage ? 100 : 1)
      return { position, key, difference, percentage, label: formatThroughputDelta(difference) }
    })
    .filter(change => change.label !== "0")
  let relayMessage: string | undefined
  switch (true) {
    case !rotation || !build:
      relayMessage = t("ui.gearSuggestions.needsRotation")
      break
    case targets.length === 0:
      relayMessage = t("ui.gearSuggestions.needsValues")
      break
    case !reference || !relay:
      relayMessage = t("ui.gearSuggestions.calculating")
      break
  }
  let retuneMessage: string | undefined
  switch (true) {
    case !item:
      retuneMessage = t("ui.gearSuggestions.needsValues")
      break
    case !retunePool(item!, pathId):
      retuneMessage = t("ui.gearSuggestions.missingPool")
      break
    case !rotation || !build:
      retuneMessage = t("ui.gearSuggestions.needsRotation")
      break
    case !candidates.length:
      retuneMessage = t("ui.gearSuggestions.noRetunes")
      break
    case !best || !reference:
      retuneMessage = t("ui.gearSuggestions.calculating")
      break
    case best !== undefined && reference !== undefined && best.reading.dps <= reference.dps:
      retuneMessage = t("ui.gearSuggestions.noImprovement")
      break
  }
  return (
    <aside className="gear-suggestions" aria-label={t("ui.gearSuggestions.retune")}>
      {draft.relayed ? (
        <p>{t("ui.gearSuggestions.relayedLocked")}</p>
      ) : (
        <>
          <section>
            <h4>{t("ui.gearSuggestions.relay")}</h4>
            <ul className="gear-relay-affixes">
              {relayChanges.map(change => (
                <li key={change.position}>
                  <span>{gameText(gearData.affixes[change.key]?.name)}</span>
                  <span className={throughputDeltaClass(change.difference, "damage")}>
                    {change.label}
                    {change.percentage && "%"}
                  </span>
                </li>
              ))}
            </ul>
            {relayMessage ? (
              <p>{relayMessage}</p>
            ) : (
              <div aria-live="polite">{current && relay && <GearDelta reference={current} reading={relay} />}</div>
            )}
          </section>
          <section>
            {retuneMessage ? (
              <p>{retuneMessage}</p>
            ) : (
              best &&
              item && (
                <>
                  <h4>
                    {best.relayed
                      ? t("ui.gearSuggestions.retuneThenRelay", {
                          affix: gameText(gearData.affixes[item.additionalAffixes[best.index].key]?.name),
                        })
                      : t("ui.gearSuggestions.retuneAffix", {
                          affix: gameText(gearData.affixes[item.additionalAffixes[best.index].key]?.name),
                        })}
                  </h4>
                  <ul className="gear-retune-outcomes">
                    {ranked!
                      .filter(candidate => candidate.index === best.index)
                      .map(candidate => (
                        <li key={candidate.key}>
                          <span>{gameText(gearData.affixes[candidate.key]?.name)}</span>
                          <GearDelta reference={reference} reading={candidate.reading} />
                        </li>
                      ))}
                  </ul>
                </>
              )
            )}
          </section>
        </>
      )}
    </aside>
  )
}
