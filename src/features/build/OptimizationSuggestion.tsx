import { IconAdjustmentsHorizontal, IconDice } from "@tabler/icons-react"
import { useMemo } from "react"

import { formatNumber } from "@/application/formatting"
import type { BuildSuggestionResult, ItemSuggestion, SuggestionOption } from "@/calculations/buildSuggestions"
import { defaultBuildPresets, gearData, type GearItem } from "@/gear"
import { gameText, getLocale, t } from "@/i18n"
import { Tooltip } from "@/ui/Tooltip"

import styles from "./suggestions.module.css"

export type PresentedItemSuggestion = ItemSuggestion & {
  targets: BuildSuggestionResult["targets"]
  alternatives: ReadonlyMap<string, number>
  comparisonOptions?: SuggestionOption[]
  step?: number
}

function HighlightedStat({ message, stat }: { message: string; stat: string }) {
  const index = message.indexOf(stat)
  if (index < 0) return message
  return (
    <>
      {message.slice(0, index)}
      <strong className={styles.target}>{stat}</strong>
      {message.slice(index + stat.length)}
    </>
  )
}

function Quota({ statKey, count, choices }: { statKey: string; count: number; choices: number }) {
  const stat = gameText(gearData.affixes[statKey]?.name ?? statKey)
  return <HighlightedStat message={t("ui.buildTab.suggestionQuota", { stat, count, choices })} stat={stat} />
}

function displayGain(option: SuggestionOption) {
  const min = ((option.gainRange?.min ?? option.gain) * 100).toFixed(2)
  const max = ((option.gainRange?.max ?? option.gain) * 100).toFixed(2)
  return min === max ? min : `${min}–${max}`
}

export function suggestionAlternatives(result: BuildSuggestionResult) {
  return new Map(
    result.targets.map(target => [
      target.key,
      result.items.filter(item =>
        [...item.options, ...(item.retuneAlternative?.options ?? [])].some(option =>
          option.additions.some(addition => addition.key === target.key),
        ),
      ).length,
    ]),
  )
}

export function BuildSuggestionSummary({ result }: { result: BuildSuggestionResult }) {
  if (!result.presetId) return t("ui.buildTab.suggestionNoPreset")
  const preset = defaultBuildPresets.find(preset => preset.id === result.presetId)
  const alternatives = suggestionAlternatives(result)
  return (
    <span className={styles.summary}>
      <span>{t("ui.buildTab.suggestionPreset", { name: gameText(preset?.name ?? result.presetId) })}</span>
      {result.items.length ? (
        <>
          {result.combinedGain !== undefined && (
            <strong>{t("ui.buildTab.suggestionCombinedGain", { gain: (result.combinedGain * 100).toFixed(2) })}</strong>
          )}
          {result.targets.map(target => (
            <span key={target.key}>
              <Quota statKey={target.key} count={target.count} choices={alternatives.get(target.key) ?? 0} />
            </span>
          ))}
          <span className={styles.option}>
            {result.order?.map((id, index) => {
              const item = result.items.find(item => item.itemId === id)!
              const gear = result.completion?.find(gear => gear.id === id)
              const option = item.options[0]
              const name = gear ? gameText(gearData.gear[gear.definitionId].name) : ""
              const stat = gameText(gearData.affixes[option.to]?.name ?? option.to)
              const parameters = { stat, gain: displayGain(option) }
              return (
                <span data-suggestion-step={index + 1} key={id}>
                  <strong>
                    {index + 1}. {name}
                  </strong>
                  :{" "}
                  {option.replacement ? (
                    t("ui.buildTab.suggestionFullItem", { gain: parameters.gain })
                  ) : (
                    <HighlightedStat message={t("ui.buildTab.suggestionRetune", parameters)} stat={stat} />
                  )}
                </span>
              )
            })}
          </span>
          <span>{t("ui.buildTab.suggestionAlternatives")}</span>
          <small>{t("ui.buildTab.suggestionGainRangeHint")}</small>
        </>
      ) : (
        <span>{t("ui.buildTab.suggestionNone")}</span>
      )}
    </span>
  )
}

function ReplacementRecipe({ item }: { item: GearItem }) {
  return (
    <span className={styles.option}>
      {[item.baseAffix, ...item.additionalAffixes].map((affix, position) => {
        const definition = gearData.affixes[affix.key]
        const name = gameText(definition?.name ?? affix.key)
        const value = definition?.percentage ? `${formatNumber(affix.value * 100)}%` : formatNumber(affix.value)
        return (
          <span key={`${position === 0 ? "base" : "additional"}-${affix.key}`}>
            {position === 0 ? t("ui.buildTab.baseAffix") : t("ui.buildTab.additionalAffixNumber", { number: position })}
            : <strong className={styles.target}>{name}</strong> {value}
          </span>
        )
      })}
    </span>
  )
}

export function OptimizationSuggestion({
  suggestion,
  label,
  value,
}: {
  suggestion: PresentedItemSuggestion
  label: string
  value: string
}) {
  const locale = getLocale()
  const retune = suggestion.options.some(option => option.action === "retune")
  const newItem = suggestion.options.some(option => option.action === "newItem")
  const content = useMemo(
    () => (
      <span className={styles.options} lang={locale}>
        {suggestion.step !== undefined && <strong>{suggestion.step}.</strong>}
        {suggestion.comparisonOptions && <strong>{t("ui.buildTab.suggestionSameItemChoice")}</strong>}
        {(suggestion.comparisonOptions ?? suggestion.options).map(option => {
          const stat = gameText(gearData.affixes[option.to]?.name ?? option.to)
          const parameters = { stat, gain: displayGain(option) }
          return (
            <span className={styles.option} key={`${option.action}-${option.position}-${option.to}`}>
              {option.replacement ? (
                <>
                  <strong className={styles.newItemIcon}>
                    {t("ui.buildTab.suggestionFullItem", { gain: parameters.gain })}
                  </strong>
                  <ReplacementRecipe item={option.replacement} />
                </>
              ) : (
                <>
                  <span className={styles.retuneIcon}>
                    {gameText(gearData.affixes[option.from]?.name ?? option.from)}:{" "}
                    <HighlightedStat message={t("ui.buildTab.suggestionRetune", parameters)} stat={stat} />
                  </span>
                </>
              )}
              {option.additions.length ? (
                option.additions.map(addition => {
                  const name = gameText(gearData.affixes[addition.key]?.name ?? addition.key)
                  const targetCount = suggestion.targets.find(target => target.key === addition.key)?.count
                  return (
                    <span className={styles.option} key={addition.key}>
                      <span>
                        <HighlightedStat
                          message={t("ui.buildTab.suggestionContribution", { count: addition.count, stat: name })}
                          stat={name}
                        />
                      </span>
                      {targetCount !== undefined && (
                        <span>
                          <Quota
                            statKey={addition.key}
                            count={targetCount}
                            choices={suggestion.alternatives.get(addition.key) ?? 0}
                          />
                        </span>
                      )}
                    </span>
                  )
                })
              ) : (
                <span>{t("ui.buildTab.suggestionValueUpgrade")}</span>
              )}
            </span>
          )
        })}
        <small>{t("ui.buildTab.suggestionGainRangeHint")}</small>
      </span>
    ),
    [suggestion, locale],
  )
  const rowClass = `gear-attribute ${styles.suggestedRow} ${retune ? styles.retuneRow : ""} ${newItem ? styles.newItemRow : ""}`
  return (
    <Tooltip content={content} triggerClassName={rowClass} tabIndex={0} aria-label={`${label}: ${value}`}>
      <span>
        <span className={styles.marker}>
          {retune && <IconAdjustmentsHorizontal className={styles.retuneIcon} size="1em" aria-hidden />}
          {newItem && <IconDice className={styles.newItemIcon} size="1em" aria-hidden />}
        </span>
        {label}
      </span>
      <strong>{value}</strong>
    </Tooltip>
  )
}
