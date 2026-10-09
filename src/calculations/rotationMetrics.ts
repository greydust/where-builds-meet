import type { SkillBreakdownGroup } from "./skillBreakdownCategories"
export type RotationPriority = {
  label: string
  maxRoll?: number
  increase: number
  dpsDifference: number
  healingIncrease: number
  hpsDifference: number
}
export type RotationSkillBreakdown = {
  skillBreakdownCategory?: string
  id: string
  name: string
  casts: number
  triggers: number
  hits: number
  abrasionRate: number
  normalRate: number
  criticalRate: number
  affinityRate: number
  damage: number
  percentage: number
}
export type RotationHealingSkillBreakdown = {
  skillBreakdownCategory?: string
  id: string
  name: string
  casts: number
  triggers: number
  heals: number
  normalRate: number
  criticalRate: number
  healing: number
  percentage: number
}
export type RotationCastBreakdown = {
  id: string
  skillId: string
  name: string
  casts: number
  averageCastTime: number
  averageDps?: number
  averageDpsWithBuff?: number
  vitalitySpent: number
  damagePerVitality?: number
  damagePerVitalityWithBuff?: number
  averageDamage: number
  averageDamageWithBuff?: number
  damage: number
  damageWithBuff?: number
  percentage: number
}
export type RotationHealingCastBreakdown = {
  id: string
  skillId: string
  name: string
  casts: number
  averageCastTime: number
  averageHps?: number
  averageHealing: number
  healing: number
  percentage: number
}
export type RotationGroupBreakdown = { id: string; name: string; damage: number; percentage: number }
export type RotationHealingGroupBreakdown = { id: string; name: string; healing: number; percentage: number }
export type RotationEffectCoverage = { id: string; averageStacks: number; maxStackCoverage?: number }
export type RotationBreakdown = {
  skills: RotationSkillBreakdown[]
  groupedSkills: SkillBreakdownGroup<RotationSkillBreakdown>[]
  groupedHealingSkills: SkillBreakdownGroup<RotationHealingSkillBreakdown>[]
  healingSkills: RotationHealingSkillBreakdown[]
  casts: RotationCastBreakdown[]
  healingCasts: RotationHealingCastBreakdown[]
  categories: RotationGroupBreakdown[]
  healingCategories: RotationHealingGroupBreakdown[]
  damageTypes: RotationGroupBreakdown[]
  healingTypes: RotationHealingGroupBreakdown[]
  buffCoverage: RotationEffectCoverage[]
  debuffCoverage: RotationEffectCoverage[]
}

export const emptyRotationBreakdown = (): RotationBreakdown => ({
  skills: [],
  groupedSkills: [],
  groupedHealingSkills: [],
  healingSkills: [],
  casts: [],
  healingCasts: [],
  categories: [],
  healingCategories: [],
  damageTypes: [],
  healingTypes: [],
  buffCoverage: [],
  debuffCoverage: [],
})

export type RotationMetrics = {
  totalDamage: number
  dps: number
  unscaledTotalDamage: number
  unscaledDps: number
  totalHealing: number
  hps: number
  expectedHawkwingStacks?: number
  breakdown: RotationBreakdown
  statPriority: RotationPriority[]
  attunementPriority: RotationPriority[]
  innerWayPriority: RotationPriority[]
  setupComparisons: Record<string, RotationPriority[]>
}

export const rotationCalculationCategories = [
  "baseline",
  "statPriority",
  "attunementPriority",
  "weaponSets",
  "armorSets",
  "bowRingSet",
  "arsenal",
  "globalDebuffs",
  "innerWays",
  "script",
  "divinecraft",
  "food",
  "enduranceFood",
] as const
export type RotationCalculationCategory = (typeof rotationCalculationCategories)[number]
/**
 * Progress is absent rather than zero for a calculation that publishes no steps. A baseline
 * reports none, so it is described as under way instead of as stalled at the start, and a
 * comparison that does report steps carries the fraction it measured.
 */
export type RotationCalculationCategoryStatus = { recalculating: boolean; progress?: number }
export type RotationCalculationStatus = Record<RotationCalculationCategory, RotationCalculationCategoryStatus>
