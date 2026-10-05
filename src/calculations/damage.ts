import type { CharacterStats, EnemyProfile, WeaponId } from "@/types"

import { resolveActionStatContext } from "./actionStats"
import { matchingAttunementEntries } from "./attunementStats"
import { finishCalculationPhase, startCalculationPhase } from "./calculationBenchmark"
import { DEFAULT_TARGET_HP_RATIO } from "./combatDefaults"
import { resolveMultiplyValue, resolveSegmentValue } from "./dynamicValues"
import { calculateRates, mainAttributeForWeapons } from "./effectiveStats"
import type { DerivedStats } from "./effectiveStats"
import { restrictedOutcomeRates, restrictedRateRouteFor } from "./rateRoutes"
import {
  applyStatConversions,
  resolveFormulaValue,
  type StatConversionEffectContainer,
  type StatFormula,
} from "./statEffects"
import type { UnconditionalDamageEffects } from "./unconditionalDamageEffects"

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
): DamageBreakdown {
  const { stats: baseStats, attunement, skillTags, weapons, enemy, derivedStats: baseDerivedStats, effects } = context
  const stats = baseStats
  const derivedStats = baseDerivedStats
  const effectAggregationStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const effectValue = (value: unknown) => {
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
  const coefficient = effectValue(action.phyCoef)
  const attributeCoefficient = effectValue(action.attrCoef)
  const physicalBonus = numberValue(action.phyBonus)
  const attributeBonus = numberValue(action.attrBonus)
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
    dotDamageBonus: context.isDot ? (unconditional.dotDamage ?? 0) : 0,
    physicalPenetration: unconditional.physicalPenetration ?? 0,
    defenseBonus: unconditional.defenseBonus ?? 0,
    physicalResistance: unconditional.physicalResistance ?? 0,
    critDmgBonus: unconditional.critDmgBonus ?? 0,
    affinityDmgBonus: unconditional.affinityDmgBonus ?? 0,
    attributeDmgBonus: unconditional.attributeDMGBonus ?? 0,
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
    resolvedEffects.physicalPenetration += effectValue(effect.physicalPenetration)
    resolvedEffects.defenseBonus += effectValue(effect.defenseBonus)
    resolvedEffects.physicalResistance += effectValue(effect.physicalResistance)
    resolvedEffects.critDmgBonus += effectValue(effect.critDmgBonus)
    resolvedEffects.affinityDmgBonus += effectValue(effect.affinityDmgBonus)
    resolvedEffects.attributeDmgBonus += effectValue(effect.attributeDMGBonus)
  }
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectRemainingScan", remainingScanStartedAt)
  if (import.meta.env.DEV) finishCalculationPhase("damageEffectFieldAggregation", effectFieldAggregationStartedAt)
  const channelSnapshotStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
  const physicalAttackMultiplier = 1 + resolvedEffects.attackBonus.physical
  const minPhysicalAttack = derivedStats.effectiveMinPhys * physicalAttackMultiplier
  const maxPhysicalAttack = derivedStats.effectiveMaxPhys * physicalAttackMultiplier
  const averagePhysicalAttack = (minPhysicalAttack + maxPhysicalAttack) / 2
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
  const calculateAttributeDamage = (mode: AttackRollMode) =>
    attributeRanges.reduce(
      (total, [minAttack, maxAttack, penetration, damageBonus, attribute, resistance]) => {
        const attack = attackValue(minAttack, maxAttack, mode)
        const damage =
          (attributeCoefficient * attack + (attribute === path ? attributeBonus : 0)) *
          penetrationMultiplier(penetration + (attribute === path ? attunementFormlessPenetration : 0), resistance) *
          (1 + damageBonus) *
          (attribute === path ? 1.5 : 1)
        return Object.assign(total, { [attribute]: total[attribute as keyof typeof total] + damage })
      },
      { bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0 },
    )
  const calculateVariant = (damageType: AttackRollMode, specialBonus: number) => {
    const variantStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const physicalChannelStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const physicalAttack =
      damageType === "average" ? averagePhysicalAttack : attackValue(minPhysicalAttack, maxPhysicalAttack, damageType)
    const adjustedEnemyDefense = enemy.defense * (1 + resolvedEffects.defenseBonus)
    const physicalDamage =
      (coefficient * (physicalAttack - adjustedEnemyDefense) + physicalBonus) *
      penetrationMultiplier(
        stats.physicalPenetration + attunementPhysicalPenetration + resolvedEffects.physicalPenetration,
        enemy.physicalResistance + resolvedEffects.physicalResistance,
      ) *
      (1 + stats.physDmgBonus)
    const physicalMultiplier = physicalSharedBonus * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
    const attributeMultiplier = attributeSharedBonus * (1 + specialBonus) * (1 + resolvedEffects.dotDamageBonus)
    const globalMultiplier = 1 + resolvedEffects.globalDmgBonus
    const resolvedPhysicalDamage = Math.max(0, physicalDamage * physicalMultiplier * globalMultiplier)
    if (import.meta.env.DEV) finishCalculationPhase("damagePhysicalChannel", physicalChannelStartedAt)
    const attributeChannelsStartedAt = import.meta.env.DEV ? startCalculationPhase() : 0
    const attributeDamage = calculateAttributeDamage(damageType)
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
  const rateStats = {
    effectivePrecision: derivedStats.effectivePrecision,
    effectiveCrit: derivedStats.effectiveCrit,
    effectiveAffinity: derivedStats.effectiveAffinity,
    directCrit: derivedStats.directCrit,
    directAffinity: derivedStats.finalAffinity - derivedStats.effectiveAffinity,
    finalAffinity: derivedStats.finalAffinity,
  }
  const conversionEffects = effects.filter(
    (effect): effect is Record<string, unknown> & StatConversionEffectContainer => effect.convert !== undefined,
  )
  const convertedRateStats =
    conversionEffects.length > 0 ? applyStatConversions(rateStats, conversionEffects) : rateStats
  const GuaranteedAffinity = effects.some(effect => effect.GuaranteedAffinity === true)
  const NoAbrasion = effects.some(effect => effect.NoAbrasion === true)
  const GuaranteedCrit = effects.some(effect => effect.GuaranteedCrit === true)
  const SteadfastGuaranteedCrit =
    effects.some(effect => effect.SteadfastGuaranteedCrit === true) &&
    (skillTags.includes("BurningHeart") || skillTags.includes("AnxiSoldier"))
  const calculatedRates = calculateRates(
    NoAbrasion ? { ...convertedRateStats, effectivePrecision: 1 } : convertedRateStats,
    { GuaranteedCrit, GuaranteedAffinity, SteadfastGuaranteedCrit },
  )
  const convertedRates =
    conversionEffects.length > 0 ? applyStatConversions(calculatedRates, conversionEffects) : calculatedRates
  const normalRates = GuaranteedAffinity
    ? {
        ...convertedRates,
        finalAffinity: 1,
        finalCrit: 0,
        critRate: 0,
        abrasionRate: 0,
        normalRate: 0,
        affinityRate: 1,
      }
    : GuaranteedCrit
      ? { ...convertedRates, finalCrit: 1, critRate: 1, abrasionRate: 0, normalRate: 0, affinityRate: 0 }
      : convertedRates
  // The healing and Divinecraft routes cannot roll every outcome, so they replace the normal rates.
  const rateRoute = restrictedRateRouteFor(action.rateRoute)
  const rates = rateRoute ? restrictedOutcomeRates(rateRoute, rateStats) : normalRates
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
  const abrasionDamage = calculateVariant("min", 0)
  const normalDamage = calculateVariant("average", 0)
  const critDamage = calculateVariant("average", derivedStats.effectiveCritDmgBonus + resolvedEffects.critDmgBonus)
  const affinityDamage = calculateVariant("max", stats.affinityDmgBonus + resolvedEffects.affinityDmgBonus)
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
  if (import.meta.env.DEV) finishCalculationPhase("damageOutcomeAggregation", outcomeAggregationStartedAt)
  return result
}

export function calculateDamageBreakdown(action: DamageAction, context: DamageContext): DamageBreakdown {
  const [distribution, ...remaining] = context.expectedEffects ?? []
  if (!distribution) return calculateDamageBreakdownInternal(action, resolveActionStatContext(context))
  let result: DamageBreakdown | undefined
  for (const outcome of distribution) {
    const current = calculateDamageBreakdown(action, {
      ...context,
      effects: [...context.effects, ...outcome.effects],
      expectedEffects: remaining,
    })
    result ??= { ...current, physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total: 0 }
    for (const field of ["physical", "bellstrike", "stonesplit", "silkbind", "bamboocut", "total"] as const)
      result[field] += current[field] * outcome.probability
  }
  return result!
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
