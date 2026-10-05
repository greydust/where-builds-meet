import arsenalDefinitions from "@gamedata/arsenal.json"
import bowRingSetDefinitions from "@gamedata/bow-ring-set.json"
import breakthroughProfiles from "@gamedata/breakthrough.json"
import divinecraftDefinitions from "@gamedata/divinecraft.json"
import foodDefinitions from "@gamedata/food.json"
import scriptDefinitions from "@gamedata/script.json"
import systemStats from "@gamedata/system.json"

import type { CalculatorSettings, PathId } from "@/application/contracts"
import { DEFAULT_PING_MS } from "@/calculations/combatDefaults"
import type { EditableObject, ResourceEventRule } from "@/calculations/rotationTimeline"
import type { EffectiveStatEffectContainer, StatEffectContainer } from "@/calculations/statEffects"
import type { BaseAttributeData } from "@/data/baseAttributeEffects"
import { createBaseAttributeEffects } from "@/data/baseAttributeEffects"
import { armorSetDefinitions, weaponSetDefinitions, type SetDefinition } from "@/gear"
import type { EnemyProfile } from "@/types"

export type SetupEffect = StatEffectContainer &
  EffectiveStatEffectContainer & {
    condition?: string
    requirement?: unknown
    /** One reactive rule, or several that each react to their own event. */
    trigger?: EditableObject | EditableObject[]
    buffDurationBonus?: number
    target?: string
    modify?: EditableObject
  }
export type BreakthroughProfile = EnemyProfile & {
  soloLevel: number
  martialArtTalentRank: number
  levelBonusStats: SetupEffect & {
    rawStat: { precision: number; agility: number; power: number; momentum: number; body: number; defense: number }
  }
}
export const typedBreakthroughProfiles = breakthroughProfiles as Record<string, BreakthroughProfile>
export const defaultBreakthrough = "17"
export const defaultSettings: CalculatorSettings = {
  weapons: ["snowparting", "phalanxbane"],
  breakthrough: defaultBreakthrough,
  ping: DEFAULT_PING_MS,
}

export function breakthroughProfile(settings: CalculatorSettings) {
  return typedBreakthroughProfiles[settings.breakthrough] ?? typedBreakthroughProfiles[defaultSettings.breakthrough]
}

export type SystemStatsDefinition = {
  initialResources: Record<string, number>
  resourceMaximums: Record<string, number>
  resourceRegeneration?: Record<string, number>
  resourceSpendRegenDelay?: Record<string, number>
  resourceEvents: ResourceEventRule[]
  baseStats: SetupEffect
  enhancementStats: Array<SetupEffect & { id: string }>
  talentStats: Array<SetupEffect & { id: string }>
  qingheOddityStats: Array<SetupEffect & { id: string }>
  kaifengOddityStats: Array<SetupEffect & { id: string }>
  imperialPalaceOddityStats: Array<SetupEffect & { id: string }>
  hexiOddityStats: Array<SetupEffect & { id: string }>
  hiddenMountainOddityStats: Array<SetupEffect & { id: string }>
  baseAttributes: BaseAttributeData
}
export const typedSystemStats = systemStats as SystemStatsDefinition
export const baseAttributeEffects = createBaseAttributeEffects(typedSystemStats.baseAttributes)
export const systemStatEffects: SetupEffect[] = [
  typedSystemStats.baseStats,
  ...typedSystemStats.enhancementStats,
  ...typedSystemStats.talentStats,
  ...typedSystemStats.qingheOddityStats,
  ...typedSystemStats.kaifengOddityStats,
  ...typedSystemStats.imperialPalaceOddityStats,
  ...typedSystemStats.hexiOddityStats,
  ...typedSystemStats.hiddenMountainOddityStats,
  ...baseAttributeEffects,
]
export type ArsenalDefinition = { name: string; effect?: SetupEffect }
export const typedArsenalDefinitions = arsenalDefinitions as Record<string, ArsenalDefinition>
export const typedBowRingSetDefinitions = bowRingSetDefinitions as Record<string, ArsenalDefinition>
export type GearSetOption = { name: string; effect?: SetupEffect | SetupEffect[] }
export type GearSetDefinition = Omit<SetDefinition, "options"> & { options: Record<string, GearSetOption> }
export const typedWeaponSetDefinitions = weaponSetDefinitions as Record<string, GearSetDefinition>
export const typedArmorSetDefinitions = armorSetDefinitions as Record<string, GearSetDefinition>
export const foodCategories = [
  { key: "food", title: "Physical Attack" },
  { key: "enduranceFood", title: "Endurance" },
] as const
export type FoodCategory = (typeof foodCategories)[number]["key"]
export type FoodDefinition = ArsenalDefinition & {
  title?: string
  category?: FoodCategory
  paths?: PathId[]
  altersTimeline?: boolean
}
export const typedFoodDefinitions = foodDefinitions as Record<string, FoodDefinition>

export function foodAvailableForPath(value: string, pathId: PathId, category?: FoodCategory) {
  const definition = typedFoodDefinitions[value]
  return Boolean(
    definition &&
    (!category || value === "None" || definition.category === category) &&
    (!definition.paths || definition.paths.includes(pathId)),
  )
}

export function foodSelectionForPath(value: string = "None", pathId: PathId, category?: FoodCategory) {
  return foodAvailableForPath(value, pathId, category) ? value : "None"
}
export type DivinecraftDefinition = ArsenalDefinition & {
  description: string
  image?: string
  available?: boolean
  altersTimeline?: boolean
}
export const typedDivinecraftDefinitions = divinecraftDefinitions as Record<string, DivinecraftDefinition>
export type ScriptDefinition = ArsenalDefinition & { description: string; image?: string; altersTimeline?: boolean }
export const typedScriptDefinitions = scriptDefinitions as Record<string, ScriptDefinition>
export const scriptDisplayOrder = [
  "Wraithstrike",
  "Voidrot",
  "Convergence",
  "Opportunity",
  "Detachment",
  "Insight",
  "Revelry",
  "None",
] as const
export const divinecraftDisplayOrder = [
  "Fire",
  "FireWater",
  "FirePoison",
  "None",
  "WaterFire",
  "WaterPoison",
  null,
  "PoisonFire",
  "PoisonWater",
] as const

export function arsenalEffectFor(value: string) {
  return typedArsenalDefinitions[value]?.effect ?? {}
}

export function bowRingSetEffectFor(value: string) {
  return typedBowRingSetDefinitions[value]?.effect ?? {}
}

type DivinecraftEffect = SetupEffect & { trigger?: EditableObject | EditableObject[] }

/**
 * The burn, poison, and Solid Foundation are the only Divinecraft rules that add
 * damage over time; they all react to a direct hit. Stripping just those lets the
 * Settings toggle exclude Divinecraft damage while the HP DMG bonus and the
 * healing trigger keep working.
 */
function withoutDivinecraftDamage(effect: DivinecraftEffect): DivinecraftEffect {
  const rules = effect.trigger
  const wasArray = Array.isArray(rules)
  const declared: EditableObject[] = wasArray ? (rules as EditableObject[]) : rules ? [rules] : []
  const isDamageRule = (rule: EditableObject) => rule.event === "damage"
  if (!declared.some(isDamageRule)) return effect
  const kept = declared.filter(rule => !isDamageRule(rule))
  if (!kept.length) {
    const { trigger: _removed, ...rest } = effect
    return rest
  }
  return { ...effect, trigger: wasArray ? kept : kept[0] }
}

export function divinecraftEffectFor(value: string, damage = true) {
  const effect = typedDivinecraftDefinitions[value]?.effect
  if (!effect) return {}
  return damage ? effect : withoutDivinecraftDamage(effect as DivinecraftEffect)
}

export function scriptEffectFor(value: string) {
  return typedScriptDefinitions[value]?.effect ?? {}
}
