import attunementJson from "@gamedata/attunement.json"

import { emptyStats } from "@/data/statDefinitions"
import type { CharacterStats, EnemyProfile, WeaponId } from "@/types"

import { attunementDamageMultiplier, attunementPenetrationMultiplier } from "./attunementStats"
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark"
import { DEFAULT_TARGET_HP_RATIO, normalizeEnemyCount, resolveTargetType } from "./combatDefaults"
import {
  calculateDamageBreakdown,
  createPreparedDamageCalculator,
  preparedDamageStatFields,
  calculateSimulatedDamageBreakdown,
  type DamageBreakdown,
  type DamageContext,
  type DamageAction,
  attackFields,
} from "./damage"
import type { AttunementStats } from "./damage"
import { mainAttributeForWeapons } from "./effectiveStats"
import { ExpectedHawkwingTracker, SimulatedHawkwingTracker, hawkwingEffectFor, type HawkwingEffect } from "./hawkwing"
import {
  calculateHealingAttackSnapshot,
  calculateHealingBreakdown,
  calculateSimulatedHealingBreakdown,
  type HealingBreakdown,
} from "./healing"
import {
  ExpectedInsightfulStrikeTracker,
  SimulatedInsightfulStrikeTracker,
  insightfulStrikeDirectAffinityBonus,
  insightfulStrikeConditionalBonus,
  insightfulStrikeEffectFor,
  type InsightfulStrikeEffect,
} from "./insightfulStrike"
import { outcomeBuffTick, type ExpectedOutcomeBuffSchedule } from "./outcomeTriggeredBuffs"
import { createPreparedEffectState } from "./preparedEffectState"
import {
  attackStatFields,
  attackInputFields,
  rateStatFields,
  referencesChangedInput,
  referencedInputs,
  RotationDamageResponse,
  type AttackStatField,
} from "./rotationDamageResponse"
import {
  emptyRotationBreakdown,
  type RotationBreakdown,
  type RotationMetrics,
  type RotationPriority,
} from "./rotationMetrics"
import {
  buildRotationTimeline,
  compareTimelineTime,
  effectsForTrackedEffect,
  mergeEffectDefinition,
  requirementsPass,
  type EditableObject,
  type InnerWayEffectRule,
  type TimelineBuildInput,
  type TimelineRow,
} from "./rotationTimeline"
import {
  applySeasonalEdgeCooldownToTimeline,
  applySeasonalVitalityRanges,
  appendSeasonalEdgeWindow,
  seasonalEdgeEffectFor,
  seasonalEdgeStateAt,
  seasonalEdgeWindows,
  type SeasonalEdgeEntryState,
  type SeasonalEdgeOutcomeDefinition,
  type SeasonalVitalityResult,
  type SeasonalEdgeWindow,
} from "./seasonalEdge"
import { groupSkillBreakdown } from "./skillBreakdownCategories"
import {
  calculateStatsWithEffects,
  calculateRawStats,
  calculateActionStats,
  resolveRawStatFormulas,
  applyStatEffects,
  collectEffectiveStatEffects,
  requirementIsUnconditional,
  type ResolvedStats,
  type EffectiveStatEffectContainer,
  type StatEffectContainer,
} from "./statEffects"
import { trackedEffectMetadata, effectState, filterTrackedEffects, type EffectState } from "./trackedEffectState"
import {
  addUnconditionalDamageEffects,
  splitStaticDamageEffect,
  subtractUnconditionalDamageEffects,
  collectUnconditionalStatEffects,
  type UnconditionalDamageEffects,
} from "./unconditionalDamageEffects"

export type RotationDamageEntry = {
  id?: string
  action: DamageAction
  context: DamageContext
  attributionContexts?: Array<{ sourceRowId: string; context: DamageContext }>
  timelineTime?: number
  timelineOrder?: number
  combatOrder?: number
  sourceRowId?: string
  activeBuffStacks?: Record<string, number>
  activeDebuffStacks?: Record<string, number>
  replay?: { sourceDamage: number; coef: number; sourceActionIds?: string[] }
  hawkwing?: HawkwingEffect
  insightfulStrike?: InsightfulStrikeEffect
  seasonalEdge?: SeasonalEdgeEntryState
  healingRecipients?: { self: number; teammates: number; teammateOverhealRatio: number }
  accumulatorSnapshot?: { physical: number; silkbind: number }
}

export type RotationActionBreakdown = DamageBreakdown & {
  healing?: HealingBreakdown
  recipientHealing?: HealingBreakdown[]
  buffedDamageBySource?: Record<string, number>
  expectedBuffStacks?: Record<string, number>
}

export type RotationCalculationVariant = { key: string; entries: RotationDamageEntry[]; duration?: number }

export type RotationCalculationBundle = {
  duration: number
  baseline: RotationDamageEntry[]
  statPriority: Array<{
    label: string
    maxRoll?: number
    entries: RotationDamageEntry[]
    duration?: number
    damage?: number
    healing?: number
  }>
  attunementPriority: Array<{
    label: string
    maxRoll?: number
    entries: RotationDamageEntry[]
    duration?: number
    damage?: number
    healing?: number
  }>
  innerWayPriority: Array<{
    label: string
    maxRoll?: number
    entries: RotationDamageEntry[]
    duration?: number
    damage?: number
    healing?: number
  }>
  setupComparisons: Record<
    string,
    Array<{
      label: string
      maxRoll?: number
      entries: RotationDamageEntry[]
      duration?: number
      damage?: number
      healing?: number
    }>
  >
}

export type RotationSimulationVariant = {
  label: string
  maxRoll?: number
  stats?: CharacterStats
  attunement?: AttunementStats
  timeline?: TimelineBuildInput
  innerWayRules?: InnerWayEffectRule[]
  innerWayConditions?: string[]
  setupEffects?: EditableObject[]
}

export type RotationSimulationBundle = {
  timeline: TimelineBuildInput
  startAnchor: { rowId: string; actionIndex?: number }
  stats: CharacterStats
  /** Complete sheet inputs supplied by the UI; omitted by raw-input diagnostic callers. */
  rawStats?: CharacterStats
  baseStats?: CharacterStats
  attunement: AttunementStats
  enemy: EnemyProfile
  /** Legacy raw-input probe field; production bundles send effective/final fields inside stats. */
  derivedStats?: DamageContext["derivedStats"]
  weapons: WeaponId[]
  statPriority: RotationSimulationVariant[]
  attunementPriority: RotationSimulationVariant[]
  innerWayPriority: RotationSimulationVariant[]
  setupComparisons: Record<string, RotationSimulationVariant[]>
}

export type RotationSimulationResult = {
  /** Published results may merge equivalent grouped damage; rebuild before event replay. */
  compactedInnerWayResults?: boolean
  metrics: RotationMetrics
  timeline: TimelineRow[]
  anchorTime: number
  duration: number
  actionBreakdowns: Record<string, RotationActionBreakdown>
}

export type RotationSimulationBaseline = RotationSimulationResult & {
  baseline: RotationDamageEntry[]
  expectedOutcomeBuffSchedule: ExpectedOutcomeBuffSchedule
  mysticVitalityDamageScale: number
}

const emptyBreakdown = (): DamageBreakdown => ({
  physical: 0,
  bellstrike: 0,
  stonesplit: 0,
  silkbind: 0,
  bamboocut: 0,
  total: 0,
})

function replayBreakdown(damage: number): DamageBreakdown {
  const total = Math.max(0, damage)
  return { physical: total, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total }
}

function combineHealingBreakdowns(recipients: HealingBreakdown[]): HealingBreakdown {
  const count = recipients.length
  const sum = (field: "physical" | "silkbind" | "total") =>
    recipients.reduce((total, healing) => total + healing[field], 0)
  return {
    physical: sum("physical"),
    silkbind: sum("silkbind"),
    total: sum("total"),
    normalRate: count > 0 ? recipients.reduce((total, healing) => total + (healing.normalRate ?? 0), 0) / count : 0,
    criticalRate: count > 0 ? recipients.reduce((total, healing) => total + (healing.criticalRate ?? 0), 0) / count : 0,
    ...(count === 1 && recipients[0].outcome ? { outcome: recipients[0].outcome } : {}),
  }
}

function calculateRotationDamageEntry(
  entry: RotationDamageEntry,
  outcomeEffects?: UnconditionalDamageEffects,
  directAffinityBonus = 0,
  random?: () => number,
  additionalEffects: EditableObject[] = [],
  preparedDamage?: ReturnType<typeof createPreparedDamageCalculator>,
): RotationActionBreakdown {
  let breakdown: RotationActionBreakdown
  if (entry.replay) {
    const replayDmgBonus = entry.context.effects.reduce(
      (total, effect) => total + (typeof effect.replayDmgBonus === "number" ? effect.replayDmgBonus : 0),
      0,
    )
    breakdown = replayBreakdown(entry.replay.sourceDamage * entry.replay.coef * (1 + replayDmgBonus))
  } else if (entry.action.type === "heal") {
    const healingContext = {
      ...entry.context,
      unconditionalDamageEffects: addUnconditionalDamageEffects(
        entry.context.unconditionalDamageEffects,
        outcomeEffects,
      ),
    }
    const recipientCount = (entry.healingRecipients?.self ?? 1) + (entry.healingRecipients?.teammates ?? 0)
    const recipientHealing = Array.from({ length: recipientCount }, () =>
      random
        ? calculateSimulatedHealingBreakdown(entry.action, healingContext, random)
        : calculateHealingBreakdown(entry.action, healingContext),
    )
    breakdown = { ...emptyBreakdown(), healing: combineHealingBreakdowns(recipientHealing), recipientHealing }
  } else {
    const damageStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const contextWithDamageEffects =
      outcomeEffects && Object.keys(outcomeEffects).length
        ? {
            ...entry.context,
            unconditionalDamageEffects: addUnconditionalDamageEffects(
              entry.context.unconditionalDamageEffects,
              outcomeEffects,
            ),
          }
        : entry.context
    const context =
      directAffinityBonus || additionalEffects.length
        ? {
            ...contextWithDamageEffects,
            effects: [
              ...contextWithDamageEffects.effects,
              ...(directAffinityBonus ? [{ stat: { directAffinity: directAffinityBonus } }] : []),
              ...additionalEffects,
            ],
          }
        : contextWithDamageEffects
    breakdown = random
      ? calculateSimulatedDamageBreakdown(entry.action, context, random)
      : (preparedDamage ?? calculateDamageBreakdown)(entry.action, context)
    if (import.meta.env.DEV) finishCalculationPhase("damageCalculation", damageStartedAt)
  }
  return breakdown
}

function blendDamageBreakdowns(
  inactive: RotationActionBreakdown,
  active: RotationActionBreakdown,
  activeProbability: number,
): RotationActionBreakdown {
  const inactiveProbability = 1 - activeProbability
  const weighted = (field: keyof DamageBreakdown) =>
    Number(inactive[field] ?? 0) * inactiveProbability + Number(active[field] ?? 0) * activeProbability
  const outcomeRates =
    inactive.outcomeRates && active.outcomeRates
      ? {
          abrasion:
            inactive.outcomeRates.abrasion * inactiveProbability + active.outcomeRates.abrasion * activeProbability,
          normal: inactive.outcomeRates.normal * inactiveProbability + active.outcomeRates.normal * activeProbability,
          critical:
            inactive.outcomeRates.critical * inactiveProbability + active.outcomeRates.critical * activeProbability,
          affinity:
            inactive.outcomeRates.affinity * inactiveProbability + active.outcomeRates.affinity * activeProbability,
        }
      : undefined
  return {
    physical: weighted("physical"),
    bellstrike: weighted("bellstrike"),
    stonesplit: weighted("stonesplit"),
    silkbind: weighted("silkbind"),
    bamboocut: weighted("bamboocut"),
    total: weighted("total"),
    ...(outcomeRates ? { outcomeRates } : {}),
  }
}

function effectsForSeasonalOutcome(context: DamageContext, outcome: SeasonalEdgeOutcomeDefinition) {
  return outcome.effects
    .filter(
      (effect): effect is EditableObject => Boolean(effect) && typeof effect === "object" && !Array.isArray(effect),
    )
    .filter(effect =>
      requirementsPass(
        effect.requirement,
        effectState(context.buffs.map(name => ({ name }))),
        effectState(),
        context.skillTags,
        new Set(),
        context.weapons,
        {},
        {
          distance: context.distance ?? 1,
          selfHPPercentage: (context.currentHPRatio ?? 1) * 100,
          targetHPPercentage: (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
        },
      ),
    )
    .map(effect =>
      effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
        ? (effect.effect as EditableObject)
        : effect,
    )
}

export type ResolvedRotationDamage = {
  entry: RotationDamageEntry
  breakdown: RotationActionBreakdown
  accumulatorThreshold?: number
  selfRecovery?: number
  expectedBuffStacks?: Record<string, number>
  outcomeEffects?: UnconditionalDamageEffects
  expectedConcentration?: {
    probability: number
    activeEffects: UnconditionalDamageEffects
    directAffinityBonus: number
  }
}

function createRotationDamageResolver(
  random?: () => number,
  schedule?: ExpectedOutcomeBuffSchedule,
  preparedDamage?: ReturnType<typeof createPreparedDamageCalculator>,
) {
  const expectedHawkwing = random ? undefined : new ExpectedHawkwingTracker()
  const simulatedHawkwing = random ? new SimulatedHawkwingTracker() : undefined
  const expectedInsightfulStrike = random ? undefined : new ExpectedInsightfulStrikeTracker()
  const simulatedInsightfulStrike = random ? new SimulatedInsightfulStrikeTracker() : undefined
  const simulatedSeasons = new Map<string, string>()
  const concentrationAt = (effect: InsightfulStrikeEffect, time: number) =>
    random
      ? Number(simulatedInsightfulStrike!.concentrationActive(effect, outcomeBuffTick(time)))
      : expectedInsightfulStrike!.expectedConcentration(effect, outcomeBuffTick(time))
  const resolve = (entry: RotationDamageEntry): ResolvedRotationDamage => {
    const tick = outcomeBuffTick(entry.timelineTime)
    const expectedBuffStacks: Record<string, number> = {}
    let outcomeEffects: UnconditionalDamageEffects = {}
    if (entry.hawkwing) {
      const stack = random
        ? simulatedHawkwing!.stack(tick)
        : (schedule?.[entry.id ?? ""]?.Hawkwing ?? expectedHawkwing!.expectedStack(entry.hawkwing, tick))
      expectedBuffStacks.Hawkwing = stack
      outcomeEffects = addUnconditionalDamageEffects(outcomeEffects, {
        physicalAttackBonus: stack * entry.hawkwing.physicalAttackBonusPerStack,
      })
    }
    if (entry.accumulatorSnapshot) {
      const attack = calculateHealingAttackSnapshot({
        ...entry.context,
        unconditionalDamageEffects: addUnconditionalDamageEffects(
          entry.context.unconditionalDamageEffects,
          outcomeEffects,
        ),
      })
      return {
        entry,
        breakdown: emptyBreakdown(),
        expectedBuffStacks,
        outcomeEffects,
        accumulatorThreshold:
          attack.averagePhysicalAttack * entry.accumulatorSnapshot.physical +
          attack.averageSilkbindAttack * entry.accumulatorSnapshot.silkbind,
      }
    }
    let concentrationProbability: number | undefined
    let concentrationEffects: UnconditionalDamageEffects = {}
    let concentrationDirectAffinity = 0
    if (entry.insightfulStrike) {
      concentrationProbability = random
        ? Number(simulatedInsightfulStrike!.concentrationActive(entry.insightfulStrike, tick))
        : (schedule?.[entry.id ?? ""]?.Concentration ??
          expectedInsightfulStrike!.expectedConcentration(entry.insightfulStrike, tick))
      expectedBuffStacks.Concentration = concentrationProbability
      concentrationEffects = {
        affinityDmgBonus: entry.insightfulStrike.affinityDamageBonus,
        dmgBonus: insightfulStrikeConditionalBonus(
          entry.insightfulStrike,
          {
            selfHPPercentage: (entry.context.currentHPRatio ?? 1) * 100,
            targetHPPercentage: (entry.context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
          },
          entry.context.skillTags,
        ),
      }
      concentrationDirectAffinity = insightfulStrikeDirectAffinityBonus(entry.insightfulStrike, {
        selfHPPercentage: (entry.context.currentHPRatio ?? 1) * 100,
        targetHPPercentage: (entry.context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
      })
    }
    const seasonalOutcomes = entry.seasonalEdge?.outcomes
    let selectedSeasonalOutcome: SeasonalEdgeOutcomeDefinition | undefined
    if (random && seasonalOutcomes?.length) {
      const windowId = entry.seasonalEdge!.windowId!
      let selectedId = simulatedSeasons.get(windowId)
      if (!selectedId) {
        const roll = random()
        let cumulative = 0
        selectedId = seasonalOutcomes[seasonalOutcomes.length - 1].id
        for (const outcome of seasonalOutcomes) {
          cumulative += outcome.weight
          if (roll < cumulative) {
            selectedId = outcome.id
            break
          }
        }
        simulatedSeasons.set(windowId, selectedId)
      }
      selectedSeasonalOutcome = seasonalOutcomes.find(outcome => outcome.id === selectedId)
    }
    if (random) selectedSeasonalOutcome?.buffs.forEach(buff => (expectedBuffStacks[buff] = 1))
    else
      seasonalOutcomes?.forEach(outcome => {
        outcome.buffs.forEach(buff => {
          expectedBuffStacks[buff] = (expectedBuffStacks[buff] ?? 0) + outcome.weight
        })
      })
    const calculateWithSeason = (
      baseOutcomeEffects: UnconditionalDamageEffects,
      directAffinityBonus: number,
    ): RotationActionBreakdown => {
      const outcomes = entry.seasonalEdge?.outcomes
      if (!outcomes?.length || entry.action.type !== "damage" || entry.replay)
        return calculateRotationDamageEntry(entry, baseOutcomeEffects, directAffinityBonus, random, [], preparedDamage)
      if (random) {
        return calculateRotationDamageEntry(
          entry,
          baseOutcomeEffects,
          directAffinityBonus,
          random,
          effectsForSeasonalOutcome(entry.context, selectedSeasonalOutcome!),
          preparedDamage,
        )
      }
      const grouped = new Map<string, { weight: number; effects: EditableObject[] }>()
      outcomes.forEach(outcome => {
        const effects = effectsForSeasonalOutcome(entry.context, outcome)
        const key = JSON.stringify(effects)
        const current = grouped.get(key)
        grouped.set(key, { weight: (current?.weight ?? 0) + outcome.weight, effects })
      })
      let combined: RotationActionBreakdown | undefined
      let combinedWeight = 0
      grouped.forEach(({ weight, effects }) => {
        const current = calculateRotationDamageEntry(
          entry,
          baseOutcomeEffects,
          directAffinityBonus,
          undefined,
          effects,
          preparedDamage,
        )
        combined = combined ? blendDamageBreakdowns(combined, current, weight / (combinedWeight + weight)) : current
        combinedWeight += weight
      })
      return combined!
    }
    let inactiveBreakdown: RotationActionBreakdown | undefined
    let activeBreakdown: RotationActionBreakdown | undefined
    let breakdown: RotationActionBreakdown
    if (concentrationProbability !== undefined && entry.action.type === "damage" && !entry.replay && !random) {
      if (concentrationProbability < 1) inactiveBreakdown = calculateWithSeason(outcomeEffects, 0)
      if (concentrationProbability > 0)
        activeBreakdown = calculateWithSeason(
          addUnconditionalDamageEffects(outcomeEffects, concentrationEffects),
          concentrationDirectAffinity,
        )
      breakdown =
        inactiveBreakdown && activeBreakdown
          ? blendDamageBreakdowns(inactiveBreakdown, activeBreakdown, concentrationProbability)
          : (activeBreakdown ?? inactiveBreakdown)!
    } else {
      const concentrationActive = concentrationProbability === 1
      breakdown = calculateWithSeason(
        concentrationActive ? addUnconditionalDamageEffects(outcomeEffects, concentrationEffects) : outcomeEffects,
        concentrationActive ? concentrationDirectAffinity : 0,
      )
      if (!random) {
        if (concentrationActive) activeBreakdown = breakdown
        else inactiveBreakdown = breakdown
      }
    }
    if (!entry.replay && breakdown.total > 0) {
      if (entry.hawkwing) {
        if (random && breakdown.outcome === entry.hawkwing.outcome)
          simulatedHawkwing!.resolveAffinity(entry.hawkwing, tick)
        else if (!random && !schedule)
          expectedHawkwing!.resolveAffinity(
            entry.hawkwing,
            tick,
            (breakdown.outcomeRates?.[entry.hawkwing.outcome] ?? 0) * Number(entry.action.hitProbability ?? 1),
          )
      }
      if (entry.insightfulStrike && entry.action.type === "damage" && !entry.context.isDot) {
        if (random && breakdown.outcome === entry.insightfulStrike.outcome)
          simulatedInsightfulStrike!.resolveAffinity(entry.insightfulStrike, tick)
        else if (!random && !schedule)
          expectedInsightfulStrike!.resolveAffinity(
            entry.insightfulStrike,
            tick,
            ((inactiveBreakdown ?? breakdown).outcomeRates?.[entry.insightfulStrike.outcome] ?? 0) *
              Number(entry.action.hitProbability ?? 1),
            ((activeBreakdown ?? breakdown).outcomeRates?.[entry.insightfulStrike.outcome] ?? 0) *
              Number(entry.action.hitProbability ?? 1),
          )
      }
    }
    const leech =
      entry.insightfulStrike && entry.action.type === "damage" && !entry.replay
        ? insightfulStrikeConditionalBonus(
            entry.insightfulStrike,
            {
              selfHPPercentage: (entry.context.currentHPRatio ?? 1) * 100,
              targetHPPercentage: (entry.context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
            },
            entry.context.skillTags,
            "leechRules",
          )
        : 0
    const selfRecovery = leech * (concentrationProbability ?? 0) * (activeBreakdown ?? breakdown).total
    return {
      entry,
      breakdown,
      ...(selfRecovery > 0 ? { selfRecovery } : {}),
      ...(Object.keys(expectedBuffStacks).length ? { expectedBuffStacks, outcomeEffects } : {}),
      ...(!random && concentrationProbability !== undefined
        ? {
            expectedConcentration: {
              probability: concentrationProbability,
              activeEffects: concentrationEffects,
              directAffinityBonus: concentrationDirectAffinity,
            },
          }
        : {}),
    }
  }
  return {
    resolve,
    resolveIncomingDamage: (damage: number, time: number, effect: InsightfulStrikeEffect | undefined) => {
      if (!effect?.incomingDamageReduction || damage <= 0) return damage
      const { chance, reduction } = effect.incomingDamageReduction
      const probability = concentrationAt(effect, time) * chance
      const proc = random ? Number(probability > 0 && random() < probability) : probability
      return damage * (1 - proc * reduction)
    },
  }
}

export function calculateRotationDamageSequence(
  entries: RotationDamageEntry[],
  random?: () => number,
  schedule?: ExpectedOutcomeBuffSchedule,
  recalculateRecordings = false,
  preparedDamage?: ReturnType<typeof createPreparedDamageCalculator>,
) {
  const resolver = createRotationDamageResolver(random, schedule, preparedDamage)
  const damageByAction = new Map<string, number>()
  return entries.map(entry => {
    const sourceIds = recalculateRecordings ? entry.replay?.sourceActionIds : undefined
    const resolvedEntry = sourceIds
      ? {
          ...entry,
          replay: {
            ...entry.replay!,
            sourceDamage: sourceIds.reduce((sum, id) => {
              const damage = damageByAction.get(id)
              if (damage === undefined) throw new Error(`Recording source action ${id} has not been resolved`)
              return sum + damage
            }, 0),
          },
        }
      : entry
    const result = resolver.resolve(resolvedEntry)
    if (recalculateRecordings && entry.id) damageByAction.set(entry.id, result.breakdown.total)
    return result
  })
}

type ResolvedRotationDamageSequence = ReturnType<typeof calculateRotationDamageSequence>

function expectedOutcomeBuffSchedule(sequence: ResolvedRotationDamageSequence): ExpectedOutcomeBuffSchedule {
  return Object.fromEntries(
    sequence.flatMap(({ entry, expectedBuffStacks }) =>
      entry.id && expectedBuffStacks ? [[entry.id, { ...expectedBuffStacks }] as const] : [],
    ),
  )
}

function averageExpectedBuffStack(sequence: ResolvedRotationDamageSequence, buffName: string) {
  const stacks = sequence.flatMap(({ entry, expectedBuffStacks }) =>
    entry.action.type === "damage" && !entry.replay && expectedBuffStacks?.[buffName] !== undefined
      ? [expectedBuffStacks[buffName]]
      : [],
  )
  return stacks.length ? stacks.reduce((total, stack) => total + stack, 0) / stacks.length : undefined
}

function contextWithOutcomeEffects(
  context: DamageContext,
  outcomeEffects: UnconditionalDamageEffects | undefined,
  directAffinityBonus = 0,
  additionalEffects: EditableObject[] = [],
) {
  const withDamageEffects =
    outcomeEffects && Object.keys(outcomeEffects).length
      ? {
          ...context,
          unconditionalDamageEffects: addUnconditionalDamageEffects(context.unconditionalDamageEffects, outcomeEffects),
        }
      : context
  return directAffinityBonus || additionalEffects.length
    ? {
        ...withDamageEffects,
        effects: [
          ...withDamageEffects.effects,
          ...(directAffinityBonus ? [{ stat: { directAffinity: directAffinityBonus } }] : []),
          ...additionalEffects,
        ],
      }
    : withDamageEffects
}

function calculateExpectedSeasonalDamage(
  action: DamageAction,
  context: DamageContext,
  outcomeEffects: UnconditionalDamageEffects | undefined,
  directAffinityBonus: number,
  seasonalEdge: SeasonalEdgeEntryState | undefined,
) {
  if (!seasonalEdge?.outcomes?.length || action.type !== "damage")
    return calculateDamageBreakdown(action, contextWithOutcomeEffects(context, outcomeEffects, directAffinityBonus))
  const grouped = new Map<string, { weight: number; effects: EditableObject[] }>()
  seasonalEdge.outcomes.forEach(outcome => {
    const effects = effectsForSeasonalOutcome(context, outcome)
    const key = JSON.stringify(effects)
    const current = grouped.get(key)
    grouped.set(key, { weight: (current?.weight ?? 0) + outcome.weight, effects })
  })
  let combined: RotationActionBreakdown | undefined
  let combinedWeight = 0
  grouped.forEach(({ weight, effects }) => {
    const current = calculateDamageBreakdown(
      action,
      contextWithOutcomeEffects(context, outcomeEffects, directAffinityBonus, effects),
    )
    combined = combined ? blendDamageBreakdowns(combined, current, weight / (combinedWeight + weight)) : current
    combinedWeight += weight
  })
  return combined!
}

function calculateExpectedOutcomeDamage(
  action: DamageAction,
  context: DamageContext,
  outcomeEffects: UnconditionalDamageEffects | undefined,
  concentration: ResolvedRotationDamage["expectedConcentration"],
  seasonalEdge?: SeasonalEdgeEntryState,
) {
  const inactive = calculateExpectedSeasonalDamage(action, context, outcomeEffects, 0, seasonalEdge)
  if (!concentration || concentration.probability <= 0) return inactive
  const active = calculateExpectedSeasonalDamage(
    action,
    context,
    addUnconditionalDamageEffects(outcomeEffects, concentration.activeEffects),
    concentration.directAffinityBonus,
    seasonalEdge,
  )
  return concentration.probability >= 1 ? active : blendDamageBreakdowns(inactive, active, concentration.probability)
}

function sumResolvedSequence(sequence: ResolvedRotationDamageSequence) {
  return sequence.reduce(
    (total, { breakdown }) => {
      return {
        physical: total.physical + breakdown.physical,
        bellstrike: total.bellstrike + breakdown.bellstrike,
        stonesplit: total.stonesplit + breakdown.stonesplit,
        silkbind: total.silkbind + breakdown.silkbind,
        bamboocut: total.bamboocut + breakdown.bamboocut,
        total: total.total + breakdown.total,
        healing: total.healing + (breakdown.healing?.total ?? 0),
      }
    },
    { ...emptyBreakdown(), healing: 0 },
  )
}

function mysticDamageInResolvedSequence(sequence: ResolvedRotationDamageSequence) {
  return sequence.reduce(
    (total, { entry, breakdown }) => total + (entry.context.skillTags.includes("Mystic") ? breakdown.total : 0),
    0,
  )
}

function vitalityDamageScale(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  seasonalVitality?: SeasonalVitalityResult,
) {
  if (input.rotation.infiniteVitality) return 1
  const summary = timeline.find(row => row.timelineResourceSummary)?.timelineResourceSummary?.Vitality
  if (!summary || summary.consumed <= 0) return 1
  const scaleForEndingVitality = (endingVitality: number) =>
    endingVitality < 0 ? Math.max(0, Math.min(1, (summary.consumed + endingVitality) / summary.consumed)) : 1
  return seasonalVitality
    ? seasonalVitality.endingDistribution.reduce(
        (total, outcome) => total + scaleForEndingVitality(outcome.vitality) * outcome.probability,
        0,
      )
    : scaleForEndingVitality(summary.final)
}

function sumEntries(entries: RotationDamageEntry[]) {
  return sumResolvedSequence(calculateRotationDamageSequence(entries))
}

function priorityRow(
  label: string,
  baselineDps: number,
  variantDps: number,
  baselineHps: number,
  variantHps: number,
  maxRoll?: number,
): RotationPriority {
  return {
    label,
    maxRoll,
    increase: baselineDps > 0 ? (variantDps / baselineDps - 1) * 100 : 0,
    dpsDifference: variantDps - baselineDps,
    healingIncrease: baselineHps > 0 ? (variantHps / baselineHps - 1) * 100 : 0,
    hpsDifference: variantHps - baselineHps,
  }
}

function calculatePriorityRows(
  baselineDps: number,
  baselineHps: number,
  duration: number,
  variants: Array<{
    label: string
    maxRoll?: number
    entries: RotationDamageEntry[]
    duration?: number
    damage?: number
    healing?: number
  }>,
  order: "ascending" | "descending" = "descending",
) {
  const rows = variants.map(({ label, maxRoll, entries, duration: variantDuration = duration, damage, healing }) => {
    const totals = damage === undefined || healing === undefined ? sumEntries(entries) : undefined
    return priorityRow(
      label,
      baselineDps,
      variantDuration > 0 ? (damage ?? totals?.total ?? 0) / variantDuration : 0,
      baselineHps,
      variantDuration > 0 ? (healing ?? totals?.healing ?? 0) / variantDuration : 0,
      maxRoll,
    )
  })
  return sortRotationPriorityRows(rows, order)
}

export function sortRotationPriorityRows<T extends RotationPriority>(
  rows: T[],
  order: "ascending" | "descending" = "descending",
) {
  const direction = order === "ascending" ? 1 : -1
  return [...rows].sort(
    (left, right) =>
      direction * (left.dpsDifference - right.dpsDifference) || direction * (left.hpsDifference - right.hpsDifference),
  )
}

export function sortAttunementPriorityRows(rows: RotationPriority[]) {
  const penetrationLabels = new Set(
    Object.values(attunementJson)
      .filter(definition =>
        Object.keys(definition.effect?.stat ?? {}).some(
          key => key === "physicalPenetration" || key === "formlessPenetration",
        ),
      )
      .map(definition => definition.name),
  )
  return [
    ...sortRotationPriorityRows(rows.filter(row => penetrationLabels.has(row.label))),
    ...sortRotationPriorityRows(rows.filter(row => !penetrationLabels.has(row.label))),
  ]
}

/**
 * Pure calculation entry point. It has no React or browser storage dependency;
 * callers build the timeline and provide all state needed for each variant.
 */
export function calculateRotationMetrics(
  bundle: RotationCalculationBundle,
  baselineDamageOverride?: number,
  baselineHealingOverride?: number,
  unscaledDamageOverride?: number,
): RotationMetrics {
  const duration = Math.max(0, bundle.duration)
  const baselineTotals =
    baselineDamageOverride === undefined || baselineHealingOverride === undefined
      ? sumEntries(bundle.baseline)
      : undefined
  const baselineDamage = baselineDamageOverride ?? baselineTotals?.total ?? 0
  const unscaledDamage = unscaledDamageOverride ?? baselineDamage
  const baselineHealing = baselineHealingOverride ?? baselineTotals?.healing ?? 0
  const baselineDps = duration > 0 ? baselineDamage / duration : 0
  const unscaledDps = duration > 0 ? unscaledDamage / duration : 0
  const baselineHps = duration > 0 ? baselineHealing / duration : 0
  const setupComparisons = Object.fromEntries(
    Object.entries(bundle.setupComparisons).map(([group, variants]) => [
      group,
      calculatePriorityRows(baselineDps, baselineHps, duration, variants),
    ]),
  )

  const attunementRows = calculatePriorityRows(baselineDps, baselineHps, duration, bundle.attunementPriority)
  return {
    totalDamage: baselineDamage,
    dps: baselineDps,
    unscaledTotalDamage: unscaledDamage,
    unscaledDps,
    totalHealing: baselineHealing,
    hps: baselineHps,
    breakdown: emptyRotationBreakdown(),
    statPriority: calculatePriorityRows(baselineDps, baselineHps, duration, bundle.statPriority, "descending"),
    attunementPriority: sortAttunementPriorityRows(attunementRows),
    innerWayPriority: calculatePriorityRows(baselineDps, baselineHps, duration, bundle.innerWayPriority, "ascending"),
    setupComparisons,
  }
}

function calculateBreakdown(
  timeline: TimelineRow[],
  actionBreakdowns: Record<string, RotationActionBreakdown>,
  entries: RotationDamageEntry[],
  effectDefinitions: TimelineBuildInput["effectDefinitions"],
  duration: number,
  totalDamage: number,
  totalHealing: number,
  skillDefinitions: TimelineBuildInput["skills"],
): RotationBreakdown {
  const percentage = (damage: number) => (totalDamage > 0 ? (damage / totalDamage) * 100 : 0)
  const healingPercentage = (healing: number) => (totalHealing > 0 ? (healing / totalHealing) * 100 : 0)
  const outputEntries = entries.filter(entry => {
    if (!entry.id || entry.replay) return false
    const breakdown = actionBreakdowns[entry.id]
    return Boolean(breakdown && (breakdown.total > 0 || (breakdown.healing?.total ?? 0) > 0))
  })
  const healingRecipientCounts = new Map(
    entries.flatMap(entry => {
      if (!entry.id || entry.action.type !== "heal") return []
      const recipients = entry.healingRecipients ?? { self: 1, teammates: 0 }
      return [[entry.id, recipients.self + recipients.teammates] as const]
    }),
  )
  const debuffMaxStackCoverage = (id: string) =>
    duration > 0 ? Math.min(100, ((timeline[0]?.debuffMaxStackSeconds?.[id] ?? 0) / duration) * 100) : 0
  const effectCoverage = (field: "activeBuffStacks" | "activeDebuffStacks") => {
    const isDebuff = field === "activeDebuffStacks"
    return Object.entries(effectDefinitions)
      .filter(([, definition]) => definition.showCoverage === true)
      .map(([id, definition]) => {
        const totalStacks = outputEntries.reduce((total, entry) => {
          const expectedStacks =
            !isDebuff && entry.id ? actionBreakdowns[entry.id]?.expectedBuffStacks?.[id] : undefined
          const trackedStacks = entry[field]?.[id] ?? 0
          return total + (expectedStacks ?? trackedStacks)
        }, 0)
        const averageStacks = outputEntries.length > 0 ? totalStacks / outputEntries.length : 0
        return Object.assign(
          { id, averageStacks },
          isDebuff && definition.shared === true ? { maxStackCoverage: debuffMaxStackCoverage(id) } : {},
        )
      })
      .filter(row => row.averageStacks > 0 || (row.maxStackCoverage ?? 0) > 0)
      .sort(
        (left, right) =>
          right.averageStacks - left.averageStacks ||
          (right.maxStackCoverage ?? 0) - (left.maxStackCoverage ?? 0) ||
          left.id.localeCompare(right.id),
      )
  }
  const skills = new Map<
    string,
    {
      id: string
      name: string
      casts: number
      triggers: number
      hits: number
      abrasionTotal: number
      normalTotal: number
      criticalTotal: number
      affinityTotal: number
      damage: number
      tags: string[]
      skillBreakdownCategory?: string
    }
  >()
  const healingSkills = new Map<
    string,
    {
      id: string
      name: string
      casts: number
      triggers: number
      heals: number
      healing: number
      normalTotal: number
      criticalTotal: number
      tags: string[]
      skillBreakdownCategory?: string
    }
  >()
  const damageGroupRowIds = new Set(timeline.filter(row => row.kind === "damageGroup").map(row => row.id))
  const castRows = timeline.filter(
    row =>
      !row.skipped &&
      row.step.type === "skill" &&
      row.step.skill &&
      (row.kind === "rotation" ||
        row.kind === "damageGroup" ||
        (row.kind === "trigger" && row.triggerSource === "innerWay" && !damageGroupRowIds.has(row.sourceRowId ?? ""))),
  )
  const casts = new Map(
    castRows.map(row => [
      row.id,
      {
        id: row.id,
        skillId: row.step.type === "skill" ? (row.step.skill ?? "") : "",
        name: row.skill?.name ?? (row.step.type === "skill" ? (row.step.skill ?? "") : ""),
        castTime: row.effectiveCastTime,
        damage: 0,
        healing: 0,
        buffedDamage: 0,
        vitalitySpent: row.resourceConsumption?.Vitality ?? 0,
        time: row.startTime,
        order: row.order,
      },
    ]),
  )
  const rowsById = new Map(timeline.map(row => [row.id, row]))
  const orderedRotationCasts = castRows
    .filter(row => row.kind === "rotation")
    .sort(
      (left, right) =>
        (left.rotationIndex ?? Number.MAX_SAFE_INTEGER) - (right.rotationIndex ?? Number.MAX_SAFE_INTEGER),
    )
  orderedRotationCasts.forEach((row, index) => {
    const followingRow = orderedRotationCasts[index + 1]
    if (followingRow?.step.type !== "skill" || followingRow.step.skill !== "Deflect") return
    const cast = casts.get(row.id)
    if (cast) cast.castTime += followingRow.effectiveCastTime
  })
  const owningCastId = (row: TimelineRow, overrideSourceId?: string) => {
    if (!overrideSourceId && casts.has(row.id)) return row.id
    let sourceId = overrideSourceId ?? row.sourceRowId
    const visited = new Set<string>()
    while (sourceId && !visited.has(sourceId)) {
      if (casts.has(sourceId)) return sourceId
      visited.add(sourceId)
      sourceId = rowsById.get(sourceId)?.sourceRowId
    }
    return undefined
  }

  const breakdownRows = timeline.flatMap<TimelineRow>(row => {
    if (row.step.type !== "skill" || !row.step.skill || !row.actionSkillIds) return [row]
    const rootId = row.step.skill
    const attributedSkills = new Map<string, NonNullable<TimelineRow["skill"]>>()
    const owners = row.actions.map((_, index) => {
      const componentId = row.actionSkillIds?.[index]
      const component = componentId ? skillDefinitions[componentId] : undefined
      const category = row.actionSkillCategories?.[index]?.trim() ?? component?.skillBreakdownCategory?.trim()
      if (!componentId || !component || !category) return rootId
      const id =
        category === component.skillBreakdownCategory?.trim() ? componentId : `${componentId}:category:${category}`
      attributedSkills.set(id, Object.assign({}, component, { skillBreakdownCategory: category }))
      return id
    })
    return [...new Set(owners)].map(skillId =>
      Object.assign({}, row, {
        step: { type: "skill" as const, skill: skillId },
        skill: attributedSkills.get(skillId) ?? skillDefinitions[skillId] ?? row.skill,
        actions: row.actions.map((action, index) => (owners[index] === skillId ? action : { type: "inactive" })),
      }),
    )
  })
  breakdownRows.forEach(row => {
    if (row.skipped || row.step.type !== "skill" || !row.step.skill) return
    const id = row.step.skill
    const hasCountedDamage = row.actions.some(
      (action, actionIndex) =>
        (action.type === "damage" || action.type === "replay") && Boolean(actionBreakdowns[`${row.id}:${actionIndex}`]),
    )
    const hasCountedHealing = row.actions.some(
      (action, actionIndex) => action.type === "heal" && Boolean(actionBreakdowns[`${row.id}:${actionIndex}`]?.healing),
    )
    const current = skills.get(id) ?? {
      id,
      name: row.skill?.name ?? id,
      skillBreakdownCategory: row.skill?.skillBreakdownCategory,
      casts: 0,
      triggers: 0,
      hits: 0,
      abrasionTotal: 0,
      normalTotal: 0,
      criticalTotal: 0,
      affinityTotal: 0,
      damage: 0,
      tags: row.skill?.tags ?? [],
    }
    const currentHealing = healingSkills.get(id) ?? {
      id,
      name: row.skill?.name ?? id,
      skillBreakdownCategory: row.skill?.skillBreakdownCategory,
      casts: 0,
      triggers: 0,
      heals: 0,
      healing: 0,
      normalTotal: 0,
      criticalTotal: 0,
      tags: row.skill?.tags ?? [],
    }
    if (row.kind === "rotation") current.casts += 1
    else if (hasCountedDamage)
      current.triggers += Number(row.actions.find(action => action.type === "damage")?.hitProbability ?? 1)
    if (row.kind === "rotation") currentHealing.casts += 1
    else if (hasCountedHealing) currentHealing.triggers += 1
    row.actions.forEach((action, actionIndex) => {
      if (action.type === "damage" || action.type === "replay") {
        const breakdown = actionBreakdowns[`${row.id}:${actionIndex}`]
        if (!breakdown) return
        const castId = owningCastId(row)
        const cast = castId ? casts.get(castId) : undefined
        if (row.sourceDamageWeights) {
          for (const [source, weight] of Object.entries(row.sourceDamageWeights)) {
            const sourceCastId = owningCastId(row, source)
            const sourceCast = sourceCastId ? casts.get(sourceCastId) : undefined
            if (sourceCast) sourceCast.damage += breakdown.total * weight
          }
        } else if (cast) cast.damage += breakdown.total
        Object.entries(breakdown.buffedDamageBySource ?? {}).forEach(([sourceRowId, damage]) => {
          const sourceCast = casts.get(sourceRowId)
          if (sourceCast) sourceCast.buffedDamage += damage
        })
        const hitProbability = Number(action.hitProbability ?? 1)
        current.hits += hitProbability
        current.damage += breakdown.total
        current.abrasionTotal += (breakdown.outcomeRates?.abrasion ?? 0) * hitProbability
        current.normalTotal += (breakdown.outcomeRates?.normal ?? 0) * hitProbability
        current.criticalTotal += (breakdown.outcomeRates?.critical ?? 0) * hitProbability
        current.affinityTotal += (breakdown.outcomeRates?.affinity ?? 0) * hitProbability
      } else if (action.type === "heal") {
        const actionId = `${row.id}:${actionIndex}`
        const breakdown = actionBreakdowns[actionId]
        if (!breakdown?.healing) return
        const castId = owningCastId(row)
        const cast = castId ? casts.get(castId) : undefined
        if (cast) cast.healing += breakdown.healing.total
        const recipientCount = healingRecipientCounts.get(actionId) ?? 1
        currentHealing.heals += recipientCount
        currentHealing.healing += breakdown.healing.total
        currentHealing.normalTotal += (breakdown.healing.normalRate ?? 0) * recipientCount
        currentHealing.criticalTotal += (breakdown.healing.criticalRate ?? 0) * recipientCount
      }
    })
    skills.set(id, current)
    healingSkills.set(id, currentHealing)
  })

  const categoryTotals = { martialArts: 0, mystic: 0, other: 0 }
  skills.forEach(skill => {
    if (skill.tags.includes("MartialArts")) categoryTotals.martialArts += skill.damage
    else if (skill.tags.includes("Mystic")) categoryTotals.mystic += skill.damage
    else categoryTotals.other += skill.damage
  })
  const healingCategoryTotals = { martialArts: 0, mystic: 0, other: 0 }
  healingSkills.forEach(skill => {
    if (skill.tags.includes("MartialArts")) healingCategoryTotals.martialArts += skill.healing
    else if (skill.tags.includes("Mystic")) healingCategoryTotals.mystic += skill.healing
    else healingCategoryTotals.other += skill.healing
  })

  const damageTotals = Object.values(actionBreakdowns).reduce(
    (total, breakdown) => ({
      physical: total.physical + breakdown.physical,
      bellstrike: total.bellstrike + breakdown.bellstrike,
      stonesplit: total.stonesplit + breakdown.stonesplit,
      silkbind: total.silkbind + breakdown.silkbind,
      bamboocut: total.bamboocut + breakdown.bamboocut,
    }),
    { physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 },
  )
  const healingTotals = Object.values(actionBreakdowns).reduce(
    (total, breakdown) => ({
      physical: total.physical + (breakdown.healing?.physical ?? 0),
      silkbind: total.silkbind + (breakdown.healing?.silkbind ?? 0),
    }),
    { physical: 0, silkbind: 0 },
  )

  return {
    groupedSkills: [],
    groupedHealingSkills: [],
    skills: [...skills.values()]
      .filter(skill => skill.damage > 0)
      .map(({ tags: _tags, abrasionTotal, normalTotal, criticalTotal, affinityTotal, ...skill }) =>
        Object.assign(skill, {
          abrasionRate: skill.hits > 0 ? (abrasionTotal / skill.hits) * 100 : 0,
          normalRate: skill.hits > 0 ? (normalTotal / skill.hits) * 100 : 0,
          criticalRate: skill.hits > 0 ? (criticalTotal / skill.hits) * 100 : 0,
          affinityRate: skill.hits > 0 ? (affinityTotal / skill.hits) * 100 : 0,
          percentage: percentage(skill.damage),
        }),
      )
      .sort((left, right) => right.damage - left.damage || left.name.localeCompare(right.name)),
    healingSkills: [...healingSkills.values()]
      .filter(skill => skill.healing > 0)
      .map(({ tags: _tags, normalTotal, criticalTotal, ...skill }) =>
        Object.assign(skill, {
          normalRate: skill.heals > 0 ? (normalTotal / skill.heals) * 100 : 0,
          criticalRate: skill.heals > 0 ? (criticalTotal / skill.heals) * 100 : 0,
          percentage: healingPercentage(skill.healing),
        }),
      )
      .sort((left, right) => right.healing - left.healing || left.name.localeCompare(right.name)),
    casts: [...casts.values()]
      .filter(cast => cast.damage > 0 || cast.buffedDamage > 0)
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order)
      .reduce<
        Array<{
          id: string
          skillId: string
          name: string
          casts: number
          totalCastTime: number
          dpsTotal: number
          dpsWithBuffTotal: number
          dpsSamples: number
          damage: number
          buffedDamage: number
          vitalitySpent: number
        }>
      >((groups, cast) => {
        const existing = groups.find(group => group.skillId === cast.skillId)
        const group = existing ?? {
          id: cast.skillId,
          skillId: cast.skillId,
          name: cast.name,
          casts: 0,
          totalCastTime: 0,
          dpsTotal: 0,
          dpsWithBuffTotal: 0,
          dpsSamples: 0,
          damage: 0,
          buffedDamage: 0,
          vitalitySpent: 0,
        }
        if (!existing) groups.push(group)
        group.casts += 1
        group.totalCastTime += cast.castTime
        group.damage += cast.damage
        group.buffedDamage += cast.buffedDamage
        group.vitalitySpent += cast.vitalitySpent
        if (cast.castTime > 0) {
          group.dpsTotal += cast.damage / cast.castTime
          group.dpsWithBuffTotal += (cast.damage + cast.buffedDamage) / cast.castTime
          group.dpsSamples += 1
        }
        return groups
      }, [])
      .map(({ totalCastTime, dpsTotal, dpsWithBuffTotal, dpsSamples, buffedDamage, ...group }) => {
        const damagePerVitality = group.vitalitySpent > 0 ? group.damage / group.vitalitySpent : undefined
        return Object.assign(
          group,
          {
            averageCastTime: group.casts > 0 ? totalCastTime / group.casts : 0,
            averageDamage: group.casts > 0 ? group.damage / group.casts : 0,
          },
          dpsSamples > 0 ? { averageDps: dpsTotal / dpsSamples } : {},
          damagePerVitality === undefined ? {} : { damagePerVitality },
          buffedDamage > 0
            ? Object.assign(
                {
                  averageDamageWithBuff: group.casts > 0 ? (group.damage + buffedDamage) / group.casts : 0,
                  damageWithBuff: group.damage + buffedDamage,
                },
                dpsSamples > 0 ? { averageDpsWithBuff: dpsWithBuffTotal / dpsSamples } : {},
                group.vitalitySpent > 0
                  ? { damagePerVitalityWithBuff: (group.damage + buffedDamage) / group.vitalitySpent }
                  : {},
              )
            : {},
          { percentage: percentage(group.damage) },
        )
      })
      .sort(
        (left, right) =>
          (right.averageDpsWithBuff ?? right.averageDps ?? Number.NEGATIVE_INFINITY) -
            (left.averageDpsWithBuff ?? left.averageDps ?? Number.NEGATIVE_INFINITY) ||
          (right.damageWithBuff ?? right.damage) - (left.damageWithBuff ?? left.damage) ||
          left.name.localeCompare(right.name),
      ),
    healingCasts: [...casts.values()]
      .filter(cast => cast.healing > 0)
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order)
      .reduce<
        Array<{
          id: string
          skillId: string
          name: string
          casts: number
          totalCastTime: number
          hpsTotal: number
          hpsSamples: number
          healing: number
        }>
      >((groups, cast) => {
        const existing = groups.find(group => group.skillId === cast.skillId)
        const group = existing ?? {
          id: cast.skillId,
          skillId: cast.skillId,
          name: cast.name,
          casts: 0,
          totalCastTime: 0,
          hpsTotal: 0,
          hpsSamples: 0,
          healing: 0,
        }
        if (!existing) groups.push(group)
        group.casts += 1
        group.totalCastTime += cast.castTime
        group.healing += cast.healing
        if (cast.castTime > 0) {
          group.hpsTotal += cast.healing / cast.castTime
          group.hpsSamples += 1
        }
        return groups
      }, [])
      .map(({ totalCastTime, hpsTotal, hpsSamples, ...group }) =>
        Object.assign(
          group,
          {
            averageCastTime: group.casts > 0 ? totalCastTime / group.casts : 0,
            averageHealing: group.casts > 0 ? group.healing / group.casts : 0,
          },
          hpsSamples > 0 ? { averageHps: hpsTotal / hpsSamples } : {},
          { percentage: healingPercentage(group.healing) },
        ),
      )
      .sort(
        (left, right) =>
          (right.averageHps ?? Number.NEGATIVE_INFINITY) - (left.averageHps ?? Number.NEGATIVE_INFINITY) ||
          right.healing - left.healing ||
          left.name.localeCompare(right.name),
      ),
    categories: [
      {
        id: "martialArts",
        name: "Martial Arts",
        damage: categoryTotals.martialArts,
        percentage: percentage(categoryTotals.martialArts),
      },
      { id: "mystic", name: "Mystic", damage: categoryTotals.mystic, percentage: percentage(categoryTotals.mystic) },
      { id: "other", name: "Other", damage: categoryTotals.other, percentage: percentage(categoryTotals.other) },
    ],
    healingCategories: [
      {
        id: "martialArts",
        name: "Martial Arts",
        healing: healingCategoryTotals.martialArts,
        percentage: healingPercentage(healingCategoryTotals.martialArts),
      },
      {
        id: "mystic",
        name: "Mystic",
        healing: healingCategoryTotals.mystic,
        percentage: healingPercentage(healingCategoryTotals.mystic),
      },
      {
        id: "other",
        name: "Other",
        healing: healingCategoryTotals.other,
        percentage: healingPercentage(healingCategoryTotals.other),
      },
    ],
    damageTypes: [
      {
        id: "physical",
        name: "Physical",
        damage: damageTotals.physical,
        percentage: percentage(damageTotals.physical),
      },
      {
        id: "bellstrike",
        name: "Bellstrike",
        damage: damageTotals.bellstrike,
        percentage: percentage(damageTotals.bellstrike),
      },
      {
        id: "stonesplit",
        name: "Stonesplit",
        damage: damageTotals.stonesplit,
        percentage: percentage(damageTotals.stonesplit),
      },
      {
        id: "silkbind",
        name: "Silkbind",
        damage: damageTotals.silkbind,
        percentage: percentage(damageTotals.silkbind),
      },
      {
        id: "bamboocut",
        name: "Bamboocut",
        damage: damageTotals.bamboocut,
        percentage: percentage(damageTotals.bamboocut),
      },
    ],
    healingTypes: [
      {
        id: "physical",
        name: "Physical",
        healing: healingTotals.physical,
        percentage: healingPercentage(healingTotals.physical),
      },
      {
        id: "silkbind",
        name: "Silkbind",
        healing: healingTotals.silkbind,
        percentage: healingPercentage(healingTotals.silkbind),
      },
    ],
    buffCoverage: effectCoverage("activeBuffStacks"),
    debuffCoverage: effectCoverage("activeDebuffStacks"),
  }
}

function combatCutoff(timeline: TimelineRow[]) {
  const row = timeline
    .filter(
      candidate =>
        !candidate.skipped &&
        candidate.kind === "rotation" &&
        candidate.step.type === "event" &&
        candidate.step.event === "BattleEnd",
    )
    .sort((left, right) => compareTimelineTime(left.startTime, right.startTime) || left.order - right.order)[0]
  if (row) return { time: row.startTime, order: row.order }
  const end = timeline[0]?.timelineEndTime
  return end === undefined ? undefined : { time: end, order: Number.POSITIVE_INFINITY }
}

const skillStaticRequirementTargets = new Set(["skillTag", "martialArt", "equippedMartialArt"])

function requirementNodeIsSkillStatic(node: unknown): boolean {
  if (Array.isArray(node)) return node.every(requirementNodeIsSkillStatic)
  if (!node || typeof node !== "object") return false
  const condition = node as EditableObject
  switch (condition.operator) {
    case "or":
      return Array.isArray(condition.operand) && condition.operand.every(requirementNodeIsSkillStatic)
    case "not":
      return (
        Array.isArray(condition.operand) &&
        condition.operand.length === 1 &&
        requirementNodeIsSkillStatic(condition.operand[0])
      )
    default:
      return typeof condition.target === "string" && skillStaticRequirementTargets.has(condition.target)
  }
}

function requirementIsSkillStatic(requirement: unknown): boolean {
  if (requirement === undefined) return true
  return Array.isArray(requirement)
    ? requirement.every(requirementNodeIsSkillStatic)
    : requirementNodeIsSkillStatic(requirement)
}

function unwrappedEffect(effect: EditableObject): EditableObject {
  return effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
    ? { ...(effect.effect as EditableObject), ...(effect.statStage ? { statStage: effect.statStage } : {}) }
    : effect
}

function splitStaticStatEffect(effect: EditableObject): {
  statEffect?: StatEffectContainer & EffectiveStatEffectContainer
  remaining?: EditableObject
} {
  const statEffect: StatEffectContainer & EffectiveStatEffectContainer = {}
  if (effect.rawStat && typeof effect.rawStat === "object" && !Array.isArray(effect.rawStat))
    statEffect.rawStat = effect.rawStat as StatEffectContainer["rawStat"]
  if (effect.statStage === "talent" || effect.statStage === "food") statEffect.statStage = effect.statStage
  if (effect.stat && typeof effect.stat === "object" && !Array.isArray(effect.stat))
    statEffect.stat = effect.stat as StatEffectContainer["stat"]
  if (effect.effectiveStat && typeof effect.effectiveStat === "object" && !Array.isArray(effect.effectiveStat))
    statEffect.effectiveStat = effect.effectiveStat as EffectiveStatEffectContainer["effectiveStat"]

  const remaining = { ...effect }
  delete remaining.stat
  delete remaining.rawStat
  delete remaining.effectiveStat
  delete remaining.statStage
  const hasStatEffect = Boolean(statEffect.rawStat || statEffect.stat || statEffect.effectiveStat)
  if (Object.keys(remaining).every(key => key === "id")) return hasStatEffect ? { statEffect } : {}
  return { ...(hasStatEffect ? { statEffect } : {}), ...(Object.keys(remaining).length ? { remaining } : {}) }
}

function unconditionalStatEffects(setup: EditableObject[], rules: InnerWayEffectRule[]) {
  return [
    ...setup.filter(effect => requirementIsUnconditional(effect.requirement)).map(unwrappedEffect),
    ...rules.filter(rule => requirementIsUnconditional(rule.requirement)).map(rule => rule.effect),
  ].flatMap(effect => {
    const split = splitStaticStatEffect(effect)
    return split.statEffect ? [split.statEffect] : []
  })
}

/** UI bundles already carry the completed sheet; raw-input probes use this same preparation boundary. */
function rotationStatState(bundle: RotationSimulationBundle) {
  const effects = unconditionalStatEffects(bundle.timeline.setupEffects, bundle.timeline.innerWayRules)
  const prepared = bundle.rawStats
    ? undefined
    : calculateStatsWithEffects(bundle.stats, effects, bundle.enemy.judgementResistance, bundle.weapons)
  return {
    stats: prepared?.stats ?? (bundle.stats as ResolvedStats),
    rawStats: bundle.rawStats ?? prepared!.rawStats,
    baseStats: bundle.baseStats ?? bundle.stats,
    effects,
    attunement: bundle.attunement,
    enemy: bundle.enemy,
    weapons: bundle.weapons,
  }
}

function variantStatState(
  state: ReturnType<typeof rotationStatState>,
  setup: EditableObject[],
  rules: InnerWayEffectRule[],
  variant: RotationSimulationVariant,
) {
  if (!variant.stats && !variant.setupEffects && !variant.innerWayRules && !variant.timeline) return state
  const effects = unconditionalStatEffects(setup, rules)
  const rawStats = calculateRawStats(variant.stats ?? state.baseStats, effects)
  const finalContributions = (raw: CharacterStats, all: typeof effects) => {
    const resolved = all.map(effect => (effect.statStage === "talent" ? resolveRawStatFormulas(effect, raw) : effect))
    const final = applyStatEffects(emptyStats, resolved)
    const ordinary = Object.fromEntries(
      Object.keys(emptyStats).map(key => [key, raw[key as keyof CharacterStats] + final[key as keyof CharacterStats]]),
    ) as CharacterStats
    return { stat: final, effectiveStat: collectEffectiveStatEffects(ordinary, resolved) }
  }
  const oldFinal = finalContributions(state.rawStats, state.effects)
  const nextFinal = finalContributions(rawStats, effects)
  const delta = Object.fromEntries(
    Object.keys(emptyStats)
      .map(key => {
        const field = key as keyof CharacterStats
        return [key, rawStats[field] - state.rawStats[field] + nextFinal.stat[field] - oldFinal.stat[field]]
      })
      .filter(([, value]) => value !== 0),
  )
  const effectiveDelta = Object.fromEntries(
    Object.keys(emptyStats)
      .map(key => {
        const field = key as keyof CharacterStats
        return [key, (nextFinal.effectiveStat[field] ?? 0) - (oldFinal.effectiveStat[field] ?? 0)]
      })
      .filter(([, value]) => value !== 0),
  )
  return {
    rawStats,
    stats: calculateActionStats(
      state.stats,
      [{ stat: delta, effectiveStat: effectiveDelta }],
      state.enemy.judgementResistance,
      state.weapons,
    ),
  }
}

function createTimelineEntryBuilder(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  state: ReturnType<typeof rotationStatState>,
  startAnchor: RotationSimulationBundle["startAnchor"],
  overrides: RotationSimulationVariant = { label: "" },
  updateTimelineState = false,
  includePrecombat = false,
  live?: { initialEffects: { buffs: EffectState; debuffs: EffectState }; seasonalWindows: SeasonalEdgeWindow[] },
  collectAttribution = true,
) {
  const rules = overrides.innerWayRules ?? input.innerWayRules
  const conditions = new Set(overrides.innerWayConditions ?? input.innerWayConditions)
  let setupEffects = overrides.setupEffects ?? input.setupEffects
  const hawkwing = hawkwingEffectFor(setupEffects, input.effectDefinitions)
  const insightfulStrike = insightfulStrikeEffectFor(rules, input.effectDefinitions)
  const seasonalEdge = seasonalEdgeEffectFor(rules, input.effectDefinitions)
  const seasonalWindows = live?.seasonalWindows ?? (seasonalEdge ? seasonalEdgeWindows(timeline, seasonalEdge) : [])
  if (seasonalEdge && updateTimelineState) applySeasonalEdgeCooldownToTimeline(timeline, seasonalWindows)
  const seasonalVitality =
    seasonalEdge && !input.rotation.infiniteVitality
      ? applySeasonalVitalityRanges(timeline, seasonalWindows, input.resourceMaximums?.Vitality, updateTimelineState)
      : undefined
  const sheet = variantStatState(state, setupEffects, rules, overrides)
  setupEffects = setupEffects.map(effect =>
    effect.statStage === "talent" ? resolveRawStatFormulas(effect, sheet.rawStats) : effect,
  )
  // Global fixed stat contributions belong to buffedStats, not to each action.
  const globalNames = new Set(
    [...(input.initialBuffs ?? []), ...(input.initialDebuffs ?? [])].map(effect => effect.name),
  )
  const globalContributions = addUnconditionalDamageEffects(
    ...[
      ...(live?.initialEffects.buffs ?? timeline[0]?.buffs ?? effectState()).values(),
      ...(live?.initialEffects.debuffs ?? timeline[0]?.debuffs ?? effectState()).values(),
    ]
      .filter(effect => globalNames.has(effect.name) && (effect.playerRecipientIndex ?? 0) === 0)
      .map(effect => effect.unconditionalDamageEffects),
  )
  const globalStats = collectUnconditionalStatEffects(globalContributions)
  const buffedStats =
    Object.keys(globalStats.stat).length || Object.keys(globalStats.effectiveStat).length
      ? calculateActionStats(sheet.stats, [globalStats], state.enemy.judgementResistance, state.weapons)
      : sheet.stats
  const calculationSetupEffects = setupEffects.flatMap(effect => {
    if (!requirementIsUnconditional(effect.requirement)) return [effect]
    const split = splitStaticStatEffect(unwrappedEffect(effect))
    return split.remaining ? [split.remaining] : []
  })
  const staticSetupEffects = calculationSetupEffects.filter(effect => requirementIsSkillStatic(effect.requirement))
  const dynamicSetupEffects = calculationSetupEffects.filter(effect => !requirementIsSkillStatic(effect.requirement))
  const staticInnerWayRules = rules.flatMap(rule => {
    if (!requirementIsSkillStatic(rule.requirement)) return []
    if (!requirementIsUnconditional(rule.requirement)) return [rule]
    const split = splitStaticStatEffect(rule.effect)
    return split.remaining ? [{ ...rule, effect: split.remaining }] : []
  })
  const dynamicInnerWayRules = rules.filter(rule => !requirementIsSkillStatic(rule.requirement))
  const preparedEffectsFor = createPreparedEffectState([setupEffects, rules, input.effectDefinitions])
  const globalStatContributions = Object.fromEntries(
    Object.entries(globalContributions).filter(([key]) => key.startsWith("stat.") || key.startsWith("effectiveStat.")),
  )
  const preparedAggregates = new Map<string, UnconditionalDamageEffects>()
  const skillStaticEffectCache = new Map<
    string,
    {
      stats: CharacterStats
      derivedStats: DamageContext["derivedStats"]
      aggregated: UnconditionalDamageEffects
      remaining: EditableObject[]
    }
  >()
  const skillStaticEffectsFor = (skillTags: string[]) => {
    const key = [...skillTags].sort().join("\u001f")
    const cached = skillStaticEffectCache.get(key)
    if (cached) return cached
    const startedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const applicableEffects = [
      ...staticSetupEffects
        .filter(effect =>
          requirementsPass(
            effect.requirement,
            effectState(),
            effectState(),
            skillTags,
            conditions,
            state.weapons,
            {},
            {},
          ),
        )
        .map(unwrappedEffect),
      ...staticInnerWayRules
        .filter(rule =>
          requirementsPass(
            rule.requirement,
            effectState(),
            effectState(),
            skillTags,
            conditions,
            state.weapons,
            {},
            {},
          ),
        )
        .map(rule => rule.effect),
    ]
    let aggregated: UnconditionalDamageEffects = {}
    const statEffects: Array<StatEffectContainer & EffectiveStatEffectContainer> = []
    const remaining: EditableObject[] = []
    for (const effect of applicableEffects) {
      const statSplit = splitStaticStatEffect(effect)
      if (statSplit.statEffect) statEffects.push(statSplit.statEffect)
      if (!statSplit.remaining) continue
      const damageSplit = splitStaticDamageEffect(statSplit.remaining, state.weapons)
      aggregated = addUnconditionalDamageEffects(aggregated, damageSplit.aggregated)
      if (damageSplit.remaining && !Object.keys(damageSplit.remaining).every(field => field === "id"))
        remaining.push(damageSplit.remaining)
    }
    const staticState = statEffects.length
      ? calculateActionStats(buffedStats, statEffects, state.enemy.judgementResistance, state.weapons)
      : buffedStats
    const resolved = { stats: staticState, derivedStats: staticState, aggregated, remaining }
    skillStaticEffectCache.set(key, resolved)
    if (import.meta.env.DEV) finishCalculationPhase("skillStaticEffectAggregation", startedAt)
    return resolved
  }
  const attunement = overrides.attunement ?? state.attunement
  const anchorRow = timeline.find(row => row.id === startAnchor.rowId) ?? timeline[0]
  const anchorActionIndex = startAnchor.actionIndex
  const anchorTime = Math.max(
    0,
    timeline[0]?.battleStartTime ??
      (anchorRow
        ? anchorRow.startTime +
          (anchorActionIndex === undefined ? 0 : Number(anchorRow.actions[anchorActionIndex]?.time ?? 0))
        : 0),
  )
  const anchorOrder = anchorRow ? anchorRow.order + (anchorActionIndex === undefined ? 0 : 10 + anchorActionIndex) : 0
  const battleEnd = combatCutoff(timeline)
  const entriesForAction = (row: TimelineRow, actionIndex: number) => {
    const action = row.actions[actionIndex]
    const accumulatorThreshold =
      action.type === "apply" && action.target !== "target" && typeof action.value === "string"
        ? input.effectDefinitions[action.value]?.accumulator?.threshold
        : undefined
    const accumulatorSnapshot = typeof accumulatorThreshold === "object" ? accumulatorThreshold : undefined
    const replay =
      action.type === "replay" &&
      row.skill?.tags?.includes("Replayed") &&
      typeof action.replaySourceDamage === "number" &&
      typeof action.coef === "number"
        ? {
            sourceDamage: action.replaySourceDamage,
            coef: action.coef,
            ...(Array.isArray(action.replaySourceActionIds)
              ? { sourceActionIds: action.replaySourceActionIds as string[] }
              : {}),
          }
        : undefined
    if (action.type !== "damage" && action.type !== "heal" && !accumulatorSnapshot && !replay) return []
    const actionTime = row.startTime + Number(action.time ?? 0)
    const actionOrder = row.order + 10 + actionIndex
    const anchorTimeOrder = compareTimelineTime(actionTime, anchorTime)
    if (!includePrecombat && (anchorTimeOrder < 0 || (anchorTimeOrder === 0 && actionOrder < anchorOrder))) return []
    const battleEndTimeOrder = battleEnd ? compareTimelineTime(actionTime, battleEnd.time) : -1
    if (
      !includePrecombat &&
      battleEnd &&
      (battleEndTimeOrder > 0 || (battleEndTimeOrder === 0 && actionOrder >= battleEnd.order))
    )
      return []
    const actionState = row.actionStates[actionIndex] ?? {
      buffs: row.buffs,
      debuffs: row.debuffs,
      distance: row.distance,
      currentHPRatio: row.currentHPRatio,
      targetHPRatio: row.targetHPRatio,
      targetQiRatio: row.targetQiRatio,
      resources: row.resources,
      enduranceLost: row.enduranceLost,
      unconditionalDamageEffects: row.unconditionalDamageEffects,
    }
    const buffs = trackedEffectMetadata(actionState.buffs).self
    const debuffs = actionState.debuffs
    const resources = actionState.resources
    const skillTags = row.actionSkillTags?.[actionIndex] ?? row.skill?.tags ?? []
    const skillStaticEffects = skillStaticEffectsFor(skillTags)
    const requirementState = {
      enemyCount: normalizeEnemyCount(input.rotation.enemyCount),
      distance: actionState.distance,
      selfHPPercentage: actionState.currentHPRatio * 100,
      targetHPPercentage: actionState.targetHPRatio * 100,
      targetQiPercentage: actionState.targetQiRatio * 100,
      targetType: resolveTargetType(input.rotation),
    }
    const componentModifiers = row.actionModifierEffects?.[actionIndex] ?? row.modifierEffects
    const modifierCacheKey = Array.isArray(action.modifier)
      ? [...componentModifiers, ...action.modifier]
      : componentModifiers
    const effectsForState = (
      currentBuffs: typeof buffs,
      currentDebuffs: typeof debuffs,
      currentResources: typeof resources,
      currentRequirementState = requirementState,
    ) =>
      preparedEffectsFor(
        currentBuffs,
        currentDebuffs,
        currentResources,
        currentRequirementState,
        skillStaticEffects,
        modifierCacheKey,
        () => {
          const effectStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
          const activeSetupEffects = dynamicSetupEffects
            .filter(effect =>
              requirementsPass(
                effect.requirement,
                currentBuffs,
                currentDebuffs,
                skillTags,
                conditions,
                state.weapons,
                currentResources,
                currentRequirementState,
              ),
            )
            .map(unwrappedEffect)
          const activeInnerWayEffects = dynamicInnerWayRules
            .filter(rule =>
              requirementsPass(
                rule.requirement,
                currentBuffs,
                currentDebuffs,
                skillTags,
                conditions,
                state.weapons,
                currentResources,
                currentRequirementState,
              ),
            )
            .map(rule => rule.effect)
          const activeTrackedEffects = [...currentBuffs.values(), ...currentDebuffs.values()]
            .flatMap(tracked => {
              if (tracked.perHitEffectRules) return tracked.perHitEffectRules
              const setupModifiers = setupEffects
                .filter(
                  effect =>
                    effect.target === tracked.name &&
                    effect.modify &&
                    typeof effect.modify === "object" &&
                    !Array.isArray(effect.modify) &&
                    requirementsPass(
                      effect.requirement,
                      currentBuffs,
                      currentDebuffs,
                      skillTags,
                      conditions,
                      state.weapons,
                      currentResources,
                      currentRequirementState,
                    ),
                )
                .map(effect => effect.modify as EditableObject)
              const innerWayModifiers = rules
                .filter(
                  rule =>
                    rule.target === tracked.name &&
                    rule.modify &&
                    requirementsPass(
                      rule.requirement,
                      currentBuffs,
                      currentDebuffs,
                      skillTags,
                      conditions,
                      state.weapons,
                      currentResources,
                      currentRequirementState,
                    ),
                )
                .map(rule => rule.modify!)
              const definition = [...setupModifiers, ...innerWayModifiers].reduce(mergeEffectDefinition, {
                ...input.effectDefinitions[tracked.name],
              })
              return effectsForTrackedEffect(tracked.stack, definition)
            })
            .filter(
              (effect): effect is EditableObject =>
                Boolean(effect) && typeof effect === "object" && !Array.isArray(effect),
            )
            .filter(effect =>
              requirementsPass(
                effect.requirement,
                currentBuffs,
                currentDebuffs,
                skillTags,
                conditions,
                state.weapons,
                currentResources,
                currentRequirementState,
              ),
            )
            .map(effect =>
              effect.effect && typeof effect.effect === "object" && !Array.isArray(effect.effect)
                ? (effect.effect as EditableObject)
                : effect,
            )
          const resolvedEffects = [
            ...skillStaticEffects.remaining,
            ...activeSetupEffects,
            ...activeInnerWayEffects,
            ...activeTrackedEffects,
            ...(row.actionModifierEffects?.[actionIndex] ?? row.modifierEffects),
            ...(Array.isArray(action.modifier) ? action.modifier : [])
              .filter((modifier: EditableObject) =>
                requirementsPass(
                  modifier.requirement,
                  currentBuffs,
                  currentDebuffs,
                  skillTags,
                  conditions,
                  state.weapons,
                  currentResources,
                  currentRequirementState,
                ),
              )
              .map((modifier: EditableObject) => modifier.effect as EditableObject),
          ]
          if (import.meta.env.DEV) finishCalculationPhase("effectResolution", effectStartedAt)
          return resolvedEffects
        },
      )
    const aggregateKey = JSON.stringify([actionState.unconditionalDamageEffects, skillStaticEffects.aggregated])
    let aggregate = preparedAggregates.get(aggregateKey)
    if (!aggregate) {
      aggregate = addUnconditionalDamageEffects(
        subtractUnconditionalDamageEffects(actionState.unconditionalDamageEffects, globalStatContributions),
        skillStaticEffects.aggregated,
      )
      preparedAggregates.set(aggregateKey, aggregate)
    }
    const context: DamageContext = {
      stats: skillStaticEffects.stats,
      attunement,
      skillTags,
      weapons: state.weapons,
      buffs: trackedEffectMetadata(buffs).names,
      enemy: state.enemy,
      derivedStats: skillStaticEffects.derivedStats,
      effects: effectsForState(buffs, debuffs, resources),
      unconditionalDamageEffects: aggregate,
      distance: actionState.distance,
      currentHPRatio: actionState.currentHPRatio,
      targetHPRatio: actionState.targetHPRatio,
      enduranceLost: actionState.enduranceLost ?? row.enduranceLost,
      enduranceSpent: row.baseResourceConsumption?.Endurance ?? row.resourceConsumption?.Endurance ?? 0,
      isDot: row.kind === "dot",
      expectedEffects: "expectedEffects" in actionState ? actionState.expectedEffects : undefined,
    }
    const attributionContexts =
      collectAttribution && action.type === "damage"
        ? Array.from(buffs.values()).flatMap(tracked => {
            if (tracked.collectBoostDamage !== tracked.name || !tracked.sourceRowId) return []
            const counterfactualBuffs = filterTrackedEffects(buffs, candidate => candidate !== tracked)
            return [
              {
                sourceRowId: tracked.sourceRowId,
                context: {
                  ...context,
                  buffs: trackedEffectMetadata(counterfactualBuffs).names,
                  effects: effectsForState(counterfactualBuffs, debuffs, resources),
                  unconditionalDamageEffects: subtractUnconditionalDamageEffects(
                    context.unconditionalDamageEffects,
                    tracked.unconditionalDamageEffects,
                  ),
                },
              },
            ]
          })
        : []
    return [
      {
        id: `${row.id}:${actionIndex}`,
        action,
        ...(accumulatorSnapshot ? { accumulatorSnapshot } : {}),
        ...(replay ? { replay } : {}),
        context,
        timelineTime: actionTime,
        timelineOrder: actionOrder,
        ...(row.actionStates[actionIndex]?.combatOrder !== undefined
          ? { combatOrder: row.actionStates[actionIndex].combatOrder }
          : {}),
        sourceRowId: row.sourceRowId ?? row.id,
        activeBuffStacks: trackedEffectMetadata(buffs).stacks,
        activeDebuffStacks: {
          ...trackedEffectMetadata(debuffs).stacks,
          ...("expectedDebuffStacks" in actionState ? actionState.expectedDebuffStacks : {}),
        },
        ...(hawkwing ? { hawkwing } : {}),
        ...(insightfulStrike ? { insightfulStrike } : {}),
        ...(seasonalEdge
          ? { seasonalEdge: seasonalEdgeStateAt(actionTime, row.id, seasonalEdge, seasonalWindows) }
          : {}),
        ...(action.type === "heal"
          ? {
              healingRecipients:
                row.playerRecipientIndex !== undefined
                  ? {
                      self: row.playerRecipientIndex === 0 ? 1 : 0,
                      teammates: row.playerRecipientIndex === 0 ? 0 : 1,
                      teammateOverhealRatio: 1,
                    }
                  : row.skill?.group === true
                    ? {
                        self: 1,
                        teammates:
                          input.rotation.groupSize === 5 || input.rotation.groupSize === 10
                            ? input.rotation.groupSize - 1
                            : 0,
                        teammateOverhealRatio: 0.2,
                      }
                    : { self: 1, teammates: 0, teammateOverhealRatio: 0 },
            }
          : {}),
        ...(attributionContexts.length ? { attributionContexts } : {}),
      },
    ]
  }
  return { entriesForAction, seasonalVitality }
}

function timelineDamageEntries(
  timeline: TimelineRow[],
  input: TimelineBuildInput,
  state: ReturnType<typeof rotationStatState>,
  startAnchor: RotationSimulationBundle["startAnchor"],
  overrides: RotationSimulationVariant = { label: "" },
  includeRecordingSources = false,
) {
  // Only event-invariant variants use stored action snapshots. Combat state and
  // listeners were already resolved by the baseline's single live traversal.
  const { entriesForAction, seasonalVitality } = createTimelineEntryBuilder(
    timeline,
    input,
    state,
    startAnchor,
    overrides,
    false,
    includeRecordingSources,
    undefined,
    false,
  )
  const entries: RotationDamageEntry[] = timeline
    .flatMap(row => (row.skipped ? [] : row.actions.flatMap((_action, index) => entriesForAction(row, index))))
    .filter(entry => !entry.accumulatorSnapshot && (!includeRecordingSources || entry.combatOrder !== undefined))
  entries.sort(
    (left, right) =>
      (includeRecordingSources ? (left.combatOrder ?? 0) - (right.combatOrder ?? 0) : 0) ||
      compareTimelineTime(left.timelineTime ?? 0, right.timelineTime ?? 0) ||
      (left.timelineOrder ?? 0) - (right.timelineOrder ?? 0),
  )
  return { entries, seasonalVitality, resolvedSequence: undefined as ResolvedRotationDamageSequence | undefined }
}

function timelineTiming(
  timeline: TimelineRow[],
  startAnchor: RotationSimulationBundle["startAnchor"],
  damageEntries: RotationDamageEntry[] = [],
) {
  const anchorRow = timeline.find(row => row.id === startAnchor.rowId) ?? timeline[0]
  const anchorTime = Math.max(
    0,
    timeline[0]?.battleStartTime ??
      (anchorRow
        ? anchorRow.startTime +
          (startAnchor.actionIndex === undefined ? 0 : Number(anchorRow.actions[startAnchor.actionIndex]?.time ?? 0))
        : 0),
  )
  const battleEnd = combatCutoff(timeline)
  const lastActionTime =
    battleEnd?.time ??
    timeline[0]?.timelineEndTime ??
    timeline.reduce(
      (latest, row) =>
        row.skipped
          ? latest
          : Math.max(
              latest,
              row.step.type === "event" && row.step.event === "Delay"
                ? row.startTime + row.effectiveCastTime
                : row.startTime,
              ...row.actions.flatMap(action => (typeof action.time === "number" ? [row.startTime + action.time] : [])),
            ),
      0,
    )
  const lastDamageTime = damageEntries.reduce(
    (latest, entry) => Math.max(latest, entry.timelineTime ?? Number.NEGATIVE_INFINITY),
    Number.NEGATIVE_INFINITY,
  )
  return {
    anchorTime,
    duration:
      timeline[0]?.battleStartTime === -1
        ? 0
        : Math.max(
            0,
            (timeline[0]?.timelineEndTime ?? (battleEnd ? lastActionTime : Math.max(lastActionTime, lastDamageTime))) -
              anchorTime,
          ),
  }
}

/** Resolve combat values in the event traversal that creates their dependent procs and replays. */
function resolveCombatTimeline(
  input: TimelineBuildInput,
  state: ReturnType<typeof rotationStatState>,
  startAnchor: RotationSimulationBundle["startAnchor"],
  overrides: RotationSimulationVariant = { label: "" },
  random?: () => number,
  procRoll?: (key: string) => number,
  collectAttribution = true,
) {
  // Setup variants retain the baseline input but must start with their own Endurance capacity.
  const sheet = variantStatState(
    state,
    overrides.setupEffects ?? input.setupEffects,
    overrides.innerWayRules ?? input.innerWayRules,
    overrides,
  )
  const enduranceDelta = sheet.stats.maxEndurance - state.stats.maxEndurance
  if (enduranceDelta !== 0) {
    input = {
      ...input,
      initialResources:
        input.initialResources?.Endurance === undefined
          ? input.initialResources
          : { ...input.initialResources, Endurance: input.initialResources.Endurance + enduranceDelta },
      resourceMaximums:
        input.resourceMaximums?.Endurance === undefined
          ? input.resourceMaximums
          : { ...input.resourceMaximums, Endurance: input.resourceMaximums.Endurance + enduranceDelta },
    }
  }
  const resolvedActions = new Map<string, ResolvedRotationDamage>()
  const seasonalEdge = seasonalEdgeEffectFor(overrides.innerWayRules ?? input.innerWayRules, input.effectDefinitions)
  const windows: SeasonalEdgeWindow[] = []
  const anchorMatch = /^rotation-(\d+)$/.exec(startAnchor.rowId)
  const timelineInput = anchorMatch
    ? {
        ...input,
        rotation: {
          ...input.rotation,
          start: {
            step: Number(anchorMatch[1]),
            ...(startAnchor.actionIndex === undefined ? {} : { action: startAnchor.actionIndex }),
          },
        },
      }
    : input
  const timeline = buildRotationTimeline(timelineInput, procRoll, (passInput, liveRows, initialEffects) => {
    const { entriesForAction } = createTimelineEntryBuilder(
      liveRows,
      passInput,
      state,
      startAnchor,
      overrides,
      false,
      true,
      { initialEffects, seasonalWindows: windows },
      collectAttribution,
    )
    const resolver = createRotationDamageResolver(random)
    const insightfulStrike = insightfulStrikeEffectFor(
      overrides.innerWayRules ?? passInput.innerWayRules ?? [],
      passInput.effectDefinitions,
    )
    const resolveAction = (row: TimelineRow, actionIndex: number) => {
      const startedAt = import.meta.env.DEV ? startCalculationPhase() : 0
      const entry = entriesForAction(row, actionIndex)[0]
      if (import.meta.env.DEV) finishCalculationPhase("damageEntryConstruction", startedAt)
      if (!entry) {
        if (import.meta.env.DEV) finishCalculationPhase("liveActionResolution", startedAt)
        return undefined
      }
      const result = resolver.resolve(entry)
      if (import.meta.env.DEV) finishCalculationPhase("liveActionResolution", startedAt)
      resolvedActions.set(entry.id!, result)
      const { self = 1, teammates = 0, teammateOverhealRatio = 0 } = entry.healingRecipients ?? {}
      const recipients = result.breakdown.recipientHealing ?? []
      return {
        accumulatorThreshold: result.accumulatorThreshold,
        damage: result.breakdown.total,
        selfRecovery: result.selfRecovery,
        outcomeRates: result.breakdown.outcomeRates,
        ...(result.breakdown.healing
          ? {
              healing: {
                self: recipients.slice(0, self).map(healing => healing.total),
                teammateOverhealContributions: recipients
                  .slice(self, self + teammates)
                  .map(healing => healing.total * teammateOverhealRatio),
              },
            }
          : {}),
      }
    }
    return Object.assign(resolveAction, {
      onCastEnd: seasonalEdge ? (row: TimelineRow) => appendSeasonalEdgeWindow(windows, row, seasonalEdge) : undefined,
      resolveIncomingDamage: (damage: number, time: number) =>
        resolver.resolveIncomingDamage(damage, time, insightfulStrike),
    })
  })
  const { anchorTime } = timelineTiming(timeline, startAnchor)
  const anchorRow = timeline.find(row => row.id === startAnchor.rowId)
  const anchorOrder = anchorRow
    ? anchorRow.order + (startAnchor.actionIndex === undefined ? 0 : 10 + startAnchor.actionIndex)
    : 0
  const resolvedSequence = [...resolvedActions.values()].filter(({ entry }) => {
    if (timeline[0]?.battleStartTime === -1) return false
    if (entry.accumulatorSnapshot) return false
    const compared = compareTimelineTime(entry.timelineTime ?? 0, anchorTime)
    return compared > 0 || (compared === 0 && (entry.timelineOrder ?? 0) >= anchorOrder)
  })
  if (seasonalEdge) applySeasonalEdgeCooldownToTimeline(timeline, windows)
  const seasonalVitality =
    seasonalEdge && !input.rotation.infiniteVitality
      ? applySeasonalVitalityRanges(timeline, windows, input.resourceMaximums?.Vitality, true)
      : undefined
  return {
    timeline,
    resolvedActions,
    entries: resolvedSequence.map(({ entry }) => entry),
    resolvedSequence,
    seasonalVitality,
  }
}

export function calculateSimulatedRotationRun(
  bundle: RotationSimulationBundle,
  random: () => number,
): { resolvedSequence: ResolvedRotationDamage[]; duration: number; mysticVitalityDamageScale: number } {
  const state = rotationStatState(bundle)
  const structuralInput = { ...bundle.timeline }
  const procRoll = () => random()
  const runtime = resolveCombatTimeline(
    structuralInput,
    state,
    bundle.startAnchor,
    { label: "" },
    random,
    procRoll,
    false,
  )
  const timeline = runtime.timeline
  const resolution = runtime
  const resolvedSequence = resolution.resolvedSequence ?? calculateRotationDamageSequence(resolution.entries, random)
  return {
    resolvedSequence,
    duration: timelineTiming(timeline, bundle.startAnchor, resolution.entries).duration,
    mysticVitalityDamageScale: vitalityDamageScale(timeline, bundle.timeline, resolution.seasonalVitality),
  }
}

const baselineSequences = new WeakMap<RotationSimulationBaseline, ResolvedRotationDamageSequence>()
const rateInvariantBaselines = new WeakMap<RotationSimulationBaseline, boolean>()
function baselineRateInvariant(baseline: RotationSimulationBaseline) {
  let independent = rateInvariantBaselines.get(baseline)
  if (independent === undefined) {
    independent = Boolean(
      baselineSequences
        .get(baseline)
        ?.every(
          ({ entry }) =>
            !entry.hawkwing && !entry.insightfulStrike && !entry.seasonalEdge && !entry.context.expectedEffects?.length,
        ),
    )
    rateInvariantBaselines.set(baseline, independent)
  }
  return independent
}

const damageResponses = new WeakMap<RotationSimulationBaseline, RotationDamageResponse | null>()

const attackDependencies = new WeakMap<RotationSimulationBaseline, Set<string>>()
function baselineAttackDependencies(baseline: RotationSimulationBaseline, input: TimelineBuildInput) {
  let dependencies = attackDependencies.get(baseline)
  if (!dependencies) {
    const effectNames = new Set(baseline.timeline.flatMap(row => [...row.buffs.keys(), ...row.debuffs.keys()]))
    dependencies = referencedInputs([
      input.rotation,
      input.innerWayRules,
      ...baseline.timeline.flatMap(row => [row.skill, row.actions, row.modifierEffects, row.actionModifierEffects]),
      ...new Set(baseline.baseline.flatMap(entry => [entry.context.effects, entry.context.expectedEffects])),
      ...Array.from(effectNames, name => input.effectDefinitions[name]),
    ])
    attackDependencies.set(baseline, dependencies)
  }
  return dependencies
}

function baselineDependsOnAttack(baseline: RotationSimulationBaseline, input: TimelineBuildInput, fields: Set<string>) {
  const dependencies = baselineAttackDependencies(baseline, input)
  for (const field of fields) if (dependencies.has(field)) return true
  return false
}

function rotationDamageResponse(baseline: RotationSimulationBaseline) {
  if (damageResponses.has(baseline)) return damageResponses.get(baseline)
  const sequence = baselineSequences.get(baseline)
  if (
    !sequence ||
    sequence.some(
      ({ entry }) =>
        entry.action.type === "heal" || entry.accumulatorSnapshot || (entry.replay && !entry.replay.sourceActionIds),
    )
  ) {
    damageResponses.set(baseline, null)
    return null
  }
  const includeRates = baselineRateInvariant(baseline)
  const total = new RotationDamageResponse(includeRates)
  const responses = new Map<string, RotationDamageResponse>()
  for (const resolved of sequence) {
    const { entry, outcomeEffects, expectedConcentration: concentration } = resolved
    const response = new RotationDamageResponse(includeRates)
    if (entry.replay) {
      const bonus = entry.context.effects.reduce(
        (sum, effect) => sum + (typeof effect.replayDmgBonus === "number" ? effect.replayDmgBonus : 0),
        0,
      )
      const weight = entry.replay.coef * (1 + bonus)
      if (!(weight >= 0)) {
        damageResponses.set(baseline, null)
        return null
      }
      for (const id of entry.replay.sourceActionIds!) {
        const source = responses.get(id)
        if (!source) {
          damageResponses.set(baseline, null)
          return null
        }
        response.add(source, weight)
      }
    } else {
      response.addAttunementDamage(resolved.breakdown.total, entry.context)
      const addContext = (effects: UnconditionalDamageEffects | undefined, directAffinity: number, weight: number) => {
        if (weight === 0) return
        const outcomes = entry.seasonalEdge?.outcomes
        if (!outcomes?.length)
          response.addDamage(entry.action, contextWithOutcomeEffects(entry.context, effects, directAffinity), weight)
        else
          for (const outcome of outcomes)
            response.addDamage(
              entry.action,
              contextWithOutcomeEffects(
                entry.context,
                effects,
                directAffinity,
                effectsForSeasonalOutcome(entry.context, outcome),
              ),
              weight * outcome.weight,
            )
      }
      addContext(outcomeEffects, 0, 1 - (concentration?.probability ?? 0))
      if (concentration)
        addContext(
          addUnconditionalDamageEffects(outcomeEffects, concentration.activeEffects),
          concentration.directAffinityBonus,
          concentration.probability,
        )
    }
    if (entry.id) responses.set(entry.id, response)
    total.add(response, entry.context.skillTags.includes("Mystic") ? baseline.mysticVitalityDamageScale : 1)
  }
  damageResponses.set(baseline, total)
  return total
}

export function calculateRotationBaseline(bundle: RotationSimulationBundle): RotationSimulationBaseline {
  const timelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const state = rotationStatState(bundle)
  const combatRuntime = resolveCombatTimeline(bundle.timeline, state, bundle.startAnchor)
  const timeline = combatRuntime.timeline
  if (import.meta.env.DEV) finishCalculationPhase("timelineConstruction", timelineStartedAt)
  const initialTimingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const { anchorTime } = timelineTiming(timeline, bundle.startAnchor)
  if (import.meta.env.DEV) finishCalculationPhase("timingResolution", initialTimingStartedAt)
  const damagePipelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const baselineResolution = combatRuntime
  const baseline = baselineResolution.entries
  const resolvedSequence = baselineResolution.resolvedSequence ?? calculateRotationDamageSequence(baseline)
  const mysticVitalityDamageScale = vitalityDamageScale(timeline, bundle.timeline, baselineResolution.seasonalVitality)
  if (import.meta.env.DEV) finishCalculationPhase("damagePipeline", damagePipelineStartedAt)
  const finalTimingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const { duration } = timelineTiming(timeline, bundle.startAnchor, baseline)
  if (import.meta.env.DEV) finishCalculationPhase("timingResolution", finalTimingStartedAt)
  const metricsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  let rawBaselineDamage = 0
  let baselineHealing = 0
  const actionBreakdowns = Object.fromEntries(
    resolvedSequence
      .filter(({ entry }) => entry.id)
      .map(({ entry, breakdown, expectedBuffStacks, outcomeEffects, expectedConcentration }) => {
        rawBaselineDamage += breakdown.total
        baselineHealing += breakdown.healing?.total ?? 0
        const buffedDamageBySource = Object.fromEntries(
          (entry.replay ? [] : (entry.attributionContexts ?? []))
            .map(({ sourceRowId, context }) => {
              const damageStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
              const counterfactualDamage = calculateExpectedOutcomeDamage(
                entry.action,
                context,
                outcomeEffects,
                expectedConcentration,
                entry.seasonalEdge,
              ).total
              if (import.meta.env.DEV) finishCalculationPhase("damageCalculation", damageStartedAt)
              return [sourceRowId, breakdown.total - counterfactualDamage]
            })
            .filter(([, damage]) => Math.abs(damage as number) > 1e-9),
        )
        return [
          entry.id!,
          {
            ...breakdown,
            ...(Object.keys(buffedDamageBySource).length ? { buffedDamageBySource } : {}),
            ...(expectedBuffStacks ? { expectedBuffStacks } : {}),
          },
        ]
      }),
  )
  const baselineDamage =
    rawBaselineDamage - mysticDamageInResolvedSequence(resolvedSequence) * (1 - mysticVitalityDamageScale)
  const metrics = calculateRotationMetrics(
    { duration, baseline, statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {} },
    baselineDamage,
    baselineHealing,
    rawBaselineDamage,
  )
  metrics.breakdown = calculateBreakdown(
    timeline,
    actionBreakdowns,
    resolvedSequence.map(({ entry }) => entry),
    bundle.timeline.effectDefinitions,
    duration,
    rawBaselineDamage,
    baselineHealing,
    bundle.timeline.skills,
  )
  metrics.breakdown.groupedSkills = groupSkillBreakdown(metrics.breakdown.skills, bundle.timeline.skills)
  metrics.breakdown.groupedHealingSkills = groupSkillBreakdown(metrics.breakdown.healingSkills, bundle.timeline.skills)
  metrics.expectedHawkwingStacks = averageExpectedBuffStack(resolvedSequence, "Hawkwing")
  if (import.meta.env.DEV) finishCalculationPhase("metricsAndBreakdown", metricsStartedAt)
  const result = {
    metrics,
    timeline,
    anchorTime,
    duration,
    actionBreakdowns,
    baseline,
    expectedOutcomeBuffSchedule: expectedOutcomeBuffSchedule(resolvedSequence),
    mysticVitalityDamageScale,
  }
  baselineSequences.set(result, resolvedSequence)
  return result
}

function canReuseExpectedOutcomeBuffSchedule(variant: RotationSimulationVariant) {
  // Affinity can change indirectly through formula effects such as Momentum,
  // conditions, conversions, or tracked effects. Reuse is safe only when the
  // variant cannot alter any input involved in per-hit outcome resolution.
  return !(
    variant.timeline ||
    variant.stats ||
    variant.setupEffects ||
    variant.innerWayRules ||
    variant.innerWayConditions
  )
}

function requiresLiveCollectors(timeline: TimelineRow[], input: TimelineBuildInput) {
  const actions = timeline.flatMap(row => row.actions)
  const hasHealing = actions.some(action => action.type === "heal")
  const hasDamage = actions.some(action => action.type === "damage")
  if (hasHealing || actions.some(action => action.type === "replay" && !Array.isArray(action.replaySourceActionIds)))
    return true
  const effectNames = new Set([
    ...(input.initialBuffs ?? []).map(effect => effect.name),
    ...(input.initialDebuffs ?? []).map(effect => effect.name),
    ...actions.flatMap(action => (action.type === "apply" && typeof action.value === "string" ? [action.value] : [])),
  ])
  return Array.from(effectNames).some(name => {
    const definition = input.effectDefinitions[name]
    if (definition?.recording) {
      const payout = input.skills[definition.recording.action.value]
      if (
        !payout?.tags?.includes("Replayed") ||
        !Array.isArray(payout.action) ||
        !payout.action.every(item => {
          const replay = item as EditableObject
          return replay.type === "replay" && typeof replay.coef === "number"
        })
      )
        return true
    }
    if (!definition?.accumulator) return false
    switch (definition.accumulator.event) {
      case "overheal":
        return hasHealing
      case "damage":
        return hasDamage
      default:
        return true
    }
  })
}

export function calculateRotationComparisons(
  bundle: RotationSimulationBundle,
  baselineResult: RotationSimulationBaseline,
  onProgress?: (completed: number, total: number) => void,
): RotationMetrics {
  const state = rotationStatState(bundle)
  const preparedDamage = createPreparedDamageCalculator()
  const totalVariants =
    bundle.statPriority.length +
    bundle.attunementPriority.length +
    bundle.innerWayPriority.length +
    Object.values(bundle.setupComparisons).reduce((total, variants) => total + variants.length, 0)
  const baselineActionIds = new Set(baselineResult.baseline.map(entry => entry.id))
  const liveCollectors = requiresLiveCollectors(baselineResult.timeline, bundle.timeline)
  const hasRecordingSources = baselineResult.timeline.some(row =>
    row.actions.some(action => Array.isArray(action.replaySourceActionIds)),
  )
  let completedVariants = 0
  onProgress?.(0, totalVariants)
  const calculationFromDifference = (difference: number) => {
    completedVariants += 1
    onProgress?.(completedVariants, totalVariants)
    return {
      entries: [],
      damage: baselineResult.metrics.totalDamage + difference,
      healing: baselineResult.metrics.totalHealing,
      duration: baselineResult.duration,
    }
  }
  const calculationForVariant = (variant: RotationSimulationVariant) => {
    const timelineInput = variant.timeline ?? bundle.timeline
    const requiresLiveResolution =
      Boolean(
        variant.timeline ||
        variant.setupEffects ||
        variant.innerWayRules ||
        variant.innerWayConditions ||
        baselineResult.compactedInnerWayResults ||
        timelineInput.rotation.targetHP,
      ) ||
      // Outcome-triggered resource gains change later spending and damage bonuses.
      // Re-evaluating damage against the baseline meter is not a valid comparison.
      timelineInput.innerWayRules.some(
        rule => rule.listen?.event === "damage" || rule.trigger?.event === "damageOutcome",
      ) ||
      // Resource caps move natural-regeneration thresholds and later spending.
      timelineInput.setupEffects.some(effect => effect.resourceRegenerationBonus) ||
      liveCollectors
    if (!requiresLiveResolution && variant.attunement && !variant.stats) {
      const changed = (Object.keys(bundle.attunement) as Array<keyof AttunementStats>).filter(
        key => variant.attunement![key] !== bundle.attunement[key],
      )
      if (
        changed.length === 1 &&
        (attunementDamageMultiplier(changed[0]) !== undefined ||
          attunementPenetrationMultiplier(changed[0]) !== undefined)
      ) {
        const key = changed[0]
        const difference = rotationDamageResponse(baselineResult)?.evaluateAttunement(
          key,
          variant.attunement[key] - bundle.attunement[key],
        )
        if (difference !== undefined) return calculationFromDifference(difference)
      }
    }
    if (!requiresLiveResolution && variant.stats && !variant.attunement) {
      const changedRates = Object.keys(emptyStats).filter(
        key => variant.stats![key as keyof CharacterStats] !== state.baseStats[key as keyof CharacterStats],
      )
      if (
        changedRates.length > 0 &&
        changedRates.every(key => rateStatFields.has(key)) &&
        baselineRateInvariant(baselineResult) &&
        !baselineDependsOnAttack(baselineResult, timelineInput, rateStatFields)
      ) {
        const next = variantStatState(state, timelineInput.setupEffects, timelineInput.innerWayRules, variant)
        const unchanged = Object.keys(emptyStats).every(
          key =>
            rateStatFields.has(key) ||
            next.stats[key as keyof CharacterStats] === state.stats[key as keyof CharacterStats],
        )
        if (unchanged) {
          const delta: Partial<CharacterStats> = {}
          const effectiveDelta: Partial<CharacterStats> = {}
          for (const key of Object.keys(emptyStats) as Array<keyof CharacterStats>) {
            const amount =
              key === "directCrit"
                ? next.stats.uncappedDirectCrit - state.stats.uncappedDirectCrit
                : next.stats[key] - state.stats[key]
            if (amount !== 0) delta[key] = amount
            const bonus = (next.stats.effectiveStatBonuses?.[key] ?? 0) - (state.stats.effectiveStatBonuses?.[key] ?? 0)
            if (bonus !== 0) effectiveDelta[key] = bonus
          }
          const difference = rotationDamageResponse(baselineResult)?.evaluateRates(delta, effectiveDelta)
          if (difference !== undefined) return calculationFromDifference(difference)
        }
      }

      const changed = Object.keys(emptyStats).filter(
        key => variant.stats![key as keyof CharacterStats] !== state.baseStats[key as keyof CharacterStats],
      )
      const changedInputs = new Set(
        changed.flatMap(key => [key, attackStatFields[key as keyof typeof attackStatFields]]).filter(Boolean),
      )
      const primary = mainAttributeForWeapons(state.weapons)
      if (primary && changed.some(key => key === "minVoidAttack" || key === "maxVoidAttack"))
        for (const field of attackFields[primary]) changedInputs.add(field)
      const attackChange = changed.every(key => attackInputFields.has(key))
      if (changed.length > 0 && attackChange) {
        const next = variantStatState(state, timelineInput.setupEffects, timelineInput.innerWayRules, variant)
        const resolvedSetup = timelineInput.setupEffects.map(effect =>
          effect.statStage === "talent" ? resolveRawStatFormulas(effect, state.rawStats) : effect,
        )
        const nextSetup = timelineInput.setupEffects.map(effect =>
          effect.statStage === "talent" ? resolveRawStatFormulas(effect, next.rawStats) : effect,
        )
        const independent =
          JSON.stringify(resolvedSetup) === JSON.stringify(nextSetup) &&
          !referencesChangedInput(resolvedSetup, changedInputs) &&
          !baselineDependsOnAttack(baselineResult, timelineInput, changedInputs)
        // Raw-sourced talents may change damage bonuses, penetration or other derived inputs.
        const onlyEligibleStats = Object.keys(emptyStats).every(
          key =>
            attackInputFields.has(key) ||
            next.stats[key as keyof CharacterStats] === state.stats[key as keyof CharacterStats],
        )
        if (onlyEligibleStats && independent) {
          const delta: Partial<Record<AttackStatField, number>> = {}
          for (const field of attackInputFields as Set<AttackStatField>) {
            const amount = next.stats[field] - state.stats[field]
            if (amount !== 0) delta[field] = amount
          }
          const difference = rotationDamageResponse(baselineResult)?.evaluate(delta)
          if (difference !== undefined) return calculationFromDifference(difference)
        }
      }
    }
    const damagePipelineStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const reusableExpectedBuffSchedule =
      !requiresLiveResolution && !hasRecordingSources && canReuseExpectedOutcomeBuffSchedule(variant)
        ? baselineResult.expectedOutcomeBuffSchedule
        : undefined
    const combatRuntime = requiresLiveResolution
      ? resolveCombatTimeline(
          {
            ...timelineInput,
            setupEffects: variant.setupEffects ?? timelineInput.setupEffects,
            innerWayRules: variant.innerWayRules ?? timelineInput.innerWayRules,
            innerWayConditions: variant.innerWayConditions ?? timelineInput.innerWayConditions,
          },
          state,
          bundle.startAnchor,
          variant,
          undefined,
          undefined,
          false,
        )
      : undefined
    const variantTimeline = combatRuntime?.timeline ?? baselineResult.timeline
    const resolution =
      combatRuntime ??
      timelineDamageEntries(variantTimeline, timelineInput, state, bundle.startAnchor, variant, hasRecordingSources)
    // Reusing combat events must preserve actions skipped by requirements or cooldowns.
    const entries = combatRuntime
      ? resolution.entries
      : resolution.entries.filter(entry => baselineActionIds.has(entry.id))
    const reusableDamageFormula =
      variant.stats &&
      !variant.attunement &&
      Object.keys(emptyStats).every(
        key =>
          preparedDamageStatFields.has(key) ||
          variant.stats![key as keyof CharacterStats] === state.baseStats[key as keyof CharacterStats],
      )
        ? preparedDamage
        : undefined
    const resolvedSequence =
      resolution.resolvedSequence ??
      calculateRotationDamageSequence(
        hasRecordingSources ? resolution.entries : entries,
        undefined,
        reusableExpectedBuffSchedule,
        hasRecordingSources,
        reusableDamageFormula,
      ).filter(result => baselineActionIds.has(result.entry.id))
    if (import.meta.env.DEV) finishCalculationPhase("damagePipeline", damagePipelineStartedAt)
    let duration = baselineResult.duration
    if (variant.timeline || combatRuntime) {
      const timingStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
      duration = timelineTiming(variantTimeline, bundle.startAnchor, entries).duration
      if (import.meta.env.DEV) finishCalculationPhase("timingResolution", timingStartedAt)
    }
    const mysticVitalityDamageScale = vitalityDamageScale(variantTimeline, timelineInput, resolution.seasonalVitality)
    const totals = sumResolvedSequence(resolvedSequence)
    const calculation = {
      entries,
      damage: totals.total - mysticDamageInResolvedSequence(resolvedSequence) * (1 - mysticVitalityDamageScale),
      healing: totals.healing,
      duration,
    }
    completedVariants += 1
    onProgress?.(completedVariants, totalVariants)
    return calculation
  }
  const entryBundle: RotationCalculationBundle = {
    duration: baselineResult.duration,
    baseline: baselineResult.baseline,
    statPriority: bundle.statPriority.map(variant => ({
      label: variant.label,
      maxRoll: variant.maxRoll,
      ...calculationForVariant(variant),
    })),
    attunementPriority: bundle.attunementPriority.map(variant => ({
      label: variant.label,
      maxRoll: variant.maxRoll,
      ...calculationForVariant(variant),
    })),
    innerWayPriority: bundle.innerWayPriority.map(variant => ({
      label: variant.label,
      maxRoll: variant.maxRoll,
      ...calculationForVariant(variant),
    })),
    setupComparisons: Object.fromEntries(
      Object.entries(bundle.setupComparisons).map(([group, variants]) => [
        group,
        variants.map(variant => ({
          label: variant.label,
          maxRoll: variant.maxRoll,
          ...calculationForVariant(variant),
        })),
      ]),
    ),
  }
  const metricsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const metrics = calculateRotationMetrics(
    entryBundle,
    baselineResult.metrics.totalDamage,
    baselineResult.metrics.totalHealing,
  )
  metrics.breakdown = baselineResult.metrics.breakdown
  metrics.expectedHawkwingStacks = baselineResult.metrics.expectedHawkwingStacks
  if (import.meta.env.DEV) finishCalculationPhase("metricsAndBreakdown", metricsStartedAt)
  return metrics
}

export function calculateRotationSimulation(bundle: RotationSimulationBundle): RotationSimulationResult {
  const baselineResult = calculateRotationBaseline(bundle)
  const metrics = calculateRotationComparisons(bundle, baselineResult)
  const {
    baseline: _baseline,
    expectedOutcomeBuffSchedule: _expectedOutcomeBuffSchedule,
    mysticVitalityDamageScale: _mysticVitalityDamageScale,
    ...publicResult
  } = baselineResult
  return { ...publicResult, metrics }
}
