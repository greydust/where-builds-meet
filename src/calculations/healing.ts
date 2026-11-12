import attunementJson from "@gamedata/attunement.json"

import { resolveActionStatContext } from "./actionStats"
import { attunementMatchesSkill, type AttunementTagFilter } from "./attunementStats"
import { DEFAULT_TARGET_HP_RATIO } from "./combatDefaults"
import { weaponArtBonus, type DamageAction, type DamageContext } from "./damage"
import { resolveMultiplyValue, resolveSegmentValue } from "./dynamicValues"
import { mainAttributeForWeapons } from "./effectiveStats"
import { restrictedOutcomeRates, restrictedRateRouteFor } from "./rateRoutes"
import { resolveFormulaValue, type StatFormula } from "./statEffects"

type AttunementDefinition = { effect?: AttunementTagFilter & { stat?: Record<string, number> } }

const attunementDefinitions = attunementJson as Record<string, AttunementDefinition>
const SIMULATED_HEALING_FLUCTUATION = 0.08

export type HealingBreakdown = {
  physical: number
  silkbind: number
  total: number
  normalRate?: number
  criticalRate?: number
  outcome?: "normal" | "critical"
}

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0)

function effectValue(
  value: unknown,
  context: DamageContext,
  stats: DamageContext["stats"],
  derivedStats: DamageContext["derivedStats"],
) {
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0
  const parameters = {
    distance: context.distance ?? 1,
    maxHp: stats.maxHp,
    currentHPPercentage: (context.currentHPRatio ?? 1) * 100,
    missingHPPercentage: (1 - (context.currentHPRatio ?? 1)) * 100,
    targetHPPercentage: (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
    missingTargetHPPercentage: (1 - (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO)) * 100,
  }
  const multiplied = resolveMultiplyValue(value, parameters)
  if (multiplied !== undefined) return multiplied
  const segmented = resolveSegmentValue(value, parameters)
  if (segmented !== undefined) return segmented
  const formula = (value as Record<string, unknown>).formula
  return formula && typeof formula === "object" && !Array.isArray(formula)
    ? (resolveFormulaValue(formula as StatFormula, { ...stats, ...derivedStats }) ?? 0)
    : 0
}

function matchingAttunementStats(context: DamageContext) {
  let physicalPenetration = 0
  let formlessPenetration = 0
  let healingBonus = 0
  for (const [key, value] of Object.entries(context.attunement)) {
    const definition = attunementDefinitions[key]
    if (!attunementMatchesSkill(definition?.effect, context.skillTags)) continue
    const stats = definition?.effect?.stat
    physicalPenetration += value * numberValue(stats?.physicalPenetration)
    formlessPenetration += value * numberValue(stats?.formlessPenetration)
    healingBonus += value * numberValue(stats?.healingBonus)
  }
  return { physicalPenetration, formlessPenetration, healingBonus }
}

function resolveHealingAttackState(context: DamageContext) {
  const stats = context.stats
  const derivedStats = context.derivedStats
  const unconditional = context.unconditionalDamageEffects ?? {}
  let physicalAttackBonus = unconditional.physicalAttackBonus ?? 0
  let silkbindAttackBonus = unconditional.silkbindAttackBonus ?? 0
  for (const effect of context.effects) {
    physicalAttackBonus += effectValue(effect.physicalAttackBonus, context, stats, derivedStats)
    silkbindAttackBonus += effectValue(effect.silkbindAttackBonus, context, stats, derivedStats)
  }
  const averagePhysicalAttack =
    ((derivedStats.effectiveMinPhys + derivedStats.effectiveMaxPhys) / 2) * (1 + physicalAttackBonus)
  const averageSilkbindAttack =
    ((derivedStats.effectiveMinSilkbind + derivedStats.effectiveMaxSilkbind) / 2) * (1 + silkbindAttackBonus)
  return { stats, derivedStats, averagePhysicalAttack, averageSilkbindAttack }
}

/** Buffed attack averages captured at the action timestamp, before healing-specific multipliers. */
export function calculateHealingAttackSnapshot(context: DamageContext) {
  const { averagePhysicalAttack, averageSilkbindAttack } = resolveHealingAttackState(resolveActionStatContext(context))
  return { averagePhysicalAttack, averageSilkbindAttack }
}

function calculateHealingBreakdownInternal(
  action: DamageAction,
  context: DamageContext,
  random?: () => number,
): HealingBreakdown {
  const { stats, derivedStats, averagePhysicalAttack, averageSilkbindAttack } = resolveHealingAttackState(context)
  const percentageHealing = Math.max(0, stats.maxHp * numberValue(action.maxHPRatio))
  const hasAttackHealing = [action.phyCoef, action.silkbindCoef, action.phyBonus, action.attrBonus].some(
    value => numberValue(value) !== 0,
  )
  if (typeof action.maxHPRatio === "number" && !hasAttackHealing) {
    return {
      physical: percentageHealing,
      silkbind: 0,
      total: percentageHealing,
      normalRate: 1,
      criticalRate: 0,
      ...(random ? { outcome: "normal" as const } : {}),
    }
  }
  const unconditional = context.unconditionalDamageEffects ?? {}
  let physicalPenetration = stats.physicalPenetration + (unconditional.physicalPenetration ?? 0)
  let silkbindPenetration = stats.silkbindPenetration + (unconditional.silkbindPenetration ?? 0)
  let healingBonus = 0
  let criticalHealingBonus = 0
  let healingReceivedBonus = 0

  for (const effect of context.effects) {
    physicalPenetration += effectValue(effect.physicalPenetration, context, stats, derivedStats)
    silkbindPenetration += effectValue(effect.silkbindPenetration, context, stats, derivedStats)
    healingBonus += effectValue(effect.healingBonus, context, stats, derivedStats)
    criticalHealingBonus += effectValue(effect.criticalHealingBonus, context, stats, derivedStats)
    healingReceivedBonus += effectValue(effect.healingReceivedBonus, context, stats, derivedStats)
  }

  const attunement = matchingAttunementStats(context)
  physicalPenetration += attunement.physicalPenetration
  if (mainAttributeForWeapons(context.weapons) === "silkbind") {
    silkbindPenetration += stats.formlessPenetration + attunement.formlessPenetration
  }
  healingBonus += attunement.healingBonus

  const coefficient = numberValue(action.phyCoef)
  const silkbindCoefficient = numberValue(action.silkbindCoef)
  const physical =
    (averagePhysicalAttack * coefficient + numberValue(action.phyBonus)) *
    (1 + physicalPenetration / 200) *
    (1 + stats.physicalHealingBonus)
  const silkbind =
    (averageSilkbindAttack * silkbindCoefficient + numberValue(action.attrBonus)) *
    (1 + silkbindPenetration / 200) *
    (1 + stats.silkbindHealingBonus)
  // A healing action always resolves at the average of its attack range; the shared
  // route keeps that fact in one place instead of repeating the rates here.
  const rates = restrictedOutcomeRates(restrictedRateRouteFor(action.rateRoute) ?? "healing", derivedStats)
  const criticalRate = rates.critRate
  const outcome = random && random() < criticalRate ? "critical" : "normal"
  let criticalMultiplier = 1 + criticalRate * (stats.criticalHealingBonus + criticalHealingBonus)
  if (random) criticalMultiplier = outcome === "critical" ? 1 + stats.criticalHealingBonus + criticalHealingBonus : 1
  const fluctuationMultiplier = random
    ? 1 - SIMULATED_HEALING_FLUCTUATION + random() * SIMULATED_HEALING_FLUCTUATION * 2
    : 1
  const martialArtHealingBonus = context.skillTags.includes("MartialArts")
    ? stats.allMartialArts + weaponArtBonus(stats, context.skillTags)
    : 0
  const generalMultiplier = 1 + healingBonus + martialArtHealingBonus
  const finalMultiplier = criticalMultiplier * generalMultiplier * fluctuationMultiplier * (1 + healingReceivedBonus)

  return {
    physical: Math.max(0, physical * finalMultiplier) + percentageHealing,
    silkbind: Math.max(0, silkbind * finalMultiplier),
    total: Math.max(0, (physical + silkbind) * finalMultiplier) + percentageHealing,
    normalRate: rates.normalRate,
    criticalRate,
    ...(random ? { outcome } : {}),
  }
}

/** Resolve one expected healing action from the same hit-time stats and effects used by damage actions. */
export function calculateHealingBreakdown(action: DamageAction, context: DamageContext): HealingBreakdown {
  return calculateHealingBreakdownInternal(action, resolveActionStatContext(context))
}

/** Resolve one sampled Normal/Critical healing action for a simulation run. */
export function calculateSimulatedHealingBreakdown(
  action: DamageAction,
  context: DamageContext,
  random: () => number,
): HealingBreakdown {
  return calculateHealingBreakdownInternal(action, resolveActionStatContext(context), random)
}
