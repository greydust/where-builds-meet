import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { type AttunementStats, type DamageBreakdown } from "./calculations/damage";
import BuildTab from "./BuildTab";
import SimulationTab from "./SimulationTab";
import { allStatDefinitions, combatStats, defenseStats, emptyStats, martialArtsStats } from "./data/statDefinitions";
import { activeBuildStorageKey, attunementData, buildEntryAvailableForWeapons, buildListStorageKey, calculateEquippedGearEffects, loadBuildState, maxGearRoll, normalizeBuildSetupOverrides, resolveBuildInventory, resolveBuildSetup, serializeBuildState, type BuildSetup, type BuildSetupOverrides, type BuildState } from "./gear";
import { weaponIds as allWeaponIds, type CharacterStats, type EnemyProfile, type StatDefinition, type WeaponId } from "./types";
import type { DerivedStats } from "./calculations/effectiveStats";
import snowpartingSkills from "../data/skill/snowparting-blade.json";
import phalanxbaneSkills from "../data/skill/phalanxbane-blade.json";
import mysticSkills from "../data/skill/mystic.json";
import generalSkills from "../data/skill/general.json";
import mysticBuffs from "../data/buff/mystic.json";
import generalBuffs from "../data/buff/general.json";
import stonesplitStrengthBuffs from "../data/buff/stonesplit-strength.json";
import bamboocutWindBuffs from "../data/buff/bamboocut-wind.json";
import stonesplitStrengthDebuffs from "../data/debuff/stonesplit-strength.json";
import generalDebuffs from "../data/debuff/general.json";
import bellstrikeSplendorDebuffs from "../data/debuff/bellstrike-splendor.json";
import bellstrikeUmbraDebuffs from "../data/debuff/bellstrike-umbra.json";
import innerWayDebuffs from "../data/debuff/innerway.json";
import bamboocutDustDebuffs from "../data/debuff/bamboocut-dust.json";
import stonesplitMightDebuffs from "../data/debuff/stonesplit-might.json";
import mysticDots from "../data/dot/mystic.json";
import enemyProfiles from "../data/enemy.json";
import frostCladNight from "../data/innerway/frost-clad-night.json";
import moraleChant from "../data/innerway/morale-chant.json";
import steadfastDevotion from "../data/innerway/steadfast-devotion.json";
import throatPiercingArt from "../data/innerway/throat-piercing-art.json";
import breakingPoint from "../data/innerway/breaking-point.json";
import envigoratedWarrior from "../data/innerway/envigorated-warrior.json";
import statPriorityLines from "../data/stat-priority.json";
import systemStats from "../data/system.json";
import defaultSetup from "../data/default-setup.json";
import { emptyRotationBreakdown, getRotationMetrics, getRotationRecalculating, publishRotationMetrics, publishRotationRecalculating, subscribeToRotationMetrics, subscribeToRotationRecalculating, type RotationGroupBreakdown, type RotationMetrics, type RotationPriority } from "./calculations/rotationMetrics";
import arsenalDefinitions from "../data/arsenal.json";
import bowRingSetDefinitions from "../data/bow-ring-set.json";
import gearSetDefinitions from "../data/gear-set.json";
import foodDefinitions from "../data/food.json";
import divinecraftDefinitions from "../data/divinecraft.json";
import pathDefinitions from "../data/path.json";
import snowpartingMartialArt from "../data/martial-art/snowparting-blade.json";
import phalanxbaneMartialArt from "../data/martial-art/phalanxbane-blade.json";
import everspringMartialArt from "../data/martial-art/everspring-umbrella.json";
import unfetteredMartialArt from "../data/martial-art/unfettered-rope-dart.json";
import heavenwillMartialArt from "../data/martial-art/heavenwill-gauntlets.json";
import skygraspMartialArt from "../data/martial-art/skygrasp-rope-dart.json";
import { type RotationSimulationBundle, type RotationSimulationResult, type RotationSimulationVariant } from "./calculations/rotationCalculator";
import { requestRotationBaseline, requestRotationComparisons } from "./calculations/rotationWorkerClient";
import { compareTimelineTime, type AttachedEventTarget, type EditableObject, type InnerWayEffectRule, type RotationRecord, type RotationStep, type SkillRecord, type TimelineBuildInput, type TimelineRow } from "./calculations/rotationTimeline";
import { calculateStatsWithOverrides, type CharacterStatOverrides, type EffectiveStatEffectContainer, type StatEffectContainer } from "./calculations/statEffects";
import { exportRotationEntries, mergeImportedRotationEntries, serializeRotationEntries, type RotationEntry } from "./rotationTransfer";
import { readableRotationText } from "./readableRotation";
import { characterProfileMatches, characterProfileStorageKey, exportCharacterProfiles, loadCharacterProfiles, mergeImportedCharacterProfiles, serializeCharacterProfiles, type CharacterProfile } from "./characterProfiles";
import { defaultGlobalDebuffs, globalDebuffRows, globalDebuffStorageKey, globalDebuffTimelineEffects, loadGlobalDebuffs, type GlobalDebuffState } from "./globalDebuffs";

const storageKey = "wwm-character-stats-v3";
const legacyStorageKey = "wwm-character-stats-v2";
const statOverrideStorageKey = "wwm-stat-overrides-v1";
const skillStorageKey = "wwm-skill-editor-session-v1";
const innerWayStorageKey = "wwm-inner-way-session-v1";
const attunementStorageKey = "wwm-attunement-session-v2";
const legacyAttunementStorageKey = "wwm-attunement-session-v1";
const attunementOverrideStorageKey = "wwm-attunement-overrides-v1";
const settingsStorageKey = "wwm-settings-session-v1";
const arsenalStorageKey = "wwm-arsenal-session-v1";
const bowRingSetStorageKey = "wwm-bow-ring-set-session-v1";
const gearSetStorageKey = "wwm-gear-set-session-v1";
const foodStorageKey = "wwm-food-session-v1";
const divinecraftStorageKey = "wwm-divinecraft-session-v1";
const pathStorageKey = "wwm-path-session-v1";
const buildSetupOverrideStorageKey = "wwm-build-setup-overrides-v1";
const percentageStatKeys = new Set<keyof CharacterStats>(allStatDefinitions.filter(({ unit }) => unit === "%").map(({ key }) => key));

type SkillMap = Record<string, SkillRecord>;
type SkillCategory = "Snowparting" | "Phalanxbane" | "Mystic" | "General";
type EditorCategory = SkillCategory | "Buff" | "Debuff" | "DOT";
type SkillOverrides = Partial<Record<EditorCategory, SkillMap>>;
type CalculatorSettings = { weapons: [WeaponId, WeaponId]; enemy: string };
type PathId = "mixed" | "stonesplitStrength" | "bamboocutDust" | "bamboocutKite";
type PathDefinition = {
  name: string;
  icon?: string;
  tag?: string;
  wip?: boolean;
  lockedWeapons?: [WeaponId, WeaponId];
};
type DefaultSetup = {
  innerWays: Array<{ innerWay: string; tier: string }>;
  gearSets: { Cleftpeak: 0 | 2 | 4; RainWhisper: 0 | 2 | 4 };
  bowRingSet: string;
  arsenal: string;
  food: string;
  divinecraft: string;
};
const typedDefaultSetup = defaultSetup as DefaultSetup;
const typedPathDefinitions = pathDefinitions as Record<PathId, PathDefinition>;
const enabledWeaponIds = new Set<WeaponId>((Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).flatMap(([id, definition]) => id !== "mixed" && (!definition.wip || import.meta.env.DEV) ? definition.lockedWeapons ?? [] : []));

const defaultSkillMaps: Record<SkillCategory, SkillMap> = {
  Snowparting: snowpartingSkills as SkillMap,
  Phalanxbane: phalanxbaneSkills as SkillMap,
  Mystic: mysticSkills as SkillMap,
  General: generalSkills as SkillMap,
};
const defaultEditorMaps: Record<EditorCategory, SkillMap> = {
  ...defaultSkillMaps,
  Buff: { ...mysticBuffs, ...generalBuffs, ...stonesplitStrengthBuffs, ...bamboocutWindBuffs } as SkillMap,
  Debuff: { ...stonesplitStrengthDebuffs, ...stonesplitMightDebuffs, ...bellstrikeSplendorDebuffs, ...bellstrikeUmbraDebuffs, ...bamboocutDustDebuffs, ...innerWayDebuffs, ...generalDebuffs } as SkillMap,
  DOT: mysticDots as SkillMap,
};
const skillCategoryByWeapon: Partial<Record<WeaponId, SkillCategory>> = {
  snowparting: "Snowparting",
  phalanxbane: "Phalanxbane",
};
const rotationEventDefinitions: Record<string, SkillRecord> = {
  Exhausted: {
    name: "Event: Exhausted",
    castTime: 0,
    action: [{ type: "apply", target: "target", value: "Exhausted", stack: 1, time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  Controlled: {
    name: "Event: Controlled",
    castTime: 3,
    action: [{ type: "apply", target: "target", value: "Controlled", stack: 1, time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  BattleEnd: {
    name: "Event: Battle End",
    castTime: 0,
    action: [],
    modifier: [],
    tags: ["Event"],
  },
  Move: {
    name: "Event: Move",
    castTime: 0,
    action: [{ type: "move", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
};
const innerWayDefinitions = {
  FrostCladNight: frostCladNight,
  MoraleChant: moraleChant,
  SteadfastDevotion: steadfastDevotion,
  ThroatPiercingArt: throatPiercingArt,
  BreakingPoint: breakingPoint,
  EnvigoratedWarrior: envigoratedWarrior,
};
const rotationStorageKey = "wwm-rotation-editor-session-v2";
const rotationListStorageKey = "wwm-rotation-list-session-v1";
const allSkillDefinitions = Object.assign({}, ...Object.values(defaultSkillMaps)) as SkillMap;
const allSkillIds = (Object.keys(defaultSkillMaps) as SkillCategory[]).flatMap((category) => Object.keys(defaultSkillMaps[category]));
const editorSkillIds = Array.from(new Set(allSkillIds));
const martialArtBySkillId = new Map<string, WeaponId>([
  ...Object.keys(snowpartingSkills).map((id) => [id, "snowparting"] as const),
  ...Object.keys(phalanxbaneSkills).map((id) => [id, "phalanxbane"] as const),
]);
const rotationEventOptionIds = ["__event:Exhausted", "__event:Controlled", "__event:BattleEnd", "__event:Move"];
const dotDefinitions = mysticDots as Record<string, { duration?: number; maxStack?: number; tick?: number; action?: unknown[] }>;
const effectDefinitions = { ...mysticBuffs, ...generalBuffs, ...stonesplitStrengthBuffs, ...bamboocutWindBuffs, ...stonesplitStrengthDebuffs, ...stonesplitMightDebuffs, ...bellstrikeSplendorDebuffs, ...bellstrikeUmbraDebuffs, ...bamboocutDustDebuffs, ...innerWayDebuffs, ...generalDebuffs, ...dotDefinitions } as Record<string, { name?: string; description?: string; duration?: number; cooldown?: number; maxStack?: number; effect?: unknown[]; stackEffects?: unknown[][] }>;

function loadSelectedPath(): PathId {
  const saved = sessionStorage.getItem(pathStorageKey);
  const definition = saved ? typedPathDefinitions[saved as PathId] : undefined;
  return definition && (!definition.wip || import.meta.env.DEV) ? saved as PathId : "stonesplitStrength";
}

function innerWayAvailableForPath(innerWay: string, pathId = loadSelectedPath()) {
  if (!innerWay) return true;
  const requiredTag = typedPathDefinitions[pathId].tag;
  if (!requiredTag) return true;
  const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as { tags?: string[] } | undefined;
  return definition?.tags?.includes(requiredTag) === true;
}

function attunementAvailableForSettings(attunement: string, pathId: PathId, settings: CalculatorSettings) {
  const definition = attunementData[attunement];
  if (definition?.tags.includes("Weapon")) return true;
  const requiredTag = typedPathDefinitions[pathId].tag;
  if (requiredTag && !definition?.tags.includes(requiredTag)) return false;
  return settings.weapons.some((weapon) => definition?.tags.includes(martialArtDefinitions[weapon].tag));
}

function settingsForPath(settings: CalculatorSettings, pathId: PathId): CalculatorSettings {
  const lockedWeapons = typedPathDefinitions[pathId].lockedWeapons;
  return lockedWeapons ? { ...settings, weapons: [...lockedWeapons] } : settings;
}

function selectableRotationSkillIds(weapons: [WeaponId, WeaponId]) {
  const martialCategories = weapons.flatMap((weapon) => {
    const category = skillCategoryByWeapon[weapon];
    return category ? [category] : [];
  });
  const categories = [...new Set<SkillCategory>([...martialCategories, "Mystic", "General"])] as SkillCategory[];
  return categories.flatMap((category) => Object.keys(defaultSkillMaps[category])).filter((skillId) => !allSkillDefinitions[skillId]?.tags?.includes("Triggered"));
}

function loadInnerWayConditions(excludedInnerWay?: string) {
  const conditions = new Set<string>();
  const pathId = loadSelectedPath();
  try {
    const saved = JSON.parse(sessionStorage.getItem(innerWayStorageKey) ?? "[]") as Array<{ innerWay?: unknown; tier?: unknown }>;
    for (const row of saved) {
      if (typeof row?.innerWay !== "string" || !row.innerWay || typeof row.tier !== "string") continue;
      if (row.innerWay === excludedInnerWay) continue;
      if (!innerWayAvailableForPath(row.innerWay, pathId)) continue;
      const tierNumber = Number(row.tier.slice(1));
      for (let tier = 0; tier <= tierNumber; tier += 1) conditions.add(`${row.innerWay}T${tier}`);
    }
  } catch {
    // A missing or malformed session selection simply provides no Inner Way conditions.
  }
  return conditions;
}

function loadInnerWayEffectRules(): InnerWayEffectRule[] {
  const pathId = loadSelectedPath();
  const selected = loadInnerWays().filter(({ innerWay }) => innerWayAvailableForPath(innerWay, pathId));
  return selected.flatMap(({ innerWay, tier }) => {
    if (!innerWay || !innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions]) return [];
    const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as { effect?: Record<string, { effect?: unknown[]; trigger?: unknown[] }> };
    const tierNumber = Number(tier.slice(1));
    return Array.from({ length: tierNumber + 1 }, (_, currentTier) => {
      const tierDefinition = definition.effect?.[`${innerWay}T${currentTier}`];
      const effects = tierDefinition?.effect ?? [];
      const triggers = tierDefinition?.trigger ?? [];
      const effectRules = effects.filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
        requirement: item.requirement,
        trigger: item.trigger && typeof item.trigger === "object" && !Array.isArray(item.trigger) ? item.trigger as EditableObject : undefined,
        target: typeof item.target === "string" ? item.target : undefined,
        modify: item.modify && typeof item.modify === "object" && !Array.isArray(item.modify) ? item.modify as EditableObject : undefined,
        effect: item.stat && typeof item.stat === "object" && !Array.isArray(item.stat)
          ? { stat: item.stat as EditableObject }
          : item.effect && typeof item.effect === "object" && !Array.isArray(item.effect) ? item.effect as EditableObject : {},
        source: innerWay,
        tier: currentTier,
      }));
      const triggerRules = triggers.filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item)).map((item) => ({
        requirement: item.requirement,
        trigger: {
          target: typeof item.target === "string" ? item.target : "self",
          action: Array.isArray(item.action) ? item.action : [],
        },
        effect: {},
        source: innerWay,
        tier: currentTier,
      }));
      return [...effectRules, ...triggerRules];
    }).flat();
  });
}

function normalizeRotation(rotation: RotationRecord): RotationRecord {
  const steps: RotationStep[] = (rotation.steps as Array<RotationStep & { repeat?: number }>).flatMap((step): RotationStep[] => {
    if (step.type === "event") return [step];
    const repeat = Math.max(1, step.repeat ?? 1);
    const { repeat: _repeat, ...stepWithoutRepeat } = step;
    return Array.from({ length: repeat }, (_, index) => ({ ...stepWithoutRepeat, causesBreak: index === repeat - 1 ? step.causesBreak : undefined })) as RotationStep[];
  });
  return { name: rotation.name, steps, start: rotation.start, ...(rotation.eventTimeReference === "battleStart" ? { eventTimeReference: "battleStart" as const } : {}) };
}

function attachedTargetForStep(step: RotationStep | undefined) {
  if (step?.type !== "event") return undefined;
  if (step.event === "Move" && "before" in step) return step.before;
  if (step.event === "Exhausted") return "after" in step ? step.after : "before" in step ? step.before : undefined;
  return undefined;
}

function baseRotationAnchorTime(rotation: RotationRecord) {
  if (!rotation.start) return 0;
  let time = 0;
  for (const [stepIndex, step] of rotation.steps.entries()) {
    if (stepIndex === rotation.start.step) {
      if (step.type !== "skill") return time;
      const skill = allSkillDefinitions[step.skill ?? ""];
      return time + (rotation.start.action === undefined || !Array.isArray(skill?.action) ? 0 : Number((skill.action[rotation.start.action] as EditableObject | undefined)?.time ?? 0));
    }
    if (step.type === "skill") time += typeof allSkillDefinitions[step.skill ?? ""]?.castTime === "number" ? allSkillDefinitions[step.skill ?? ""].castTime! : 0;
  }
  return 0;
}

function migrateRotation(rotation: RotationRecord): RotationRecord {
  const migrated = normalizeRotation(rotation);
  migrated.steps = migrated.steps.map((step) => {
    if (step.type !== "event" || step.event !== "Exhausted" || !("before" in step)) return step;
    return { type: "event", event: "Exhausted", after: step.before };
  });
  if (migrated.steps[6]?.type === "skill" && migrated.steps[6].skill === "SnowpartingQ") migrated.steps[6] = { ...migrated.steps[6], skill: "SnowpartingQStab" };
  if (migrated.eventTimeReference !== "battleStart") {
    const previousAnchorTime = baseRotationAnchorTime(migrated);
    migrated.steps = migrated.steps.map((step) => step.type === "event" && "startTime" in step ? { ...step, startTime: step.startTime - previousAnchorTime } : step);
    migrated.eventTimeReference = "battleStart";
  }
  const legacyEvents = migrated.steps.flatMap((step, index) => step.type === "event" && (step.event === "Move" || step.event === "Exhausted") && "startTime" in step ? [{ step, index }] : []);
  if (legacyEvents.length) {
    const anchor = baseRotationAnchorTime(migrated);
    let elapsed = 0;
    const candidates = migrated.steps.flatMap((step, index) => {
      if (step.type !== "skill") return [];
      const skill = allSkillDefinitions[step.skill ?? ""];
      const castStart = elapsed;
      elapsed += Number(skill?.castTime ?? 0);
      const actions = Array.isArray(skill?.action) ? skill.action as EditableObject[] : [];
      return [
        { index, time: castStart - anchor, before: { action: "start" } as AttachedEventTarget },
        ...actions.flatMap((action, actionIndex) => {
          const time = castStart + Number(action.time ?? 0) - anchor;
          const direct = { index, time, before: { action: actionIndex } as AttachedEventTarget };
          if (action.type !== "trigger" || typeof action.value !== "string") return [direct];
          const triggered = allSkillDefinitions[action.value];
          const triggeredActions = Array.isArray(triggered?.action) ? triggered.action as EditableObject[] : [];
          const triggerOrdinal = actions.slice(0, actionIndex + 1).filter((candidate) => candidate.type === "trigger").length - 1;
          return [direct, ...triggeredActions.map((triggeredAction, triggeredActionIndex) => ({ index, time: time + Number(triggeredAction.time ?? 0), before: { trigger: triggerOrdinal, action: triggeredActionIndex } as AttachedEventTarget }))];
        }),
      ];
    });
    const attachments = new Map<number, RotationStep[]>();
    legacyEvents.forEach(({ step }) => {
      if (!candidates.length) return;
      const target = candidates.reduce((best, candidate) => Math.abs(candidate.time - step.startTime) < Math.abs(best.time - step.startTime) ? candidate : best, candidates[0]);
      if (!target) return;
      const attached = step.event === "Move" ? { type: "event", event: "Move", before: target.before, distance: step.distance } as RotationStep : { type: "event", event: "Exhausted", after: target.before } as RotationStep;
      attachments.set(target.index, [...(attachments.get(target.index) ?? []), attached]);
    });
    const startSkill = migrated.steps[migrated.start?.step ?? -1];
    migrated.steps = migrated.steps.flatMap((step, index) => step.type === "event" && (step.event === "Move" || step.event === "Exhausted") && "startTime" in step ? [] : step.type === "skill" ? [...(attachments.get(index) ?? []), step] : [step]);
    const startStep = migrated.steps.indexOf(startSkill);
    if (startStep >= 0 && migrated.start) migrated.start = { ...migrated.start, step: startStep };
  }
  return migrated;
}

type RotationPresetRecord = RotationRecord & { martialArts?: WeaponId[]; test?: boolean };
const rotationPresetModules = import.meta.glob("../data/rotation/**/*.json", { eager: true, import: "default" }) as Record<string, RotationPresetRecord>;
function rotationMartialArts(rotation: RotationRecord, explicit?: unknown) {
  const configured = Array.isArray(explicit) ? [...new Set(explicit.filter((item): item is WeaponId => typeof item === "string" && allWeaponIds.includes(item as WeaponId)))] : [];
  if (configured.length) return configured;
  const inferred = [...new Set(rotation.steps.flatMap((step) => step.type === "skill" ? martialArtBySkillId.get(step.skill ?? "") ?? [] : []))];
  return inferred.length ? inferred : [...allWeaponIds];
}
function rotationAvailableForWeapons(entry: RotationEntry, weapons: [WeaponId, WeaponId]) {
  if (allWeaponIds.every((weapon) => entry.martialArts.includes(weapon))) return true;
  const selected = [...new Set(weapons)];
  const tagged = [...new Set(entry.martialArts)];
  return tagged.length === selected.length && selected.every((weapon) => tagged.includes(weapon));
}
const defaultRotationEntries = Object.entries(rotationPresetModules)
  .filter(([, rotation]) => !rotation.test || import.meta.env.DEV)
  .sort(([leftPath, left], [rightPath, right]) => Number(left.test === true) - Number(right.test === true) || leftPath.localeCompare(rightPath))
  .map(([path, rotation]): RotationEntry => ({
    id: path.split("/").pop()?.replace(/\.json$/, "") ?? path,
    rotation: migrateRotation(rotation),
    martialArts: rotationMartialArts(rotation, rotation.martialArts),
    isDefault: true,
  }));
const defaultRotation = defaultRotationEntries[0]?.rotation ?? { name: "Default Rotation", steps: [] };
const defaultRotationId = defaultRotationEntries[0]?.id ?? "default-rotation";
const formerDefaultRotationIds = new Set(["dummy-1-min"]);

const typedEnemyProfiles = enemyProfiles as Record<string, EnemyProfile>;
const defaultSettings: CalculatorSettings = { weapons: ["snowparting", "phalanxbane"], enemy: "level96" };

type SetupEffect = StatEffectContainer & EffectiveStatEffectContainer & { requirement?: unknown; trigger?: EditableObject; target?: string; modify?: EditableObject };
type SystemStatsDefinition = {
  baseStats: SetupEffect;
  levelBonusStats: SetupEffect;
  enhancementStats: Array<SetupEffect & { id: string }>;
  talentStats: Array<SetupEffect & { id: string }>;
  qingheOddityStats: Array<SetupEffect & { id: string }>;
  kaifengOddityStats: Array<SetupEffect & { id: string }>;
  imperialPalaceOddityStats: Array<SetupEffect & { id: string }>;
  hexiOddityStats: Array<SetupEffect & { id: string }>;
  hiddenMountainOddityStats: Array<SetupEffect & { id: string }>;
  attributeConversions: Array<SetupEffect & { id: string }>;
};
const typedSystemStats = systemStats as SystemStatsDefinition;
const systemStatEffects: SetupEffect[] = [typedSystemStats.baseStats, typedSystemStats.levelBonusStats, ...typedSystemStats.enhancementStats, ...typedSystemStats.talentStats, ...typedSystemStats.qingheOddityStats, ...typedSystemStats.kaifengOddityStats, ...typedSystemStats.imperialPalaceOddityStats, ...typedSystemStats.hexiOddityStats, ...typedSystemStats.hiddenMountainOddityStats, ...typedSystemStats.attributeConversions];
type ArsenalDefinition = { name: string; effect?: SetupEffect };
const typedArsenalDefinitions = arsenalDefinitions as Record<string, ArsenalDefinition>;
const typedBowRingSetDefinitions = bowRingSetDefinitions as Record<string, ArsenalDefinition>;
type GearSetOption = { name: string; effect?: SetupEffect };
type GearSetDefinition = { name: string; tags: string[]; options: Record<string, GearSetOption> };
const typedGearSetDefinitions = gearSetDefinitions as Record<string, GearSetDefinition>;
const typedFoodDefinitions = foodDefinitions as Record<string, ArsenalDefinition>;
type DivinecraftDefinition = ArsenalDefinition & { description: string; image?: string; available?: boolean };
const typedDivinecraftDefinitions = divinecraftDefinitions as Record<string, DivinecraftDefinition>;
const divinecraftDisplayOrder = ["Fire", "FireWater", "FirePoison", "None", "WaterFire", "WaterPoison", null, "PoisonFire", "PoisonWater"] as const;
type MartialArtWeapon = "HengBlade" | "MoBlade" | "Umbrella" | "RopeDart" | "Gauntlet";
type MartialArtDefinition = { name: string; weapon: MartialArtWeapon; tag: string; talent: Array<{ name: string; effect?: SetupEffect[] }> };
const martialArtDefinitions: Record<WeaponId, MartialArtDefinition> = {
  snowparting: snowpartingMartialArt as MartialArtDefinition,
  phalanxbane: phalanxbaneMartialArt as MartialArtDefinition,
  everspring: everspringMartialArt as MartialArtDefinition,
  unfettered: unfetteredMartialArt as MartialArtDefinition,
  heavenwill: heavenwillMartialArt as MartialArtDefinition,
  skygrasp: skygraspMartialArt as MartialArtDefinition,
};
const weaponFamilyNames: Record<MartialArtWeapon, string> = {
  HengBlade: "Heng Blade",
  MoBlade: "Mo Blade",
  Umbrella: "Umbrella",
  RopeDart: "Rope Dart",
  Gauntlet: "Gauntlet",
};
const weaponIdSet = new Set<WeaponId>(allWeaponIds);
const isWeaponId = (value: unknown): value is WeaponId => typeof value === "string" && weaponIdSet.has(value as WeaponId) && enabledWeaponIds.has(value as WeaponId);

const artStatByWeaponFamily: Record<MartialArtWeapon, keyof CharacterStats> = {
  HengBlade: "hengBladeDmgBoost",
  MoBlade: "moBladeDmgBoost",
  Umbrella: "umbrellaDmgBoost",
  RopeDart: "ropeDartDmgBoost",
  Gauntlet: "gauntletDmgBoost",
};

function characterStatAvailableForSettings(key: keyof CharacterStats, settings: CalculatorSettings) {
  const artStats = new Set(Object.values(artStatByWeaponFamily));
  if (artStats.has(key)) return settings.weapons.some((weapon) => artStatByWeaponFamily[martialArtDefinitions[weapon].weapon] === key);
  return true;
}

function arsenalEffectFor(value: string) {
  return typedArsenalDefinitions[value]?.effect ?? {};
}

function bowRingSetEffectFor(value: string) {
  return typedBowRingSetDefinitions[value]?.effect ?? {};
}

function loadFood() {
  const saved = sessionStorage.getItem(foodStorageKey);
  return saved && typedFoodDefinitions[saved] ? saved : typedDefaultSetup.food;
}

function selectedFoodEffect() {
  return typedFoodDefinitions[loadFood()]?.effect ?? {};
}

function loadDivinecraft() {
  const saved = sessionStorage.getItem(divinecraftStorageKey);
  return saved && typedDivinecraftDefinitions[saved]?.available !== false ? saved : typedDefaultSetup.divinecraft;
}

function divinecraftEffectFor(value: string) {
  return typedDivinecraftDefinitions[value]?.effect ?? {};
}

function selectedMartialArtEffects(settings: CalculatorSettings) {
  return Array.from(new Set(settings.weapons)).flatMap((weapon) => (martialArtDefinitions[weapon]?.talent ?? []).flatMap((talent) => talent.effect ?? []));
}

function selectedSetupEffects(settings: CalculatorSettings, gearStatEffect: StatEffectContainer, buildSetup: BuildSetup, overrides: Partial<BuildSetup> & { food?: string; divinecraft?: string } = {}) {
  const selectedBuildSetup = { ...buildSetup, ...overrides, gearSets: overrides.gearSets ?? buildSetup.gearSets };
  const foodEffect = overrides.food ? typedFoodDefinitions[overrides.food]?.effect ?? {} : selectedFoodEffect();
  const divinecraftEffect = divinecraftEffectFor(overrides.divinecraft ?? loadDivinecraft());
  return [...systemStatEffects, ...selectedMartialArtEffects(settings), arsenalEffectFor(selectedBuildSetup.arsenal), bowRingSetEffectFor(selectedBuildSetup.bowRingSet), ...gearSetEffectsFor(selectedBuildSetup.gearSets, settings), foodEffect, divinecraftEffect, gearStatEffect];
}

function gearSetAvailableForSettings(setName: string, settings: CalculatorSettings, pathId = loadSelectedPath()) {
  const definition = typedGearSetDefinitions[setName];
  const requiredTag = typedPathDefinitions[pathId].tag;
  if (requiredTag && !definition?.tags.includes(requiredTag)) return false;
  return [...new Set(settings.weapons.map((weapon) => martialArtDefinitions[weapon].tag))].every((tag) => definition?.tags.includes(tag));
}

function gearSetEffectsFor(selected: { Cleftpeak: number; RainWhisper: number }, settings: CalculatorSettings) {
  return Object.entries(selected).filter(([setName]) => gearSetAvailableForSettings(setName, settings)).map(([setName, tier]) => typedGearSetDefinitions[setName]?.options[String(tier)]?.effect ?? {});
}

function sameBuildSetupValue(key: keyof BuildSetup, left: BuildSetup[keyof BuildSetup], right: BuildSetup[keyof BuildSetup]) {
  return key === "gearSets" ? JSON.stringify(left) === JSON.stringify(right) : left === right;
}

function loadBuildSetupOverrides(baseline: BuildSetup): BuildSetupOverrides {
  try {
    const saved = sessionStorage.getItem(buildSetupOverrideStorageKey);
    if (saved !== null) return normalizeBuildSetupOverrides(JSON.parse(saved));
    const legacy: Record<string, unknown> = {};
    const legacyGearSets = sessionStorage.getItem(gearSetStorageKey);
    const legacyBowRingSet = sessionStorage.getItem(bowRingSetStorageKey);
    const legacyArsenal = sessionStorage.getItem(arsenalStorageKey);
    if (legacyGearSets !== null) legacy.gearSets = JSON.parse(legacyGearSets);
    if (legacyBowRingSet !== null) legacy.bowRingSet = legacyBowRingSet;
    if (legacyArsenal !== null) legacy.arsenal = legacyArsenal;
    const parsed = normalizeBuildSetupOverrides(legacy);
    return Object.fromEntries(Object.entries(parsed).filter(([key, value]) => !sameBuildSetupValue(key as keyof BuildSetup, value as BuildSetup[keyof BuildSetup], baseline[key as keyof BuildSetup]))) as BuildSetupOverrides;
  } catch {
    return {};
  }
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function skillDisplayName(skill: SkillRecord | undefined, fallback = "") {
  const name = skill?.name?.trim() || fallback;
  const shortName = skill?.shortName?.trim();
  return shortName ? `${name} (${shortName})` : name;
}

function RotationSkillName({ skill, fallback = "" }: { skill: SkillRecord | undefined; fallback?: string }) {
  const name = skill?.name?.trim() || fallback;
  const shortName = skill?.shortName?.trim();
  return <span className="rotation-skill-label"><span>{name}</span>{shortName && <span>({shortName})</span>}</span>;
}

function loadStats(): CharacterStats {
  try {
    const currentSaved = localStorage.getItem(storageKey);
    const isLegacy = currentSaved === null;
    const saved = JSON.parse(currentSaved ?? localStorage.getItem(legacyStorageKey) ?? "null") as (Partial<CharacterStats> & Record<string, unknown> & { attributeDmgBonus?: unknown }) | null;
    if (!saved) return { ...emptyStats };
    const legacyAttributeBonus = typeof saved.attributeDmgBonus === "number" && Number.isFinite(saved.attributeDmgBonus) ? saved.attributeDmgBonus / (isLegacy ? 100 : 1) : 0;
    const pathBonusKeys = new Set<keyof CharacterStats>(["bellstrikeDmgBonus", "stonesplitDmgBonus", "silkbindDmgBonus", "bamboocutDmgBonus"]);
    const legacyPenetrationKeys: Partial<Record<keyof CharacterStats, string>> = {
      bellstrikePenetration: "bellstrikePen",
      silkbindPenetration: "silkbindPen",
      stonesplitPenetration: "stonesplitPen",
      bamboocutPenetration: "bamboocutPen",
    };
    return Object.fromEntries(allStatDefinitions.map(({ key }) => {
      const savedValue = saved[key] ?? (legacyPenetrationKeys[key] ? saved[legacyPenetrationKeys[key]!] : undefined);
      const hasSavedValue = typeof savedValue === "number" && Number.isFinite(savedValue);
      const value = hasSavedValue ? savedValue : pathBonusKeys.has(key) ? legacyAttributeBonus : 0;
      return [key, isLegacy && hasSavedValue && percentageStatKeys.has(key) ? value / 100 : value];
    })) as CharacterStats;
  } catch {
    return { ...emptyStats };
  }
}

function loadStatOverrides(): CharacterStatOverrides {
  try {
    const currentSaved = localStorage.getItem(statOverrideStorageKey);
    if (currentSaved !== null) {
      const values = JSON.parse(currentSaved) as Record<string, unknown>;
      return Object.fromEntries(allStatDefinitions.flatMap(({ key }) => {
        const value = values?.[key];
        return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : [];
      })) as CharacterStatOverrides;
    }

    // Existing raw stat entries were all manual inputs. Preserve non-zero values
    // as final-value overrides when moving to the calculated-stat model.
    return Object.fromEntries(Object.entries(loadStats()).filter(([, value]) => value !== 0)) as CharacterStatOverrides;
  } catch {
    return {};
  }
}

function loadSettings(): CalculatorSettings {
  try {
    const saved = JSON.parse(sessionStorage.getItem(settingsStorageKey) ?? "null") as Partial<CalculatorSettings> | null;
    const savedWeapons = Array.isArray(saved?.weapons) ? saved.weapons.filter(isWeaponId) : [];
    const legacyWeapon = saved && "weapon" in saved && saved.weapon === "phalanxbane" ? "phalanxbane" : "snowparting";
    const weapons: [WeaponId, WeaponId] = savedWeapons.length === 2
      ? [savedWeapons[0], savedWeapons[1]]
      : [legacyWeapon, legacyWeapon === "snowparting" ? "phalanxbane" : "snowparting"];
    const savedEnemy = saved?.enemy === "level100" ? "level96" : saved?.enemy;
    return {
      weapons,
      enemy: typeof savedEnemy === "string" && typedEnemyProfiles[savedEnemy] ? savedEnemy : defaultSettings.enemy,
    };
  } catch {
    return { ...defaultSettings };
  }
}

function loadSkillOverrides(): SkillOverrides {
  try {
    return JSON.parse(sessionStorage.getItem(skillStorageKey) ?? "{}") as SkillOverrides;
  } catch {
    return {};
  }
}

function loadInnerWays() {
  const defaults = typedDefaultSetup.innerWays.map((row) => ({ ...row }));
  try {
    const saved = JSON.parse(sessionStorage.getItem(innerWayStorageKey) ?? "null") as unknown;
    if (!Array.isArray(saved)) return defaults;
    return defaults.map((defaultRow, index) => {
      const savedRow = saved[index];
      if (!savedRow || typeof savedRow !== "object") return defaultRow;
      const row = savedRow as Record<string, unknown>;
      return {
        innerWay: typeof row.innerWay === "string" ? row.innerWay : defaultRow.innerWay,
        tier: typeof row.tier === "string" && /^T[0-6]$/.test(row.tier) ? row.tier : defaultRow.tier,
      };
    });
  } catch {
    return defaults;
  }
}

const defaultAttunementStats = Object.fromEntries(Object.keys(attunementData).map((key) => [key, 0])) as AttunementStats;
const percentageAttunementKeys = new Set<keyof AttunementStats>(Object.entries(attunementData)
  .filter(([, definition]) => definition.percentage)
  .map(([key]) => key as keyof AttunementStats));
type CharacterState = {
  stats: CharacterStats;
  rawStats: CharacterStats;
  attunementStats: AttunementStats;
  settings: CalculatorSettings;
  enemy: EnemyProfile;
  derivedStats: DerivedStats;
  innerWayRevision: number;
  gearStatEffect: StatEffectContainer;
  buildSetup: BuildSetup;
};

function loadAttunementStats() {
  try {
    const currentSaved = sessionStorage.getItem(attunementStorageKey);
    const isLegacy = currentSaved === null;
    const saved = JSON.parse(currentSaved ?? sessionStorage.getItem(legacyAttunementStorageKey) ?? "null") as unknown;
    if (!saved || typeof saved !== "object") return { ...defaultAttunementStats };
    const values = saved as Record<string, unknown>;
    return Object.fromEntries(Object.keys(defaultAttunementStats).map((key) => {
      const statKey = key as keyof AttunementStats;
      const value = typeof values[key] === "number" && Number.isFinite(values[key]) ? values[key] as number : 0;
      return [key, isLegacy && percentageAttunementKeys.has(statKey) ? value / 100 : value];
    })) as typeof defaultAttunementStats;
  } catch {
    return { ...defaultAttunementStats };
  }
}

type AttunementOverrides = Partial<AttunementStats>;

function loadAttunementOverrides(): AttunementOverrides {
  try {
    const currentSaved = sessionStorage.getItem(attunementOverrideStorageKey);
    if (currentSaved !== null) {
      const values = JSON.parse(currentSaved) as Record<string, unknown>;
      return Object.fromEntries(Object.keys(defaultAttunementStats).flatMap((key) => {
        const value = values?.[key];
        return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : [];
      })) as AttunementOverrides;
    }
    return Object.fromEntries(Object.entries(loadAttunementStats()).filter(([, value]) => value !== 0)) as AttunementOverrides;
  } catch {
    return {};
  }
}

function loadRotationEntries(): RotationEntry[] {
  const bundledDefaults = (): RotationEntry[] => defaultRotationEntries.map((entry) => ({ ...entry, martialArts: [...entry.martialArts], rotation: JSON.parse(JSON.stringify(entry.rotation)) as RotationRecord }));
  try {
    const saved = JSON.parse(sessionStorage.getItem(rotationListStorageKey) ?? "null") as RotationEntry[] | null;
    const customEntries: RotationEntry[] = [];
    const bundledDefaultIds = new Set(defaultRotationEntries.map((entry) => entry.id));
    const usedIds = new Set(bundledDefaultIds);
    const addCustom = (preferredId: string, rotation: RotationRecord, martialArts?: unknown) => {
      let id = preferredId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${preferredId}:${suffix++}`;
      usedIds.add(id);
      customEntries.push({ id, rotation, martialArts: rotationMartialArts(rotation, martialArts) });
    };
    const preserveFormerDefault = (rotation: RotationRecord) => {
      const migrated = migrateRotation(rotation);
      if (defaultRotationEntries.some((entry) => JSON.stringify(migrated) === JSON.stringify(entry.rotation))) return;
      addCustom("migrated-default-rotation", { ...migrated, name: `${migrated.name || defaultRotation.name} Copy` });
    };
    if (Array.isArray(saved)) {
      saved.forEach((entry) => {
        if (!entry || typeof entry.id !== "string" || !entry.id || !entry.rotation || !Array.isArray(entry.rotation.steps)) return;
        if (entry.isDefault === true || bundledDefaultIds.has(entry.id) || formerDefaultRotationIds.has(entry.id)) preserveFormerDefault(entry.rotation);
        else addCustom(entry.id, migrateRotation(entry.rotation), entry.martialArts);
      });
      return [...bundledDefaults(), ...customEntries];
    }
    const legacy = JSON.parse(sessionStorage.getItem(rotationStorageKey) ?? "null") as RotationRecord | null;
    if (legacy && Array.isArray(legacy.steps)) preserveFormerDefault(legacy);
    return [...bundledDefaults(), ...customEntries];
  } catch {
    return bundledDefaults();
  }
}

function initialRotationId(entries: RotationEntry[]) {
  const savedId = sessionStorage.getItem("wwm-active-rotation-session-v1");
  return savedId && entries.some((entry) => entry.id === savedId) ? savedId : entries[0]?.id ?? defaultRotationId;
}

function globalStatEffects(settings: CalculatorSettings, gearStatEffect: StatEffectContainer, buildSetup: BuildSetup) {
  const innerWayStatEffects = loadInnerWayEffectRules().filter((rule) => !rule.requirement && rule.effect.stat).map((rule) => rule.effect as StatEffectContainer);
  return [...selectedSetupEffects(settings, gearStatEffect, buildSetup), ...innerWayStatEffects];
}

function calculateGlobalStatState(overrides: CharacterStatOverrides, settings: CalculatorSettings, gearStatEffect: StatEffectContainer, buildSetup: BuildSetup) {
  const enemy = typedEnemyProfiles[settings.enemy] ?? typedEnemyProfiles[defaultSettings.enemy];
  return calculateStatsWithOverrides(emptyStats, globalStatEffects(settings, gearStatEffect, buildSetup), enemy.judgementResistance, overrides);
}

function StatField({ definition, stats, onChange, onReset, modified = false, derivedLabel, derivedValue, derivedUnit, compact }: {
  definition: StatDefinition;
  stats: CharacterStats;
  onChange: (key: keyof CharacterStats, value: number) => void;
  onReset?: () => void;
  modified?: boolean;
  derivedLabel?: string;
  derivedValue?: number;
  derivedUnit?: string;
  compact?: boolean;
}) {
  const displayValue = (value: number) => definition.unit === "%" ? value * 100 : value;
  const [draftValue, setDraftValue] = useState(() => formatNumber(displayValue(stats[definition.key])));
  const [editing, setEditing] = useState(false);
  const [dirty, setDirty] = useState(false);

  useEffect(() => {
    if (!editing) setDraftValue(formatNumber(displayValue(stats[definition.key])));
  }, [editing, stats, definition.key]);

  function commitValue(rawValue: string) {
    const normalized = Number(rawValue);
    const displayedValue = Number.isFinite(normalized) ? normalized : 0;
    const value = definition.unit === "%" ? displayedValue / 100 : displayedValue;
    setDraftValue(String(displayedValue));
    setEditing(false);
    setDirty(false);
    onChange(definition.key, value);
  }

  function finishEditing(rawValue: string) {
    if (dirty) commitValue(rawValue);
    else {
      setEditing(false);
      setDraftValue(formatNumber(displayValue(stats[definition.key])));
    }
  }

  return (
    <label className={`field ${compact ? "compact-field" : ""} ${modified ? "modified-field" : ""}`}>
      <span className="field-label"><span>{definition.label}{definition.unit && definition.showUnitInLabel !== false ? ` ${definition.unit}` : ""}</span>{modified && <button className="stat-reset-button" type="button" aria-label={`Reset ${definition.label}`} title="Reset to calculated value" onClick={(event) => { event.preventDefault(); onReset?.(); }}>↺</button>}</span>
      <span className="input-wrap">
        <input type="number" min="0" max={definition.unit === "%" ? 100 : undefined} step={definition.step ?? "0.01"} value={draftValue} onFocus={() => { setEditing(true); setDirty(false); }} onChange={(event) => { setDraftValue(event.target.value); setDirty(true); }} onBlur={(event) => finishEditing(event.currentTarget.value)} onKeyDown={(event) => {
          if (event.key === "Enter") event.currentTarget.blur();
        }} />
        {definition.unit && definition.showUnitInInput !== false && <span className="input-unit">{definition.unit}</span>}
      </span>
      {derivedLabel ? <small className="inline-derived">{derivedLabel}</small> : <span className="derived-spacer" />}
      {derivedLabel ? <strong className="inline-derived-value">{derivedValue === undefined ? "—" : formatNumber(derivedValue)}{derivedUnit ?? ""}</strong> : <span className="derived-spacer" />}
    </label>
  );
}

function PriorityPanel({ title, rows, sectionBreakAt, showMaxRoll = false }: { title: string; rows: RotationPriority[]; sectionBreakAt?: number; showMaxRoll?: boolean }) {
  return <section className="panel priority-panel"><div className="panel-heading"><div><h2>{title}</h2></div></div>{rows.length > 0 ? <div className={`priority-list ${showMaxRoll ? "priority-list-with-roll" : ""}`}><div className="priority-header"><span>Name</span>{showMaxRoll && <span>Max Roll</span>}<span>DPS Change</span><span>Percentage</span></div>{rows.map((row, index) => <div className={`priority-row ${sectionBreakAt === index ? "priority-section-start" : ""}`} key={row.label}><span>{row.label}</span>{showMaxRoll && <strong className="priority-max-roll">{row.maxRoll === undefined ? "—" : formatNumber(row.maxRoll)}</strong>}<strong className={row.dpsDifference >= 0 ? "priority-positive" : "priority-negative"}>{row.dpsDifference >= 0 ? "+" : ""}{formatNumber(row.dpsDifference)}</strong><strong className={row.increase >= 0 ? "priority-positive" : "priority-negative"}>{row.increase >= 0 ? "+" : ""}{formatNumber(row.increase)}%</strong></div>)}</div> : <p className="priority-empty">Open the Rotation Editor to calculate priority.</p>}</section>;
}

function BreakdownGroupTable({ title, rows, colored = false }: { title: string; rows: RotationGroupBreakdown[]; colored?: boolean }) {
  return <section className="panel breakdown-panel"><div className="panel-heading"><div><h2>{title}</h2></div></div><div className="breakdown-table breakdown-group-table"><div className="breakdown-table-header"><span>Category</span><span>Damage</span><span>% Total</span></div>{rows.map((row) => <div className="breakdown-table-row" key={row.id}><span className={colored ? `damage-${row.id}` : ""}>{row.name}</span><strong>{formatNumber(row.damage)}</strong><strong>{formatNumber(row.percentage)}%</strong></div>)}</div></section>;
}

function BreakdownTab({ metrics }: { metrics?: RotationMetrics }) {
  if (!metrics) return <section className="panel breakdown-empty"><h2>DPS Breakdown</h2><p>Open the Rotation Editor to calculate the active rotation.</p></section>;
  const { breakdown } = metrics;
  return <div className="breakdown-page">
    <section className="panel breakdown-panel"><div className="panel-heading"><div><h2>Per Skill Breakdown</h2></div><div className="breakdown-totals"><span>Total Damage <strong>{formatNumber(metrics.totalDamage)}</strong></span><span>DPS <strong>{formatNumber(metrics.dps)}</strong></span></div></div><div className="breakdown-table breakdown-skill-table"><div className="breakdown-table-header"><span>Skill</span><span>Casts</span><span>Triggers</span><span>Hits</span><span>Abrasion</span><span>Normal</span><span>Critical</span><span>Affinity</span><span>Damage</span><span>% Total</span></div>{breakdown.skills.map((row) => <div className="breakdown-table-row" key={row.id}><span>{skillDisplayName(allSkillDefinitions[row.id], row.name)}</span><strong>{row.casts || ""}</strong><strong>{row.triggers || ""}</strong><strong>{row.hits || ""}</strong><strong>{formatNumber(row.abrasionRate)}%</strong><strong>{formatNumber(row.normalRate)}%</strong><strong>{formatNumber(row.criticalRate)}%</strong><strong>{formatNumber(row.affinityRate)}%</strong><strong>{formatNumber(row.damage)}</strong><strong>{formatNumber(row.percentage)}%</strong></div>)}</div></section>
    <section className="panel breakdown-panel"><div className="panel-heading"><div><h2>Per Cast Breakdown</h2></div></div><div className="breakdown-table breakdown-cast-table"><div className="breakdown-table-header"><span>Skill</span><span>Casts</span><span>Avg Cast Time</span><span>Average DPS</span><span>Damage</span><span>% Total</span></div>{breakdown.casts.map((row) => <div className="breakdown-table-row" key={row.id}><span>{skillDisplayName(allSkillDefinitions[row.skillId], row.name)}</span><strong>{row.casts}</strong><strong>{formatNumber(row.averageCastTime)}s</strong><strong>{row.averageDps === undefined ? "—" : formatNumber(row.averageDps)}</strong><strong>{formatNumber(row.damage)}</strong><strong>{formatNumber(row.percentage)}%</strong></div>)}</div></section>
    <BreakdownGroupTable title="Skill Type Breakdown" rows={breakdown.categories} />
    <BreakdownGroupTable title="Physical and Attribute Breakdown" rows={breakdown.damageTypes} colored />
  </div>;
}

function DamageBreakdownValue({ breakdown, className = "" }: { breakdown: DamageBreakdown; className?: string }) {
  const parts: Array<[keyof DamageBreakdown, string]> = [["physical", "Physical"], ["bellstrike", "Bellstrike"], ["stonesplit", "Stonesplit"], ["silkbind", "Silkbind"], ["bamboocut", "Bamboocut"]];
  return <span className={`damage-breakdown-wrap ${className}`}><span>{formatNumber(breakdown.total)}</span><span className="damage-breakdown-tooltip">{parts.map(([key, label]) => <span className={`damage-breakdown-part damage-${key}`} key={key}><i>{label}</i>{formatNumber(breakdown[key] as number)}</span>)}</span></span>;
}

function StatsTab({ character, pathId, statOverrides, attunementOverrides, characterProfiles, buildSetupOverrides, onStatChange, onStatReset, onAttunementChange, onAttunementReset, onApplyCharacterProfile, onCharacterProfilesChange, onBuildSetupChange, onBuildSetupReset, rotationMetrics, rotationRecalculating, activeBuildName, activeRotationName, onInnerWayChange }: {
  character: CharacterState;
  pathId: PathId;
  statOverrides: CharacterStatOverrides;
  attunementOverrides: AttunementOverrides;
  characterProfiles: CharacterProfile[];
  buildSetupOverrides: BuildSetupOverrides;
  onStatChange: (key: keyof CharacterStats, value: number) => void;
  onStatReset: (key: keyof CharacterStats) => void;
  onAttunementChange: (key: keyof AttunementStats, value: number) => void;
  onAttunementReset: (key: keyof AttunementStats) => void;
  onApplyCharacterProfile: (profile?: CharacterProfile) => void;
  onCharacterProfilesChange: (profiles: CharacterProfile[]) => void;
  onBuildSetupChange: <K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) => void;
  onBuildSetupReset: (key: keyof BuildSetup) => void;
  rotationMetrics?: RotationMetrics;
  rotationRecalculating: boolean;
  activeBuildName: string;
  activeRotationName: string;
  onInnerWayChange: () => void;
}) {
  const { stats, derivedStats, attunementStats, buildSetup, settings } = character;
  const [innerWays, setInnerWays] = useState(loadInnerWays);
  const [food, setFood] = useState(loadFood);
  const [divinecraft, setDivinecraft] = useState(loadDivinecraft);
  const [globalDebuffs, setGlobalDebuffs] = useState(loadGlobalDebuffs);
  const [attunementDrafts, setAttunementDrafts] = useState<Partial<Record<keyof AttunementStats, string>>>({});
  const [newProfileName, setNewProfileName] = useState("");
  const [profileTransferStatus, setProfileTransferStatus] = useState<{ message: string; error?: boolean }>();
  const profileDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => sessionStorage.setItem(innerWayStorageKey, JSON.stringify(innerWays)), [innerWays]);
  useEffect(() => sessionStorage.setItem(foodStorageKey, food), [food]);
  useEffect(() => sessionStorage.setItem(divinecraftStorageKey, divinecraft), [divinecraft]);
  useEffect(() => sessionStorage.setItem(globalDebuffStorageKey, JSON.stringify(globalDebuffs)), [globalDebuffs]);

  const { arsenal, bowRingSet, gearSets } = buildSetup;
  const currentProfileData = { statOverrides, attunementOverrides, innerWays, buildSetup, food, divinecraft, globalDebuffs };
  const matchingProfile = characterProfiles.find((profile) => characterProfileMatches(profile, currentProfileData));
  const isCalculated = Object.keys(statOverrides).length === 0
    && Object.keys(attunementOverrides).length === 0
    && Object.keys(buildSetupOverrides).length === 0
    && JSON.stringify(innerWays) === JSON.stringify(typedDefaultSetup.innerWays)
    && food === typedDefaultSetup.food
    && divinecraft === typedDefaultSetup.divinecraft
    && JSON.stringify(globalDebuffs) === JSON.stringify(defaultGlobalDebuffs);
  const [selectedProfileId, setSelectedProfileId] = useState(() => isCalculated ? "__calculated" : matchingProfile?.id ?? "__modified");

  useEffect(() => {
    if (selectedProfileId === "__calculated") {
      if (!isCalculated) setSelectedProfileId("__modified");
      return;
    }
    if (selectedProfileId === "__modified") return;
    const selectedProfile = characterProfiles.find(({ id }) => id === selectedProfileId);
    if (!selectedProfile) {
      setSelectedProfileId(isCalculated ? "__calculated" : "__modified");
      return;
    }
    if (characterProfileMatches(selectedProfile, currentProfileData)) return;
    onCharacterProfilesChange(characterProfiles.map((profile) => profile.id === selectedProfileId ? {
      ...profile,
      statOverrides: { ...statOverrides },
      attunementOverrides: { ...attunementOverrides },
      innerWays: innerWays.map((row) => ({ ...row })),
      buildSetup: { ...buildSetup, gearSets: { ...buildSetup.gearSets } },
      food,
      divinecraft,
      globalDebuffs: { ...globalDebuffs },
    } : profile));
  }, [attunementOverrides, buildSetup, characterProfiles, divinecraft, food, globalDebuffs, innerWays, isCalculated, onCharacterProfilesChange, selectedProfileId, statOverrides]);

  function applyProfile(profile?: CharacterProfile) {
    const nextInnerWays = profile ? profile.innerWays.map((row) => ({ ...row })) : typedDefaultSetup.innerWays.map((row) => ({ ...row }));
    const nextFood = profile?.food ?? typedDefaultSetup.food;
    const nextDivinecraft = profile?.divinecraft ?? typedDefaultSetup.divinecraft;
    const nextGlobalDebuffs = profile ? { ...profile.globalDebuffs } : { ...defaultGlobalDebuffs };
    setAttunementDrafts({});
    sessionStorage.setItem(innerWayStorageKey, JSON.stringify(nextInnerWays));
    sessionStorage.setItem(foodStorageKey, nextFood);
    sessionStorage.setItem(divinecraftStorageKey, nextDivinecraft);
    sessionStorage.setItem(globalDebuffStorageKey, JSON.stringify(nextGlobalDebuffs));
    setInnerWays(nextInnerWays);
    setFood(nextFood);
    setDivinecraft(nextDivinecraft);
    setGlobalDebuffs(nextGlobalDebuffs);
    onApplyCharacterProfile(profile);
    onInnerWayChange();
  }

  function selectProfile(profile?: CharacterProfile) {
    setSelectedProfileId(profile?.id ?? "__calculated");
    applyProfile(profile);
  }

  function createProfile() {
    const name = newProfileName.trim();
    if (!name) return;
    const usedIds = new Set(characterProfiles.map(({ id }) => id));
    const baseId = `character-profile-${Date.now()}`;
    let id = baseId;
    let suffix = 2;
    while (usedIds.has(id)) id = `${baseId}-${suffix++}`;
    onCharacterProfilesChange([...characterProfiles, { id, name, statOverrides: { ...statOverrides }, attunementOverrides: { ...attunementOverrides }, innerWays: innerWays.map((row) => ({ ...row })), buildSetup: { ...buildSetup, gearSets: { ...buildSetup.gearSets } }, food, divinecraft, globalDebuffs: { ...globalDebuffs } }]);
    setSelectedProfileId(id);
    setNewProfileName("");
    setProfileTransferStatus({ message: `Saved ${name}.` });
  }

  function exportProfiles() {
    const blob = new Blob([exportCharacterProfiles(characterProfiles)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `where-builds-meet-character-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
    setProfileTransferStatus({ message: `Exported ${characterProfiles.length} profiles.` });
  }

  async function importProfiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = mergeImportedCharacterProfiles(characterProfiles, JSON.parse(await file.text()));
      onCharacterProfilesChange(result.profiles);
      setProfileTransferStatus({ message: `Imported ${result.importedCount} profiles.` });
    } catch (error) {
      setProfileTransferStatus({ message: error instanceof Error ? error.message : "The character profile file could not be imported.", error: true });
    }
  }

  function updateStat(key: keyof CharacterStats, value: number) {
    onStatChange(key, Number.isFinite(value) ? value : 0);
  }

  function commitAttunement(key: keyof AttunementStats, rawValue: string) {
    const displayedValue = Number(rawValue);
    const normalizedValue = Number.isFinite(displayedValue) ? displayedValue : 0;
    const nextValue = percentageAttunementKeys.has(key) ? normalizedValue / 100 : normalizedValue;
    setAttunementDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    onAttunementChange(key, nextValue);
  }

  function resetAttunement(key: keyof AttunementStats) {
    setAttunementDrafts((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
    onAttunementReset(key);
  }

  function updateGlobalDebuff<K extends keyof GlobalDebuffState>(key: K, value: GlobalDebuffState[K]) {
    const next = { ...globalDebuffs, [key]: value };
    sessionStorage.setItem(globalDebuffStorageKey, JSON.stringify(next));
    setGlobalDebuffs(next);
    onInnerWayChange();
  }

  function CalculatedStatField({ definition, derivedLabel, derivedValue, derivedUnit, compact }: {
    definition: StatDefinition;
    derivedLabel?: string;
    derivedValue?: number;
    derivedUnit?: string;
    compact?: boolean;
  }) {
    return <StatField definition={definition} stats={stats} onChange={updateStat} modified={Object.prototype.hasOwnProperty.call(statOverrides, definition.key)} onReset={() => onStatReset(definition.key)} derivedLabel={derivedLabel} derivedValue={derivedValue} derivedUnit={derivedUnit} compact={compact} />;
  }

  const physicalRows = [
    [combatStats[0], combatStats[1]],
    [combatStats[2], combatStats[3]],
    [combatStats[4], combatStats[5]],
    [combatStats[6], combatStats[7]],
    [combatStats[8], combatStats[9]],
  ];
  const martialRows = [0, 1, 2, 3].map((index) => [martialArtsStats[index * 2], martialArtsStats[index * 2 + 1]]);
  const selectedArtStats = Array.from(new Set(settings.weapons.map((weapon) => artStatByWeaponFamily[martialArtDefinitions[weapon].weapon]))).flatMap((key) => {
    const definition = allStatDefinitions.find((candidate) => candidate.key === key);
    return definition ? [definition] : [];
  });
  const penetrationRows = [[defenseStats[0], defenseStats[1]], [defenseStats[2], defenseStats[3]]];
  const innerWayOptions = [
    ["", "None"],
    ...Object.entries(innerWayDefinitions).filter(([value]) => innerWayAvailableForPath(value, pathId)).map(([value, definition]) => [value, definition.name] as [string, string]),
  ];
  const attunementFields = Object.entries(attunementData).filter(([key]) => attunementAvailableForSettings(key, pathId, settings)).map(([key, definition]) => [key as keyof AttunementStats, definition.name, definition.percentage ? "%" : ""] as const);
  const armorAttunementStart = attunementFields.findIndex(([key]) => attunementData[key]?.tags.includes("Armor"));
  const setupStatus = (group: string, value: string, active: boolean) => {
    if (active) return <small className="setup-active-label">Active</small>;
    const comparison = rotationMetrics?.setupComparisons[group]?.find((row) => row.label === value);
    return comparison ? <small className={`setup-delta-label ${comparison.dpsDifference >= 0 ? "setup-positive-label" : "setup-negative-label"}`}><span>{comparison.dpsDifference >= 0 ? "+" : ""}{formatNumber(comparison.dpsDifference)} DPS</span><span>({comparison.increase >= 0 ? "+" : ""}{formatNumber(comparison.increase)}%)</span></small> : <small className="setup-inactive-label">—</small>;
  };
  const globalDebuffOption = (key: typeof globalDebuffRows[number]["key"], value: boolean, label: string) => {
    const active = globalDebuffs[key] === value;
    const optionValue = value ? "on" : "off";
    return <button className={active ? "selected" : ""} type="button" key={optionValue} onClick={() => updateGlobalDebuff(key, value)}>{label}<span>{setupStatus(`debuff:${key}`, optionValue, active)}</span></button>;
  };

  return (
    <>
      <div className="app-layout">
        <div className="character-stats-column">
        <section className="panel stats-panel">
          <div className="panel-heading character-stats-heading"><div><h2>Character Stats</h2></div><div className="character-profile-controls">
            <select aria-label="Character profile" value={selectedProfileId} onChange={(event) => {
              if (event.target.value === "__calculated") selectProfile();
              else selectProfile(characterProfiles.find(({ id }) => id === event.target.value));
            }}>
              <option value="__calculated">Calculated</option>
              {selectedProfileId === "__modified" && <option value="__modified" disabled>Unsaved changes</option>}
              {characterProfiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
            </select>
            <button className="button button-secondary" type="button" onClick={() => { setProfileTransferStatus(undefined); profileDialogRef.current?.showModal(); }}>Profiles</button>
            <button className="button button-secondary" type="button" onClick={() => selectProfile()}>Reset</button>
          </div></div>
          <div className="stats-grid">
            {physicalRows.map(([left, right], index) => (
              <div className="stat-row" key={left.key}>
                <CalculatedStatField definition={left} derivedLabel={index === 0 ? "Effective Min Physical Attack" : index === 3 ? "Effective Critical" : index === 4 ? "Effective Affinity" : undefined} derivedValue={index === 0 ? derivedStats.effectiveMinPhys : index === 3 ? derivedStats.effectiveCrit * 100 : index === 4 ? derivedStats.effectiveAffinity * 100 : undefined} derivedUnit={index === 3 || index === 4 ? "%" : undefined} />
                <CalculatedStatField definition={right} derivedLabel={index === 0 ? "Effective Max Physical Attack" : index === 2 ? "Effective Precision" : index === 3 ? "Final Critical" : index === 4 ? "Final Affinity" : undefined} derivedValue={index === 0 ? derivedStats.effectiveMaxPhys : index === 2 ? derivedStats.effectivePrecision * 100 : index === 3 ? derivedStats.finalCrit * 100 : index === 4 ? derivedStats.finalAffinity * 100 : undefined} derivedUnit={index === 2 || index === 3 || index === 4 ? "%" : undefined} />
              </div>
            ))}
            {martialRows.map(([left, right], index) => (
              <div className="stat-row" key={left.key}>
                <CalculatedStatField definition={left} derivedLabel={`Effective ${left.label}`} derivedValue={derivedStats[["effectiveMinBellstrike", "effectiveMinStonesplit", "effectiveMinSilkbind", "effectiveMinBamboocut"][index] as keyof typeof derivedStats] as number} />
                <CalculatedStatField definition={right} derivedLabel={`Effective ${right.label}`} derivedValue={derivedStats[["effectiveMaxBellstrike", "effectiveMaxStonesplit", "effectiveMaxSilkbind", "effectiveMaxBamboocut"][index] as keyof typeof derivedStats] as number} />
              </div>
            ))}
            <div className="stat-row">
              <CalculatedStatField definition={martialArtsStats[8]} compact />
              <CalculatedStatField definition={martialArtsStats[9]} compact />
            </div>
            {penetrationRows.map(([left, right]) => <div className="stat-row" key={left.key}><CalculatedStatField definition={left} compact /><CalculatedStatField definition={right} compact /></div>)}
            <div className="stat-row"><CalculatedStatField definition={defenseStats[13]} derivedLabel="Effective Crit DMG Bonus" derivedValue={derivedStats.effectiveCritDmgBonus * 100} derivedUnit="%" compact /><CalculatedStatField definition={defenseStats[14]} compact /></div>
            <div className="stat-row"><CalculatedStatField definition={defenseStats[4]} compact /><CalculatedStatField definition={defenseStats[5]} compact /></div>
            <div className="stat-row"><CalculatedStatField definition={defenseStats[6]} compact /><CalculatedStatField definition={defenseStats[7]} compact /></div>
            <div className="stat-row"><CalculatedStatField definition={defenseStats[8]} compact /><span /></div>
            <div className="stat-row"><CalculatedStatField definition={defenseStats[9]} compact /><CalculatedStatField definition={defenseStats[10]} compact /></div>
            <div className="stat-row">{selectedArtStats.map((definition) => <CalculatedStatField definition={definition} compact key={definition.key} />)}{selectedArtStats.length === 1 && <span />}</div>
            <div className="stat-row"><CalculatedStatField definition={defenseStats[15]} compact /><CalculatedStatField definition={defenseStats[16]} compact /></div>
          </div>
        </section>
        <div className="character-secondary-stats">
        <section className="panel attunement-panel">
          <div className="panel-heading"><div><h2>Attunement Stats</h2></div></div>
          <div className="attunement-list">
            {attunementFields.map(([key, label, unit], index) => (
              <label className={`attunement-field ${index === armorAttunementStart ? "attunement-section-start" : ""} ${Object.prototype.hasOwnProperty.call(attunementOverrides, key) ? "modified-field" : ""}`} key={key}>
                <span className="attunement-label"><span>{label}</span>{Object.prototype.hasOwnProperty.call(attunementOverrides, key) && <button className="stat-reset-button" type="button" aria-label={`Reset ${label}`} title="Reset to calculated value" onClick={(event) => { event.preventDefault(); resetAttunement(key); }}>↺</button>}</span>
                <span className="attunement-input-wrap"><input type="number" step="0.01" value={attunementDrafts[key] ?? formatNumber(unit ? attunementStats[key] * 100 : attunementStats[key])} onChange={(event) => setAttunementDrafts((current) => ({ ...current, [key]: event.target.value }))} onBlur={(event) => { if (attunementDrafts[key] !== undefined) commitAttunement(key, event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />{unit && <i>{unit}</i>}</span>
              </label>
            ))}
          </div>
        </section>
        <section className="panel global-debuff-panel">
          <div className="panel-heading"><div><h2>Global Buffs/Debuffs</h2></div></div>
          <div className="global-debuff-list">
            {globalDebuffRows.map(({ key, name }) => <div className="global-debuff-row" key={key}>
              <span>{name}</span>
              <div className="setup-option-list global-debuff-options">{globalDebuffOption(key, false, "Off")}{globalDebuffOption(key, true, "On")}</div>
            </div>)}
            <div className="global-debuff-row">
              <span>Bitter Seasons</span>
              <div className="setup-option-list global-debuff-options qingyi-options">
                {(["none", "T1", "T6"] as const).map((value) => {
                  const active = globalDebuffs.qingyisCharm === value;
                  return <button className={active ? "selected" : ""} type="button" key={value} onClick={() => updateGlobalDebuff("qingyisCharm", value)}>{value === "none" ? "None" : value}<span>{setupStatus("debuff:qingyisCharm", value, active)}</span></button>;
                })}
              </div>
            </div>
          </div>
        </section>
        </div>
        </div>
        <section className="middle-stats-column">
          <section className="panel inner-way-panel">
            <div className="panel-heading"><div><h2>Inner Ways</h2></div></div>
            <div className="inner-way-list">
              {innerWays.map((row, index) => (
                <div className="inner-way-row" key={index}>
                  <select aria-label={`Inner way ${index + 1}`} value={innerWayAvailableForPath(row.innerWay, pathId) ? row.innerWay : ""} onChange={(event) => { const next = innerWays.map((item, itemIndex) => itemIndex === index ? { ...item, innerWay: event.target.value } : item); sessionStorage.setItem(innerWayStorageKey, JSON.stringify(next)); setInnerWays(next); onInnerWayChange(); }}>
                    {innerWayOptions.map(([value, label]) => <option key={value} value={value} disabled={Boolean(value) && innerWays.some((item, itemIndex) => itemIndex !== index && item.innerWay === value)}>{label}</option>)}
                  </select>
                  <select aria-label={`Inner way ${index + 1} tier`} value={row.tier} onChange={(event) => { const next = innerWays.map((item, itemIndex) => itemIndex === index ? { ...item, tier: event.target.value } : item); sessionStorage.setItem(innerWayStorageKey, JSON.stringify(next)); setInnerWays(next); onInnerWayChange(); }}>
                    {Array.from({ length: 7 }, (_, tier) => <option key={tier}>T{tier}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </section>
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading"><div><h2>Gear Set</h2></div>{buildSetupOverrides.gearSets && <button className="stat-reset-button" type="button" aria-label="Reset Gear Set" title="Reset to build value" onClick={() => onBuildSetupReset("gearSets")}>↺</button>}</div>
            <div className="gear-set-list">
              {Object.entries(typedGearSetDefinitions).filter(([setName]) => gearSetAvailableForSettings(setName, settings, pathId)).map(([setName, definition]) => {
                const otherSet = setName === "Cleftpeak" ? "RainWhisper" : "Cleftpeak";
                return <div className="setup-field" key={setName}><span>{definition.name}</span><div className="setup-option-control"><div className="setup-option-list">{[0, 2, 4].map((tier) => <button className={gearSets[setName as keyof typeof gearSets] === tier ? "selected" : ""} type="button" key={tier} onClick={() => { const updated = { ...gearSets, [setName]: tier as 0 | 2 | 4, [otherSet]: Math.min(gearSets[otherSet as keyof typeof gearSets], 4 - tier) as 0 | 2 | 4 }; onBuildSetupChange("gearSets", updated); }}>{tier === 0 ? "0 piece" : `${tier} pieces`}<span>{setupStatus(`gear:${setName}`, String(tier), gearSets[setName as keyof typeof gearSets] === tier)}</span></button>)}</div></div></div>;
              })}
            </div>
          </section>
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading"><div><h2>Bow/Ring Set</h2></div>{buildSetupOverrides.bowRingSet !== undefined && <button className="stat-reset-button" type="button" aria-label="Reset Bow/Ring Set" title="Reset to build value" onClick={() => onBuildSetupReset("bowRingSet")}>↺</button>}</div>
            <div className="setup-option-list setup-option-list-wide">{Object.entries(typedBowRingSetDefinitions).map(([value, definition]) => <button className={bowRingSet === value ? "selected" : ""} type="button" key={value} onClick={() => onBuildSetupChange("bowRingSet", value)}>{definition.name}<span>{setupStatus("bowRingSet", value, bowRingSet === value)}</span></button>)}</div>
          </section>
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading"><div><h2>Arsenal</h2></div>{buildSetupOverrides.arsenal !== undefined && <button className="stat-reset-button" type="button" aria-label="Reset Arsenal" title="Reset to build value" onClick={() => onBuildSetupReset("arsenal")}>↺</button>}</div>
            <div className="setup-option-list setup-option-list-arsenal">{Object.entries(typedArsenalDefinitions).map(([value, definition]) => <button className={arsenal === value ? "selected" : ""} type="button" key={value} onClick={() => onBuildSetupChange("arsenal", value)}>{definition.name}<span>{setupStatus("arsenal", value, arsenal === value)}</span></button>)}</div>
          </section>
          <section className="panel setup-placeholder-panel"><div className="panel-heading"><div><h2>Food</h2></div></div><div className="setup-option-list setup-option-list-food">{Object.entries(typedFoodDefinitions).map(([value, definition]) => <button className={food === value ? "selected" : ""} type="button" key={value} onClick={() => { setFood(value); sessionStorage.setItem(foodStorageKey, value); onInnerWayChange(); }}>{definition.name}<span>{setupStatus("food", value, food === value)}</span></button>)}</div></section>
          <section className="panel setup-placeholder-panel"><div className="panel-heading"><div><h2>Script</h2></div></div><p>Details will be added later.</p></section>
          <section className="panel setup-placeholder-panel divinecraft-panel">
            <div className="panel-heading"><div><h2>Divinecraft</h2></div></div>
            <div className="divinecraft-option-list">
              {divinecraftDisplayOrder.map((value, index) => {
                if (value === null) return <span className="divinecraft-option-spacer" aria-hidden="true" key={`spacer-${index}`} />;
                const definition = typedDivinecraftDefinitions[value];
                if (!definition) return null;
                const available = definition.available !== false;
                return <button className={`divinecraft-option ${divinecraft === value ? "selected" : ""}`} type="button" key={value} disabled={!available} title={`${definition.name}: ${definition.description}${available ? "" : " Not available yet."}`} onClick={() => { setDivinecraft(value); sessionStorage.setItem(divinecraftStorageKey, value); onInnerWayChange(); }}>
                  <span className="divinecraft-image-frame">{definition.image ? <img src={`${import.meta.env.BASE_URL}divinecraft/${definition.image}`} alt="" /> : <span className="divinecraft-none-mark" aria-hidden="true" />}</span>
                  <strong>{definition.name}</strong>
                  <span className="divinecraft-option-status">{available ? setupStatus("divinecraft", value, divinecraft === value) : <small>Not available yet</small>}</span>
                </button>;
              })}
            </div>
          </section>
        </section>
        <aside className="results-column">
          <section className="panel dps-panel"><div className="panel-heading"><div><h2>DPS</h2></div></div><div className="dps-value">{rotationMetrics ? formatNumber(rotationMetrics.dps) : "—"}</div><div className={`dps-recalculating ${rotationRecalculating ? "" : "idle"}`} role="status" aria-live="polite">{rotationRecalculating ? "Recalculating…" : "Up to date"}</div><div className="dps-context"><div><span>Build</span><strong title={activeBuildName}>{activeBuildName}</strong></div><div><span>Rotation</span><strong title={activeRotationName}>{activeRotationName}</strong></div></div></section>
          <PriorityPanel title="Stats Priority" rows={rotationMetrics?.statPriority ?? []} showMaxRoll />
          <PriorityPanel title="Attunement Stats Priority" rows={rotationMetrics?.attunementPriority ?? []} sectionBreakAt={2} showMaxRoll />
          <PriorityPanel title="Inner Ways Priority" rows={rotationMetrics?.innerWayPriority ?? []} />
        </aside>
      </div>
      <dialog className="character-profile-dialog" ref={profileDialogRef} onCancel={() => setProfileTransferStatus(undefined)}>
        <div className="character-profile-dialog-heading"><div><h2>Character Profiles</h2><p>Profiles save modified stats and the complete Main-tab setup.</p></div><button className="icon-button" type="button" aria-label="Close character profiles" onClick={() => profileDialogRef.current?.close()}>×</button></div>
        <div className="character-profile-create"><input value={newProfileName} placeholder="Profile name" aria-label="New character profile name" onChange={(event) => setNewProfileName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") createProfile(); }} /><button className="button button-primary" type="button" disabled={!newProfileName.trim()} onClick={createProfile}>Save current</button></div>
        <div className="character-profile-list">
          <div className="character-profile-row calculated-profile-row"><strong>Calculated</strong><button className="button button-secondary button-small" type="button" onClick={() => { selectProfile(); profileDialogRef.current?.close(); }}>Load</button></div>
          {characterProfiles.map((profile) => <div className="character-profile-row" key={profile.id}>
            <input defaultValue={profile.name} aria-label={`Rename ${profile.name}`} onBlur={(event) => {
              const name = event.currentTarget.value.trim();
              if (!name) { event.currentTarget.value = profile.name; return; }
              if (name !== profile.name) onCharacterProfilesChange(characterProfiles.map((candidate) => candidate.id === profile.id ? { ...candidate, name } : candidate));
            }} />
            <div><button className="button button-secondary button-small" type="button" onClick={() => { selectProfile(profile); profileDialogRef.current?.close(); }}>Load</button><button className="button button-secondary button-small" type="button" onClick={() => {
              const usedIds = new Set(characterProfiles.map(({ id }) => id));
              const baseId = `${profile.id}:copy`;
              let id = baseId;
              let suffix = 2;
              while (usedIds.has(id)) id = `${baseId}:${suffix++}`;
              onCharacterProfilesChange([...characterProfiles, { ...profile, id, name: `${profile.name} Copy`, statOverrides: { ...profile.statOverrides }, attunementOverrides: { ...profile.attunementOverrides }, innerWays: profile.innerWays.map((row) => ({ ...row })), buildSetup: { ...profile.buildSetup, gearSets: { ...profile.buildSetup.gearSets } }, globalDebuffs: { ...profile.globalDebuffs } }]);
            }}>Duplicate</button><button className="button button-danger button-small" type="button" onClick={() => onCharacterProfilesChange(characterProfiles.filter(({ id }) => id !== profile.id))}>Delete</button></div>
          </div>)}
        </div>
        <div className="character-profile-transfer"><div><button className="button button-secondary button-small" type="button" disabled={characterProfiles.length === 0} onClick={exportProfiles}>Export</button><label className="button button-secondary button-small character-profile-import">Import<input type="file" accept="application/json,.json" aria-label="Import character profiles" onChange={importProfiles} /></label></div>{profileTransferStatus && <p className={profileTransferStatus.error ? "error" : ""} role={profileTransferStatus.error ? "alert" : "status"}>{profileTransferStatus.message}</p>}<button className="button button-primary" type="button" onClick={() => profileDialogRef.current?.close()}>Done</button></div>
      </dialog>
    </>
  );
}

function skillToDraft(skill: SkillRecord) {
  const { name = "", shortName = "", castTime = 0, action = [], modifier = [], tags = [] } = skill;
  const toObjects = (items: unknown[]) => items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? item as EditableObject : {});
  const stackEffects = Array.isArray(skill.stackEffects) ? skill.stackEffects : [];
  return {
    name,
    shortName,
    description: asString(skill.description),
    castTime: String(castTime),
    cooldown: typeof skill.cooldown === "number" ? String(skill.cooldown) : "",
    duration: typeof skill.duration === "number" ? String(skill.duration) : "",
    maxStack: typeof skill.maxStack === "number" ? String(skill.maxStack) : "",
    tick: typeof skill.tick === "number" ? String(skill.tick) : "",
    tags: tags.join(", "),
    actionItems: toObjects(action),
    modifierItems: toObjects(modifier),
    effectItems: toObjects(Array.isArray(skill.effect) ? skill.effect : []),
    stackEffectGroups: stackEffects.map((group) => toObjects(Array.isArray(group) ? group : [])),
  };
}

const actionTypes = ["damage", "consume", "apply", "trigger", "extend", "clearCD"];
const conditionTargets = ["self", "target", "skillTag", "martialArt"];
const effectFields = ["castTimeModifier", "castTimeMultiplier", "baseDMGBonus", "hpDMGBonus", "globalDmgBonus", "globalHPDMGBonus", "globalBellstrikeDMGBonus", "dotDamage", "dmgBonus", "defenseBonus", "physicalPenetration", "formlessPenetration", "physicalResistance", "bellstrikeResistance", "stonesplitResistance", "silkbindResistance", "bamboocutResistance", "critDmgBonus", "affinityDmgBonus", "SteadfastGuaranteedCrit", "enhanceDrunkenPoet"];
const booleanEffectFields = new Set(["SteadfastGuaranteedCrit", "enhanceDrunkenPoet"]);

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function itemSummary(item: string, index: number, kind: "action" | "modifier" | "effect") {
  try {
    const parsed = JSON.parse(item) as EditableObject;
    if (kind === "effect") {
      const payload = parsed.effect && typeof parsed.effect === "object" && !Array.isArray(parsed.effect) ? parsed.effect as EditableObject : parsed;
      const fields = Object.keys(payload).filter((field) => field !== "requirement");
      return `${index + 1}. ${fields.join(", ") || "effect"}`;
    }
    const type = typeof parsed.type === "string" ? parsed.type : kind;
    const time = typeof parsed.time === "number" ? ` at ${parsed.time}s` : "";
    return `${index + 1}. ${type}${time}`;
  } catch {
    return `${index + 1}. ${kind}`;
  }
}

function updateObjectField(object: EditableObject, field: string, value: unknown) {
  return { ...object, [field]: value };
}

function RequirementEditor({ value, onChange }: { value: unknown; onChange: (value: unknown[]) => void }) {
  const requirements = Array.isArray(value) ? value as unknown[] : [];
  function editLeaf(leaf: unknown, field: string, fieldValue: string) {
    const current = leaf && typeof leaf === "object" && !Array.isArray(leaf) ? leaf as EditableObject : {};
    return { ...current, [field]: fieldValue };
  }
  function updateLeaf(index: number, field: string, fieldValue: string) {
    const next = [...requirements];
    next[index] = editLeaf(next[index], field, fieldValue);
    onChange(next);
  }
  function updateOrLeaf(groupIndex: number, operandIndex: number, field: string, fieldValue: string, nestedIndex?: number) {
    const group = requirements[groupIndex] as EditableObject;
    const operands = Array.isArray(group.operand) ? [...group.operand] : [];
    if (nestedIndex === undefined) operands[operandIndex] = editLeaf(operands[operandIndex], field, fieldValue);
    else {
      const nested = Array.isArray(operands[operandIndex]) ? [...operands[operandIndex] as unknown[]] : [];
      nested[nestedIndex] = editLeaf(nested[nestedIndex], field, fieldValue);
      operands[operandIndex] = nested;
    }
    const next = [...requirements];
    next[groupIndex] = { ...group, operand: operands };
    onChange(next);
  }
  function addOrGroup() { onChange([...requirements, { operator: "or", operand: [{ target: "self", value: "" }, { target: "self", value: "" }] }]); }
  function addOrOperand(groupIndex: number) {
    const group = requirements[groupIndex] as EditableObject;
    const next = [...requirements];
    next[groupIndex] = { ...group, operand: [...(Array.isArray(group.operand) ? group.operand : []), { target: "self", value: "" }] };
    onChange(next);
  }
  function removeOrOperand(groupIndex: number, operandIndex: number, nestedIndex?: number) {
    const group = requirements[groupIndex] as EditableObject;
    const operands = Array.isArray(group.operand) ? [...group.operand] : [];
    if (nestedIndex === undefined) operands.splice(operandIndex, 1);
    else {
      const nested = Array.isArray(operands[operandIndex]) ? [...operands[operandIndex] as unknown[]] : [];
      nested.splice(nestedIndex, 1);
      operands[operandIndex] = nested;
    }
    const next = [...requirements];
    next[groupIndex] = { ...group, operand: operands };
    onChange(next);
  }
  const addLeaf = () => onChange([...requirements, { target: "self", value: "" }]);
  const remove = (index: number) => onChange(requirements.filter((_, itemIndex) => itemIndex !== index));
  return (
    <div className="requirement-editor">
      <div className="sub-editor-heading"><span>Requirements <small>(all conditions must pass)</small></span><div className="sub-editor-buttons"><button className="button button-small" type="button" onClick={addLeaf}>Add condition</button><button className="button button-small" type="button" onClick={addOrGroup}>Add OR</button></div></div>
      {requirements.length === 0 && <span className="sub-editor-empty">No requirements</span>}
      {requirements.map((requirement, index) => {
        const item = requirement && typeof requirement === "object" && !Array.isArray(requirement) ? requirement as EditableObject : {};
        if (item.operator === "or") {
          const operands = Array.isArray(item.operand) ? item.operand : [];
          return <div className="or-condition" key={index}><div className="or-condition-heading"><span>OR group</span><button type="button" onClick={() => remove(index)}>Remove</button></div>{operands.map((operand, operandIndex) => Array.isArray(operand) ? <div className="and-group" key={operandIndex}><small>AND group</small>{operand.map((leaf, nestedIndex) => <div className="condition-row" key={nestedIndex}><select value={asString((leaf as EditableObject)?.target) || "self"} onChange={(event) => updateOrLeaf(index, operandIndex, "target", event.target.value, nestedIndex)}>{conditionTargets.map((target) => <option key={target}>{target}</option>)}</select><input value={asString((leaf as EditableObject)?.value)} placeholder="Value" onChange={(event) => updateOrLeaf(index, operandIndex, "value", event.target.value, nestedIndex)} /><button type="button" aria-label="Remove alternative" onClick={() => removeOrOperand(index, operandIndex, nestedIndex)}>×</button></div>)}</div> : <div className="condition-row" key={operandIndex}><select value={asString((operand as EditableObject)?.target) || "self"} onChange={(event) => updateOrLeaf(index, operandIndex, "target", event.target.value)}>{conditionTargets.map((target) => <option key={target}>{target}</option>)}</select><input value={asString((operand as EditableObject)?.value)} placeholder="Value" onChange={(event) => updateOrLeaf(index, operandIndex, "value", event.target.value)} /><button type="button" aria-label="Remove alternative" onClick={() => removeOrOperand(index, operandIndex)}>×</button></div>)}<button className="button button-small" type="button" onClick={() => addOrOperand(index)}>Add alternative</button></div>;
        }
        return <div className="condition-row" key={index}>
          <select value={asString(item.target) || "self"} onChange={(event) => updateLeaf(index, "target", event.target.value)}>{conditionTargets.map((target) => <option key={target}>{target}</option>)}</select>
          <input value={asString(item.value)} placeholder="Value" onChange={(event) => updateLeaf(index, "value", event.target.value)} />
          <button type="button" aria-label="Remove condition" onClick={() => remove(index)}>×</button>
        </div>;
      })}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) {
  return <label className="detail-field"><span>{label}</span><input type="number" step="0.0001" value={typeof value === "number" ? value : ""} onChange={(event) => onChange(Number(event.target.value))} /></label>;
}

function ActionDetails({ item, onChange, skillIds }: { item: EditableObject; onChange: (item: EditableObject) => void; skillIds: string[] }) {
  const type = asString(item.type) || "damage";
  const set = (field: string, value: unknown) => onChange(updateObjectField(item, field, value));
  const firstConsume = item.value && typeof item.value === "object" && !Array.isArray(item.value) && (item.value as EditableObject).operator === "first";
  const consumeText = firstConsume ? (Array.isArray((item.value as EditableObject).operand) ? ((item.value as EditableObject).operand as unknown[]).map(asString).join(", ") : "") : asString(item.value);
  function setConsumeMode(mode: string) {
    const current = consumeText.split(",").map((value) => value.trim()).filter(Boolean);
    set("value", mode === "first" ? { operator: "first", operand: current } : (current[0] ?? ""));
  }
  function setConsumeText(value: string) {
    set("value", firstConsume ? { operator: "first", operand: value.split(",").map((part) => part.trim()).filter(Boolean) } : value);
  }
  return <div className="structured-detail">
    <div className="detail-fields">
      <label className="detail-field"><span>Type</span><select value={type} onChange={(event) => set("type", event.target.value)}>{actionTypes.map((actionType) => <option key={actionType}>{actionType}</option>)}</select></label>
      <NumberField label="Time" value={item.time} onChange={(value) => set("time", value)} />
    </div>
    {type === "damage" && <div className="detail-fields detail-fields-four"><NumberField label="Physical Coefficient" value={item.phyCoef} onChange={(value) => set("phyCoef", value)} /><NumberField label="Physical Bonus" value={item.phyBonus} onChange={(value) => set("phyBonus", value)} /><NumberField label="Attribute Bonus" value={item.attrBonus} onChange={(value) => set("attrBonus", value)} /></div>}
    {(type === "apply" || type === "extend" || type === "clearCD") && <div className="detail-fields">
      <label className="detail-field"><span>Target</span><select value={asString(item.target) || "self"} onChange={(event) => set("target", event.target.value)}><option>self</option><option>target</option></select></label>
      <label className="detail-field"><span>Value</span><input value={asString(item.value)} onChange={(event) => set("value", event.target.value)} /></label>
    </div>}
    {type === "consume" && <div className="detail-fields consume-fields">
      <label className="detail-field"><span>Target</span><select value={asString(item.target) || "self"} onChange={(event) => set("target", event.target.value)}><option>self</option><option>target</option></select></label>
      <label className="detail-field"><span>Value mode</span><select value={firstConsume ? "first" : "name"} onChange={(event) => setConsumeMode(event.target.value)}><option value="name">Single name</option><option value="first">First available</option></select></label>
      <label className="detail-field consume-value-field"><span>{firstConsume ? "Values (comma separated)" : "Value"}</span><input value={consumeText} onChange={(event) => setConsumeText(event.target.value)} /></label>
    </div>}
    {(type === "apply" || type === "consume") && <div className="detail-fields">
      {type === "consume" && <label className="checkbox-field"><input type="checkbox" checked={item.stack === "all"} onChange={(event) => set("stack", event.target.checked ? "all" : 1)} /><span>All stacks</span></label>}
      {item.stack !== "all" && <NumberField label="Stack" value={item.stack} onChange={(value) => set("stack", value)} />}
      {type === "apply" && <label className="checkbox-field"><input type="checkbox" checked={item.reapply === true} onChange={(event) => set("reapply", event.target.checked)} /><span>Reapply</span></label>}
    </div>}
    {(type === "apply" || type === "extend") && <NumberField label="Duration" value={item.duration} onChange={(value) => set("duration", value)} />}
    {type === "trigger" && <label className="detail-field"><span>Triggered skill</span><select value={asString(item.value)} onChange={(event) => set("value", event.target.value)}><option value="">Select a skill</option>{skillIds.map((skillId) => <option key={skillId}>{skillId}</option>)}</select></label>}
    {(type === "apply" || type === "trigger" || type === "extend" || type === "clearCD") && <RequirementEditor value={item.requirement} onChange={(value) => set("requirement", value)} />}
  </div>;
}

function ModifierDetails({ item, onChange }: { item: EditableObject; onChange: (item: EditableObject) => void }) {
  const set = (field: string, value: unknown) => onChange(updateObjectField(item, field, value));
  const effect = item.effect && typeof item.effect === "object" && !Array.isArray(item.effect) ? item.effect as EditableObject : {};
  const effectEntries = Object.entries(effect);
  function updateEffect(field: string, value: unknown) { set("effect", { ...effect, [field]: value }); }
  function addEffect() {
    const field = effectFields.find((candidate) => !(candidate in effect));
    if (field) updateEffect(field, booleanEffectFields.has(field) ? false : 0);
  }
  function removeEffect(field: string) { const next = { ...effect }; delete next[field]; set("effect", next); }
  return <div className="structured-detail">
    <RequirementEditor value={item.requirement} onChange={(value) => set("requirement", value)} />
    <div className="sub-editor-heading"><span>Effects</span><button className="button button-small" type="button" onClick={addEffect}>Add effect</button></div>
      {effectEntries.map(([field, value]) => <div className="effect-row" key={field}>
      <select value={field} onChange={(event) => { const next = { ...effect }; const nextField = event.target.value; if (nextField !== field) { next[nextField] = next[field]; delete next[field]; set("effect", next); } }}>{!effectFields.includes(field) && <option value={field}>{field}</option>}{effectFields.map((effectField) => <option key={effectField}>{effectField}</option>)}</select>
      <EffectValueEditor value={value} onChange={(nextValue) => updateEffect(field, nextValue)} />
      <button type="button" aria-label="Remove effect" onClick={() => removeEffect(field)}>×</button>
    </div>)}
  </div>;
}

function DynamicByValueEditor({ value, onChange }: { value: EditableObject; onChange: (value: EditableObject) => void }) {
  const values = Array.isArray(value.param2) ? value.param2.map((item) => asNumber(item)) : [];
  const updateValue = (index: number, nextValue: number) => onChange({ ...value, function: "by", param2: values.map((item, itemIndex) => itemIndex === index ? nextValue : item) });
  return <div className="dynamic-effect-editor">
    <label className="detail-field"><span>Parameter</span><input value={asString(value.param1)} onChange={(event) => onChange({ ...value, function: "by", param1: event.target.value })} /></label>
    <div className="sub-editor-heading"><span>Values</span><button className="button button-small" type="button" onClick={() => onChange({ ...value, function: "by", param2: [...values, 0] })}>Add</button></div>
    <div className="dynamic-effect-values">{values.map((item, index) => <div key={index}><input aria-label={`Value ${index + 1}`} type="number" step="0.0001" value={item} onChange={(event) => updateValue(index, Number(event.target.value))} /><button type="button" aria-label={`Remove value ${index + 1}`} onClick={() => onChange({ ...value, function: "by", param2: values.filter((_, itemIndex) => itemIndex !== index) })}>×</button></div>)}</div>
  </div>;
}

function DynamicByStackValueEditor({ value, onChange }: { value: EditableObject; onChange: (value: EditableObject) => void }) {
  return <div className="dynamic-effect-editor">
    <label className="detail-field"><span>Effect</span><input value={asString(value.param1)} onChange={(event) => onChange({ ...value, function: "byStack", param1: event.target.value })} /></label>
    <label className="detail-field"><span>Value per stack</span><input type="number" step="0.0001" value={typeof value.param2 === "number" ? value.param2 : ""} onChange={(event) => onChange({ ...value, function: "byStack", param2: Number(event.target.value) })} /></label>
    <label className="detail-field"><span>Target</span><select value={value.target === "target" ? "target" : "self"} onChange={(event) => onChange({ ...value, function: "byStack", target: event.target.value })}><option value="self">Self</option><option value="target">Target</option></select></label>
  </div>;
}

function DynamicSegmentValueEditor({ value, onChange }: { value: EditableObject; onChange: (value: EditableObject) => void }) {
  const thresholds = Array.isArray(value.param2) ? value.param2.map((item) => asNumber(item)) : [];
  const results = Array.isArray(value.param3) ? value.param3.map((item) => asNumber(item)) : [];
  const resizeResults = (nextThresholds: number[]) => Array.from({ length: nextThresholds.length + 1 }, (_, index) => results[index] ?? 0);
  return <div className="dynamic-effect-editor">
    <label className="detail-field"><span>Parameter</span><input value={typeof value.param1 === "number" ? value.param1 : asString(value.param1)} onChange={(event) => onChange({ ...value, function: "segment", param1: event.target.value })} /></label>
    <div className="sub-editor-heading"><span>Thresholds</span><button className="button button-small" type="button" onClick={() => { const nextThresholds = [...thresholds, 0]; onChange({ ...value, function: "segment", param2: nextThresholds, param3: resizeResults(nextThresholds) }); }}>Add</button></div>
    <div className="dynamic-effect-values">{thresholds.map((item, index) => <div key={index}><input aria-label={`Threshold ${index + 1}`} type="number" step="0.0001" value={item} onChange={(event) => onChange({ ...value, function: "segment", param2: thresholds.map((threshold, thresholdIndex) => thresholdIndex === index ? Number(event.target.value) : threshold) })} /><button type="button" aria-label={`Remove threshold ${index + 1}`} onClick={() => { const nextThresholds = thresholds.filter((_, thresholdIndex) => thresholdIndex !== index); const nextResults = results.filter((_, resultIndex) => resultIndex !== index); onChange({ ...value, function: "segment", param2: nextThresholds, param3: Array.from({ length: nextThresholds.length + 1 }, (_, resultIndex) => nextResults[resultIndex] ?? 0) }); }}>×</button></div>)}</div>
    <div className="sub-editor-heading"><span>Segment values</span></div>
    <div className="dynamic-effect-values">{Array.from({ length: thresholds.length + 1 }, (_, index) => results[index] ?? 0).map((item, index) => <div key={index}><input aria-label={`Segment value ${index + 1}`} type="number" step="0.0001" value={item} onChange={(event) => onChange({ ...value, function: "segment", param3: Array.from({ length: thresholds.length + 1 }, (_, resultIndex) => resultIndex === index ? Number(event.target.value) : results[resultIndex] ?? 0) })} /></div>)}</div>
  </div>;
}

function EffectValueEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const objectValue = value && typeof value === "object" && !Array.isArray(value) ? value as EditableObject : undefined;
  const dynamicValue = objectValue?.function === "by" || objectValue?.function === "byStack" || objectValue?.function === "segment" ? objectValue : undefined;
  const kind = dynamicValue?.function === "byStack" ? "byStack" : dynamicValue?.function === "segment" ? "segment" : dynamicValue ? "by" : typeof value === "boolean" ? "boolean" : typeof value === "string" ? "text" : "number";
  return <div className="effect-value-editor">
    <select aria-label="Effect value type" value={kind} onChange={(event) => {
      const nextKind = event.target.value;
      onChange(nextKind === "by" ? { function: "by", param1: "distance", param2: [] } : nextKind === "byStack" ? { function: "byStack", param1: "", param2: 0.2, target: "self" } : nextKind === "segment" ? { function: "segment", param1: "actionTime", param2: [], param3: [0] } : nextKind === "boolean" ? false : nextKind === "text" ? "" : 0);
    }}><option value="number">Number</option><option value="boolean">Boolean</option><option value="by">By parameter</option><option value="byStack">By stack</option><option value="segment">Segment</option><option value="text">Text</option></select>
    {kind === "by" && dynamicValue ? <DynamicByValueEditor value={dynamicValue} onChange={onChange} /> : kind === "byStack" && dynamicValue ? <DynamicByStackValueEditor value={dynamicValue} onChange={onChange} /> : kind === "segment" && dynamicValue ? <DynamicSegmentValueEditor value={dynamicValue} onChange={onChange} /> : kind === "boolean" ? <label className="checkbox-field"><input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} /><span>{value === true ? "True" : "False"}</span></label> : <input type={kind === "number" ? "number" : "text"} step={kind === "number" ? "0.0001" : undefined} value={kind === "number" ? (typeof value === "number" ? value : "") : asString(value)} onChange={(event) => onChange(kind === "number" ? Number(event.target.value) : event.target.value)} />}
  </div>;
}

function EffectRuleDetails({ item, onChange }: { item: EditableObject; onChange: (item: EditableObject) => void }) {
  const wrapped = item.effect && typeof item.effect === "object" && !Array.isArray(item.effect);
  const effect = wrapped
    ? item.effect as EditableObject
    : Object.fromEntries(Object.entries(item).filter(([field]) => field !== "requirement"));
  const effectEntries = Object.entries(effect);
  function setEffect(nextEffect: EditableObject) {
    if (wrapped) onChange({ ...item, effect: nextEffect });
    else onChange({ ...(Array.isArray(item.requirement) ? { requirement: item.requirement } : {}), ...nextEffect });
  }
  function updateEffect(field: string, value: unknown) { setEffect({ ...effect, [field]: value }); }
  function addEffect() {
    const field = effectFields.find((candidate) => !(candidate in effect));
    if (field) updateEffect(field, booleanEffectFields.has(field) ? false : 0);
  }
  function removeEffect(field: string) { const next = { ...effect }; delete next[field]; setEffect(next); }
  return <div className="structured-detail">
    <RequirementEditor value={item.requirement} onChange={(requirement) => onChange({ ...item, requirement })} />
    <div className="sub-editor-heading"><span>Effects <small>({wrapped ? "wrapped" : "direct"})</small></span><button className="button button-small" type="button" onClick={addEffect}>Add effect</button></div>
    {effectEntries.length === 0 && <span className="sub-editor-empty">No effects</span>}
    {effectEntries.map(([field, value]) => <div className="effect-row effect-rule-row" key={field}>
      <select value={field} onChange={(event) => { const next = { ...effect }; const nextField = event.target.value; if (nextField !== field) { next[nextField] = next[field]; delete next[field]; setEffect(next); } }}>{!effectFields.includes(field) && <option value={field}>{field}</option>}{effectFields.map((effectField) => <option key={effectField}>{effectField}</option>)}</select>
      <EffectValueEditor value={value} onChange={(nextValue) => updateEffect(field, nextValue)} />
      <button type="button" aria-label={`Remove ${field}`} onClick={() => removeEffect(field)}>×</button>
    </div>)}
  </div>;
}

function ArrayItemEditor({ label, kind, items, onChange, skillIds }: {
  label: string;
  kind: "action" | "modifier" | "effect";
  items: EditableObject[];
  onChange: (items: EditableObject[]) => void;
  skillIds: string[];
}) {
  const [expanded, setExpanded] = useState<number | null>(items.length ? 0 : null);

  function updateItem(index: number, value: EditableObject) {
    const next = [...items];
    next[index] = value;
    onChange(next);
  }

  function addItem() {
    const item: EditableObject = kind === "action" ? { type: "damage", time: 0 } : { requirement: [], effect: {} };
    const next = [...items, item];
    onChange(next);
    setExpanded(next.length - 1);
  }

  function moveItem(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= items.length) return;
    const next = [...items];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setExpanded(target);
  }

  function deleteItem(index: number) {
    onChange(items.filter((_, itemIndex) => itemIndex !== index));
    setExpanded(null);
  }

  return (
    <section className="array-editor">
      <div className="array-editor-heading"><span>{label}</span><button className="button button-small" type="button" onClick={addItem}>Add</button></div>
      {items.length === 0 && <p className="array-editor-empty">No {label.toLowerCase()} yet.</p>}
      <div className="array-editor-list">
        {items.map((item, index) => {
          return (
            <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={index}>
              <div className="array-item-header">
                <button className="array-item-toggle" type="button" onClick={() => setExpanded(expanded === index ? null : index)}>{itemSummary(JSON.stringify(item), index, kind)}</button>
                <div className="array-item-controls">
                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveItem(index, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>↓</button>
                  <button type="button" aria-label="Delete" onClick={() => deleteItem(index)}>×</button>
                </div>
              </div>
              {expanded === index && <div className="array-item-detail">{kind === "action" ? <ActionDetails item={item} onChange={(next) => updateItem(index, next)} skillIds={skillIds} /> : kind === "modifier" ? <ModifierDetails item={item} onChange={(next) => updateItem(index, next)} /> : <EffectRuleDetails item={item} onChange={(next) => updateItem(index, next)} />}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StackEffectsEditor({ groups, onChange, skillIds }: { groups: EditableObject[][]; onChange: (groups: EditableObject[][]) => void; skillIds: string[] }) {
  const [expanded, setExpanded] = useState<number | null>(groups.length ? 0 : null);
  function moveGroup(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setExpanded(target);
  }
  return <section className="array-editor stack-effects-editor">
    <div className="array-editor-heading"><span>Stack Effects</span><button className="button button-small" type="button" onClick={() => { const next = [...groups, []]; onChange(next); setExpanded(next.length - 1); }}>Add stack</button></div>
    {groups.length === 0 && <p className="array-editor-empty">No stack effects yet.</p>}
    <div className="array-editor-list">{groups.map((group, index) => <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={index}>
      <div className="array-item-header"><button className="array-item-toggle" type="button" onClick={() => setExpanded(expanded === index ? null : index)}>Stack {index + 1} · {group.length} effect{group.length === 1 ? "" : "s"}</button><div className="array-item-controls"><button type="button" aria-label="Move stack up" disabled={index === 0} onClick={() => moveGroup(index, -1)}>↑</button><button type="button" aria-label="Move stack down" disabled={index === groups.length - 1} onClick={() => moveGroup(index, 1)}>↓</button><button type="button" aria-label="Delete stack" onClick={() => { onChange(groups.filter((_, groupIndex) => groupIndex !== index)); setExpanded(null); }}>×</button></div></div>
      {expanded === index && <div className="array-item-detail"><ArrayItemEditor label={`Stack ${index + 1} effects`} kind="effect" items={group} skillIds={skillIds} onChange={(items) => onChange(groups.map((candidate, groupIndex) => groupIndex === index ? items : candidate))} /></div>}
    </div>)}</div>
  </section>;
}

function SkillEditorTab({ weapons }: { weapons: [WeaponId, WeaponId] }) {
  const [category, setCategory] = useState<EditorCategory>("Snowparting");
  const [selectedSkill, setSelectedSkill] = useState(Object.keys(defaultEditorMaps.Snowparting)[0]);
  const [overrides, setOverrides] = useState<SkillOverrides>(loadSkillOverrides);
  const [draft, setDraft] = useState(() => skillToDraft(defaultEditorMaps.Snowparting[selectedSkill]));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const skills = useMemo(() => ({ ...defaultEditorMaps[category], ...(overrides[category] ?? {}) }), [category, overrides]);
  const skillIds = useMemo(() => Object.keys(skills), [skills]);
  const visibleCategories = useMemo<EditorCategory[]>(() => {
    const martialCategories = weapons.flatMap((weapon) => {
      const item = skillCategoryByWeapon[weapon];
      return item ? [item] : [];
    });
    return [...new Set<EditorCategory>([...martialCategories, "Mystic", "General", "Buff", "Debuff", "DOT"])] as EditorCategory[];
  }, [weapons]);

  useEffect(() => {
    if (!visibleCategories.includes(category)) setCategory(visibleCategories[0]);
  }, [category, visibleCategories]);

  useEffect(() => {
    const firstSkill = Object.keys(defaultEditorMaps[category])[0];
    setSelectedSkill(firstSkill);
  }, [category]);

  useEffect(() => {
    const skill = skills[selectedSkill] ?? skills[skillIds[0]];
    if (skill) {
      setDraft(skillToDraft(skill));
      setError("");
      setStatus("");
    }
  }, [selectedSkill, skills, skillIds]);

  function selectSkill(id: string) {
    setSelectedSkill(id);
  }

  function save() {
    try {
      const isDefinition = category === "Buff" || category === "Debuff";
      const optionalNumber = (value: string, label: string) => {
        if (!value.trim()) return undefined;
        const number = Number(value);
        if (!Number.isFinite(number)) throw new Error(`${label} must be a number.`);
        return number;
      };
      let updatedSkill: SkillRecord;
      if (isDefinition) {
        updatedSkill = {
          ...skills[selectedSkill],
          name: draft.name,
          description: draft.description,
          duration: optionalNumber(draft.duration, "Duration"),
          cooldown: optionalNumber(draft.cooldown, "Cooldown"),
          maxStack: optionalNumber(draft.maxStack, "Max stack"),
          effect: draft.effectItems,
          stackEffects: draft.stackEffectGroups,
        };
      } else {
      const action = draft.actionItems;
      const modifier = draft.modifierItems;
      const actionTimes = action.map((item) => item.time);
      if (actionTimes.some((time) => typeof time !== "number" || !Number.isFinite(time))) {
        throw new Error("Every action must have a numeric time.");
      }
      const numericActionTimes = actionTimes as number[];
      const firstOutOfOrder = numericActionTimes.findIndex((time, index) => index > 0 && time < numericActionTimes[index - 1]);
      if (firstOutOfOrder !== -1) {
        throw new Error(`Actions are out of order: action ${firstOutOfOrder + 1} occurs before action ${firstOutOfOrder}.`);
      }
      const castTime = category === "DOT" ? undefined : Number(draft.castTime);
      if (castTime !== undefined && !Number.isFinite(castTime)) throw new Error("Cast time must be a number.");
        updatedSkill = {
        ...skills[selectedSkill],
        name: draft.name,
        shortName: draft.shortName.trim() || undefined,
        ...(castTime === undefined ? {} : { castTime }),
        cooldown: optionalNumber(draft.cooldown, "Cooldown"),
        action,
        modifier,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
        ...(category === "DOT" ? {
          tick: optionalNumber(draft.tick, "Tick"),
          duration: optionalNumber(draft.duration, "Duration"),
          maxStack: optionalNumber(draft.maxStack, "Max stack"),
        } : {}),
      };
      }
      const nextOverrides: SkillOverrides = {
        ...overrides,
        [category]: { ...(overrides[category] ?? {}), [selectedSkill]: updatedSkill },
      };
      setOverrides(nextOverrides);
      sessionStorage.setItem(skillStorageKey, JSON.stringify(nextOverrides));
      setStatus("Saved for this session");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this record.");
      setStatus("");
    }
  }

  function restoreDefault() {
    const nextCategoryOverrides = { ...(overrides[category] ?? {}) };
    delete nextCategoryOverrides[selectedSkill];
    const nextOverrides: SkillOverrides = { ...overrides, [category]: nextCategoryOverrides };
    setOverrides(nextOverrides);
    sessionStorage.setItem(skillStorageKey, JSON.stringify(nextOverrides));
    setDraft(skillToDraft(defaultEditorMaps[category][selectedSkill]));
    setError("");
    setStatus("");
  }

  const isDefinitionCategory = category === "Buff" || category === "Debuff";
  const categoryLabel = (item: EditorCategory) => item === "Snowparting" ? "Snowparting Blade" : item === "Phalanxbane" ? "Phalanxbane Blade" : item;

  return (
    <>
      <section className="panel skill-editor-panel">
        <div className="skill-category-tabs" role="tablist" aria-label="Skill categories">
          {visibleCategories.map((item) => (
            <button key={item} className={`category-tab ${category === item ? "active" : ""}`} type="button" onClick={() => setCategory(item)}>{categoryLabel(item)}</button>
          ))}
        </div>
        <div className="skill-editor-layout">
          <aside className="skill-list" aria-label={`${category} skills`}>
            {skillIds.map((id) => (
              <button key={id} className={`skill-list-item ${selectedSkill === id ? "active" : ""}`} type="button" onClick={() => selectSkill(id)}>
                <strong>{skillDisplayName(skills[id], id)}</strong>
                <small>{id}</small>
              </button>
            ))}
          </aside>
          <div className="skill-detail">
            <div className="skill-detail-heading">
              <div><span className="detail-kicker">{category}</span><h3>{skillDisplayName(skills[selectedSkill], selectedSkill)}</h3></div>
              {status && <span className="editor-status">{status}</span>}
            </div>
            {isDefinitionCategory ? <>
              <div className="skill-basic-fields definition-basic-fields">
                <label className="editor-field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="editor-field"><span>Max Stack</span><input type="number" min="1" step="1" value={draft.maxStack} onChange={(event) => setDraft({ ...draft, maxStack: event.target.value })} /></label>
                <label className="editor-field editor-field-wide"><span>Description</span><input value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} /></label>
                <label className="editor-field"><span>Duration</span><input type="number" min="0" step="0.0001" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label>
                <label className="editor-field"><span>Cooldown</span><input type="number" min="0" step="0.0001" value={draft.cooldown} onChange={(event) => setDraft({ ...draft, cooldown: event.target.value })} /></label>
              </div>
              <div className="structured-editor-grid">
                <ArrayItemEditor label="Effects" kind="effect" items={draft.effectItems} onChange={(effectItems) => setDraft({ ...draft, effectItems })} skillIds={editorSkillIds} />
                <StackEffectsEditor groups={draft.stackEffectGroups} onChange={(stackEffectGroups) => setDraft({ ...draft, stackEffectGroups })} skillIds={editorSkillIds} />
              </div>
            </> : <>
              <div className="skill-basic-fields">
                <label className="editor-field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
                <label className="editor-field"><span>Short Name</span><input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} /></label>
                {category === "DOT" ? <>
                  <label className="editor-field"><span>Tick</span><input type="number" min="0" step="0.0001" value={draft.tick} onChange={(event) => setDraft({ ...draft, tick: event.target.value })} /></label>
                  <label className="editor-field"><span>Duration</span><input type="number" min="0" step="0.0001" value={draft.duration} onChange={(event) => setDraft({ ...draft, duration: event.target.value })} /></label>
                  <label className="editor-field"><span>Max Stack</span><input type="number" min="1" step="1" value={draft.maxStack} onChange={(event) => setDraft({ ...draft, maxStack: event.target.value })} /></label>
                </> : <>
                  <label className="editor-field"><span>Cast Time</span><input type="number" min="0" step="0.0001" value={draft.castTime} onChange={(event) => setDraft({ ...draft, castTime: event.target.value })} /></label>
                  <label className="editor-field"><span>Cooldown</span><input type="number" min="0" step="0.0001" value={draft.cooldown} onChange={(event) => setDraft({ ...draft, cooldown: event.target.value })} /></label>
                </>}
                <label className="editor-field editor-field-wide"><span>Tags <small>(comma separated)</small></span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label>
              </div>
              <div className="json-editor-grid">
                <ArrayItemEditor label="Actions" kind="action" items={draft.actionItems} onChange={(actionItems) => setDraft({ ...draft, actionItems })} skillIds={editorSkillIds} />
                <ArrayItemEditor label="Modifiers" kind="modifier" items={draft.modifierItems} onChange={(modifierItems) => setDraft({ ...draft, modifierItems })} skillIds={editorSkillIds} />
              </div>
            </>}
            {error && <p className="editor-error">{error}</p>}
            <div className="editor-actions">
              <button className="button button-secondary" type="button" onClick={restoreDefault}>Default</button>
              <button className="button button-primary" type="button" onClick={save}>Save</button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SettingsTab({ settings, enemy, pathId, onSettingsChange }: {
  settings: CalculatorSettings;
  enemy: EnemyProfile;
  pathId: PathId;
  onSettingsChange: Dispatch<SetStateAction<CalculatorSettings>>;
}) {
  const weaponsLocked = Boolean(typedPathDefinitions[pathId].lockedWeapons);

  return <section className="panel settings-panel">
    <div className="settings-fields">
      <div className="settings-weapon-row">
        {settings.weapons.map((weapon, index) => <label className="editor-field" key={index}><span>{index === 0 ? "Left Weapon" : "Right Weapon"}</span><select value={weapon} disabled={weaponsLocked} onChange={(event) => onSettingsChange((current) => {
          const nextWeapon = event.target.value as WeaponId;
          const weapons: [WeaponId, WeaponId] = [...current.weapons] as [WeaponId, WeaponId];
          weapons[index] = nextWeapon;
          return { ...current, weapons };
        })}>
          {Object.entries(martialArtDefinitions).filter(([value]) => enabledWeaponIds.has(value as WeaponId)).map(([value, definition]) => <option key={value} value={value}>{definition.name} ({weaponFamilyNames[definition.weapon]})</option>)}
        </select></label>)}
      </div>
      <div className="settings-enemy-row">
        <label className="editor-field"><span>Enemy</span><select value={settings.enemy} onChange={(event) => onSettingsChange((current) => ({ ...current, enemy: event.target.value }))}>
          {Object.entries(typedEnemyProfiles).map(([key, profile]) => <option key={key} value={key}>{profile.name}</option>)}
        </select></label>
      </div>
    </div>
    <div className="settings-summary">
      <span>Defense: {enemy.defense}</span>
      <span>Physical Resistance: {enemy.physicalResistance}</span>
      <span>Attribute Resistance: {enemy.bellstrikeResistance}</span>
      <span>Judgement Resistance: {formatNumber(enemy.judgementResistance * 100)}%</span>
    </div>
  </section>;
}

function RotationEditorTab({ character, onMetricsChange, onActiveSimulationBundleChange }: { character: CharacterState; onMetricsChange: (metrics: RotationMetrics, isActive: boolean) => void; onActiveSimulationBundleChange: (bundle: RotationSimulationBundle, rotationName: string, bundleKey: string) => void }) {
  const { rawStats: characterStats, attunementStats, settings, enemy, derivedStats, innerWayRevision: _innerWayRevision, gearStatEffect, buildSetup } = character;
  const rotationSkillIds = useMemo(() => selectableRotationSkillIds(settings.weapons), [settings.weapons]);
  const innerWayConditions = loadInnerWayConditions();
  const innerWayEffectRules = loadInnerWayEffectRules();
  const [rotationEntries, setRotationEntries] = useState<RotationEntry[]>(loadRotationEntries);
  const [activeRotationId, setActiveRotationId] = useState(() => initialRotationId(loadRotationEntries()));
  const [editingRotationId, setEditingRotationId] = useState(() => initialRotationId(loadRotationEntries()));
  const [rotation, setRotation] = useState<RotationRecord>(() => {
    const entries = loadRotationEntries();
    const activeId = initialRotationId(entries);
    return JSON.parse(JSON.stringify(entries.find((entry) => entry.id === activeId)?.rotation ?? entries[0]?.rotation ?? defaultRotation)) as RotationRecord;
  });
  const [startAnchor, setStartAnchor] = useState<{ rowId: string; actionIndex?: number }>(() => {
    const initialEntries = loadRotationEntries();
    const initialId = initialRotationId(initialEntries);
    const start = initialEntries.find((entry) => entry.id === initialId)?.rotation.start;
    return start ? { rowId: `rotation-${start.step}`, actionIndex: start.action } : { rowId: "rotation-0" };
  });
  const [expandedSkillRows, setExpandedSkillRows] = useState<Set<string>>(() => new Set());
  const [editingName, setEditingName] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [transferStatus, setTransferStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [eventTimeDrafts, setEventTimeDrafts] = useState<Record<string, string>>({});
  const [eventDurationDrafts, setEventDurationDrafts] = useState<Record<string, string>>({});
  const [eventDistanceDrafts, setEventDistanceDrafts] = useState<Record<string, string>>({});
  const [rotationResults, setRotationResults] = useState<Record<string, { key: string; result: RotationSimulationResult }>>({});
  const rotationResultsRef = useRef(rotationResults);
  const [diffResult, setDiffResult] = useState<{ key: string; rotationId: string; requestSequence: number; metrics: RotationMetrics } | null>(null);
  const diffRequestSequenceRef = useRef(0);
  const [readableDialogOpen, setReadableDialogOpen] = useState(false);
  const [readableCopyStatus, setReadableCopyStatus] = useState("");
  const readableDialogRef = useRef<HTMLDialogElement>(null);
  const readableTextRef = useRef<HTMLTextAreaElement>(null);
  const rotationScrollRef = useRef<HTMLDivElement>(null);
  const pendingEventScrollRef = useRef<{ stepIndex: number; top: number } | null>(null);
  const pendingSkillFocusRef = useRef<number | null>(null);
  const visibleRotationEntries = useMemo(() => rotationEntries.filter((entry) => rotationAvailableForWeapons(entry, settings.weapons)), [rotationEntries, settings.weapons]);
  const editingEntry = visibleRotationEntries.find((entry) => entry.id === editingRotationId) ?? visibleRotationEntries[0];
  const rotationLocked = editingEntry?.isDefault === true;
  const currentGlobalDebuffs = loadGlobalDebuffs();
  const calculationContextKey = JSON.stringify({ characterStats, attunementStats, settings, enemy, innerWayConditions: [...innerWayConditions], innerWayEffectRules, innerWayRevision: _innerWayRevision, gearStatEffect, buildSetup, globalDebuffs: currentGlobalDebuffs });
  const rotationStateKey = `${editingRotationId}:${calculationContextKey}:${JSON.stringify(rotation)}`;
  const calculationContextKeyRef = useRef(calculationContextKey);
  calculationContextKeyRef.current = calculationContextKey;
  rotationResultsRef.current = rotationResults;

  function persistRotationEntries(entries: RotationEntry[]) {
    sessionStorage.setItem(rotationListStorageKey, serializeRotationEntries(entries));
  }

  useEffect(() => {
    const migrated = migrateRotation(rotation);
    setRotation(migrated);
    persistRotationEntries(rotationEntries);
  }, []);

  useEffect(() => {
    const fallback = visibleRotationEntries.find((entry) => entry.id === activeRotationId) ?? visibleRotationEntries[0];
    if (!fallback) return;
    if (!visibleRotationEntries.some((entry) => entry.id === activeRotationId)) {
      setActiveRotationId(fallback.id);
      sessionStorage.setItem("wwm-active-rotation-session-v1", fallback.id);
    }
    if (!visibleRotationEntries.some((entry) => entry.id === editingRotationId)) {
      setEditingRotationId(fallback.id);
      setRotation(JSON.parse(JSON.stringify(fallback.rotation)) as RotationRecord);
      setStartAnchor(fallback.rotation.start ? { rowId: `rotation-${fallback.rotation.start.step}`, actionIndex: fallback.rotation.start.action } : { rowId: "rotation-0" });
      setEventTimeDrafts({});
    }
  }, [activeRotationId, editingRotationId, visibleRotationEntries]);

  useEffect(() => {
    if (startAnchor.actionIndex === undefined) return;
    const key = `${editingRotationId}:${startAnchor.rowId}`;
    setExpandedSkillRows((current) => current.has(key) ? current : new Set(current).add(key));
  }, [editingRotationId, startAnchor.rowId, startAnchor.actionIndex]);

  useEffect(() => {
    const dialog = readableDialogRef.current;
    if (!dialog) return;
    if (readableDialogOpen && !dialog.open) dialog.showModal();
    else if (!readableDialogOpen && dialog.open) dialog.close();
  }, [readableDialogOpen]);

  function findSkill(skillId: string) {
    for (const category of Object.keys(defaultSkillMaps) as SkillCategory[]) {
      const skill = defaultSkillMaps[category][skillId];
      if (skill) return skill;
    }
    return undefined;
  }
  function findDot(dotId: string) {
    const dot = (mysticDots as Record<string, SkillRecord>)[dotId];
    return dot;
  }

  function updateStep(index: number, changes: Record<string, unknown>) {
    if (rotationLocked) return;
    setRotation((current) => ({ ...current, steps: current.steps.map((step, stepIndex) => stepIndex === index ? { ...step, ...changes } as RotationStep : step) }));
  }
  function selectRotationItem(index: number, value: string, control: HTMLSelectElement) {
    if (rotationLocked) return;
    if (value === "__event:Move" || value === "__event:Exhausted") {
      const scrollContainer = rotationScrollRef.current;
      const row = control.closest<HTMLElement>("[data-rotation-step-index]");
      if (scrollContainer && row) pendingEventScrollRef.current = { stepIndex: index, top: row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top };
    }
    const rowId = `rotation-${index}`;
    setEventDistanceDrafts((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    const previousSkills = timeline.filter((row) => row.kind === "rotation" && (row.rotationIndex ?? -1) < index && row.step.type === "skill");
    const previousSkill = previousSkills[previousSkills.length - 1];
    setRotation((current) => {
      let steps = current.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step;
        if (value === "__event:Exhausted") return { type: "event", event: "Exhausted", after: { action: 0 } };
        if (value === "__event:Controlled") return { type: "event", event: "Controlled", startTime: previousSkill ? previousSkill.startTime - anchorTime : 0, duration: 3 };
        if (value === "__event:BattleEnd") return { type: "event", event: "BattleEnd", startTime: previousSkill ? previousSkill.startTime - anchorTime : 0 };
        if (value === "__event:Move") return { type: "event", event: "Move", before: { action: "start" }, distance: 1 };
        return { type: "skill", skill: value };
      }) as RotationStep[];
      const attached = value === "__event:Move" || value === "__event:Exhausted";
      if (attached && !steps.slice(index + 1).some((step) => step.type === "skill")) steps.push({ type: "skill", skill: rotationSkillIds[0] });
      if (value === "__event:Exhausted") {
        const targetSkill = steps.slice(index + 1).find((step): step is Extract<RotationStep, { type: "skill" }> => step.type === "skill");
        const actions = targetSkill ? findSkill(targetSkill.skill ?? "")?.action : undefined;
        const firstDamage = Array.isArray(actions) ? actions.findIndex((action) => (action as EditableObject).type === "damage") : -1;
        steps = steps.map((step, stepIndex) => stepIndex === index ? { type: "event", event: "Exhausted", after: { action: Math.max(0, firstDamage) } } : step);
      }
      return { ...current, steps };
    });
  }
  function commitEventTime(rowId: string, stepIndex: number) {
    const draft = eventTimeDrafts[rowId];
    if (draft === undefined) return;
    const time = Number(draft);
    if (Number.isFinite(time)) updateStep(stepIndex, { startTime: time });
    setEventTimeDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }
  function commitEventDuration(rowId: string, stepIndex: number) {
    const draft = eventDurationDrafts[rowId];
    if (draft === undefined) return;
    const duration = Number(draft);
    if (Number.isFinite(duration)) updateStep(stepIndex, { duration: Math.max(0, duration) });
    setEventDurationDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }
  function commitEventDistance(rowId: string, stepIndex: number) {
    const draft = eventDistanceDrafts[rowId];
    if (draft === undefined) return;
    const distance = Number(draft);
    if (Number.isFinite(distance)) updateStep(stepIndex, { distance: Math.max(1, Math.floor(distance)) });
    setEventDistanceDrafts((current) => {
      const next = { ...current };
      delete next[rowId];
      return next;
    });
  }
  function moveAttachedEvent(stepIndex: number, direction: -1 | 1, control: HTMLButtonElement) {
    if (rotationLocked) return;
    const eventStep = rotation.steps[stepIndex];
    const eventTarget = attachedTargetForStep(eventStep);
    if (eventStep?.type !== "event" || !eventTarget) return;
    const availableTargets = eventStep.event === "Exhausted" ? attachmentTargets.filter((target) => target.target.action !== "start") : attachmentTargets;
    const eventRow = timeline.find((row) => row.id === `rotation-${stepIndex}`);
    const currentTargetIndex = availableTargets.findIndex((target) => target.skillRowId === eventRow?.sourceRowId
      && target.target.action === eventTarget.action && target.target.trigger === eventTarget.trigger);
    const nextTarget = availableTargets[currentTargetIndex + direction];
    if (!nextTarget) return;

    const startStep = rotation.start ? rotation.steps[rotation.start.step] : undefined;
    const currentTargetRow = timeline.find((row) => row.id === eventRow?.sourceRowId);
    const currentTargetSkill = currentTargetRow?.rotationIndex === undefined ? undefined : rotation.steps[currentTargetRow.rotationIndex];
    const targetSkill = rotation.steps[nextTarget.skillStepIndex];
    const withoutEvent = rotation.steps.filter((_, index) => index !== stepIndex);
    const targetIndex = withoutEvent.indexOf(targetSkill);
    if (targetIndex < 0) return;
    const movedEvent = eventStep.event === "Exhausted"
      ? { type: "event", event: "Exhausted", after: nextTarget.target } as RotationStep
      : { ...eventStep, before: nextTarget.target } as RotationStep;
    const steps = [...withoutEvent.slice(0, targetIndex), movedEvent, ...withoutEvent.slice(targetIndex)];
    const movedEventIndex = steps.indexOf(movedEvent);
    const nextStartStep = startStep ? steps.indexOf(startStep) : -1;
    const nextRotation = { ...rotation, steps, ...(rotation.start && nextStartStep >= 0 ? { start: { ...rotation.start, step: nextStartStep } } : {}) };
    const scrollContainer = rotationScrollRef.current;
    const eventElement = control.closest<HTMLElement>("[data-rotation-step-index]");
    if (scrollContainer && eventElement) pendingEventScrollRef.current = { stepIndex: movedEventIndex, top: eventElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top };
    setRotation(nextRotation);
    if (nextStartStep >= 0 && rotation.start) setStartAnchor({ rowId: `rotation-${nextStartStep}`, actionIndex: rotation.start.action });
    const movedTargetIndex = steps.indexOf(targetSkill);
    const previousTargetIndex = currentTargetSkill ? steps.indexOf(currentTargetSkill) : -1;
    setExpandedSkillRows((current) => {
      const next = new Set(current);
      if (currentTargetSkill !== targetSkill) {
        if (currentTargetRow) next.delete(`${editingRotationId}:${currentTargetRow.id}`);
        if (previousTargetIndex >= 0) next.delete(`${editingRotationId}:rotation-${previousTargetIndex}`);
      }
      if (nextTarget.target.action !== "start") next.add(`${editingRotationId}:rotation-${movedTargetIndex}`);
      return next;
    });
  }
  function addStepBelow(index: number) {
    if (rotationLocked) return;
    pendingSkillFocusRef.current = index + 1;
    setRotation((current) => ({ ...current, steps: [...current.steps.slice(0, index + 1), { type: "skill", skill: rotationSkillIds[0] }, ...current.steps.slice(index + 1)] }));
  }
  function addExhaustedEvent() {
    if (rotationLocked) return;
    setRotation((current) => {
      const targetSkill = current.steps[current.steps.length - 1];
      const actions = targetSkill?.type === "skill" ? findSkill(targetSkill.skill ?? "")?.action : undefined;
      const firstDamage = Array.isArray(actions) ? actions.findIndex((action) => (action as EditableObject).type === "damage") : -1;
      return { ...current, steps: [...current.steps.slice(0, -1), { type: "event", event: "Exhausted", after: { action: Math.max(0, firstDamage) } }, ...current.steps.slice(-1)] };
    });
  }
  function moveStep(index: number, direction: number) {
    if (rotationLocked) return;
    setRotation((current) => {
      if (current.steps[index]?.type !== "skill") return current;
      const attached = (step: RotationStep | undefined) => Boolean(attachedTargetForStep(step));
      let blockStart = index;
      while (blockStart > 0 && attached(current.steps[blockStart - 1])) blockStart -= 1;
      const currentBlock = current.steps.slice(blockStart, index + 1);
      if (direction < 0) {
        let previousSkill = blockStart - 1;
        while (previousSkill >= 0 && current.steps[previousSkill].type !== "skill") previousSkill -= 1;
        if (previousSkill < 0) return current;
        let previousStart = previousSkill;
        while (previousStart > 0 && attached(current.steps[previousStart - 1])) previousStart -= 1;
        return { ...current, steps: [...current.steps.slice(0, previousStart), ...currentBlock, ...current.steps.slice(previousStart, blockStart), ...current.steps.slice(index + 1)] };
      }
      let nextSkill = index + 1;
      while (nextSkill < current.steps.length && current.steps[nextSkill].type !== "skill") nextSkill += 1;
      if (nextSkill >= current.steps.length) return current;
      return { ...current, steps: [...current.steps.slice(0, blockStart), ...current.steps.slice(index + 1, nextSkill + 1), ...currentBlock, ...current.steps.slice(nextSkill + 1)] };
    });
  }
  function removeStep(index: number) {
    if (rotationLocked) return;
    setRotation((current) => {
      if (current.steps[index]?.type !== "skill") return { ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) };
      let start = index;
      while (start > 0 && attachedTargetForStep(current.steps[start - 1])) start -= 1;
      return { ...current, steps: current.steps.filter((_, stepIndex) => stepIndex < start || stepIndex > index) };
    });
  }
  function selectStart(step: number, action?: number) {
    if (rotationLocked) return;
    setStartAnchor({ rowId: `rotation-${step}`, actionIndex: action });
    setRotation((current) => ({ ...current, start: { step, ...(action === undefined ? {} : { action }) } }));
  }
  function save() {
    if (rotationLocked) return;
    if (!rotation.name.trim()) { setError("Rotation name is required."); setStatus(""); return; }
    const normalized = migrateRotation(rotation);
    const nextEntries = rotationEntries.map((entry) => entry.id === editingRotationId ? { ...entry, rotation: normalized } : entry);
    setRotationEntries(nextEntries);
    setRotation(normalized);
    persistRotationEntries(nextEntries);
    sessionStorage.setItem("wwm-active-rotation-session-v1", activeRotationId);
    setError("");
    setStatus("Saved for this session");
    if (editingRotationId === activeRotationId) void calculateDiffsForRotation(editingRotationId, normalized);
  }
  function activateRotation(id: string) {
    if (id === activeRotationId) return;
    const current = migrateRotation(rotation);
    const nextEntries = rotationEntries.map((entry) => entry.id === editingRotationId ? { ...entry, rotation: current } : entry);
    const nextRotation = nextEntries.find((entry) => entry.id === id)?.rotation;
    if (!nextRotation) return;
    setRotationEntries(nextEntries);
    setActiveRotationId(id);
    setEditingRotationId(id);
    setRotation(JSON.parse(JSON.stringify(nextRotation)) as RotationRecord);
    setStartAnchor(nextRotation.start ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action } : { rowId: "rotation-0" });
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
    sessionStorage.setItem("wwm-active-rotation-session-v1", id);
    void activateCalculatedRotation(id, nextRotation);
  }
  function editRotation(id: string) {
    if (id === editingRotationId) return;
    const current = migrateRotation(rotation);
    const nextEntries = rotationEntries.map((entry) => entry.id === editingRotationId ? { ...entry, rotation: current } : entry);
    const nextRotation = nextEntries.find((entry) => entry.id === id)?.rotation;
    if (!nextRotation) return;
    setRotationEntries(nextEntries);
    setEditingRotationId(id);
    setRotation(JSON.parse(JSON.stringify(nextRotation)) as RotationRecord);
    setStartAnchor(nextRotation.start ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action } : { rowId: "rotation-0" });
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
  }
  function addRotation() {
    const current = migrateRotation(rotation);
    const id = `rotation-${Date.now()}`;
    const nextRotation: RotationRecord = { name: "New Rotation", steps: [{ type: "skill", skill: rotationSkillIds[0] }], eventTimeReference: "battleStart" };
    const nextEntries = [...rotationEntries.map((entry) => entry.id === editingRotationId ? { ...entry, rotation: current } : entry), { id, rotation: nextRotation, martialArts: [...new Set(settings.weapons)] }];
    setRotationEntries(nextEntries);
    setEditingRotationId(id);
    setRotation(nextRotation);
    setStartAnchor({ rowId: "rotation-0" });
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
  }
  function duplicateRotation() {
    const id = `rotation-${Date.now()}`;
    const source = migrateRotation(rotation);
    const duplicate: RotationRecord = JSON.parse(JSON.stringify({ ...source, name: `${source.name || "Rotation"} Copy` })) as RotationRecord;
    const sourceEntry = rotationEntries.find((entry) => entry.id === editingRotationId);
    const nextEntries = [...rotationEntries, { id, rotation: duplicate, martialArts: [...(sourceEntry?.martialArts ?? new Set(settings.weapons))] }];
    setRotationEntries(nextEntries);
    setEditingRotationId(id);
    setRotation(duplicate);
    setStartAnchor(duplicate.start ? { rowId: `rotation-${duplicate.start.step}`, actionIndex: duplicate.start.action } : { rowId: "rotation-0" });
    setEventTimeDrafts({});
    setEventDurationDrafts({});
    setEditingName(false);
    setStatus("");
    setError("");
    persistRotationEntries(nextEntries);
  }
  function removeRotation(id: string) {
    if (rotationEntries.find((entry) => entry.id === id)?.isDefault) return;
    if (visibleRotationEntries.length <= 1) return;
    const nextEntries = rotationEntries.filter((entry) => entry.id !== id);
    if (id !== editingRotationId && id !== activeRotationId) {
      setRotationEntries(nextEntries);
      persistRotationEntries(nextEntries);
      return;
    }
    const nextVisibleEntries = nextEntries.filter((entry) => rotationAvailableForWeapons(entry, settings.weapons));
    const nextActive = nextVisibleEntries[Math.max(0, visibleRotationEntries.findIndex((entry) => entry.id === id) - 1)] ?? nextVisibleEntries[0];
    if (!nextActive) return;
    setRotationEntries(nextEntries);
    if (id === activeRotationId) {
      setActiveRotationId(nextActive.id);
      void activateCalculatedRotation(nextActive.id, nextActive.rotation);
    }
    if (id === editingRotationId) {
      setEditingRotationId(nextActive.id);
      setRotation(JSON.parse(JSON.stringify(nextActive.rotation)) as RotationRecord);
      setStartAnchor(nextActive.rotation.start ? { rowId: `rotation-${nextActive.rotation.start.step}`, actionIndex: nextActive.rotation.start.action } : { rowId: "rotation-0" });
    }
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
    sessionStorage.setItem("wwm-active-rotation-session-v1", id === activeRotationId ? nextActive.id : activeRotationId);
  }

  function currentRotationEntries() {
    const current = migrateRotation(rotation);
    return rotationEntries.map((entry) => entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: current } : entry);
  }

  function exportRotations() {
    const entries = currentRotationEntries();
    const exportedCount = entries.filter((entry) => !entry.isDefault).length;
    const blob = new Blob([exportRotationEntries(entries)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `where-builds-meet-rotations-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
    setTransferStatus({ message: `Exported ${exportedCount} rotations.` });
  }

  async function importRotations(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const result = mergeImportedRotationEntries(currentRotationEntries(), JSON.parse(await file.text()) as unknown);
      const migratedEntries = result.entries.map((entry) => result.importedIds.includes(entry.id) ? { ...entry, rotation: migrateRotation(entry.rotation) } : entry);
      setRotationEntries(migratedEntries);
      persistRotationEntries(migratedEntries);
      const importedEntry = migratedEntries.find((entry) => entry.id === result.importedIds[0]);
      if (importedEntry) {
        setEditingRotationId(importedEntry.id);
        setRotation(JSON.parse(JSON.stringify(importedEntry.rotation)) as RotationRecord);
        setStartAnchor(importedEntry.rotation.start ? { rowId: `rotation-${importedEntry.rotation.start.step}`, actionIndex: importedEntry.rotation.start.action } : { rowId: "rotation-0" });
        setEventTimeDrafts({});
        setEventDurationDrafts({});
        setEditingName(false);
        setStatus("");
        setError("");
      }
      setTransferStatus({ message: `Imported ${result.importedCount} rotations.` });
    } catch (error) {
      setTransferStatus({ message: error instanceof Error ? error.message : "The rotation file could not be imported.", error: true });
    }
  }

  const currentCachedResult = rotationResults[editingRotationId]?.result;
  const timeline = currentCachedResult?.timeline ?? [];
  const anchorTime = currentCachedResult?.anchorTime ?? 0;
  useLayoutEffect(() => {
    const scrollContainer = rotationScrollRef.current;
    const pendingScroll = pendingEventScrollRef.current;
    if (scrollContainer && pendingScroll) {
      const row = scrollContainer.querySelector<HTMLElement>(`[data-rotation-step-index="${pendingScroll.stepIndex}"]`);
      if (row) {
        const currentTop = row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top;
        scrollContainer.scrollTop += currentTop - pendingScroll.top;
        pendingEventScrollRef.current = null;
      }
    }
    const pendingFocus = pendingSkillFocusRef.current;
    if (scrollContainer && pendingFocus !== null) {
      const select = scrollContainer.querySelector<HTMLSelectElement>(`select[data-rotation-step-index="${pendingFocus}"]`);
      if (select) {
        select.focus({ preventScroll: true });
        select.scrollIntoView({ block: "nearest" });
        pendingSkillFocusRef.current = null;
      }
    }
  }, [timeline]);
  const workerActionBreakdowns = currentCachedResult?.actionBreakdowns ?? {};
  const displayTime = (time: number) => time - anchorTime;
  const calculateTimelineActionBreakdown = (row: TimelineRow, actionIndex: number): DamageBreakdown => workerActionBreakdowns[`${row.id}:${actionIndex}`] ?? { physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total: 0 };
  const skillExpansionKey = (rowId: string) => `${editingRotationId}:${rowId}`;
  const skillActionsExpanded = (rowId: string) => expandedSkillRows.has(skillExpansionKey(rowId));
  const toggleSkillActions = (rowId: string) => setExpandedSkillRows((current) => {
    const next = new Set(current);
    const key = skillExpansionKey(rowId);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });
  const timelineRowsById = new Map(timeline.map((row) => [row.id, row]));
  const attachmentTargets = timeline.filter((row) => row.kind === "rotation" && row.step.type === "skill" && !row.skipped).flatMap((skillRow) => {
    const skillStepIndex = skillRow.rotationIndex ?? -1;
    const targets: Array<{ skillRowId: string; skillStepIndex: number; target: AttachedEventTarget; time: number; order: number }> = [
      { skillRowId: skillRow.id, skillStepIndex, target: { action: "start" }, time: skillRow.startTime, order: skillRow.order },
    ];
    skillRow.actions.forEach((action, actionIndex) => {
      if (action.type === "damage") targets.push({ skillRowId: skillRow.id, skillStepIndex, target: { action: actionIndex }, time: skillRow.startTime + Number(action.time ?? 0), order: skillRow.order + 10 + actionIndex });
    });
    const usedTriggeredRows = new Set<string>();
    let triggerOrdinal = 0;
    skillRow.actions.forEach((action) => {
      if (action.type !== "trigger" || typeof action.value !== "string") return;
      const triggeredRow = timeline.find((candidate) => candidate.kind === "trigger" && candidate.sourceRowId === skillRow.id && candidate.step.type === "skill" && candidate.step.skill === action.value && !usedTriggeredRows.has(candidate.id));
      if (triggeredRow) {
        usedTriggeredRows.add(triggeredRow.id);
        triggeredRow.actions.forEach((triggeredAction, actionIndex) => {
          if (triggeredAction.type === "damage") targets.push({ skillRowId: skillRow.id, skillStepIndex, target: { trigger: triggerOrdinal, action: actionIndex }, time: triggeredRow.startTime + Number(triggeredAction.time ?? 0), order: triggeredRow.order + 10 + actionIndex });
        });
      }
      triggerOrdinal += 1;
    });
    return targets;
  }).sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order);
  const derivedSourceExpanded = (row: TimelineRow) => {
    if (row.kind === "rotation") return false;
    const sourceRow = row.sourceRowId ? timelineRowsById.get(row.sourceRowId) : undefined;
    return Boolean(sourceRow && (sourceRow.step.type !== "skill" || skillActionsExpanded(sourceRow.id)));
  };
  const displayEntries = timeline.flatMap((row) => {
    if (row.skipped) return [];
    const entries: Array<{ row: TimelineRow; kind: "skill" | "action"; time: number; order: number; actionIndex?: number }> = [];
    const derivedActionsVisible = derivedSourceExpanded(row);
    if (row.kind === "rotation") entries.push({ row, kind: "skill", time: row.startTime, order: row.order });
    row.actions.forEach((action, actionIndex) => {
      const isStartingAction = startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex;
      const actionsVisible = row.kind !== "rotation" && derivedActionsVisible || row.step.type !== "skill" || skillActionsExpanded(row.id) || isStartingAction;
      if (action.type === "damage" && actionsVisible) entries.push({ row, kind: "action", actionIndex, time: row.startTime + (typeof action.time === "number" ? action.time : 0), order: row.order + 10 + actionIndex });
    });
    return entries;
  }).sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order);
  const totalRotationTime = currentCachedResult?.duration ?? 0;
  const readableRotation = readableRotationText(timeline, startAnchor, anchorTime);
  const totalRotationDamage = currentCachedResult?.metrics.totalDamage ?? 0;
  const rotationDps = currentCachedResult?.metrics.dps ?? 0;
  const applyPriorityStatLine = (key: keyof CharacterStats, amount: number) => {
    return { ...characterStats, [key]: characterStats[key] + amount };
  };
  const priorityCharacter = Object.fromEntries(Object.entries(statPriorityLines.character).filter(([key]) => characterStatAvailableForSettings(key as keyof CharacterStats, settings))) as Partial<Record<keyof CharacterStats, number>>;
  const priorityAttunement = Object.keys(attunementData).filter((key) => attunementAvailableForSettings(key, loadSelectedPath(), settings)).flatMap((key) => {
    const amount = maxGearRoll(key, "attunement");
    return typeof amount === "number" ? [[key, amount] as const] : [];
  });
  const selectedInnerWays = loadInnerWays().filter((row) => row.innerWay && innerWayAvailableForPath(row.innerWay));
  const currentGearSets = buildSetup.gearSets;
  const priorityStats: RotationPriority[] = [];
  const priorityAttunementRows: RotationPriority[] = [];
  const priorityInnerWays: RotationPriority[] = [];
  const setupComparisons: Record<string, RotationPriority[]> = {};
  function openReadableRotation() {
    setReadableCopyStatus("");
    setReadableDialogOpen(true);
  }
  async function copyReadableRotation() {
    try {
      if (navigator.clipboard?.writeText) await navigator.clipboard.writeText(readableRotation);
      else {
        readableTextRef.current?.focus();
        readableTextRef.current?.select();
        if (!document.execCommand("copy")) throw new Error("Copy is unavailable");
      }
      setReadableCopyStatus("Copied");
    } catch {
      readableTextRef.current?.focus();
      readableTextRef.current?.select();
      setReadableCopyStatus("Select the text and copy it manually.");
    }
  }
  const makeTimelineInput = (rotationRecord: RotationRecord, conditions = innerWayConditions, rules = innerWayEffectRules, setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup), globalDebuffs = currentGlobalDebuffs): TimelineBuildInput => ({
    rotation: rotationRecord,
    skills: Object.assign({}, ...Object.values(defaultSkillMaps)),
    eventDefinitions: rotationEventDefinitions,
    dots: mysticDots as Record<string, SkillRecord>,
    effectDefinitions,
    innerWayConditions: [...conditions],
    innerWayRules: rules,
    setupEffects,
    weapons: settings.weapons,
    initialDebuffs: globalDebuffTimelineEffects(globalDebuffs),
  });
  function calculationBundleFor(rotationRecord: RotationRecord, includeDiffs: boolean): RotationSimulationBundle {
    const rotationAnchor = rotationRecord.start ? { rowId: `rotation-${rotationRecord.start.step}`, actionIndex: rotationRecord.start.action } : { rowId: "rotation-0" };
    return {
    timeline: makeTimelineInput(rotationRecord),
    startAnchor: rotationAnchor,
    stats: characterStats,
    attunement: attunementStats,
    enemy,
    derivedStats,
    weapons: settings.weapons,
    statPriority: includeDiffs ? Object.entries(priorityCharacter).map(([key, amount]) => {
      const variantStats = applyPriorityStatLine(key as keyof CharacterStats, Number(amount));
      const definition = allStatDefinitions.find((candidate) => candidate.key === key);
      return { label: definition?.label ?? key, maxRoll: Number(amount) * (definition?.unit === "%" ? 100 : 1), stats: variantStats };
    }) : [],
    attunementPriority: includeDiffs ? priorityAttunement.map(([key, amount]) => {
      const variantAttunement = { ...attunementStats, [key]: attunementStats[key as keyof AttunementStats] + Number(amount) };
      return { label: attunementData[key]?.name ?? key, maxRoll: Number(amount) * (percentageAttunementKeys.has(key as keyof AttunementStats) ? 100 : 1), attunement: variantAttunement };
    }) : [],
    innerWayPriority: includeDiffs ? selectedInnerWays.map((selected) => {
      const variantRules = innerWayEffectRules.filter((rule) => rule.source !== selected.innerWay);
      const variantConditions = loadInnerWayConditions(selected.innerWay);
      return { label: innerWayDefinitions[selected.innerWay as keyof typeof innerWayDefinitions]?.name ?? selected.innerWay, timeline: makeTimelineInput(rotationRecord, variantConditions, variantRules), innerWayRules: variantRules, innerWayConditions: [...variantConditions] };
    }) : [],
    setupComparisons: includeDiffs ? {
      arsenal: Object.keys(typedArsenalDefinitions).map((value) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { arsenal: value }) })),
      bowRingSet: Object.keys(typedBowRingSetDefinitions).map((value) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { bowRingSet: value }) })),
      food: Object.keys(typedFoodDefinitions).map((value) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { food: value }) })),
      divinecraft: Object.entries(typedDivinecraftDefinitions).filter(([, definition]) => definition.available !== false).map(([value]) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { divinecraft: value }) })),
      ...Object.fromEntries(globalDebuffRows.map(({ key }) => [`debuff:${key}`, [false, true].map((enabled) => {
        const globalDebuffs = { ...currentGlobalDebuffs, [key]: enabled };
        return { label: enabled ? "on" : "off", timeline: makeTimelineInput(rotationRecord, innerWayConditions, innerWayEffectRules, selectedSetupEffects(settings, gearStatEffect, buildSetup), globalDebuffs) };
      })])),
      "debuff:qingyisCharm": (["none", "T1", "T6"] as const).map((value) => {
        const globalDebuffs = { ...currentGlobalDebuffs, qingyisCharm: value };
        return { label: value, timeline: makeTimelineInput(rotationRecord, innerWayConditions, innerWayEffectRules, selectedSetupEffects(settings, gearStatEffect, buildSetup), globalDebuffs) };
      }),
      "gear:Cleftpeak": [0, 2, 4].filter((tier) => tier > currentGearSets.Cleftpeak).map((tier) => {
        const setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, { gearSets: { Cleftpeak: tier as 0 | 2 | 4, RainWhisper: Math.min(currentGearSets.RainWhisper, 4 - tier) as 0 | 2 | 4 } });
        return { label: String(tier), setupEffects, timeline: makeTimelineInput(rotationRecord, innerWayConditions, innerWayEffectRules, setupEffects) };
      }),
      "gear:RainWhisper": [0, 2, 4].filter((tier) => tier > currentGearSets.RainWhisper).map((tier) => {
        const setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, { gearSets: { Cleftpeak: Math.min(currentGearSets.Cleftpeak, 4 - tier) as 0 | 2 | 4, RainWhisper: tier as 0 | 2 | 4 } });
        return { label: String(tier), setupEffects, timeline: makeTimelineInput(rotationRecord, innerWayConditions, innerWayEffectRules, setupEffects) };
      }),
    } : ({} as Record<string, RotationSimulationVariant[]>),
    };
  }

  useEffect(() => {
    const activeRotation = activeRotationId === editingRotationId
      ? rotation
      : rotationEntries.find((entry) => entry.id === activeRotationId)?.rotation;
    if (activeRotation) onActiveSimulationBundleChange(calculationBundleFor(activeRotation, false), activeRotation.name || "Active rotation", `${activeRotationId}:${calculationContextKey}:${JSON.stringify(activeRotation)}`);
  }, [activeRotationId, editingRotationId, rotation, rotationEntries, calculationContextKey, onActiveSimulationBundleChange]);

  const resultKeyFor = (id: string, rotationRecord: RotationRecord, contextKey = calculationContextKey) => `${id}:${contextKey}:${JSON.stringify(rotationRecord)}`;
  const workerCacheKeyFor = (resultKey: string) => `rotation:${resultKey}`;

  function storeBaselineResult(id: string, key: string, result: RotationSimulationResult) {
    const next = { ...rotationResultsRef.current, [id]: { key, result } };
    rotationResultsRef.current = next;
    setRotationResults(next);
  }

  async function calculateBaselineForRotation(id: string, rotationRecord: RotationRecord, priority = 100, force = false) {
    const contextKey = calculationContextKey;
    const resultKey = resultKeyFor(id, rotationRecord, contextKey);
    const cached = rotationResultsRef.current[id];
    if (!force && cached?.key === resultKey) return cached.result;
    const result = await requestRotationBaseline(calculationBundleFor(rotationRecord, false), workerCacheKeyFor(resultKey), { key: `baseline:${id}`, priority });
    storeBaselineResult(id, resultKey, result);
    return result;
  }

  async function calculateDiffsForRotation(id: string, rotationRecord: RotationRecord, forceBaseline = false) {
    const requestSequence = ++diffRequestSequenceRef.current;
    publishRotationRecalculating(true);
    const contextKey = calculationContextKey;
    const resultKey = resultKeyFor(id, rotationRecord, contextKey);
    const baselinePromise = calculateBaselineForRotation(id, rotationRecord, 400, forceBaseline);
    const comparisonsPromise = requestRotationComparisons(calculationBundleFor(rotationRecord, true), workerCacheKeyFor(resultKey), { key: `diff:${id}`, priority: 350 });
    try {
      await baselinePromise;
      const metrics = await comparisonsPromise;
      if (calculationContextKeyRef.current !== contextKey) {
        if (diffRequestSequenceRef.current === requestSequence) publishRotationRecalculating(false);
        return;
      }
      setDiffResult({ key: resultKey, rotationId: id, requestSequence, metrics });
    } catch {
      void comparisonsPromise.catch(() => {});
      if (diffRequestSequenceRef.current === requestSequence) publishRotationRecalculating(false);
      // A newer keyed request superseded this calculation.
    }
  }

  async function activateCalculatedRotation(id: string, rotationRecord: RotationRecord) {
    await calculateDiffsForRotation(id, rotationRecord);
  }

  const localRotationCalculation: RotationMetrics = { totalDamage: totalRotationDamage, dps: rotationDps, breakdown: currentCachedResult?.metrics.breakdown ?? emptyRotationBreakdown(), statPriority: priorityStats, attunementPriority: priorityAttunementRows, innerWayPriority: priorityInnerWays, setupComparisons };
  const rotationCalculation = currentCachedResult?.metrics ?? localRotationCalculation;
  const refreshContextRef = useRef<string | null>(null);
  useEffect(() => {
    const contextChanged = refreshContextRef.current !== calculationContextKey;
    refreshContextRef.current = calculationContextKey;
    if (!contextChanged) {
      const editPriority = editingRotationId === activeRotationId ? 400 : 200;
      void calculateBaselineForRotation(editingRotationId, rotation, editPriority).catch(() => {});
      return;
    }
    const entries = rotationEntries.map((entry) => entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: migrateRotation(rotation) } : entry).filter((entry) => rotationAvailableForWeapons(entry, settings.weapons));
    const activeEntry = entries.find((entry) => entry.id === activeRotationId) ?? entries[0];
    if (!activeEntry) return;
    void (async () => {
      await calculateDiffsForRotation(activeEntry.id, activeEntry.rotation, true);
      if (calculationContextKeyRef.current !== calculationContextKey) return;
      for (const entry of entries) {
        if (entry.id === activeEntry.id) continue;
        try { await calculateBaselineForRotation(entry.id, entry.rotation, 100, true); } catch { /* Superseded by newer work. */ }
      }
    })();
  }, [calculationContextKey, rotationStateKey]);
  useEffect(() => {
    if (!diffResult || diffResult.rotationId !== activeRotationId) return;
    const activeRecord = activeRotationId === editingRotationId ? rotation : rotationEntries.find((entry) => entry.id === activeRotationId)?.rotation;
    if (!activeRecord || diffResult.key !== resultKeyFor(activeRotationId, activeRecord)) return;
    onMetricsChange(diffResult.metrics, true);
    if (diffRequestSequenceRef.current === diffResult.requestSequence) publishRotationRecalculating(false);
  }, [diffResult, activeRotationId, editingRotationId, rotation, rotationEntries]);
  return <section className="panel rotation-editor-panel"><div className="rotation-editor-layout">
    <aside className="rotation-list">
      <div className="rotation-list-heading"><span>Rotations</span><button className="icon-button" type="button" aria-label="Add rotation" onClick={addRotation}>＋</button></div>
      <div className="rotation-list-entries">{visibleRotationEntries.map((entry) => <div className={`rotation-list-item ${entry.id === activeRotationId ? "active" : ""} ${entry.id === editingRotationId ? "editing" : ""}`} key={entry.id} role="button" tabIndex={0} onClick={() => editRotation(entry.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") editRotation(entry.id); }}><strong>{entry.id === activeRotationId && <span className="active-rotation-icon" title="Active rotation">●</span>}{entry.rotation.name || "Unnamed Rotation"}</strong>{!entry.isDefault && <span className="rotation-list-actions"><button className="rotation-remove-button" type="button" aria-label={`Remove ${entry.rotation.name || "rotation"}`} title="Remove rotation" disabled={visibleRotationEntries.length <= 1} onClick={(event) => { event.stopPropagation(); removeRotation(entry.id); }}>×</button></span>}</div>)}</div>
      <div className="rotation-transfer-actions"><div><button className="button button-secondary button-small" type="button" onClick={exportRotations}>Export</button><label className="button button-secondary button-small rotation-import-button">Import<input type="file" accept="application/json,.json" aria-label="Import rotations" onChange={importRotations} /></label></div>{transferStatus && <p className={transferStatus.error ? "error" : ""} role={transferStatus.error ? "alert" : "status"}>{transferStatus.message}</p>}</div>
    </aside>
    {editingEntry ? <div className="rotation-editor-content">
    <div className="skill-detail-heading"><div>{editingName && !rotationLocked ? <input className="rotation-name-input" autoFocus value={rotation.name} onChange={(event) => setRotation({ ...rotation, name: event.target.value })} onBlur={() => setEditingName(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingName(false); }} /> : <h3>{rotation.name || "Unnamed Rotation"}{!rotationLocked && <button className="icon-button" type="button" aria-label="Edit rotation name" onClick={() => setEditingName(true)}>✎</button>}</h3>}{rotationLocked && <p className="rotation-default-note">This is a prebuilt default rotation and cannot be changed. Duplicate it to edit.</p>}</div><div className="detail-active-actions">{status && <span className="editor-status">{status}</span>}<button className="button button-small detail-active-button" type="button" disabled={editingRotationId === activeRotationId} onClick={() => activateRotation(editingRotationId)}>{editingRotationId === activeRotationId ? "Active" : "Make Active"}</button></div></div>
    <div className="rotation-toolbar"><span className="rotation-toolbar-actions"><button className="button button-secondary button-small" type="button" disabled={!readableRotation} onClick={openReadableRotation}>Readable Format</button></span><span>{rotation.steps.filter((step) => step.type === "skill").length} steps · {formatNumber(totalRotationTime)}s total time</span><span className="rotation-results"><span>Total Damage: {formatNumber(rotationCalculation.totalDamage)}</span><span>DPS: {formatNumber(rotationCalculation.dps)}</span></span></div>
    <div className="rotation-scroll-content" ref={rotationScrollRef}><div className="rotation-table">
      <div className="rotation-table-header"><span></span><span>#</span><span>Start Time</span><span>Cast Time</span><span>Skill</span><span>Distance</span><span className="rotation-damage-heading">Damage</span><span>Buff</span><span>Debuff</span><span>Actions</span></div>
      <div className="rotation-step-list">
        {displayEntries.map((entry, index) => {
          const row = entry.row;
          const isAction = entry.kind === "action";
          const { step, startTime, skill, actions } = row;
          const castTime = row.effectiveCastTime;
          const effectNames = (effects: Array<{ name: string; stack?: number; maxStack?: number }>) => effects.length === 0 ? "" : <span className="effect-plates">{effects.map((effect) => { const definition = effectDefinitions[effect.name]; const label = `${definition?.name ?? effect.name}${effect.stack && (effect.maxStack === undefined || effect.maxStack > 1) ? ` ×${effect.stack}` : ""}`; return <span className="effect-plate" title={definition?.description ?? ""} key={`${effect.name}-${effect.stack ?? 1}`}>{label}</span>; })}</span>;
          const actionIndex = entry.actionIndex;
          const actionTime = entry.time;
          const isManualEvent = step.type === "event";
          const attachedTarget = attachedTargetForStep(step);
          const isAttachedEvent = Boolean(attachedTarget);
          const availableAttachmentTargets = step.type === "event" && step.event === "Exhausted" ? attachmentTargets.filter((target) => target.target.action !== "start") : attachmentTargets;
          const attachedTargetIndex = attachedTarget ? availableAttachmentTargets.findIndex((target) => target.skillRowId === row.sourceRowId && target.target.action === attachedTarget.action && target.target.trigger === attachedTarget.trigger) : -1;
          const stepSkill = step.type === "skill" ? step.skill : undefined;
          const actionsExpanded = skillActionsExpanded(row.id);
          const actionState = actionIndex === undefined ? undefined : row.actionStates[actionIndex] ?? { buffs: row.buffs, debuffs: row.debuffs, distance: row.distance };
          const actionBuffs = actionState?.buffs.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > actionTime) ?? [];
          const actionDebuffs = actionState?.debuffs.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > actionTime) ?? [];
          const skillDamageRows = row.kind === "rotation" ? [row, ...timeline.filter((candidate) => candidate.kind !== "rotation" && candidate.sourceRowId === row.id)] : [row];
          const skillBreakdown = skillDamageRows.reduce<DamageBreakdown>((skillTotal, damageRow) => damageRow.actions.reduce<DamageBreakdown>((total, action, damageIndex) => {
            if (action.type !== "damage") return total;
            const breakdown = calculateTimelineActionBreakdown(damageRow, damageIndex);
            return { physical: total.physical + breakdown.physical, bellstrike: total.bellstrike + breakdown.bellstrike, stonesplit: total.stonesplit + breakdown.stonesplit, silkbind: total.silkbind + breakdown.silkbind, bamboocut: total.bamboocut + breakdown.bamboocut, total: total.total + breakdown.total };
          }, skillTotal), { physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total: 0 } as DamageBreakdown);
          return <div className="rotation-row-group" key={`${row.id}-${entry.kind}-${actionIndex ?? "skill"}`}>
            {!isAction && <div className={`rotation-table-row ${isManualEvent ? "rotation-event-row" : ""} ${isManualEvent && step.event === "Move" ? "rotation-move-event-row" : ""}`} data-rotation-step-index={row.rotationIndex}>
              {row.kind === "rotation" ? <button className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "active" : ""}`} type="button" aria-label="Set fight start here" disabled={rotationLocked} onClick={() => selectStart(row.rotationIndex ?? 0)}>{startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "→" : "•"}</button> : <span aria-hidden="true" />}
              <span className="rotation-index">{isManualEvent ? "" : row.rotationIndex}</span>
              {isManualEvent ? isAttachedEvent || rotationLocked ? <span>{formatNumber(displayTime(startTime))}s</span> : <input className="rotation-event-time" type="number" step="0.01" value={eventTimeDrafts[row.id] ?? formatNumber(displayTime(startTime))} onChange={(event) => setEventTimeDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onBlur={() => commitEventTime(row.id, row.rotationIndex ?? 0)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <span>{formatNumber(displayTime(startTime))}s</span>}
              {isAttachedEvent ? <span /> : isManualEvent && step.event === "Controlled" ? rotationLocked ? <span>{formatNumber(step.duration ?? 3)}s</span> : <input className="rotation-event-time" type="number" min="0" step="0.01" value={eventDurationDrafts[row.id] ?? String(step.duration ?? 3)} onChange={(event) => setEventDurationDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onBlur={() => commitEventDuration(row.id, row.rotationIndex ?? 0)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <span>{isManualEvent ? "" : row.kind === "rotation" ? `${formatNumber(castTime)}s` : "—"}</span>}
              {row.kind === "rotation" ? rotationLocked ? <span className="rotation-skill-name">{isManualEvent ? <span>{rotationEventDefinitions[step.event]?.name ?? step.event}</span> : <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />}</span> : <span className="rotation-skill-select-wrap"><RotationSkillName skill={isManualEvent ? rotationEventDefinitions[step.event] : skill} fallback={stepSkill ?? ""} /><select className="rotation-skill-select" data-rotation-step-index={row.rotationIndex} aria-label="Skill or event" value={isManualEvent ? `__event:${step.event}` : stepSkill ?? ""} onChange={(event) => selectRotationItem(row.rotationIndex ?? 0, event.target.value, event.currentTarget)}>{stepSkill && !rotationSkillIds.includes(stepSkill) && <option value={stepSkill} disabled>{skillDisplayName(findSkill(stepSkill), stepSkill)} (unavailable)</option>}{rotationSkillIds.map((id) => <option key={id} value={id}>{skillDisplayName(findSkill(id), id)}</option>)}{rotationEventOptionIds.map((id) => <option key={id} value={id}>{rotationEventDefinitions[id.slice(8)]?.name ?? id}</option>)}</select></span> : <span className="rotation-skill-name"><RotationSkillName skill={skill} fallback={stepSkill ?? ""} /></span>}
              {isManualEvent && step.event === "Move" ? rotationLocked ? <span>{step.distance}m</span> : <span className="rotation-distance-input-wrap"><input className="rotation-event-time" aria-label="Distance after move" type="number" min="1" step="1" value={eventDistanceDrafts[row.id] ?? String(step.distance)} onChange={(event) => setEventDistanceDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onBlur={() => commitEventDistance(row.id, row.rotationIndex ?? 0)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /><span>m</span></span> : <span>{formatNumber(row.distance)}m</span>}
              <span className="rotation-damage-value">{isManualEvent ? "" : step.type === "skill" && skillBreakdown.total > 0 ? <DamageBreakdownValue breakdown={skillBreakdown} /> : ""}</span>
              <span>{isManualEvent ? "" : effectNames(row.buffs)}</span>
              <span>{isManualEvent ? "" : effectNames(row.debuffs)}</span>
              <span className="rotation-controls">{isAttachedEvent && <><span className="rotation-control-placeholder" aria-hidden="true" /><button type="button" aria-label="Move event to previous action" disabled={rotationLocked || attachedTargetIndex <= 0} onClick={(event) => moveAttachedEvent(row.rotationIndex ?? 0, -1, event.currentTarget)}>↑</button><button type="button" aria-label="Move event to next action" disabled={rotationLocked || attachedTargetIndex < 0 || attachedTargetIndex >= availableAttachmentTargets.length - 1} onClick={(event) => moveAttachedEvent(row.rotationIndex ?? 0, 1, event.currentTarget)}>↓</button></>}{row.kind === "rotation" && !isManualEvent && <button className="rotation-expand-button" type="button" aria-label={`${actionsExpanded ? "Collapse" : "Expand"} ${skillDisplayName(skill, stepSkill ?? "skill")} actions`} aria-expanded={actionsExpanded} onClick={() => toggleSkillActions(row.id)}>{actionsExpanded ? "▾" : "▸"}</button>}{row.kind === "rotation" && !isManualEvent && <><button type="button" aria-label="Move up" disabled={rotationLocked || (row.rotationIndex ?? 0) === 0} onClick={() => moveStep(row.rotationIndex ?? 0, -1)}>↑</button><button type="button" aria-label="Move down" disabled={rotationLocked || (row.rotationIndex ?? 0) === rotation.steps.length - 1} onClick={() => moveStep(row.rotationIndex ?? 0, 1)}>↓</button></>} {row.kind === "rotation" && <><button type="button" aria-label="Delete step" disabled={rotationLocked} onClick={() => removeStep(row.rotationIndex ?? 0)}>×</button>{!isManualEvent && <button type="button" aria-label="Add step below" disabled={rotationLocked} onClick={() => addStepBelow(row.rotationIndex ?? 0)}>＋</button>}</>}{isAttachedEvent && <span className="rotation-control-placeholder" aria-hidden="true" />}</span>
            </div>
            }
            {isAction && (() => {
              const actionKey = `${row.id}:${actionIndex ?? 0}`;
              const actionCalculated = Object.prototype.hasOwnProperty.call(workerActionBreakdowns, actionKey);
              return <div className={`rotation-action-row ${row.kind === "trigger" ? "rotation-action-trigger" : row.kind === "dot" ? "rotation-action-dot" : ""}`}>
                {row.kind === "rotation" ? <button className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex ? "active" : ""}`} type="button" aria-label="Set fight start here" disabled={rotationLocked} onClick={() => selectStart(row.rotationIndex ?? 0, actionIndex)}>{startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex ? "→" : "•"}</button> : <span aria-hidden="true" />}
                <span className="rotation-action-time">{formatNumber(displayTime(actionTime))}s</span><span className="rotation-action-skill"><RotationSkillName skill={skill} fallback={stepSkill ?? ""} /></span><span className="rotation-action-distance">{formatNumber(actionState?.distance ?? row.distance)}m</span><span className="rotation-action-damage">{actionCalculated ? <DamageBreakdownValue breakdown={calculateTimelineActionBreakdown(row, actionIndex ?? 0)} /> : null}</span><span className="rotation-action-buff">{effectNames(actionBuffs)}</span><span className="rotation-action-debuff">{effectNames(actionDebuffs)}</span>
              </div>;
            })()}
          </div>;
        })}
      </div>
    </div>
    </div>
    {error && <p className="editor-error">{error}</p>}
    <div className="editor-actions"><button className="button button-secondary" type="button" onClick={duplicateRotation}>Duplicate</button>{!rotationLocked && <button className="button button-primary" type="button" onClick={save}>Save</button>}</div>
    </div> : <div className="rotation-editor-content"><p className="array-editor-empty">No rotations match the selected martial arts. Add a rotation to begin.</p></div>}
  </div>
  <dialog className="rotation-readable-dialog" ref={readableDialogRef} onClose={() => setReadableDialogOpen(false)}>
    <div className="rotation-readable-heading"><div><span className="detail-kicker">Readable Format</span><h3>{rotation.name || "Unnamed Rotation"}</h3></div><button className="icon-button" type="button" aria-label="Close readable rotation" onClick={() => readableDialogRef.current?.close()}>×</button></div>
    <p>Skills before the start use a rounded pre-fight countdown in 0.5-second increments.</p>
    <textarea ref={readableTextRef} readOnly value={readableRotation} aria-label="Readable rotation" onFocus={(event) => event.currentTarget.select()} />
    <div className="rotation-readable-actions"><span role="status">{readableCopyStatus}</span><button className="button button-secondary" type="button" onClick={() => readableDialogRef.current?.close()}>Close</button><button className="button button-primary" type="button" onClick={copyReadableRotation}>Copy</button></div>
  </dialog>
  </section>;
}

export default function App() {
  const [activeTab, setActiveTab] = useState<"main" | "build" | "breakdown" | "rotations" | "simulation" | "skills" | "settings">("main");
  const [activeSimulation, setActiveSimulation] = useState<{ bundle: RotationSimulationBundle; rotationName: string; bundleKey: string }>();
  const rotationMetrics = useSyncExternalStore(subscribeToRotationMetrics, getRotationMetrics, getRotationMetrics);
  const rotationRecalculating = useSyncExternalStore(subscribeToRotationRecalculating, getRotationRecalculating, getRotationRecalculating);
  const [innerWayRevision, setInnerWayRevision] = useState(0);
  const [statOverrides, setStatOverrides] = useState<CharacterStatOverrides>(loadStatOverrides);
  const [attunementOverrides, setAttunementOverrides] = useState<AttunementOverrides>(loadAttunementOverrides);
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>(loadCharacterProfiles);
  const [pathId, setPathId] = useState<PathId>(loadSelectedPath);
  const [settings, setSettings] = useState<CalculatorSettings>(() => settingsForPath(loadSettings(), pathId));
  const [buildState, setBuildState] = useState<BuildState>(loadBuildState);
  const enemy = typedEnemyProfiles[settings.enemy] ?? typedEnemyProfiles[defaultSettings.enemy];
  const availableBuildEntries = buildState.entries.filter((entry) => buildEntryAvailableForWeapons(entry, settings.weapons));
  const activeBuild = availableBuildEntries.find((entry) => entry.id === buildState.activeBuildId) ?? availableBuildEntries[0];
  const activeBuildSetup = useMemo(() => resolveBuildSetup(activeBuild), [activeBuild]);
  const [buildSetupOverrides, setBuildSetupOverrides] = useState<BuildSetupOverrides>(() => loadBuildSetupOverrides(activeBuildSetup));
  const buildSetup = useMemo<BuildSetup>(() => ({
    gearSets: { ...(buildSetupOverrides.gearSets ?? activeBuildSetup.gearSets) },
    bowRingSet: buildSetupOverrides.bowRingSet ?? activeBuildSetup.bowRingSet,
    arsenal: buildSetupOverrides.arsenal ?? activeBuildSetup.arsenal,
  }), [activeBuildSetup, buildSetupOverrides]);
  const activeGearInventory = useMemo(() => activeBuild ? resolveBuildInventory(activeBuild, buildState.gearItems) : { items: [], equipped: {} }, [activeBuild, buildState.gearItems]);
  const equippedGearEffects = useMemo(() => calculateEquippedGearEffects(activeGearInventory, settings.weapons, activeBuild?.isDefault !== true), [activeGearInventory, settings.weapons, activeBuild?.isDefault]);
  const gearStatEffect = useMemo<StatEffectContainer>(() => ({ stat: equippedGearEffects.stats }), [equippedGearEffects]);
  const globalStatState = useMemo(() => calculateGlobalStatState(statOverrides, settings, gearStatEffect, buildSetup), [statOverrides, settings, gearStatEffect, buildSetup, innerWayRevision]);
  const displayedStats = globalStatState.stats;
  const derivedStats = globalStatState.derivedStats;
  const displayedAttunementStats = useMemo(() => Object.fromEntries(Object.keys(defaultAttunementStats).map((key) => {
    const statKey = key as keyof AttunementStats;
    return [statKey, Object.prototype.hasOwnProperty.call(attunementOverrides, statKey)
      ? attunementOverrides[statKey]
      : equippedGearEffects.attunement[statKey] ?? 0];
  })) as AttunementStats, [attunementOverrides, equippedGearEffects]);
  const character = useMemo(() => ({ stats: displayedStats, rawStats: globalStatState.baseStats, attunementStats: displayedAttunementStats, settings, enemy, derivedStats, innerWayRevision, gearStatEffect, buildSetup }), [displayedStats, globalStatState.baseStats, displayedAttunementStats, settings, enemy, derivedStats, innerWayRevision, gearStatEffect, buildSetup]);
  const updateStatOverride = (key: keyof CharacterStats, value: number) => {
    setStatOverrides((current) => ({ ...current, [key]: value }));
  };
  const resetStatOverride = (key: keyof CharacterStats) => {
    setStatOverrides((current) => {
      const next = { ...current };
      delete next[key];
      return next;
    });
  };
  const updateAttunementOverride = (key: keyof AttunementStats, value: number) => setAttunementOverrides((current) => ({ ...current, [key]: value }));
  const resetAttunementOverride = (key: keyof AttunementStats) => setAttunementOverrides((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
  function updateBuildSetupOverride<K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) {
    setBuildSetupOverrides((current) => {
      if (!sameBuildSetupValue(key, value, activeBuildSetup[key])) return { ...current, [key]: value };
      const next = { ...current };
      delete next[key];
      return next;
    });
  }
  const resetBuildSetupOverride = (key: keyof BuildSetup) => setBuildSetupOverrides((current) => {
    const next = { ...current };
    delete next[key];
    return next;
  });
  const applyCharacterProfile = (profile?: CharacterProfile) => {
    setStatOverrides(profile ? { ...profile.statOverrides } : {});
    setAttunementOverrides(profile ? { ...profile.attunementOverrides } : {});
    if (!profile) {
      setBuildSetupOverrides({});
      return;
    }
    setBuildSetupOverrides({
      gearSets: { ...profile.buildSetup.gearSets },
      bowRingSet: profile.buildSetup.bowRingSet,
      arsenal: profile.buildSetup.arsenal,
    });
  };
  const handleRotationMetrics = (metrics: RotationMetrics, isActive: boolean) => {
    if (isActive) publishRotationMetrics(metrics);
  };
  const handleActiveSimulationBundle = useCallback((bundle: RotationSimulationBundle, rotationName: string, bundleKey: string) => setActiveSimulation({ bundle, rotationName, bundleKey }), []);
  const selectPath = (nextPathId: PathId) => {
    if (typedPathDefinitions[nextPathId].wip && !import.meta.env.DEV) return;
    sessionStorage.setItem(pathStorageKey, nextPathId);
    setPathId(nextPathId);
    setSettings((current) => settingsForPath(current, nextPathId));
    setInnerWayRevision((current) => current + 1);
  };

  useEffect(() => localStorage.setItem(statOverrideStorageKey, JSON.stringify(statOverrides)), [statOverrides]);
  useEffect(() => localStorage.setItem(characterProfileStorageKey, serializeCharacterProfiles(characterProfiles)), [characterProfiles]);
  useEffect(() => {
    if (activeBuild && activeBuild.id !== buildState.activeBuildId) setBuildState((current) => ({ ...current, activeBuildId: activeBuild.id }));
  }, [activeBuild, buildState.activeBuildId]);
  useEffect(() => localStorage.setItem(buildListStorageKey, serializeBuildState(buildState)), [buildState]);
  useEffect(() => localStorage.setItem(activeBuildStorageKey, buildState.activeBuildId), [buildState.activeBuildId]);
  useEffect(() => sessionStorage.setItem(attunementOverrideStorageKey, JSON.stringify(attunementOverrides)), [attunementOverrides]);
  useEffect(() => sessionStorage.setItem(buildSetupOverrideStorageKey, JSON.stringify(buildSetupOverrides)), [buildSetupOverrides]);
  useEffect(() => sessionStorage.setItem(settingsStorageKey, JSON.stringify(settings)), [settings]);
  useEffect(() => sessionStorage.setItem(pathStorageKey, pathId), [pathId]);

  return (
    <main className={`page-shell ${activeTab === "build" || activeTab === "rotations" ? "viewport-page-shell" : ""}`}>
      <header className="page-header">
        <div>
          <h1>Where Builds Meet</h1>
          <p className="intro">Build, simulate, and optimize for Where Winds Meet.</p>
        </div>
      </header>
      <section className="path-selector" aria-label="Combat path">
        <div className="path-selector-options">
          {(Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).map(([value, definition]) => <button className={pathId === value ? "selected" : ""} type="button" key={value} aria-pressed={pathId === value} disabled={definition.wip && !import.meta.env.DEV} onClick={() => selectPath(value)}>
            {definition.icon && <img src={`${import.meta.env.BASE_URL}paths/${definition.icon}`} alt="" />}
            <span>{definition.name}</span>
            {definition.wip && <small className="path-wip-badge">WIP</small>}
          </button>)}
        </div>
      </section>
      <nav className="main-tabs" aria-label="Main sections">
        <button className={activeTab === "main" ? "active" : ""} type="button" onClick={() => setActiveTab("main")}>Main</button>
        <button className={activeTab === "build" ? "active" : ""} type="button" onClick={() => setActiveTab("build")}>Build</button>
        <button className={activeTab === "breakdown" ? "active" : ""} type="button" onClick={() => setActiveTab("breakdown")}>DPS Breakdown</button>
        <button className={activeTab === "rotations" ? "active" : ""} type="button" onClick={() => setActiveTab("rotations")}>Rotation Editor</button>
        <button className={activeTab === "simulation" ? "active" : ""} type="button" onClick={() => setActiveTab("simulation")}>Simulation</button>
        <button className={activeTab === "skills" ? "active" : ""} type="button" onClick={() => setActiveTab("skills")}>Skill Editor</button>
        <button className={activeTab === "settings" ? "active" : ""} type="button" onClick={() => setActiveTab("settings")}>Settings</button>
      </nav>
      {activeTab === "main" ? <StatsTab character={character} pathId={pathId} statOverrides={statOverrides} attunementOverrides={attunementOverrides} characterProfiles={characterProfiles} buildSetupOverrides={buildSetupOverrides} onStatChange={updateStatOverride} onStatReset={resetStatOverride} onAttunementChange={updateAttunementOverride} onAttunementReset={resetAttunementOverride} onApplyCharacterProfile={applyCharacterProfile} onCharacterProfilesChange={setCharacterProfiles} onBuildSetupChange={updateBuildSetupOverride} onBuildSetupReset={resetBuildSetupOverride} rotationMetrics={rotationMetrics} rotationRecalculating={rotationRecalculating} activeBuildName={activeBuild?.name || "Unnamed Build"} activeRotationName={activeSimulation?.rotationName || "—"} onInnerWayChange={() => setInnerWayRevision((current) => current + 1)} /> : activeTab === "build" ? <div className="viewport-tab-content"><BuildTab weapons={settings.weapons} martialArtTags={settings.weapons.map((weapon) => martialArtDefinitions[weapon].tag)} pathTag={pathId === "mixed" ? undefined : typedPathDefinitions[pathId].tag} buildState={buildState} onBuildStateChange={setBuildState} /></div> : activeTab === "breakdown" ? <BreakdownTab metrics={rotationMetrics} /> : activeTab === "skills" ? <SkillEditorTab weapons={settings.weapons} /> : activeTab === "settings" ? <SettingsTab settings={settings} enemy={enemy} pathId={pathId} onSettingsChange={setSettings} /> : null}
      <div className={`viewport-tab-content ${activeTab === "rotations" ? "" : "tab-hidden"}`}><RotationEditorTab character={character} onMetricsChange={handleRotationMetrics} onActiveSimulationBundleChange={handleActiveSimulationBundle} /></div>
      <div className={activeTab === "simulation" ? "" : "tab-hidden"}><SimulationTab bundle={activeSimulation?.bundle} bundleKey={activeSimulation?.bundleKey} rotationName={activeSimulation?.rotationName} buildName={activeBuild?.name} /></div>
      <footer className="page-footer">
        <span>Author: greydust (WWM IGN) / greydust (Discord)</span>
        <a href="https://github.com/greydust/where-builds-meet" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </main>
  );
}
