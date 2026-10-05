import type { InnerWayEffectRule, EditableObject } from "@/calculations/rotationTimeline"
import {
  calculateStatsWithOverrides,
  requirementIsUnconditional,
  type CharacterStatOverrides,
  type StatEffectContainer,
} from "@/calculations/statEffects"
import { innerWayAvailableForTag, innerWayDefinitionForSoloLevel } from "@/data/innerWayDefinitions"
import { martialArtEffectsForRank } from "@/data/martialArtTalents"
import { emptyStats } from "@/data/statDefinitions"
import {
  attunementData,
  availableSetEntriesForTags,
  setAvailableForTags,
  type BuildSetup,
  type SetSelections,
} from "@/gear"
import type { SkillCategory } from "@/skillOverrides"
import type { CharacterStats, WeaponId } from "@/types"

import type { CalculatorSettings, PathId, SetupSelections } from "./contracts"
import { artStatByWeaponFamily, martialArtDefinitions } from "./gameData/martialArts"
import { typedPathDefinitions } from "./gameData/paths"
import { currentCombatDefinitions, type CombatDefinitions } from "./gameData/previews"
import {
  arsenalEffectFor,
  breakthroughProfile,
  bowRingSetEffectFor,
  divinecraftEffectFor,
  foodSelectionForPath,
  scriptEffectFor,
  systemStatEffects,
  typedArmorSetDefinitions,
  typedFoodDefinitions,
  typedWeaponSetDefinitions,
  type GearSetDefinition,
  type SetupEffect,
} from "./gameData/setup"
import {
  allSkillDefinitions,
  defaultSkillMaps,
  globalEffectDefinitions,
  skillCategoryByWeapon,
} from "./gameData/skills"
import { loadSelectedPath } from "./persistence/settings"

export function innerWayAvailableForPath(innerWay: string, pathId = loadSelectedPath()) {
  return innerWayAvailableForTag(innerWay, typedPathDefinitions[pathId].tag)
}

export function attunementAvailableForSettings(attunement: string, pathId: PathId, settings: CalculatorSettings) {
  const definition = attunementData[attunement]
  if (definition?.tags.includes("Defensive")) return false
  if (definition?.tags.includes("Weapon")) return true
  const requiredTag = typedPathDefinitions[pathId].tag
  if (requiredTag && !definition?.tags.includes(requiredTag)) return false
  return settings.weapons.some(weapon => definition?.tags.includes(martialArtDefinitions[weapon].tag))
}

export function settingsForPath(settings: CalculatorSettings, pathId: PathId): CalculatorSettings {
  const lockedWeapons = typedPathDefinitions[pathId].lockedWeapons
  return lockedWeapons ? { ...settings, weapons: [...lockedWeapons] } : settings
}

export function selectableRotationSkillGroups(weapons: [WeaponId, WeaponId]) {
  const martialCategories = weapons.flatMap(weapon => {
    const category = skillCategoryByWeapon[weapon]
    return category ? [category] : []
  })
  const categories = [
    ...new Set<SkillCategory>([...martialCategories, "Mystic", "General", "Mechanism"]),
  ] as SkillCategory[]
  return categories.map(category => ({
    category,
    skillIds: Object.keys(defaultSkillMaps[category]).filter(
      skillId => !allSkillDefinitions[skillId]?.tags?.some(tag => tag === "Triggered" || tag === "SubAction"),
    ),
  }))
}

export function innerWayConditionsFor(
  selectedInnerWays: BuildSetup["innerWays"],
  excludedInnerWay?: string,
  pathId = loadSelectedPath(),
) {
  const conditions = new Set<string>()
  for (const row of selectedInnerWays) {
    if (!row.innerWay || row.innerWay === excludedInnerWay || !innerWayAvailableForPath(row.innerWay, pathId)) continue
    const tierNumber = Number(row.tier.slice(1))
    for (let tier = 0; tier <= tierNumber; tier += 1) conditions.add(`${row.innerWay}T${tier}`)
  }
  return conditions
}

export function innerWayEffectRulesFor(
  selectedInnerWays: BuildSetup["innerWays"],
  soloLevel: number,
  pathId = loadSelectedPath(),
  definitions: CombatDefinitions = currentCombatDefinitions,
): InnerWayEffectRule[] {
  const selected = selectedInnerWays.filter(({ innerWay }) => innerWayAvailableForPath(innerWay, pathId))
  return selected.flatMap(({ innerWay, tier }) => {
    const innerWayDefinition = innerWay ? definitions.innerWayDefinitions[innerWay] : undefined
    if (!innerWay || !innerWayDefinition) return []
    const definition = innerWayDefinitionForSoloLevel(innerWayDefinition, soloLevel) as {
      effect?: Record<string, { effect?: unknown[]; trigger?: unknown[]; listen?: unknown[] }>
    }
    const tierNumber = Number(tier.slice(1))
    return Array.from({ length: tierNumber + 1 }, (_, currentTier) => {
      const tierDefinition = definition.effect?.[`${innerWay}T${currentTier}`]
      const effects = tierDefinition?.effect ?? []
      const triggers = tierDefinition?.trigger ?? []
      const listeners = tierDefinition?.listen ?? []
      const effectRules = effects
        .filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map(item => ({
          requirement: item.requirement,
          trigger:
            item.trigger && typeof item.trigger === "object" && !Array.isArray(item.trigger)
              ? (item.trigger as EditableObject)
              : undefined,
          target: typeof item.target === "string" ? item.target : undefined,
          modify:
            item.modify && typeof item.modify === "object" && !Array.isArray(item.modify)
              ? (item.modify as EditableObject)
              : undefined,
          effect:
            item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
              ? (item.effect as EditableObject)
              : Object.fromEntries(
                  ["rawStat", "stat", "effectiveStat"].flatMap(field =>
                    item[field] && typeof item[field] === "object" && !Array.isArray(item[field])
                      ? [[field, item[field]]]
                      : [],
                  ),
                ),
          source: innerWay,
          tier: currentTier,
        }))
      const triggerRules = triggers
        .filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map(item => ({
          requirement: item.requirement,
          trigger: {
            ...item,
            target: typeof item.target === "string" ? item.target : "self",
            action: Array.isArray(item.action) ? item.action : [],
          },
          effect: {},
          source: innerWay,
          tier: currentTier,
        }))
      const listenerRules = listeners
        .filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map(item => ({ requirement: item.requirement, listen: item, effect: {}, source: innerWay, tier: currentTier }))
      return [...effectRules, ...triggerRules, ...listenerRules]
    }).flat()
  })
}

export function selectedMartialArtEffects(
  settings: CalculatorSettings,
  definitions: CombatDefinitions = currentCombatDefinitions,
) {
  return martialArtEffectsForRank(
    definitions.martialArtDefinitions,
    settings.weapons,
    breakthroughProfile(settings).martialArtTalentRank,
  )
}

export function selectedSetupEffects(
  settings: CalculatorSettings,
  gearStatEffect: StatEffectContainer,
  buildSetup: BuildSetup,
  selections: SetupSelections,
  pathId: PathId,
  overrides: Partial<BuildSetup & SetupSelections> & { divinecraftDamage?: boolean } = {},
  definitions: CombatDefinitions = currentCombatDefinitions,
) {
  const selectedBuildSetup = {
    ...buildSetup,
    ...overrides,
    weaponSets: overrides.weaponSets ?? buildSetup.weaponSets,
    armorSets: overrides.armorSets ?? buildSetup.armorSets,
  }
  const foodEffect = typedFoodDefinitions[foodSelectionForPath(overrides.food ?? selections.food, pathId)]?.effect ?? {}
  const divinecraftEffect = divinecraftEffectFor(
    overrides.divinecraft ?? selections.divinecraft,
    overrides.divinecraftDamage ?? true,
  )
  const scriptEffect = scriptEffectFor(overrides.script ?? selections.script)
  return [
    ...globalEffectDefinitions.flatMap(definition =>
      definition.global === true ||
      (typeof definition.global === "object" && settings.weapons.includes(definition.global.equippedMartialArt))
        ? ((definition.effect ?? []) as EditableObject[])
        : [],
    ),
    ...systemStatEffects,
    breakthroughProfile(settings).levelBonusStats,
    ...selectedMartialArtEffects(settings, definitions),
    arsenalEffectFor(selectedBuildSetup.arsenal),
    bowRingSetEffectFor(selectedBuildSetup.bowRingSet),
    ...setEffectsFor(selectedBuildSetup.weaponSets, typedWeaponSetDefinitions, settings, pathId),
    ...setEffectsFor(selectedBuildSetup.armorSets, typedArmorSetDefinitions, settings, pathId),
    { ...foodEffect, statStage: "food" as const },
    scriptEffect,
    divinecraftEffect,
    gearStatEffect,
  ]
}

export function globalStatEffects(
  settings: CalculatorSettings,
  gearStatEffect: StatEffectContainer,
  buildSetup: BuildSetup,
  selections: SetupSelections,
  pathId: PathId,
  definitions: CombatDefinitions = currentCombatDefinitions,
) {
  const innerWayStatEffects = innerWayEffectRulesFor(
    buildSetup.innerWays,
    breakthroughProfile(settings).soloLevel,
    pathId,
    definitions,
  )
    .filter(
      rule =>
        requirementIsUnconditional(rule.requirement) &&
        (rule.effect.rawStat || rule.effect.stat || rule.effect.effectiveStat),
    )
    .map(rule => rule.effect as StatEffectContainer)
  const unconditionalSetupEffects = selectedSetupEffects(
    settings,
    gearStatEffect,
    buildSetup,
    selections,
    pathId,
    {},
    definitions,
  ).filter(effect => !("requirement" in effect) || requirementIsUnconditional(effect.requirement))
  return [...unconditionalSetupEffects, ...innerWayStatEffects]
}

export function calculateGlobalStatState(
  overrides: CharacterStatOverrides,
  settings: CalculatorSettings,
  gearStatEffect: StatEffectContainer,
  buildSetup: BuildSetup,
  selections: SetupSelections,
  pathId: PathId,
  definitions: CombatDefinitions = currentCombatDefinitions,
) {
  const breakthrough = breakthroughProfile(settings)
  return calculateStatsWithOverrides(
    emptyStats,
    globalStatEffects(settings, gearStatEffect, buildSetup, selections, pathId, definitions),
    breakthrough.judgementResistance,
    overrides,
    settings.weapons,
  )
}

export function characterStatAvailableForSettings(
  key: keyof CharacterStats,
  settings: CalculatorSettings,
  pathId = loadSelectedPath(),
) {
  if (key === "criticalHealingBonus" || key === "silkbindHealingBonus") return pathId === "silkbindDeluge"
  const artStats = new Set(Object.values(artStatByWeaponFamily))
  if (artStats.has(key))
    return settings.weapons.some(weapon => artStatByWeaponFamily[martialArtDefinitions[weapon].weapon] === key)
  return true
}

export function setAvailableForSettings(
  definition: GearSetDefinition,
  settings: CalculatorSettings,
  pathId = loadSelectedPath(),
) {
  return setAvailableForTags(
    definition,
    settings.weapons.map(weapon => martialArtDefinitions[weapon].tag),
    typedPathDefinitions[pathId].tag,
  )
}

export function availableSetEntriesForSettings<T extends GearSetDefinition>(
  definitions: Record<string, T>,
  settings: CalculatorSettings,
  pathId = loadSelectedPath(),
) {
  return availableSetEntriesForTags(
    definitions,
    settings.weapons.map(weapon => martialArtDefinitions[weapon].tag),
    typedPathDefinitions[pathId].tag,
  )
}

export function setEffectsFor(
  selected: SetSelections,
  definitions: Record<string, GearSetDefinition>,
  settings: CalculatorSettings,
  pathId = loadSelectedPath(),
) {
  return Object.entries(selected)
    .filter(([setName]) => definitions[setName] && setAvailableForSettings(definitions[setName], settings, pathId))
    .flatMap(([setName, tier]) => {
      const effect = definitions[setName]?.options[String(tier)]?.effect
      return Array.isArray(effect) ? effect : [effect ?? {}]
    })
}

export function setupConditionsFor(effects: SetupEffect[]) {
  return effects.flatMap(effect => (typeof effect.condition === "string" ? [effect.condition] : []))
}

export function sameBuildSetupValue(
  key: keyof BuildSetup,
  left: BuildSetup[keyof BuildSetup],
  right: BuildSetup[keyof BuildSetup],
) {
  return key === "weaponSets" || key === "armorSets" || key === "innerWays"
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right
}
