import bamboocutDraughtBuffs from "@gamedata/buff/bamboocut-draught.json"
import bamboocutDustBuffs from "@gamedata/buff/bamboocut-dust.json"
import bamboocutKiteBuffs from "@gamedata/buff/bamboocut-kite.json"
import bamboocutWindBuffs from "@gamedata/buff/bamboocut-wind.json"
import bellstrikeSplendorBuffs from "@gamedata/buff/bellstrike-splendor.json"
import bellstrikeUmbraBuffs from "@gamedata/buff/bellstrike-umbra.json"
import generalBuffs from "@gamedata/buff/general.json"
import mechanismBuffs from "@gamedata/buff/mechanism.json"
import mysticBuffs from "@gamedata/buff/mystic.json"
import silkbindDelugeBuffs from "@gamedata/buff/silkbind-deluge.json"
import stonesplitMightBuffs from "@gamedata/buff/stonesplit-might.json"
import stonesplitStrengthBuffs from "@gamedata/buff/stonesplit-strength.json"
import bamboocutDraughtDebuffs from "@gamedata/debuff/bamboocut-draught.json"
import bamboocutDustDebuffs from "@gamedata/debuff/bamboocut-dust.json"
import bamboocutKiteDebuffs from "@gamedata/debuff/bamboocut-kite.json"
import bamboocutWindDebuffs from "@gamedata/debuff/bamboocut-wind.json"
import bellstrikeSplendorDebuffs from "@gamedata/debuff/bellstrike-splendor.json"
import bellstrikeUmbraDebuffs from "@gamedata/debuff/bellstrike-umbra.json"
import generalDebuffs from "@gamedata/debuff/general.json"
import innerWayDebuffs from "@gamedata/debuff/innerway.json"
import mysticDebuffs from "@gamedata/debuff/mystic.json"
import stonesplitMightDebuffs from "@gamedata/debuff/stonesplit-might.json"
import stonesplitStrengthDebuffs from "@gamedata/debuff/stonesplit-strength.json"
import divinecraftDots from "@gamedata/dot/divinecraft.json"
import innerWayDots from "@gamedata/dot/innerway.json"
import mysticDots from "@gamedata/dot/mystic.json"
import everspringSkills from "@gamedata/skill/everspring-umbrella.json"
import generalSkills from "@gamedata/skill/general.json"
import heavenwillSkills from "@gamedata/skill/heavenwill-gauntlets.json"
import infernalSkills from "@gamedata/skill/infernal-twinblades.json"
import mechanismSkills from "@gamedata/skill/mechanism.json"
import mortalSkills from "@gamedata/skill/mortal-rope-dart.json"
import mysticSkills from "@gamedata/skill/mystic.json"
import namelessSpearSkills from "@gamedata/skill/nameless-spear.json"
import namelessSwordSkills from "@gamedata/skill/nameless-sword.json"
import panaceaSkills from "@gamedata/skill/panacea-fan.json"
import phalanxbaneSkills from "@gamedata/skill/phalanxbane-blade.json"
import skygraspSkills from "@gamedata/skill/skygrasp-rope-dart.json"
import snowpartingSkills from "@gamedata/skill/snowparting-blade.json"
import soulshadeSkills from "@gamedata/skill/soulshade-umbrella.json"
import stormbreakerSkills from "@gamedata/skill/stormbreaker-spear.json"
import thundercrySkills from "@gamedata/skill/thundercry-blade.json"
import unfetteredSkills from "@gamedata/skill/unfettered-rope-dart.json"

import type { EffectDefinition, SkillRecord, TrackedEffect } from "@/calculations/rotationTimeline"
import type { EditorCategory, SkillCategory, SkillMap } from "@/skillOverrides"
import type { WeaponId } from "@/types"

export const defaultSkillMaps: Record<SkillCategory, SkillMap> = {
  Snowparting: snowpartingSkills as SkillMap,
  Phalanxbane: phalanxbaneSkills as SkillMap,
  Thundercry: thundercrySkills as SkillMap,
  Stormbreaker: stormbreakerSkills as SkillMap,
  Heavenwill: heavenwillSkills as SkillMap,
  Skygrasp: skygraspSkills as SkillMap,
  Panacea: panaceaSkills as SkillMap,
  Soulshade: soulshadeSkills as SkillMap,
  Infernal: infernalSkills as SkillMap,
  Mortal: mortalSkills as SkillMap,
  Everspring: everspringSkills as SkillMap,
  Unfettered: unfetteredSkills as SkillMap,
  NamelessSword: namelessSwordSkills as SkillMap,
  NamelessSpear: namelessSpearSkills as SkillMap,
  Mystic: mysticSkills as SkillMap,
  General: generalSkills as SkillMap,
  Mechanism: mechanismSkills as SkillMap,
}
export const defaultEditorMaps: Record<EditorCategory, SkillMap> = {
  ...defaultSkillMaps,
  Buff: Object.fromEntries(
    Object.entries({
      ...mysticBuffs,
      ...generalBuffs,
      ...stonesplitStrengthBuffs,
      ...stonesplitMightBuffs,
      ...bamboocutWindBuffs,
      ...bamboocutDraughtBuffs,
      ...bamboocutDustBuffs,
      ...bamboocutKiteBuffs,
      ...silkbindDelugeBuffs,
      ...bellstrikeSplendorBuffs,
      ...bellstrikeUmbraBuffs,
      ...mechanismBuffs,
    } as Record<string, EffectDefinition>).filter(([, definition]) => !definition.global),
  ) as SkillMap,
  Debuff: {
    ...stonesplitStrengthDebuffs,
    ...stonesplitMightDebuffs,
    ...bellstrikeSplendorDebuffs,
    ...bellstrikeUmbraDebuffs,
    ...bamboocutDustDebuffs,
    ...bamboocutDraughtDebuffs,
    ...bamboocutWindDebuffs,
    ...bamboocutKiteDebuffs,
    ...innerWayDebuffs,
    ...generalDebuffs,
  } as SkillMap,
  DOT: { ...mysticDots, ...innerWayDots, ...divinecraftDots } as SkillMap,
}
export const skillCategoryByWeapon: Partial<Record<WeaponId, SkillCategory>> = {
  snowparting: "Snowparting",
  phalanxbane: "Phalanxbane",
  thundercry: "Thundercry",
  stormbreaker: "Stormbreaker",
  heavenwill: "Heavenwill",
  skygrasp: "Skygrasp",
  panaceaFan: "Panacea",
  soulshadeUmbrella: "Soulshade",
  infernalTwinblades: "Infernal",
  mortalRopeDart: "Mortal",
  everspring: "Everspring",
  unfettered: "Unfettered",
  namelessSword: "NamelessSword",
  namelessSpear: "NamelessSpear",
}
export const allSkillDefinitions = Object.assign({}, ...Object.values(defaultSkillMaps)) as SkillMap
export const skillDataNamespaceByCategory: Record<SkillCategory, string> = {
  Snowparting: "snowpartingBlade",
  Phalanxbane: "phalanxbaneBlade",
  Thundercry: "thundercryBlade",
  Stormbreaker: "stormbreakerSpear",
  Heavenwill: "heavenwillGauntlets",
  Skygrasp: "skygraspRopeDart",
  Panacea: "panaceaFan",
  Soulshade: "soulshadeUmbrella",
  Infernal: "infernalTwinblades",
  Mortal: "mortalRopeDart",
  Everspring: "everspringUmbrella",
  Unfettered: "unfetteredRopeDart",
  NamelessSword: "namelessSword",
  NamelessSpear: "namelessSpear",
  Mystic: "mystic",
  General: "general",
  Mechanism: "mechanism",
}
export const skillDataNamespaceById = new Map<string, string>(
  (Object.entries(defaultSkillMaps) as Array<[SkillCategory, SkillMap]>).flatMap(([category, definitions]) =>
    Object.keys(definitions).map(id => [id, skillDataNamespaceByCategory[category]]),
  ),
)
export const allSkillIds = (Object.keys(defaultSkillMaps) as SkillCategory[]).flatMap(category =>
  Object.keys(defaultSkillMaps[category]),
)
export const editorSkillIds = Array.from(new Set(allSkillIds))
export const martialArtBySkillId = new Map<string, WeaponId>([
  ...Object.keys(snowpartingSkills).map(id => [id, "snowparting"] as const),
  ...Object.keys(phalanxbaneSkills).map(id => [id, "phalanxbane"] as const),
  ...Object.keys(thundercrySkills).map(id => [id, "thundercry"] as const),
  ...Object.keys(stormbreakerSkills).map(id => [id, "stormbreaker"] as const),
  ...Object.keys(heavenwillSkills).map(id => [id, "heavenwill"] as const),
  ...Object.keys(skygraspSkills).map(id => [id, "skygrasp"] as const),
  ...Object.keys(everspringSkills).map(id => [id, "everspring"] as const),
  ...Object.keys(unfetteredSkills).map(id => [id, "unfettered"] as const),
  ...Object.keys(panaceaSkills).map(id => [id, "panaceaFan"] as const),
  ...Object.keys(soulshadeSkills).map(id => [id, "soulshadeUmbrella"] as const),
])
export const rotationActionOptionIds = ["__event:Delay", "__event:MartialArt"]
export const rotationEventOptionIds = [
  "__event:Controlled",
  "__event:ShieldBroken",
  "__event:BattleEnd",
  "__event:Move",
  "__event:SelfHP",
  "__event:TakeDamage",
  "__event:Hellfire",
  "__event:HP",
  "__event:Qi",
  "__event:Buff",
  "__event:Debuff",
]
export const dotDefinitions = { ...mysticDots, ...innerWayDots, ...divinecraftDots } as Record<string, SkillRecord>
export const dotEffectIds = new Set(Object.keys(dotDefinitions))
export const effectDefinitions = {
  ...bellstrikeSplendorBuffs,
  ...bamboocutDustBuffs,
  ...mysticBuffs,
  ...generalBuffs,
  ...stonesplitStrengthBuffs,
  ...stonesplitMightBuffs,
  ...bamboocutWindBuffs,
  ...bamboocutDraughtBuffs,
  ...bamboocutKiteBuffs,
  ...silkbindDelugeBuffs,
  ...bellstrikeUmbraBuffs,
  ...mysticDebuffs,
  ...stonesplitStrengthDebuffs,
  ...stonesplitMightDebuffs,
  ...bellstrikeSplendorDebuffs,
  ...bellstrikeUmbraDebuffs,
  ...bamboocutDustDebuffs,
  ...bamboocutDraughtDebuffs,
  ...bamboocutWindDebuffs,
  ...bamboocutKiteDebuffs,
  ...innerWayDebuffs,
  ...generalDebuffs,
  ...mechanismBuffs,
  ...dotDefinitions,
} as Record<string, EffectDefinition>
export const expectedOutcomeBuffPlateDefinitions = [
  { name: "Hawkwing", maxStack: 5 },
  { name: "Concentration", maxStack: 1 },
  { name: "Bloom", maxStack: 1 },
  { name: "Flare", maxStack: 1 },
  { name: "Yield", maxStack: 1 },
  { name: "Frost", maxStack: 1 },
] as const
export const expectedOutcomeBuffPlateNames = new Set<string>(
  expectedOutcomeBuffPlateDefinitions.map(({ name }) => name),
)
export type DisplayedTimelineEffect = TrackedEffect & { hideRemainingTime?: boolean; averageStackOnly?: boolean }
export function withExpectedOutcomeBuffPlates(
  buffs: TrackedEffect[],
  expectedBuffStacks: Record<string, number> | undefined,
): DisplayedTimelineEffect[] {
  return withExpectedStackPlates(buffs, expectedBuffStacks, expectedOutcomeBuffPlateDefinitions)
}
export function withExpectedDebuffPlates(
  debuffs: TrackedEffect[],
  expectedDebuffStacks: Record<string, number> | undefined,
  definitions: Record<string, EffectDefinition> = effectDefinitions,
): DisplayedTimelineEffect[] {
  const plates = Object.keys(expectedDebuffStacks ?? {}).map(name => ({
    name,
    maxStack: definitions[name]?.maxStack ?? 1,
  }))
  return withExpectedStackPlates(debuffs, expectedDebuffStacks, plates)
}
function withExpectedStackPlates(
  effects: TrackedEffect[],
  expectedStacks: Record<string, number> | undefined,
  plates: readonly { name: string; maxStack: number }[],
): DisplayedTimelineEffect[] {
  if (!expectedStacks) return effects
  const names = new Set(plates.map(({ name }) => name))
  return [
    ...effects.filter(effect => !names.has(effect.name)),
    ...plates.flatMap(({ name, maxStack }) => {
      const stack = expectedStacks[name]
      return stack !== undefined && stack > 0
        ? [{ name, stack, maxStack, hideRemainingTime: true, averageStackOnly: true }]
        : []
    }),
  ]
}
export const globalEffectDefinitions = Object.values(effectDefinitions).filter(definition => definition.global)
export const manualBuffDefinitions = defaultEditorMaps.Buff as Record<string, { name?: string }>
export const manualGeneralDebuffs = Object.fromEntries(
  Object.entries(generalDebuffs).filter(([id]) => id !== "Exhausted"),
)
export const manualDebuffDefinitions = {
  ...mysticDebuffs,
  ...stonesplitStrengthDebuffs,
  ...stonesplitMightDebuffs,
  ...bellstrikeSplendorDebuffs,
  ...bellstrikeUmbraDebuffs,
  ...bamboocutDustDebuffs,
  ...bamboocutDraughtDebuffs,
  ...bamboocutWindDebuffs,
  ...bamboocutKiteDebuffs,
  ...innerWayDebuffs,
  ...manualGeneralDebuffs,
} as Record<string, { name?: string }>
