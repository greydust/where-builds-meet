import type { CharacterStats, EnemyProfile, WeaponId } from "@/types"

import { resolveActionStatContext } from "./actionStats"
import { matchingAttunementEntries } from "./attunementStats"
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark"
import { DEFAULT_TARGET_HP_RATIO } from "./combatDefaults"
import { resolveMultiplyValue, resolveSegmentValue } from "./dynamicValues"
import { calculateRates, mainAttributeForWeapons } from "./effectiveStats"
import type { DerivedStats } from "./effectiveStats"
import { restrictedOutcomeRates, restrictedRateRouteFor, type OutcomeRates } from "./rateRoutes"
import {
  applyStatConversions,
  resolveFormulaValue,
  type StatConversionEffectContainer,
  type StatFormula,
} from "./statEffects"
import { unconditionalDamageEffectFields, type UnconditionalDamageEffects } from "./unconditionalDamageEffects"

const damageEffectFields = new Set<string>(unconditionalDamageEffectFields)
const effectHasDamageFields = new WeakMap<object, boolean>()

/** Effect shapes are immutable within a calculation snapshot; values still resolve per hit. */
function hasDamageFields(effect: Record<string, unknown>) {
  let relevant = effectHasDamageFields.get(effect)
  if (relevant === undefined) {
    relevant = Object.keys(effect).some(field => damageEffectFields.has(field))
    effectHasDamageFields.set(effect, relevant)
  }
  return relevant
}

export type AttunementStats = {
  driftcleaveDeepdazeBoost: number
  skystrikeSpecialBoost: number
  skystrikeMartialBoost: number
  rivenLightBoost: number
  rivenMartialBoost: number
  namelessSwordMartialBoost: number
  namelessSwordChargedBoost: number
  namelessSwordSpecialBoost: number
  namelessSpearChargedBoost: number
  namelessSpearSpecialBoost: number
  strategicSwordMartialBoost: number
  strategicSwordSpecialBoost: number
  strategicSwordBleedingBoost: number
  heavenquakerMartialBoost: number
  heavenquakerChargedBoost: number
  inkwellChargedBoost: number
  inkwellSpecialPursuitBoost: number
  vernalMartialBoost: number
  vernalProjectile280304Boost: number
  vernalProjectile280305Boost: number
  vernalLightHeavyVariedComboBoost: number
  infernalMartialBoost: number
  infernalEmpoweredLightBoost: number
  infernalSpecialBoost: number
  mortalMartialBoost: number
  mortalRodentBoost: number
  physicalPenetration: number
  formlessPenetration: number
  physicalResistance: number
  phalanxbaneChargedBoost: number
  phalanxbaneMartialBoost: number
  snowpartingChargedBoost: number
  snowpartingVariedComboBoost: number
  snowpartingMartialBoost: number
  thundercryChargedBoost: number
  thundercryShieldBoost: number
  thundercrySpecialBoost: number
  stormbreakerChargedBoost: number
  stormbreakerSpecialBoost: number
  everspringMartialBoost: number
  everspringSpecialBoost: number
  unfetteredChargedBoost: number
  unfetteredSpecialBoost: number
  unfetteredMartialBoost: number
  heavenwillChargedBoost: number
  heavenwillMartialBoost: number
  heavenwillLightVariedComboBoost: number
  skygraspHeavyBoost: number
  skygraspSpecialBoost: number
  panaceaMartialHealingBoost: number
  panaceaSpecialHealingBoost: number
  panaceaHealingSkillBoost: number
  soulshadeMartialHealingBoost: number
  soulshadeSpecialHealingBoost: number
}

// Current level-96 test target. Move this to user-configurable encounter data later.
export const ENEMY_DEFENSE = 405

export type DamageAction = {
  type?: unknown
  phyCoef?: unknown
  attrCoef?: unknown
  silkbindCoef?: unknown
  /**
   * Resolve the attack at the average of its effective range. Expected damage already
   * uses that average for the Normal and Critical outcomes; this also removes the
   * simulation's uniform roll inside the range, making the sampled hit deterministic.
   */
  averageAttack?: unknown
  /** Outcome-rate route. Omitted actions use the normal route's four outcomes. */
  rateRoute?: unknown
  /** Runtime periodic stack/probability weight, applied after resolving attack channels. */
  damageScale?: unknown
  hitProbability?: unknown
  phyBonus?: unknown
  attrBonus?: unknown
  coef?: unknown
}
export type DamageOutcome = "abrasion" | "normal" | "critical" | "affinity"
export type DamageOutcomeRates = { abrasion: number; normal: number; critical: number; affinity: number }
export type DamageBreakdown = {
  physical: number
  bellstrike: number
  stonesplit: number
  silkbind: number
  bamboocut: number
  total: number
  outcomeRates?: DamageOutcomeRates
  outcome?: DamageOutcome
}
type AttackRollMode = "min" | "average" | "max" | "simulate"
type AttributeDamageType = "bellstrike" | "stonesplit" | "silkbind" | "bamboocut"

const attributeDamageTypes: AttributeDamageType[] = ["bellstrike", "stonesplit", "silkbind", "bamboocut"]

export type DamageContext = {
  stats: CharacterStats
  attunement: AttunementStats
  skillTags: string[]
  weapons: WeaponId[]
  buffs: string[]
  enemy: EnemyProfile
  derivedStats: DerivedStats
  effects: Record<string, unknown>[]
  unconditionalDamageEffects?: UnconditionalDamageEffects
  distance?: number
  currentHPRatio?: number
  targetHPRatio?: number
  /** Current Endurance below its maximum, exposed to the `enduranceLost` dynamic value. */
  enduranceLost?: number
  /** Direct Endurance spent by this cast, excluding its charging rate. */
  enduranceSpent?: number
  isDot?: boolean
  expectedEffects?: Array<Array<{ probability: number; effects: Record<string, unknown>[] }>>
}

// Formula reuse stays local to resolved results; it is never serialized into worker output.
type AdditiveBonusResponse = {
  context: DamageContext
  bonusComponents: Array<{
    physicalDamage: number
    attributeDamage: Pick<DamageBreakdown, AttributeDamageType>
    specialBonus: number
  }>
  damageScale: number
  attunementBonus: number
  resolvedEffects: {
    baseDmgBonus: number
    attributeDmgBonus: number
    dotDamageBonus: number
    globalBellstrikeDmgBonus: number
  }
  globalMultiplier: number
  skillWeaponArtBonus: number
  mysticSkillBonus: number
  rates: OutcomeRates
}
const additiveBonusResponses = new WeakMap<DamageBreakdown, AdditiveBonusResponse>()
const effectSignatures = new WeakMap<object, string>()
function effectSignature(effect: Record<string, unknown>) {
  let signature = effectSignatures.get(effect)
  if (signature === undefined) {
    signature = JSON.stringify(effect)
    effectSignatures.set(effect, signature)
  }
  return signature
}
const pureAdditiveEffects = new WeakMap<object, boolean>()
function isPureAdditiveEffect(effect: Record<string, unknown>) {
  let pure = pureAdditiveEffects.get(effect)
  if (pure === undefined) {
    pure = Object.keys(effect).every(key => ["dmgBonus", "hpDMGBonus", "hpDMGBonusWeapons"].includes(key))
    pureAdditiveEffects.set(effect, pure)
  }
  return pure
}
function differsOnlyInAdditiveBonus(original: DamageContext, candidate: DamageContext) {
  if (candidate.expectedEffects?.length) return false
  for (const key of [...Object.keys(original), ...Object.keys(candidate)] as Array<keyof DamageContext>) {
    switch (key) {
      case "effects":
      case "buffs":
      case "unconditionalDamageEffects":
      case "expectedEffects":
        break
      default:
        if (original[key] !== candidate[key]) return false
    }
  }
  const before = original.unconditionalDamageEffects ?? {}
  const after = candidate.unconditionalDamageEffects ?? {}
  for (const key of [...Object.keys(before), ...Object.keys(after)] as Array<keyof UnconditionalDamageEffects>)
    if (key !== "dmgBonus" && key !== "hpDMGBonus" && (before[key] ?? 0) !== (after[key] ?? 0)) return false
  let index = 0
  for (const effect of candidate.effects) {
    if (isPureAdditiveEffect(effect)) continue
    while (index < original.effects.length && isPureAdditiveEffect(original.effects[index])) index++
    const previous = original.effects[index++]
    if (!previous || (previous !== effect && effectSignature(previous) !== effectSignature(effect))) return false
  }
  while (index < original.effects.length && isPureAdditiveEffect(original.effects[index])) index++
  return index === original.effects.length
}

/** Reapply only an additive damage-bonus change; unsupported changes retain the full formula. */
export function takeAdditiveDamageBonusResponse(result: DamageBreakdown) {
  const response = additiveBonusResponses.get(result)
  additiveBonusResponses.delete(result)
  return response ? (context: DamageContext) => evaluateAdditiveBonusResponse(response, context) : undefined
}

/** Capture channel components only for hits whose reporting needs counterfactual attribution. */
export function calculateDamageWithAdditiveResponse(action: DamageAction, context: DamageContext) {
  return calculateDamageBreakdown(action, context, (resolvedAction, resolvedContext) =>
    calculateDamageBreakdownInternal(resolvedAction, resolvedContext, undefined, undefined, true),
  )
}

function damageEffectValue(value: unknown, context: DamageContext) {
  const { stats, derivedStats } = context
  if (typeof value === "number" && Number.isFinite(value)) return value
  if (!value || typeof value !== "object" || Array.isArray(value)) return 0
  const dynamicValueStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const objectValue = value as Record<string, unknown>
  const dynamicParameters = {
    distance: context.distance ?? 1,
    maxHp: stats.maxHp,
    currentHPPercentage: (context.currentHPRatio ?? 1) * 100,
    missingHPPercentage: (1 - (context.currentHPRatio ?? 1)) * 100,
    targetHPPercentage: (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO) * 100,
    missingTargetHPPercentage: (1 - (context.targetHPRatio ?? DEFAULT_TARGET_HP_RATIO)) * 100,
    enduranceLost: context.enduranceLost,
    enduranceSpent: context.enduranceSpent,
  }
  const multiplied = resolveMultiplyValue(value, dynamicParameters)
  if (multiplied !== undefined) {
    if (import.meta.env.DEV) finishCalculationPhase("damageEffectDynamicValueResolution", dynamicValueStartedAt)
    return multiplied
  }
  const segmented = resolveSegmentValue(value, dynamicParameters)
  if (segmented !== undefined) {
    if (import.meta.env.DEV) finishCalculationPhase("damageEffectDynamicValueResolution", dynamicValueStartedAt)
    return segmented
  }
  const formula = objectValue.formula
  const resolved =
    formula && typeof formula === "object" && !Array.isArray(formula)
      ? (resolveFormulaValue(formula as StatFormula, { ...stats, ...derivedStats }) ?? 0)
      : 0
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectDynamicValueResolution", dynamicValueStartedAt)
  return resolved
}

function evaluateAdditiveBonusResponse(response: AdditiveBonusResponse, unresolved: DamageContext) {
  const {
    context,
    bonusComponents,
    damageScale,
    attunementBonus,
    resolvedEffects,
    globalMultiplier,
    skillWeaponArtBonus,
    mysticSkillBonus,
    rates,
  } = response
  const { stats, skillTags, weapons } = context
  const candidate = resolveActionStatContext(unresolved)
  if (!differsOnlyInAdditiveBonus(context, candidate)) return undefined
  const aggregate = candidate.unconditionalDamageEffects ?? {}
  let bonus = (aggregate.dmgBonus ?? 0) + (aggregate.hpDMGBonus ?? 0)
  for (const effect of candidate.effects) {
    if (!hasDamageFields(effect)) continue
    bonus += damageEffectValue(effect.dmgBonus, context)
    if (
      !Array.isArray(effect.hpDMGBonusWeapons) ||
      effect.hpDMGBonusWeapons.some(weapon => weapons.includes(weapon as WeaponId))
    )
      bonus += damageEffectValue(effect.hpDMGBonus, context)
  }
  const category =
    stats.vsBossDmg +
    (skillTags.includes("MartialArts") ? stats.allMartialArts : 0) +
    skillWeaponArtBonus +
    mysticSkillBonus +
    bonus
  const physicalShared = damageScale * (1 + resolvedEffects.baseDmgBonus) * (1 + category) * (1 + attunementBonus)
  const attributeShared =
    damageScale *
    (1 + resolvedEffects.baseDmgBonus) *
    (1 + category + resolvedEffects.attributeDmgBonus) *
    (1 + attunementBonus)
  const variants = bonusComponents.map(({ physicalDamage, attributeDamage, specialBonus }) => {
    const physicalMultiplier = physicalShared * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
    const attributeMultiplier = attributeShared * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
    return {
      physical: Math.max(0, physicalDamage * physicalMultiplier * globalMultiplier),
      bellstrike:
        attributeDamage.bellstrike *
        attributeMultiplier *
        (globalMultiplier + resolvedEffects.globalBellstrikeDmgBonus),
      stonesplit: attributeDamage.stonesplit * attributeMultiplier * globalMultiplier,
      silkbind: attributeDamage.silkbind * attributeMultiplier * globalMultiplier,
      bamboocut: attributeDamage.bamboocut * attributeMultiplier * globalMultiplier,
    }
  })
  const weighted = (key: keyof (typeof variants)[0]) =>
    variants[0][key] * rates.abrasionRate +
    variants[1][key] * rates.normalRate +
    variants[2][key] * rates.critRate +
    variants[3][key] * rates.affinityRate
  return (
    weighted("physical") +
    weighted("bellstrike") +
    weighted("stonesplit") +
    weighted("silkbind") +
    weighted("bamboocut")
  )
}

const numberValue = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : 0)

function penetrationMultiplier(penetration: number, resistance = 0) {
  return penetration >= resistance ? 1 + (penetration - resistance) / 200 : 1 + (penetration - resistance) / 100
}

export function weaponArtBonus(stats: CharacterStats, skillTags: string[]) {
  for (const tag of skillTags) {
    switch (tag) {
      case "MoBlade":
        return stats.moBladeDmgBoost
      case "HengBlade":
        return stats.hengBladeDmgBoost
      case "Spear":
        return stats.spearDmgBoost
      case "Gauntlet":
        return stats.gauntletDmgBoost
      case "RopeDart":
        return stats.ropeDartDmgBoost
      case "Umbrella":
        return stats.umbrellaDmgBoost
      case "Sword":
        return stats.swordDmgBoost
      case "Fan":
        return stats.fanDmgBoost
      case "DualBlades":
        return stats.dualBladesDmgBoost
    }
  }
  return 0
}

function mysticSkillDamageBonus(stats: CharacterStats, skillTags: string[]) {
  for (const tag of skillTags) {
    switch (tag) {
      case "SingleTargetMystic":
        return stats.singleTargetMysticDmgBoost
      case "AreaMystic":
        return stats.areaMysticDmgBoost
    }
  }
  return 0
}

function calculateDamageBreakdownInternal(
  action: DamageAction,
  context: DamageContext,
  random?: () => number,
  prepare?: (formula: PreparedDamageFormula) => void,
  captureAdditiveResponse = false,
): DamageBreakdown {
  const { stats: baseStats, attunement, skillTags, weapons, enemy, derivedStats: baseDerivedStats, effects } = context
  const stats = baseStats
  const derivedStats = baseDerivedStats
  const effectAggregationStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const effectValue = (value: unknown) => damageEffectValue(value, context)
  let coefficient = effectValue(action.phyCoef)
  let attributeCoefficient = effectValue(action.attrCoef)
  let physicalBonus = numberValue(action.phyBonus)
  let attributeBonus = numberValue(action.attrBonus)
  const path = mainAttributeForWeapons(weapons)
  const effectFieldAggregationStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const accumulatorStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const unconditional = context.unconditionalDamageEffects ?? {}
  const resolvedEffects = {
    attackBonus: {
      physical: unconditional.physicalAttackBonus ?? 0,
      bellstrike: unconditional.bellstrikeAttackBonus ?? 0,
      stonesplit: unconditional.stonesplitAttackBonus ?? 0,
      silkbind: unconditional.silkbindAttackBonus ?? 0,
      bamboocut: unconditional.bamboocutAttackBonus ?? 0,
    },
    attributePenetration: {
      bellstrike: unconditional.bellstrikePenetration ?? 0,
      stonesplit: unconditional.stonesplitPenetration ?? 0,
      silkbind: unconditional.silkbindPenetration ?? 0,
      bamboocut: unconditional.bamboocutPenetration ?? 0,
    },
    attributeResistance: {
      bellstrike: unconditional.bellstrikeResistance ?? 0,
      stonesplit: unconditional.stonesplitResistance ?? 0,
      silkbind: unconditional.silkbindResistance ?? 0,
      bamboocut: unconditional.bamboocutResistance ?? 0,
    },
    innerWayDmgBonus: (unconditional.dmgBonus ?? 0) + (unconditional.hpDMGBonus ?? 0),
    baseDmgBonus: unconditional.baseDMGBonus ?? 0,
    globalDmgBonus: (unconditional.globalDmgBonus ?? 0) + (unconditional.globalHPDMGBonus ?? 0),
    globalBellstrikeDmgBonus: unconditional.globalBellstrikeDMGBonus ?? 0,
    dotDamageBonus:
      (context.isDot ? (unconditional.dotDamage ?? 0) : 0) +
      (context.skillTags.includes("HighBleed") ? (unconditional.highBleedDamage ?? 0) : 0),
    physicalPenetration: unconditional.physicalPenetration ?? 0,
    defenseBonus: unconditional.defenseBonus ?? 0,
    physicalResistance: unconditional.physicalResistance ?? 0,
    critDmgBonus: unconditional.critDmgBonus ?? 0,
    affinityDmgBonus: unconditional.affinityDmgBonus ?? 0,
    attributeDmgBonus: unconditional.attributeDMGBonus ?? 0,
    flatAttackBonus: unconditional.flatAttackBonus ?? 0,
    coefficientBonusWithoutFlatAttack: unconditional.coefficientBonusWithoutFlatAttack ?? 0,
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectAccumulatorInitialization", accumulatorStartedAt)
  const remainingScanStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  // Party-shared reductions use the strongest active value in their group, per field.
  const reductionGroups = new Map<string, Record<string, unknown>>()
  const groupedEffects = effects.map(effect => {
    if (typeof effect.reductionGroup !== "string") return effect
    let group = reductionGroups.get(effect.reductionGroup)
    if (!group) reductionGroups.set(effect.reductionGroup, (group = {}))
    for (const field of ["defenseBonus", "physicalResistance"])
      group[field] = Math.min(Number(group[field] ?? 0), effectValue(effect[field]))
    const { defenseBonus: _defense, physicalResistance: _resistance, ...remaining } = effect
    return remaining
  })
  for (const effect of [...groupedEffects, ...reductionGroups.values()]) {
    if (!hasDamageFields(effect)) continue
    resolvedEffects.flatAttackBonus += effectValue(effect.flatAttackBonus)
    resolvedEffects.coefficientBonusWithoutFlatAttack += effectValue(effect.coefficientBonusWithoutFlatAttack)
    resolvedEffects.attackBonus.physical += effectValue(effect.physicalAttackBonus)
    for (const attribute of attributeDamageTypes) {
      resolvedEffects.attackBonus[attribute] += effectValue(effect[`${attribute}AttackBonus`])
      resolvedEffects.attributePenetration[attribute] += effectValue(effect[`${attribute}Penetration`])
      resolvedEffects.attributeResistance[attribute] += effectValue(effect[`${attribute}Resistance`])
    }
    resolvedEffects.innerWayDmgBonus += effectValue(effect.dmgBonus)
    if (
      !Array.isArray(effect.hpDMGBonusWeapons) ||
      effect.hpDMGBonusWeapons.some(weapon => weapons.includes(weapon as WeaponId))
    )
      resolvedEffects.innerWayDmgBonus += effectValue(effect.hpDMGBonus)
    resolvedEffects.baseDmgBonus += effectValue(effect.baseDMGBonus)
    resolvedEffects.globalDmgBonus += effectValue(effect.globalDmgBonus) + effectValue(effect.globalHPDMGBonus)
    resolvedEffects.globalBellstrikeDmgBonus += effectValue(effect.globalBellstrikeDMGBonus)
    if (context.isDot) resolvedEffects.dotDamageBonus += effectValue(effect.dotDamage)
    if (context.skillTags.includes("HighBleed")) resolvedEffects.dotDamageBonus += effectValue(effect.highBleedDamage)
    resolvedEffects.physicalPenetration += effectValue(effect.physicalPenetration)
    resolvedEffects.defenseBonus += effectValue(effect.defenseBonus)
    resolvedEffects.physicalResistance += effectValue(effect.physicalResistance)
    resolvedEffects.critDmgBonus += effectValue(effect.critDmgBonus)
    resolvedEffects.affinityDmgBonus += effectValue(effect.affinityDmgBonus)
    resolvedEffects.attributeDmgBonus += effectValue(effect.attributeDMGBonus)
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectRemainingScan", remainingScanStartedAt)
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectFieldAggregation", effectFieldAggregationStartedAt)
  // Flat bonus attack is separate from attack stats and final damage bonuses.
  // Only explicitly opted-in talents scale coefficients on actions with no flat attack.
  if (physicalBonus === 0 && attributeBonus === 0) {
    coefficient *= 1 + resolvedEffects.coefficientBonusWithoutFlatAttack
    attributeCoefficient *= 1 + resolvedEffects.coefficientBonusWithoutFlatAttack
  }
  physicalBonus *= 1 + resolvedEffects.flatAttackBonus
  attributeBonus *= 1 + resolvedEffects.flatAttackBonus
  const channelSnapshotStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const physicalAttackMultiplier = 1 + resolvedEffects.attackBonus.physical
  const attributeRanges = [
    [
      derivedStats.effectiveMinBellstrike * (1 + resolvedEffects.attackBonus.bellstrike),
      derivedStats.effectiveMaxBellstrike * (1 + resolvedEffects.attackBonus.bellstrike),
      stats.bellstrikePenetration + resolvedEffects.attributePenetration.bellstrike,
      stats.bellstrikeDmgBonus,
      "bellstrike",
      enemy.bellstrikeResistance + resolvedEffects.attributeResistance.bellstrike,
    ],
    [
      derivedStats.effectiveMinStonesplit * (1 + resolvedEffects.attackBonus.stonesplit),
      derivedStats.effectiveMaxStonesplit * (1 + resolvedEffects.attackBonus.stonesplit),
      stats.stonesplitPenetration + resolvedEffects.attributePenetration.stonesplit,
      stats.stonesplitDmgBonus,
      "stonesplit",
      enemy.stonesplitResistance + resolvedEffects.attributeResistance.stonesplit,
    ],
    [
      derivedStats.effectiveMinSilkbind * (1 + resolvedEffects.attackBonus.silkbind),
      derivedStats.effectiveMaxSilkbind * (1 + resolvedEffects.attackBonus.silkbind),
      stats.silkbindPenetration + resolvedEffects.attributePenetration.silkbind,
      stats.silkbindDmgBonus,
      "silkbind",
      enemy.silkbindResistance + resolvedEffects.attributeResistance.silkbind,
    ],
    [
      derivedStats.effectiveMinBamboocut * (1 + resolvedEffects.attackBonus.bamboocut),
      derivedStats.effectiveMaxBamboocut * (1 + resolvedEffects.attackBonus.bamboocut),
      stats.bamboocutPenetration + resolvedEffects.attributePenetration.bamboocut,
      stats.bamboocutDmgBonus,
      "bamboocut",
      enemy.bamboocutResistance + resolvedEffects.attributeResistance.bamboocut,
    ],
  ] as Array<[number, number, number, number, AttributeDamageType, number]>
  if (import.meta.env.DEV) finishCalculationPhase("damageChannelSnapshot", channelSnapshotStartedAt)
  const attunementAggregationStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  let attunementBonus = 0
  let attunementPhysicalPenetration = 0
  let attunementFormlessPenetration = stats.formlessPenetration
  for (const { key, stat: effectStats } of matchingAttunementEntries(attunement, skillTags)) {
    const value = attunement[key]
    const addAttunementStat = (target: string) => {
      const multiplier = effectStats?.[target]
      return typeof multiplier === "number" && Number.isFinite(multiplier) ? value * multiplier : 0
    }
    attunementBonus += addAttunementStat("attunementDMGBonus")
    attunementPhysicalPenetration += addAttunementStat("physicalPenetration")
    attunementFormlessPenetration += addAttunementStat("formlessPenetration")
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageAttunementAggregation", attunementAggregationStartedAt)
  const sharedMultiplierStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const skillWeaponArtBonus = weaponArtBonus(stats, skillTags)
  const mysticSkillBonus = mysticSkillDamageBonus(stats, skillTags)
  const damageBonusCategory1 =
    stats.vsBossDmg +
    (skillTags.includes("MartialArts") ? stats.allMartialArts : 0) +
    skillWeaponArtBonus +
    mysticSkillBonus +
    resolvedEffects.innerWayDmgBonus
  const damageScale = action.damageScale === undefined ? 1 : numberValue(action.damageScale)
  const physicalSharedBonus =
    damageScale * (1 + resolvedEffects.baseDmgBonus) * (1 + damageBonusCategory1) * (1 + attunementBonus)
  const attributeSharedBonus =
    damageScale *
    (1 + resolvedEffects.baseDmgBonus) *
    (1 + damageBonusCategory1 + resolvedEffects.attributeDmgBonus) *
    (1 + attunementBonus)
  if (import.meta.env.DEV) finishCalculationPhase("damageSharedMultiplierResolution", sharedMultiplierStartedAt)
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectAggregation", effectAggregationStartedAt)
  const randomUnit = () => Math.min(1 - Number.EPSILON, Math.max(0, random?.() ?? 0.5))
  const attackValue = (minimum: number, maximum: number, mode: AttackRollMode) => {
    switch (mode) {
      case "min":
        return minimum
      case "max":
        return maximum
      case "simulate":
        return minimum === maximum ? minimum : minimum + (maximum - minimum) * randomUnit()
      case "average":
        return (minimum + maximum) / 2
    }
  }
  const preparedAttributeRanges = attributeRanges.map(([, , penetration, damageBonus, attribute, resistance]) => ({
    attribute,
    attackMultiplier: 1 + resolvedEffects.attackBonus[attribute],
    penetration: penetrationMultiplier(
      penetration + (attribute === path ? attunementFormlessPenetration : 0),
      resistance,
    ),
    damageMultiplier: 1 + damageBonus,
    pathMultiplier: attribute === path ? 1.5 : 1,
    flatBonus: attribute === path ? attributeBonus : 0,
  }))
  const adjustedEnemyDefense = enemy.defense * (1 + resolvedEffects.defenseBonus)
  const physicalPenetrationMultiplier = penetrationMultiplier(
    stats.physicalPenetration + attunementPhysicalPenetration + resolvedEffects.physicalPenetration,
    enemy.physicalResistance + resolvedEffects.physicalResistance,
  )
  const physicalDamageMultiplier = 1 + stats.physDmgBonus
  const globalMultiplier = 1 + resolvedEffects.globalDmgBonus
  const calculateAttributeDamage = (mode: AttackRollMode, snapshot: DerivedStats) =>
    preparedAttributeRanges.reduce(
      (total, { attribute, attackMultiplier, penetration, damageMultiplier, pathMultiplier, flatBonus }) => {
        const [minimum, maximum] = attackFields[attribute]
        const attack = attackValue(snapshot[minimum] * attackMultiplier, snapshot[maximum] * attackMultiplier, mode)
        const damage = (attributeCoefficient * attack + flatBonus) * penetration * damageMultiplier * pathMultiplier
        return Object.assign(total, { [attribute]: total[attribute as keyof typeof total] + damage })
      },
      { bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 },
    )
  const bonusComponents:
    | Array<{
        physicalDamage: number
        attributeDamage: ReturnType<typeof calculateAttributeDamage>
        specialBonus: number
      }>
    | undefined = captureAdditiveResponse ? [] : undefined
  const calculateVariant = (damageType: AttackRollMode, specialBonus: number, snapshot = derivedStats) => {
    const variantStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const physicalChannelStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const physicalAttack = attackValue(
      snapshot.effectiveMinPhys * physicalAttackMultiplier,
      snapshot.effectiveMaxPhys * physicalAttackMultiplier,
      damageType,
    )
    const physicalDamage =
      (coefficient * (physicalAttack - adjustedEnemyDefense) + physicalBonus) *
      physicalPenetrationMultiplier *
      physicalDamageMultiplier
    const physicalMultiplier = physicalSharedBonus * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
    const attributeMultiplier = attributeSharedBonus * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
    const resolvedPhysicalDamage = Math.max(0, physicalDamage * physicalMultiplier * globalMultiplier)
    if (import.meta.env.DEV) finishCalculationPhase("damagePhysicalChannel", physicalChannelStartedAt)
    const attributeChannelsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const attributeDamage = calculateAttributeDamage(damageType, snapshot)
    bonusComponents?.push({ physicalDamage, attributeDamage, specialBonus })
    const result = {
      physical: resolvedPhysicalDamage,
      bellstrike:
        attributeDamage.bellstrike *
        attributeMultiplier *
        (globalMultiplier + resolvedEffects.globalBellstrikeDmgBonus),
      stonesplit: attributeDamage.stonesplit * attributeMultiplier * globalMultiplier,
      silkbind: attributeDamage.silkbind * attributeMultiplier * globalMultiplier,
      bamboocut: attributeDamage.bamboocut * attributeMultiplier * globalMultiplier,
    }
    if (import.meta.env.DEV) finishCalculationPhase("damageAttributeChannels", attributeChannelsStartedAt)
    if (import.meta.env.DEV) finishCalculationPhase("damageVariantCalculation", variantStartedAt)
    return result
  }
  const rateResolutionStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const conversionEffects = effects.filter(
    (effect): effect is Record<string, unknown> & StatConversionEffectContainer => effect.convert !== undefined,
  )
  const GuaranteedAffinity = effects.some(effect => effect.GuaranteedAffinity === true)
  const NoAbrasion = effects.some(effect => effect.NoAbrasion === true)
  const GuaranteedCrit = effects.some(effect => effect.GuaranteedCrit === true)
  const SteadfastGuaranteedCrit =
    effects.some(effect => effect.SteadfastGuaranteedCrit === true) &&
    (skillTags.includes("BurningHeart") || skillTags.includes("AnxiSoldier"))
  const resolveRates = (snapshot: DerivedStats) => {
    const rateStats = {
      effectivePrecision: snapshot.effectivePrecision,
      effectiveCrit: snapshot.effectiveCrit,
      effectiveAffinity: snapshot.effectiveAffinity,
      directCrit: snapshot.directCrit,
      directAffinity: snapshot.finalAffinity - snapshot.effectiveAffinity,
      finalAffinity: snapshot.finalAffinity,
    }
    const convertedRateStats =
      conversionEffects.length > 0 ? applyStatConversions(rateStats, conversionEffects) : rateStats
    const calculatedRates = calculateRates(
      NoAbrasion ? { ...convertedRateStats, effectivePrecision: 1 } : convertedRateStats,
      { GuaranteedCrit, GuaranteedAffinity, SteadfastGuaranteedCrit },
    )
    const convertedRates =
      conversionEffects.length > 0 ? applyStatConversions(calculatedRates, conversionEffects) : calculatedRates
    let normalRates = convertedRates
    switch (true) {
      case GuaranteedAffinity:
        normalRates = {
          ...convertedRates,
          finalAffinity: 1,
          finalCrit: 0,
          critRate: 0,
          abrasionRate: 0,
          normalRate: 0,
          affinityRate: 1,
        }
        break
      case GuaranteedCrit:
        normalRates = { ...convertedRates, finalCrit: 1, critRate: 1, abrasionRate: 0, normalRate: 0, affinityRate: 0 }
        break
      default:
        break
    }
    // The healing and Divinecraft routes cannot roll every outcome, so they replace the normal rates.
    const rateRoute = restrictedRateRouteFor(action.rateRoute)
    const rates = rateRoute ? restrictedOutcomeRates(rateRoute, rateStats) : normalRates
    return rates
  }
  const initialRates = resolveRates(derivedStats)
  const rates = initialRates
  if (import.meta.env.DEV) finishCalculationPhase("damageRateResolution", rateResolutionStartedAt)
  if (random) {
    const outcomeSelectionStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const outcomeRoll = randomUnit()
    // `averageAttack` replaces the sampled roll inside the attack range with its average.
    const sampledAttack: AttackRollMode = action.averageAttack === true ? "average" : "simulate"
    let outcome: DamageOutcome
    switch (true) {
      case outcomeRoll < rates.abrasionRate:
        outcome = "abrasion"
        break
      case outcomeRoll < rates.abrasionRate + rates.normalRate:
        outcome = "normal"
        break
      case outcomeRoll < rates.abrasionRate + rates.normalRate + rates.critRate:
        outcome = "critical"
        break
      default:
        outcome = "affinity"
    }
    if (import.meta.env.DEV) finishCalculationPhase("damageOutcomeAggregation", outcomeSelectionStartedAt)
    let selectedDamage: ReturnType<typeof calculateVariant>
    switch (outcome) {
      case "abrasion":
        selectedDamage = calculateVariant("min", 0)
        break
      case "affinity":
        selectedDamage = calculateVariant("max", stats.affinityDmgBonus + resolvedEffects.affinityDmgBonus)
        break
      case "critical":
        selectedDamage = calculateVariant(
          sampledAttack,
          derivedStats.effectiveCritDmgBonus + resolvedEffects.critDmgBonus,
        )
        break
      case "normal":
        selectedDamage = calculateVariant(sampledAttack, 0)
        break
    }
    const outcomeAssemblyStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const result = {
      ...selectedDamage,
      total:
        selectedDamage.physical +
        selectedDamage.bellstrike +
        selectedDamage.stonesplit +
        selectedDamage.silkbind +
        selectedDamage.bamboocut,
      outcome,
      outcomeRates: {
        abrasion: outcome === "abrasion" ? 1 : 0,
        normal: outcome === "normal" ? 1 : 0,
        critical: outcome === "critical" ? 1 : 0,
        affinity: outcome === "affinity" ? 1 : 0,
      },
    }
    if (import.meta.env.DEV) finishCalculationPhase("damageOutcomeAggregation", outcomeAssemblyStartedAt)
    return result
  }
  let outcomeInputs: number[] | undefined
  let outcomeCritBonus: number | undefined
  let outcomeDamage: Array<ReturnType<typeof calculateVariant>> | undefined
  const evaluate = (snapshot: DerivedStats) => {
    const rates = snapshot === derivedStats ? initialRates : resolveRates(snapshot)
    // Rate-only variants retain all four channel vectors. Changes to effective
    // attack or critical damage rebuild them through the ordinary formula.
    if (
      !outcomeDamage ||
      outcomeCritBonus !== snapshot.effectiveCritDmgBonus ||
      outcomeAttackFields.some((field, index) => outcomeInputs![index] !== snapshot[field])
    ) {
      if (prepare) {
        outcomeInputs = outcomeAttackFields.map(field => snapshot[field])
        outcomeCritBonus = snapshot.effectiveCritDmgBonus
      }
      outcomeDamage = [
        calculateVariant("min", 0, snapshot),
        calculateVariant("average", 0, snapshot),
        calculateVariant("average", snapshot.effectiveCritDmgBonus + resolvedEffects.critDmgBonus, snapshot),
        calculateVariant("max", stats.affinityDmgBonus + resolvedEffects.affinityDmgBonus, snapshot),
      ]
    }
    const [abrasionDamage, normalDamage, critDamage, affinityDamage] = outcomeDamage
    const outcomeAggregationStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const weighted = (key: keyof typeof abrasionDamage) =>
      abrasionDamage[key] * rates.abrasionRate +
      normalDamage[key] * rates.normalRate +
      critDamage[key] * rates.critRate +
      affinityDamage[key] * rates.affinityRate
    const physical = weighted("physical")
    const bellstrike = weighted("bellstrike")
    const stonesplit = weighted("stonesplit")
    const silkbind = weighted("silkbind")
    const bamboocut = weighted("bamboocut")
    const result = {
      physical,
      bellstrike,
      stonesplit,
      silkbind,
      bamboocut,
      total: physical + bellstrike + stonesplit + silkbind + bamboocut,
      outcomeRates: {
        abrasion: rates.abrasionRate,
        normal: rates.normalRate,
        critical: rates.critRate,
        affinity: rates.affinityRate,
      },
    }
    if (bonusComponents)
      additiveBonusResponses.set(result, {
        context,
        bonusComponents,
        damageScale,
        attunementBonus,
        resolvedEffects,
        globalMultiplier,
        skillWeaponArtBonus,
        mysticSkillBonus,
        rates,
      })
    if (import.meta.env.DEV) finishCalculationPhase("damageOutcomeAggregation", outcomeAggregationStartedAt)
    return result
  }
  prepare?.({
    evaluate,
    rateResponse: () => ({
      key: JSON.stringify([
        GuaranteedCrit,
        GuaranteedAffinity,
        SteadfastGuaranteedCrit,
        NoAbrasion,
        conversionEffects,
        action.rateRoute,
      ]),
      coefficients: outcomeDamage!.map(
        channels =>
          channels.physical + channels.bellstrike + channels.stonesplit + channels.silkbind + channels.bamboocut,
      ),
      baselineRates: initialRates,
      resolveRates,
    }),
    response: () => {
      const coefficients = Object.fromEntries(
        Object.values(attackFields)
          .flat()
          .map(field => [field, 0]),
      ) as Record<AttackField, number>
      const physicalBounds: Array<{ minimumWeight: number; maximumWeight: number; lower: number; upper: number }> = []
      const penetrationResponse = (difference: number): PenetrationDamageResponse => ({
        coefficient: 0,
        lower: difference >= 0 ? -difference : -Infinity,
        upper: difference >= 0 ? Infinity : -difference,
      })
      const physicalDifference =
        stats.physicalPenetration +
        attunementPhysicalPenetration +
        resolvedEffects.physicalPenetration -
        (enemy.physicalResistance + resolvedEffects.physicalResistance)
      const physicalPenetration = penetrationResponse(physicalDifference)
      // Positive penetration multipliers preserve the physical zero-clamp region.
      physicalPenetration.lower =
        physicalPenetrationMultiplier > 0 ? Math.max(physicalPenetration.lower, -100 - physicalDifference) : Infinity
      const primaryRange = preparedAttributeRanges.find(range => range.attribute === path)
      const primaryDifference = primaryRange
        ? attributeRanges.find(range => range[4] === path)![2] +
          attunementFormlessPenetration -
          attributeRanges.find(range => range[4] === path)![5]
        : 0
      const formlessPenetration = penetrationResponse(primaryDifference)
      const outcomes = [
        [1, 0, rates.abrasionRate, 0],
        [0.5, 0.5, rates.normalRate, 0],
        [0.5, 0.5, rates.critRate, derivedStats.effectiveCritDmgBonus + resolvedEffects.critDmgBonus],
        [0, 1, rates.affinityRate, stats.affinityDmgBonus + resolvedEffects.affinityDmgBonus],
      ]
      for (const [minimumWeight, maximumWeight, probability, specialBonus] of outcomes) {
        if (probability === 0) continue
        const physicalMultiplier = physicalSharedBonus * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
        const attributeMultiplier = attributeSharedBonus * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
        const globalMultiplier = 1 + resolvedEffects.globalDmgBonus
        const physicalFactor =
          penetrationMultiplier(
            stats.physicalPenetration + attunementPhysicalPenetration + resolvedEffects.physicalPenetration,
            enemy.physicalResistance + resolvedEffects.physicalResistance,
          ) *
          (1 + stats.physDmgBonus) *
          physicalMultiplier *
          globalMultiplier
        const attack =
          (derivedStats.effectiveMinPhys * minimumWeight + derivedStats.effectiveMaxPhys * maximumWeight) *
          physicalAttackMultiplier
        const unclamped =
          (coefficient * (attack - enemy.defense * (1 + resolvedEffects.defenseBonus)) + physicalBonus) * physicalFactor
        const slope = coefficient * physicalAttackMultiplier * physicalFactor
        if (slope !== 0) {
          const boundary = -unclamped / slope
          const increasing = slope > 0
          const positive = unclamped > 0
          physicalBounds.push({
            minimumWeight,
            maximumWeight,
            lower: increasing === positive ? boundary : -Infinity,
            upper: increasing === positive ? Infinity : boundary,
          })
        }
        if (unclamped > 0 && physicalPenetrationMultiplier > 0)
          physicalPenetration.coefficient +=
            ((unclamped / physicalPenetrationMultiplier) * probability) / (physicalDifference >= 0 ? 200 : 100)
        if (primaryRange) {
          const [minimum, maximum] = attackFields[primaryRange.attribute]
          const attack =
            (derivedStats[minimum] * minimumWeight + derivedStats[maximum] * maximumWeight) *
            primaryRange.attackMultiplier
          const unpenetrated =
            (attributeCoefficient * attack + primaryRange.flatBonus) *
            primaryRange.damageMultiplier *
            primaryRange.pathMultiplier *
            attributeMultiplier *
            (globalMultiplier + (path === "bellstrike" ? resolvedEffects.globalBellstrikeDmgBonus : 0))
          formlessPenetration.coefficient += (unpenetrated * probability) / (primaryDifference >= 0 ? 200 : 100)
        }
        if (unclamped > 0) {
          coefficients.effectiveMinPhys += slope * minimumWeight * probability
          coefficients.effectiveMaxPhys += slope * maximumWeight * probability
        }
        for (const [, , penetration, damageBonus, attribute, resistance] of attributeRanges) {
          const factor =
            attributeCoefficient *
            (1 + resolvedEffects.attackBonus[attribute]) *
            penetrationMultiplier(penetration + (attribute === path ? attunementFormlessPenetration : 0), resistance) *
            (1 + damageBonus) *
            (attribute === path ? 1.5 : 1) *
            attributeMultiplier *
            (globalMultiplier + (attribute === "bellstrike" ? resolvedEffects.globalBellstrikeDmgBonus : 0))
          const [minimum, maximum] = attackFields[attribute]
          coefficients[minimum] += factor * minimumWeight * probability
          coefficients[maximum] += factor * maximumWeight * probability
        }
      }
      return { coefficients, physicalBounds, penetration: { physicalPenetration, formlessPenetration } }
    },
  })
  return evaluate(derivedStats)
}

export type AttackField = (typeof attackFields)[keyof typeof attackFields][number]
export type PenetrationDamageResponse = { coefficient: number; lower: number; upper: number }
export type PreparedDamageResponse = {
  penetration: Record<"physicalPenetration" | "formlessPenetration", PenetrationDamageResponse>
  coefficients: Record<AttackField, number>
  physicalBounds: Array<{ minimumWeight: number; maximumWeight: number; lower: number; upper: number }>
}
export type PreparedRateResponse = {
  key: string
  coefficients: number[]
  baselineRates: OutcomeRates
  resolveRates: (snapshot: DerivedStats) => OutcomeRates
}
export type PreparedDamageFormula = {
  rateResponse: () => PreparedRateResponse
  /** Receives a snapshot from the shared stat pipeline. Other formula inputs remain fixed. */
  evaluate: (snapshot: DerivedStats) => DamageBreakdown
  response: () => PreparedDamageResponse
}

export const attackFields = {
  physical: ["effectiveMinPhys", "effectiveMaxPhys"],
  bellstrike: ["effectiveMinBellstrike", "effectiveMaxBellstrike"],
  stonesplit: ["effectiveMinStonesplit", "effectiveMaxStonesplit"],
  silkbind: ["effectiveMinSilkbind", "effectiveMaxSilkbind"],
  bamboocut: ["effectiveMinBamboocut", "effectiveMaxBamboocut"],
} as const

const outcomeAttackFields = Object.values(attackFields).flat()

/** Compile one resolved damage context; the caller owns dependency and timeline eligibility. */
export function prepareDamageFormula(action: DamageAction, context: DamageContext): PreparedDamageFormula {
  let prepared!: PreparedDamageFormula
  calculateDamageBreakdownInternal(action, context, undefined, formula => {
    prepared = formula
  })
  return prepared
}

export function calculateDamageBreakdown(
  action: DamageAction,
  context: DamageContext,
  resolvedDamage: (action: DamageAction, context: DamageContext) => DamageBreakdown = calculateDamageBreakdownInternal,
): DamageBreakdown {
  const [distribution, ...remaining] = context.expectedEffects ?? []
  if (!distribution) return resolvedDamage(action, resolveActionStatContext(context))
  let result: DamageBreakdown | undefined
  for (const outcome of distribution) {
    const current = calculateDamageBreakdown(
      action,
      { ...context, effects: [...context.effects, ...outcome.effects], expectedEffects: remaining },
      resolvedDamage,
    )
    result ??= { ...current, physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total: 0 }
    for (const field of ["physical", "bellstrike", "stonesplit", "silkbind", "bamboocut", "total"] as const)
      result[field] += current[field] * outcome.probability
  }
  return result!
}

export const preparedDamageStatFields = new Set([
  "minPhys",
  "maxPhys",
  "minBellstrike",
  "maxBellstrike",
  "minStonesplit",
  "maxStonesplit",
  "minSilkbind",
  "maxSilkbind",
  "minBamboocut",
  "maxBamboocut",
  "minVoidAttack",
  "maxVoidAttack",
  "precision",
  "crit",
  "affinity",
  "directCrit",
  "directAffinity",
  "effectiveCritBonus",
  "critDmgBonus",
])

/** Comparison-local cache: retain attack/outcome expressions, never a previous variant's rates. */
export function createPreparedDamageCalculator() {
  const mutableFields = new Set<string>([
    ...Object.values(attackFields).flat(),
    ...preparedDamageStatFields,
    "effectivePrecision",
    "effectiveCrit",
    "effectiveAffinity",
    "effectiveCritDmgBonus",
    "finalCrit",
    "finalAffinity",
    "abrasionRate",
    "normalRate",
    "critRate",
    "affinityRate",
    "uncappedDirectCrit",
  ])
  const dependencies = new WeakMap<object, boolean>()
  const dependsOnMutableInput = (value: unknown): boolean => {
    if (typeof value === "string") return mutableFields.has(value)
    if (!value || typeof value !== "object") return false
    const cached = dependencies.get(value)
    if (cached !== undefined) return cached
    const dependent = Object.values(value).some(dependsOnMutableInput)
    dependencies.set(value, dependent)
    return dependent
  }
  const keys = new WeakMap<object, number>()
  const fixedStats = new WeakMap<object, number>()
  const values = new Map<string, number>()
  const intern = (key: string) => {
    let id = values.get(key)
    if (id === undefined) {
      id = values.size
      values.set(key, id)
    }
    return id
  }
  const templates = new WeakMap<object, Map<string, PreparedDamageFormula>>()
  const keyFor = (value: object) => {
    let key = keys.get(value)
    if (key === undefined) {
      key = intern(JSON.stringify(value))
      keys.set(value, key)
    }
    return key
  }
  const calculate = (action: DamageAction, context: DamageContext): DamageBreakdown => {
    const resolved = context
    if (dependsOnMutableInput(action) || dependsOnMutableInput(resolved.effects))
      return calculateDamageBreakdownInternal(action, resolved)
    let statsKey = fixedStats.get(resolved.stats)
    if (statsKey === undefined) {
      statsKey = intern(JSON.stringify(Object.entries(resolved.stats).filter(([field]) => !mutableFields.has(field))))
      fixedStats.set(resolved.stats, statsKey)
    }
    const key = JSON.stringify([
      statsKey,
      keyFor(resolved.effects),
      keyFor(resolved.attunement),
      keyFor(resolved.enemy),
      keyFor(resolved.weapons),
      keyFor(resolved.skillTags),
      resolved.unconditionalDamageEffects ? keyFor(resolved.unconditionalDamageEffects) : undefined,
      resolved.distance,
      resolved.currentHPRatio,
      resolved.targetHPRatio,
      resolved.enduranceLost,
      resolved.enduranceSpent,
      resolved.isDot,
    ])
    let variants = templates.get(action)
    if (!variants) {
      variants = new Map()
      templates.set(action, variants)
    }
    let formula = variants.get(key)
    if (!formula) {
      return calculateDamageBreakdownInternal(action, resolved, undefined, prepared => variants!.set(key, prepared))
    }
    return formula.evaluate(resolved.derivedStats)
  }
  return (action: DamageAction, context: DamageContext) => calculateDamageBreakdown(action, context, calculate)
}

export function calculateSimulatedDamageBreakdown(
  action: DamageAction,
  context: DamageContext,
  random: () => number = Math.random,
): DamageBreakdown & { outcome: DamageOutcome } {
  return calculateDamageBreakdownInternal(action, resolveActionStatContext(context), random) as DamageBreakdown & {
    outcome: DamageOutcome
  }
}

export function calculateDamage(action: DamageAction, context: DamageContext) {
  return calculateDamageBreakdown(action, context).total
}
