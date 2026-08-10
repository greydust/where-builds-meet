import { useEffect, useMemo, useRef, useState, useSyncExternalStore, type ChangeEvent, type Dispatch, type SetStateAction } from "react";
import { type AttunementStats, type DamageBreakdown } from "./calculations/damage";
import BuildTab from "./BuildTab";
import { allStatDefinitions, combatStats, defenseStats, emptyStats, martialArtsStats } from "./data/statDefinitions";
import { activeBuildStorageKey, buildListStorageKey, calculateEquippedGearEffects, loadBuildState, normalizeBuildSetupOverrides, resolveBuildInventory, resolveBuildSetup, serializeBuildState, type BuildSetup, type BuildSetupOverrides, type BuildState } from "./gear";
import type { CharacterStats, EnemyProfile, StatDefinition, WeaponId } from "./types";
import type { DerivedStats } from "./calculations/effectiveStats";
import snowpartingSkills from "../data/skill/snowparting-blade.json";
import phalanxbaneSkills from "../data/skill/phalanxbane-blade.json";
import mysticSkills from "../data/skill/mystic.json";
import generalSkills from "../data/skill/general.json";
import dummyRotation from "../data/rotation/stonesplit-strength/dummy-1-min.json";
import mysticBuffs from "../data/buff/mystic.json";
import generalBuffs from "../data/buff/general.json";
import stonesplitStrengthBuffs from "../data/buff/stonesplit-strength.json";
import bamboocutWindBuffs from "../data/buff/bamboocut-wind.json";
import stonesplitStrengthDebuffs from "../data/debuff/stonesplit-strength.json";
import generalDebuffs from "../data/debuff/general.json";
import mysticDots from "../data/dot/mystic.json";
import enemyProfiles from "../data/enemy.json";
import frostCladNight from "../data/innerway/frost-clad-night.json";
import moraleChant from "../data/innerway/morale-chant.json";
import steadfastDevotion from "../data/innerway/steadfast-devotion.json";
import throatPiercingArt from "../data/innerway/throat-piercing-art.json";
import breakingPoint from "../data/innerway/breaking-point.json";
import statPriorityLines from "../data/stat-priority.json";
import systemStats from "../data/system.json";
import defaultSetup from "../data/default-setup.json";
import { emptyRotationBreakdown, getRotationMetrics, publishRotationMetrics, subscribeToRotationMetrics, type RotationGroupBreakdown, type RotationMetrics, type RotationPriority } from "./calculations/rotationMetrics";
import arsenalDefinitions from "../data/arsenal.json";
import bowRingSetDefinitions from "../data/bow-ring-set.json";
import gearSetDefinitions from "../data/gear-set.json";
import foodDefinitions from "../data/food.json";
import divinecraftDefinitions from "../data/divinecraft.json";
import snowpartingMartialArt from "../data/martial-art/snowparting-blade.json";
import phalanxbaneMartialArt from "../data/martial-art/phalanxbane-blade.json";
import { type RotationSimulationBundle } from "./calculations/rotationCalculator";
import { requestRotationSimulation } from "./calculations/rotationWorkerClient";
import { type EditableObject, type InnerWayEffectRule, type RotationRecord, type RotationStep, type SkillRecord, type TimelineBuildInput, type TimelineRow } from "./calculations/rotationTimeline";
import { calculateStatsWithOverrides, type CharacterStatOverrides, type EffectiveStatEffectContainer, type StatEffectContainer } from "./calculations/statEffects";
import { exportRotationEntries, mergeImportedRotationEntries, serializeRotationEntries, type RotationEntry } from "./rotationTransfer";
import { readableRotationText } from "./readableRotation";

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
const buildSetupOverrideStorageKey = "wwm-build-setup-overrides-v1";
const percentageStatKeys = new Set<keyof CharacterStats>(allStatDefinitions.filter(({ unit }) => unit === "%").map(({ key }) => key));

type SkillMap = Record<string, SkillRecord>;
type SkillCategory = "Snowparting" | "Phalanxbane" | "Mystic" | "General";
type SkillOverrides = Partial<Record<SkillCategory, SkillMap>>;
type CalculatorSettings = { weapons: [WeaponId, WeaponId]; enemy: string };
type DefaultSetup = {
  innerWays: Array<{ innerWay: string; tier: string }>;
  gearSets: { Cleftpeak: 0 | 2 | 4; RainWhisper: 0 | 2 | 4 };
  bowRingSet: string;
  arsenal: string;
  food: string;
  divinecraft: string;
};
const typedDefaultSetup = defaultSetup as DefaultSetup;

const defaultSkillMaps: Record<SkillCategory, SkillMap> = {
  Snowparting: snowpartingSkills as SkillMap,
  Phalanxbane: phalanxbaneSkills as SkillMap,
  Mystic: mysticSkills as SkillMap,
  General: generalSkills as SkillMap,
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
};
const innerWayDefinitions = {
  FrostCladNight: frostCladNight,
  MoraleChant: moraleChant,
  SteadfastDevotion: steadfastDevotion,
  ThroatPiercingArt: throatPiercingArt,
  BreakingPoint: breakingPoint,
};
const rotationStorageKey = "wwm-rotation-editor-session-v2";
const rotationListStorageKey = "wwm-rotation-list-session-v1";
const defaultRotationId = "dummy-1-min";
const allSkillDefinitions = Object.assign({}, ...Object.values(defaultSkillMaps)) as SkillMap;
const allSkillIds = (Object.keys(defaultSkillMaps) as SkillCategory[]).flatMap((category) => Object.keys(defaultSkillMaps[category]));
const rotationSkillIds = allSkillIds.filter((skillId) => !allSkillDefinitions[skillId]?.tags?.includes("Triggered"));
const rotationEventOptionIds = ["__event:Exhausted", "__event:Controlled"];
const dotDefinitions = mysticDots as Record<string, { duration?: number; maxStack?: number; tick?: number; action?: unknown[] }>;
const effectDefinitions = { ...mysticBuffs, ...generalBuffs, ...stonesplitStrengthBuffs, ...bamboocutWindBuffs, ...stonesplitStrengthDebuffs, ...generalDebuffs, ...dotDefinitions } as Record<string, { name?: string; description?: string; duration?: number; cooldown?: number; maxStack?: number; effect?: unknown[]; stackEffects?: unknown[][] }>;

function loadInnerWayConditions(excludedInnerWay?: string) {
  const conditions = new Set<string>();
  try {
    const saved = JSON.parse(sessionStorage.getItem(innerWayStorageKey) ?? "[]") as Array<{ innerWay?: unknown; tier?: unknown }>;
    for (const row of saved) {
      if (typeof row?.innerWay !== "string" || !row.innerWay || typeof row.tier !== "string") continue;
      if (row.innerWay === excludedInnerWay) continue;
      const tierNumber = Number(row.tier.slice(1));
      for (let tier = 0; tier <= tierNumber; tier += 1) conditions.add(`${row.innerWay}T${tier}`);
    }
  } catch {
    // A missing or malformed session selection simply provides no Inner Way conditions.
  }
  return conditions;
}

function loadInnerWayEffectRules(): InnerWayEffectRule[] {
  const selected = loadInnerWays();
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
  return { name: rotation.name, steps, start: rotation.start };
}

function migrateRotation(rotation: RotationRecord): RotationRecord {
  const migrated = normalizeRotation(rotation);
  if (migrated.steps[6]?.type === "skill" && migrated.steps[6].skill === "SnowpartingQ") migrated.steps[6] = { ...migrated.steps[6], skill: "SnowpartingQStab" };
  return migrated;
}

const defaultRotation = normalizeRotation(dummyRotation as RotationRecord);
const typedEnemyProfiles = enemyProfiles as Record<string, EnemyProfile>;
const defaultSettings: CalculatorSettings = { weapons: ["snowparting", "phalanxbane"], enemy: "level100" };

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
type GearSetDefinition = { name: string; options: Record<string, GearSetOption> };
const typedGearSetDefinitions = gearSetDefinitions as Record<string, GearSetDefinition>;
const typedFoodDefinitions = foodDefinitions as Record<string, ArsenalDefinition>;
type DivinecraftDefinition = ArsenalDefinition & { description: string; image: string; available?: boolean };
const typedDivinecraftDefinitions = divinecraftDefinitions as Record<string, DivinecraftDefinition>;
type MartialArtDefinition = { name: string; talent: Array<{ name: string; effect?: SetupEffect[] }> };
const martialArtDefinitions: Record<WeaponId, MartialArtDefinition> = {
  snowparting: snowpartingMartialArt as MartialArtDefinition,
  phalanxbane: phalanxbaneMartialArt as MartialArtDefinition,
};

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
  return settings.weapons.flatMap((weapon) => (martialArtDefinitions[weapon]?.talent ?? []).flatMap((talent) => talent.effect ?? []));
}

function selectedSetupEffects(settings: CalculatorSettings, gearStatEffect: StatEffectContainer, buildSetup: BuildSetup, overrides: Partial<BuildSetup> & { food?: string; divinecraft?: string } = {}) {
  const selectedBuildSetup = { ...buildSetup, ...overrides, gearSets: overrides.gearSets ?? buildSetup.gearSets };
  const foodEffect = overrides.food ? typedFoodDefinitions[overrides.food]?.effect ?? {} : selectedFoodEffect();
  const divinecraftEffect = divinecraftEffectFor(overrides.divinecraft ?? loadDivinecraft());
  return [...systemStatEffects, ...selectedMartialArtEffects(settings), arsenalEffectFor(selectedBuildSetup.arsenal), bowRingSetEffectFor(selectedBuildSetup.bowRingSet), ...gearSetEffectsFor(selectedBuildSetup.gearSets), foodEffect, divinecraftEffect, gearStatEffect];
}

function gearSetEffectsFor(selected: { Cleftpeak: number; RainWhisper: number }) {
  return Object.entries(selected).map(([setName, tier]) => typedGearSetDefinitions[setName]?.options[String(tier)]?.effect ?? {});
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
    const savedWeapons = Array.isArray(saved?.weapons) ? saved.weapons.filter((weapon): weapon is WeaponId => weapon === "snowparting" || weapon === "phalanxbane") : [];
    const legacyWeapon = saved && "weapon" in saved && saved.weapon === "phalanxbane" ? "phalanxbane" : "snowparting";
    const weapons: [WeaponId, WeaponId] = savedWeapons.length === 2 && savedWeapons[0] !== savedWeapons[1]
      ? [savedWeapons[0], savedWeapons[1]]
      : [legacyWeapon, legacyWeapon === "snowparting" ? "phalanxbane" : "snowparting"];
    return {
      weapons,
      enemy: typeof saved?.enemy === "string" && typedEnemyProfiles[saved.enemy] ? saved.enemy : defaultSettings.enemy,
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

const defaultAttunementStats = {
  physicalPenetration: 0,
  formlessPenetration: 0,
  phalanxbaneChargedBoost: 0,
  phalanxbaneMartialBoost: 0,
  snowpartingChargedBoost: 0,
  snowpartingVariedComboBoost: 0,
  snowpartingMartialBoost: 0,
} satisfies AttunementStats;
const percentageAttunementKeys = new Set<keyof AttunementStats>([
  "phalanxbaneChargedBoost",
  "phalanxbaneMartialBoost",
  "snowpartingChargedBoost",
  "snowpartingVariedComboBoost",
  "snowpartingMartialBoost",
]);
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
  const bundledDefault = (): RotationEntry => ({ id: defaultRotationId, rotation: JSON.parse(JSON.stringify(defaultRotation)) as RotationRecord, isDefault: true });
  try {
    const saved = JSON.parse(sessionStorage.getItem(rotationListStorageKey) ?? "null") as RotationEntry[] | null;
    const customEntries: RotationEntry[] = [];
    const usedIds = new Set([defaultRotationId]);
    const addCustom = (preferredId: string, rotation: RotationRecord) => {
      let id = preferredId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${preferredId}:${suffix++}`;
      usedIds.add(id);
      customEntries.push({ id, rotation });
    };
    const preserveFormerDefault = (rotation: RotationRecord) => {
      const migrated = migrateRotation(rotation);
      if (JSON.stringify(migrated) === JSON.stringify(defaultRotation)) return;
      addCustom("migrated-default-rotation", { ...migrated, name: `${migrated.name || defaultRotation.name} Copy` });
    };
    if (Array.isArray(saved)) {
      saved.forEach((entry) => {
        if (!entry || typeof entry.id !== "string" || !entry.id || !entry.rotation || !Array.isArray(entry.rotation.steps)) return;
        if (entry.isDefault === true || entry.id === defaultRotationId) preserveFormerDefault(entry.rotation);
        else addCustom(entry.id, migrateRotation(entry.rotation));
      });
      return [bundledDefault(), ...customEntries];
    }
    const legacy = JSON.parse(sessionStorage.getItem(rotationStorageKey) ?? "null") as RotationRecord | null;
    if (legacy && Array.isArray(legacy.steps)) preserveFormerDefault(legacy);
    return [bundledDefault(), ...customEntries];
  } catch {
    return [bundledDefault()];
  }
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
    <BreakdownGroupTable title="Skill Type Breakdown" rows={breakdown.categories} />
    <BreakdownGroupTable title="Physical and Attribute Breakdown" rows={breakdown.damageTypes} colored />
  </div>;
}

function DamageBreakdownValue({ breakdown, className = "" }: { breakdown: DamageBreakdown; className?: string }) {
  const parts: Array<[keyof DamageBreakdown, string]> = [["physical", "Physical"], ["bellstrike", "Bellstrike"], ["stonesplit", "Stonesplit"], ["silkbind", "Silkbind"], ["bamboocut", "Bamboocut"]];
  return <span className={`damage-breakdown-wrap ${className}`}><span>{formatNumber(breakdown.total)}</span><span className="damage-breakdown-tooltip">{parts.map(([key, label]) => <span className={`damage-breakdown-part damage-${key}`} key={key}><i>{label}</i>{formatNumber(breakdown[key] as number)}</span>)}</span></span>;
}

function StatsTab({ character, statOverrides, attunementOverrides, buildSetupOverrides, onStatChange, onStatReset, onAttunementChange, onAttunementReset, onBuildSetupChange, onBuildSetupReset, onResetAll, rotationMetrics, onInnerWayChange }: {
  character: CharacterState;
  statOverrides: CharacterStatOverrides;
  attunementOverrides: AttunementOverrides;
  buildSetupOverrides: BuildSetupOverrides;
  onStatChange: (key: keyof CharacterStats, value: number) => void;
  onStatReset: (key: keyof CharacterStats) => void;
  onAttunementChange: (key: keyof AttunementStats, value: number) => void;
  onAttunementReset: (key: keyof AttunementStats) => void;
  onBuildSetupChange: <K extends keyof BuildSetup>(key: K, value: BuildSetup[K]) => void;
  onBuildSetupReset: (key: keyof BuildSetup) => void;
  onResetAll: () => void;
  rotationMetrics?: RotationMetrics;
  onInnerWayChange: () => void;
}) {
  const { stats, derivedStats, attunementStats, buildSetup } = character;
  const [innerWays, setInnerWays] = useState(loadInnerWays);
  const [food, setFood] = useState(loadFood);
  const [divinecraft, setDivinecraft] = useState(loadDivinecraft);
  const [attunementDrafts, setAttunementDrafts] = useState<Partial<Record<keyof AttunementStats, string>>>({});

  useEffect(() => sessionStorage.setItem(innerWayStorageKey, JSON.stringify(innerWays)), [innerWays]);
  useEffect(() => sessionStorage.setItem(foodStorageKey, food), [food]);
  useEffect(() => sessionStorage.setItem(divinecraftStorageKey, divinecraft), [divinecraft]);

  const { arsenal, bowRingSet, gearSets } = buildSetup;

  function updateStat(key: keyof CharacterStats, value: number) {
    onStatChange(key, Number.isFinite(value) ? value : 0);
  }

  function reset() {
    setAttunementDrafts({});
    onResetAll();
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
  const penetrationRows = [[defenseStats[0], defenseStats[1]], [defenseStats[2], defenseStats[3]]];
  const innerWayOptions = [
    ["", "None"],
    ...Object.entries(innerWayDefinitions).map(([value, definition]) => [value, definition.name] as [string, string]),
  ];
  const attunementFields = [
    ["physicalPenetration", "Physical Penetration", ""],
    ["formlessPenetration", "Formless Penetration", ""],
    ["phalanxbaneChargedBoost", "Phalanxbane Blade - Charged Skill DMG Boost", "%"],
    ["phalanxbaneMartialBoost", "Phalanxbane Blade - Martial Art Skill DMG Boost", "%"],
    ["snowpartingChargedBoost", "Snowparting Blade - Charged Skill DMG Boost", "%"],
    ["snowpartingVariedComboBoost", "Snowparting Blade - Light/Heavy Attack Varied Combo DMG Boost", "%"],
    ["snowpartingMartialBoost", "Snowparting Blade - Martial Art Skill DMG Boost", "%"],
  ] as const;
  const setupStatus = (group: string, value: string, active: boolean) => {
    if (active) return <small className="setup-active-label">Active</small>;
    const comparison = rotationMetrics?.setupComparisons[group]?.find((row) => row.label === value);
    return comparison ? <small className={comparison.dpsDifference >= 0 ? "setup-positive-label" : "setup-negative-label"}>{comparison.dpsDifference >= 0 ? "+" : ""}{formatNumber(comparison.dpsDifference)} DPS ({comparison.increase >= 0 ? "+" : ""}{formatNumber(comparison.increase)}%)</small> : <small className="setup-inactive-label">—</small>;
  };

  return (
    <>
      <div className="app-layout">
        <div className="character-stats-column">
        <section className="panel stats-panel">
          <div className="panel-heading"><div><h2>Character Stats</h2></div><button className="button button-secondary" type="button" onClick={reset}>Reset</button></div>
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
            <div className="stat-row"><CalculatedStatField definition={defenseStats[11]} compact /><CalculatedStatField definition={defenseStats[12]} compact /></div>
            <div className="stat-row"><CalculatedStatField definition={defenseStats[15]} compact /><CalculatedStatField definition={defenseStats[16]} compact /></div>
          </div>
        </section>
        <section className="panel attunement-panel">
          <div className="panel-heading"><div><h2>Attunement Stats</h2></div></div>
          <div className="attunement-list">
            {attunementFields.map(([key, label, unit], index) => (
              <label className={`attunement-field ${index === 2 ? "attunement-section-start" : ""} ${Object.prototype.hasOwnProperty.call(attunementOverrides, key) ? "modified-field" : ""}`} key={key}>
                <span className="attunement-label"><span>{label}</span>{Object.prototype.hasOwnProperty.call(attunementOverrides, key) && <button className="stat-reset-button" type="button" aria-label={`Reset ${label}`} title="Reset to calculated value" onClick={(event) => { event.preventDefault(); resetAttunement(key); }}>↺</button>}</span>
                <span className="attunement-input-wrap"><input type="number" step="0.01" value={attunementDrafts[key] ?? formatNumber(unit ? attunementStats[key] * 100 : attunementStats[key])} onChange={(event) => setAttunementDrafts((current) => ({ ...current, [key]: event.target.value }))} onBlur={(event) => { if (attunementDrafts[key] !== undefined) commitAttunement(key, event.currentTarget.value); }} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} />{unit && <i>{unit}</i>}</span>
              </label>
            ))}
          </div>
        </section>
        </div>
        <section className="middle-stats-column">
          <section className="panel inner-way-panel">
            <div className="panel-heading"><div><h2>Inner Ways</h2></div></div>
            <div className="inner-way-list">
              {innerWays.map((row, index) => (
                <div className="inner-way-row" key={index}>
                  <select aria-label={`Inner way ${index + 1}`} value={row.innerWay} onChange={(event) => { const next = innerWays.map((item, itemIndex) => itemIndex === index ? { ...item, innerWay: event.target.value } : item); sessionStorage.setItem(innerWayStorageKey, JSON.stringify(next)); setInnerWays(next); onInnerWayChange(); }}>
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
              {Object.entries(typedGearSetDefinitions).map(([setName, definition]) => {
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
            <div className="setup-option-list setup-option-list-wide">{Object.entries(typedArsenalDefinitions).map(([value, definition]) => <button className={arsenal === value ? "selected" : ""} type="button" key={value} onClick={() => onBuildSetupChange("arsenal", value)}>{definition.name}<span>{setupStatus("arsenal", value, arsenal === value)}</span></button>)}</div>
          </section>
          <section className="panel setup-placeholder-panel"><div className="panel-heading"><div><h2>Food</h2></div></div><div className="setup-option-list setup-option-list-wide">{Object.entries(typedFoodDefinitions).map(([value, definition]) => <button className={food === value ? "selected" : ""} type="button" key={value} onClick={() => { setFood(value); sessionStorage.setItem(foodStorageKey, value); onInnerWayChange(); }}>{definition.name}<span>{setupStatus("food", value, food === value)}</span></button>)}</div></section>
          <section className="panel setup-placeholder-panel"><div className="panel-heading"><div><h2>Script</h2></div></div><p>Details will be added later.</p></section>
          <section className="panel setup-placeholder-panel divinecraft-panel">
            <div className="panel-heading"><div><h2>Divinecraft</h2></div></div>
            <div className="divinecraft-option-list">
              {Object.entries(typedDivinecraftDefinitions).map(([value, definition]) => {
                const available = definition.available !== false;
                return <button className={`divinecraft-option ${divinecraft === value ? "selected" : ""}`} type="button" key={value} disabled={!available} title={`${definition.name}: ${definition.description}${available ? "" : " Not available yet."}`} onClick={() => { setDivinecraft(value); sessionStorage.setItem(divinecraftStorageKey, value); onInnerWayChange(); }}>
                  <span className="divinecraft-image-frame"><img src={`${import.meta.env.BASE_URL}divinecraft/${definition.image}`} alt="" /></span>
                  <strong>{definition.name}</strong>
                  <span className="divinecraft-option-status">{available ? setupStatus("divinecraft", value, divinecraft === value) : <small>Not available yet</small>}</span>
                </button>;
              })}
            </div>
          </section>
        </section>
        <aside className="results-column">
          <section className="panel dps-panel"><div className="panel-heading"><div><h2>DPS</h2></div></div><div className="dps-value">{rotationMetrics ? formatNumber(rotationMetrics.dps) : "—"}</div></section>
          <PriorityPanel title="Stats Priority" rows={rotationMetrics?.statPriority ?? []} showMaxRoll />
          <PriorityPanel title="Attunement Stats Priority" rows={rotationMetrics?.attunementPriority ?? []} sectionBreakAt={2} showMaxRoll />
          <PriorityPanel title="Inner Ways Priority" rows={rotationMetrics?.innerWayPriority ?? []} />
        </aside>
      </div>
    </>
  );
}

function skillToDraft(skill: SkillRecord) {
  const { name = "", shortName = "", castTime = 0, action = [], modifier = [], tags = [] } = skill;
  const toObjects = (items: unknown[]) => items.map((item) => item && typeof item === "object" && !Array.isArray(item) ? item as EditableObject : {});
  return {
    name,
    shortName,
    castTime: String(castTime),
    tags: tags.join(", "),
    actionItems: toObjects(action),
    modifierItems: toObjects(modifier),
  };
}

const actionTypes = ["damage", "consume", "apply", "trigger", "extend", "clearCD"];
const conditionTargets = ["self", "target", "skillTag", "martialArt"];
const effectFields = ["castTimeModifier", "castTimeMultiplier", "baseDMGBonus", "hpDMGBonus", "dmgBonus", "SteadfastGuaranteedCrit", "enhanceDrunkenPoet"];
const booleanEffectFields = new Set(["SteadfastGuaranteedCrit", "enhanceDrunkenPoet"]);

function asNumber(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

function asString(value: unknown) {
  return typeof value === "string" ? value : "";
}

function itemSummary(item: string, index: number, kind: "action" | "modifier") {
  try {
    const parsed = JSON.parse(item) as EditableObject;
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
      <NumberField label="Stack" value={item.stack} onChange={(value) => set("stack", value)} />
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
      {booleanEffectFields.has(field) ? <label className="checkbox-field"><input type="checkbox" checked={value === true} onChange={(event) => updateEffect(field, event.target.checked)} /><span>{value === true ? "True" : "False"}</span></label> : <input type="number" value={typeof value === "number" ? value : ""} onChange={(event) => updateEffect(field, Number(event.target.value))} />}
      <button type="button" aria-label="Remove effect" onClick={() => removeEffect(field)}>×</button>
    </div>)}
  </div>;
}

function ArrayItemEditor({ label, kind, items, onChange, skillIds }: {
  label: string;
  kind: "action" | "modifier";
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
            <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={`${index}-${JSON.stringify(item).slice(0, 12)}`}>
              <div className="array-item-header">
                <button className="array-item-toggle" type="button" onClick={() => setExpanded(expanded === index ? null : index)}>{itemSummary(JSON.stringify(item), index, kind)}</button>
                <div className="array-item-controls">
                  <button type="button" aria-label="Move up" disabled={index === 0} onClick={() => moveItem(index, -1)}>↑</button>
                  <button type="button" aria-label="Move down" disabled={index === items.length - 1} onClick={() => moveItem(index, 1)}>↓</button>
                  <button type="button" aria-label="Delete" onClick={() => deleteItem(index)}>×</button>
                </div>
              </div>
              {expanded === index && <div className="array-item-detail">{kind === "action" ? <ActionDetails item={item} onChange={(next) => updateItem(index, next)} skillIds={skillIds} /> : <ModifierDetails item={item} onChange={(next) => updateItem(index, next)} />}</div>}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function SkillEditorTab() {
  const [category, setCategory] = useState<SkillCategory>("Snowparting");
  const [selectedSkill, setSelectedSkill] = useState(Object.keys(defaultSkillMaps.Snowparting)[0]);
  const [overrides, setOverrides] = useState<SkillOverrides>(loadSkillOverrides);
  const [draft, setDraft] = useState(() => skillToDraft(defaultSkillMaps.Snowparting[selectedSkill]));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const skills = useMemo(() => ({ ...defaultSkillMaps[category], ...(overrides[category] ?? {}) }), [category, overrides]);
  const skillIds = useMemo(() => Object.keys(skills), [skills]);

  useEffect(() => {
    const firstSkill = Object.keys(defaultSkillMaps[category])[0];
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
      const castTime = Number(draft.castTime);
      if (!Number.isFinite(castTime)) throw new Error("Cast time must be a number.");
      const updatedSkill: SkillRecord = {
        name: draft.name,
        ...(draft.shortName.trim() ? { shortName: draft.shortName.trim() } : {}),
        castTime,
        action,
        modifier,
        tags: draft.tags.split(",").map((tag) => tag.trim()).filter(Boolean),
      };
      const nextOverrides: SkillOverrides = {
        ...overrides,
        [category]: { ...(overrides[category] ?? {}), [selectedSkill]: updatedSkill },
      };
      setOverrides(nextOverrides);
      sessionStorage.setItem(skillStorageKey, JSON.stringify(nextOverrides));
      setStatus("Saved for this session");
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "Could not save this skill.");
      setStatus("");
    }
  }

  function restoreDefault() {
    const nextCategoryOverrides = { ...(overrides[category] ?? {}) };
    delete nextCategoryOverrides[selectedSkill];
    const nextOverrides: SkillOverrides = { ...overrides, [category]: nextCategoryOverrides };
    setOverrides(nextOverrides);
    sessionStorage.setItem(skillStorageKey, JSON.stringify(nextOverrides));
    setDraft(skillToDraft(defaultSkillMaps[category][selectedSkill]));
    setError("");
    setStatus("");
  }

  return (
    <>
      <section className="panel skill-editor-panel">
        <div className="skill-category-tabs" role="tablist" aria-label="Skill categories">
          {(Object.keys(defaultSkillMaps) as SkillCategory[]).map((item) => (
            <button key={item} className={`category-tab ${category === item ? "active" : ""}`} type="button" onClick={() => setCategory(item)}>{item === "Snowparting" ? "Snowparting Blade" : item === "Phalanxbane" ? "Phalanxbane Blade" : item}</button>
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
            <div className="skill-basic-fields">
              <label className="editor-field"><span>Name</span><input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label className="editor-field"><span>Short Name</span><input value={draft.shortName} onChange={(event) => setDraft({ ...draft, shortName: event.target.value })} /></label>
              <label className="editor-field"><span>Cast Time</span><input type="number" min="0" step="0.0001" value={draft.castTime} onChange={(event) => setDraft({ ...draft, castTime: event.target.value })} /></label>
              <label className="editor-field editor-field-wide"><span>Tags <small>(comma separated)</small></span><input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} /></label>
            </div>
            <div className="json-editor-grid">
              <ArrayItemEditor label="Actions" kind="action" items={draft.actionItems} onChange={(actionItems) => setDraft({ ...draft, actionItems })} skillIds={skillIds} />
              <ArrayItemEditor label="Modifiers" kind="modifier" items={draft.modifierItems} onChange={(modifierItems) => setDraft({ ...draft, modifierItems })} skillIds={skillIds} />
            </div>
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

function SettingsTab({ settings, enemy, onSettingsChange }: {
  settings: CalculatorSettings;
  enemy: EnemyProfile;
  onSettingsChange: Dispatch<SetStateAction<CalculatorSettings>>;
}) {

  return <section className="panel settings-panel">
    <div className="panel-heading"><div><h2>Settings</h2><p>Choose the weapon and enemy profile used by the calculator.</p></div></div>
    <div className="settings-fields">
      <div className="settings-weapon-row">
        {settings.weapons.map((weapon, index) => <label className="editor-field" key={index}><span>Weapon {index + 1}</span><select value={weapon} onChange={(event) => onSettingsChange((current) => {
          const nextWeapon = event.target.value as WeaponId;
          const weapons: [WeaponId, WeaponId] = [...current.weapons] as [WeaponId, WeaponId];
          weapons[index] = nextWeapon;
          return { ...current, weapons };
        })}>
          <option value="snowparting" disabled={settings.weapons[1 - index] === "snowparting"}>Snowparting Blade</option>
          <option value="phalanxbane" disabled={settings.weapons[1 - index] === "phalanxbane"}>Phalanxbane Blade</option>
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

function RotationEditorTab({ character, onMetricsChange }: { character: CharacterState; onMetricsChange: (metrics: RotationMetrics, isActive: boolean) => void }) {
  const { rawStats: characterStats, attunementStats, settings, enemy, derivedStats, innerWayRevision: _innerWayRevision, gearStatEffect, buildSetup } = character;
  const innerWayConditions = loadInnerWayConditions();
  const innerWayEffectRules = loadInnerWayEffectRules();
  const [rotationEntries, setRotationEntries] = useState<RotationEntry[]>(loadRotationEntries);
  const [activeRotationId, setActiveRotationId] = useState(() => sessionStorage.getItem("wwm-active-rotation-session-v1") ?? loadRotationEntries()[0]?.id ?? "dummy-1-min");
  const [editingRotationId, setEditingRotationId] = useState(() => sessionStorage.getItem("wwm-active-rotation-session-v1") ?? loadRotationEntries()[0]?.id ?? "dummy-1-min");
  const [rotation, setRotation] = useState<RotationRecord>(() => {
    const entries = loadRotationEntries();
    const activeId = sessionStorage.getItem("wwm-active-rotation-session-v1") ?? entries[0]?.id;
    return JSON.parse(JSON.stringify(entries.find((entry) => entry.id === activeId)?.rotation ?? entries[0]?.rotation ?? defaultRotation)) as RotationRecord;
  });
  const [startAnchor, setStartAnchor] = useState<{ rowId: string; actionIndex?: number }>(() => {
    const initialEntries = loadRotationEntries();
    const initialId = sessionStorage.getItem("wwm-active-rotation-session-v1") ?? initialEntries[0]?.id;
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
  const [workerMetrics, setWorkerMetrics] = useState<RotationMetrics>();
  const [workerTimeline, setWorkerTimeline] = useState<TimelineRow[]>([]);
  const [workerAnchorTime, setWorkerAnchorTime] = useState(0);
  const [workerDuration, setWorkerDuration] = useState(0);
  const [workerActionBreakdowns, setWorkerActionBreakdowns] = useState<Record<string, DamageBreakdown>>({});
  const [readableDialogOpen, setReadableDialogOpen] = useState(false);
  const [readableCopyStatus, setReadableCopyStatus] = useState("");
  const readableDialogRef = useRef<HTMLDialogElement>(null);
  const readableTextRef = useRef<HTMLTextAreaElement>(null);
  const editingEntry = rotationEntries.find((entry) => entry.id === editingRotationId);
  const rotationLocked = editingEntry?.isDefault === true;
  const calculationStateKey = JSON.stringify({ characterStats, attunementStats, settings, enemy, rotation, innerWayConditions: [...innerWayConditions], innerWayEffectRules, innerWayRevision: _innerWayRevision, gearStatEffect, buildSetup });

  function persistRotationEntries(entries: RotationEntry[]) {
    sessionStorage.setItem(rotationListStorageKey, serializeRotationEntries(entries));
  }

  useEffect(() => {
    setRotation((current) => migrateRotation(current));
    persistRotationEntries(rotationEntries);
  }, []);

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
  function selectRotationItem(index: number, value: string) {
    if (rotationLocked) return;
    const previousSkills = timeline.filter((row) => row.kind === "rotation" && (row.rotationIndex ?? -1) < index && row.step.type === "skill");
    const previousSkill = previousSkills[previousSkills.length - 1];
    setRotation((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step;
        if (value === "__event:Exhausted") return { type: "event", event: "Exhausted", startTime: previousSkill?.startTime ?? 0 };
        if (value === "__event:Controlled") return { type: "event", event: "Controlled", startTime: previousSkill?.startTime ?? 0, duration: 3 };
        return { type: "skill", skill: value };
      })
    }));
  }
  function commitEventTime(rowId: string, stepIndex: number) {
    const draft = eventTimeDrafts[rowId];
    if (draft === undefined) return;
    const time = Number(draft);
    if (Number.isFinite(time)) updateStep(stepIndex, { startTime: time + anchorTime });
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
  function addStepBelow(index: number) {
    if (rotationLocked) return;
    setRotation((current) => ({ ...current, steps: [...current.steps.slice(0, index + 1), { type: "skill", skill: rotationSkillIds[0] }, ...current.steps.slice(index + 1)] }));
  }
  function addExhaustedEvent() {
    if (rotationLocked) return;
    setRotation((current) => ({ ...current, steps: [...current.steps, { type: "event", event: "Exhausted", startTime: 0 }] }));
  }
  function moveStep(index: number, direction: number) {
    if (rotationLocked) return;
    setRotation((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.steps.length) return current;
      const steps = [...current.steps];
      [steps[index], steps[nextIndex]] = [steps[nextIndex], steps[index]];
      return { ...current, steps };
    });
  }
  function removeStep(index: number) {
    if (rotationLocked) return;
    setRotation((current) => ({ ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) }));
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
    const nextRotation: RotationRecord = { name: "New Rotation", steps: [{ type: "skill", skill: rotationSkillIds[0] }] };
    const nextEntries = [...rotationEntries.map((entry) => entry.id === editingRotationId ? { ...entry, rotation: current } : entry), { id, rotation: nextRotation }];
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
    const nextEntries = [...rotationEntries, { id, rotation: duplicate }];
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
    if (rotationEntries.length <= 1) return;
    const nextEntries = rotationEntries.filter((entry) => entry.id !== id);
    if (id !== editingRotationId && id !== activeRotationId) {
      setRotationEntries(nextEntries);
      persistRotationEntries(nextEntries);
      return;
    }
    const nextActive = nextEntries[Math.max(0, rotationEntries.findIndex((entry) => entry.id === id) - 1)] ?? nextEntries[0];
    setRotationEntries(nextEntries);
    if (id === activeRotationId) setActiveRotationId(nextActive.id);
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
      setRotationEntries(result.entries);
      persistRotationEntries(result.entries);
      const importedEntry = result.entries.find((entry) => entry.id === result.importedIds[0]);
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

  const timeline = workerTimeline;
  const anchorTime = workerAnchorTime;
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
  const triggerSourceExpanded = (row: TimelineRow) => {
    if (row.kind !== "trigger") return false;
    const sourceRow = row.sourceRowId ? timelineRowsById.get(row.sourceRowId) : undefined;
    return Boolean(sourceRow && (sourceRow.kind === "dot" || sourceRow.step.type !== "skill" || skillActionsExpanded(sourceRow.id)));
  };
  const displayEntries = timeline.flatMap((row) => {
    if (row.skipped) return [];
    const entries: Array<{ row: TimelineRow; kind: "skill" | "action"; time: number; order: number; actionIndex?: number }> = [];
    const triggeredSkillVisible = triggerSourceExpanded(row);
    if (row.kind === "rotation") entries.push({ row, kind: "skill", time: row.startTime, order: row.order });
    row.actions.forEach((action, actionIndex) => {
      const isStartingAction = startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex;
      const actionsVisible = row.kind === "dot" || row.kind === "trigger" && triggeredSkillVisible || row.step.type !== "skill" || skillActionsExpanded(row.id) || isStartingAction;
      if (action.type === "damage" && actionsVisible) entries.push({ row, kind: "action", actionIndex, time: row.startTime + (typeof action.time === "number" ? action.time : 0), order: row.order + 10 + actionIndex });
    });
    return entries;
  }).sort((left, right) => left.time - right.time || left.order - right.order);
  const totalRotationTime = workerDuration;
  const readableRotation = readableRotationText(timeline, startAnchor, anchorTime);
  const totalRotationDamage = workerMetrics?.totalDamage ?? 0;
  const rotationDps = workerMetrics?.dps ?? 0;
  const applyPriorityStatLine = (key: keyof CharacterStats, amount: number) => {
    return { ...characterStats, [key]: characterStats[key] + amount };
  };
  const priorityCharacter = statPriorityLines.character as Partial<Record<keyof CharacterStats, number>>;
  const priorityAttunement = statPriorityLines.attunement as Partial<Record<keyof AttunementStats, number>>;
  const selectedInnerWays = loadInnerWays().filter((row) => row.innerWay);
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
  const makeTimelineInput = (conditions = innerWayConditions, rules = innerWayEffectRules, setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup)): TimelineBuildInput => ({
    rotation,
    skills: Object.assign({}, ...Object.values(defaultSkillMaps)),
    eventDefinitions: rotationEventDefinitions,
    dots: mysticDots as Record<string, SkillRecord>,
    effectDefinitions,
    innerWayConditions: [...conditions],
    innerWayRules: rules,
    setupEffects,
    weapons: settings.weapons,
  });
  const calculationBundle = useMemo<RotationSimulationBundle>(() => ({
    timeline: makeTimelineInput(),
    startAnchor,
    stats: characterStats,
    attunement: attunementStats,
    enemy,
    derivedStats,
    weapons: settings.weapons,
    statPriority: Object.entries(priorityCharacter).map(([key, amount]) => {
      const variantStats = applyPriorityStatLine(key as keyof CharacterStats, Number(amount));
      const definition = allStatDefinitions.find((candidate) => candidate.key === key);
      return { label: definition?.label ?? key, maxRoll: Number(amount) * (definition?.unit === "%" ? 100 : 1), stats: variantStats };
    }),
    attunementPriority: Object.entries(priorityAttunement).map(([key, amount]) => {
      const variantAttunement = { ...attunementStats, [key]: attunementStats[key as keyof AttunementStats] + Number(amount) };
      return { label: ({ physicalPenetration: "Physical Penetration", formlessPenetration: "Formless Penetration", phalanxbaneChargedBoost: "Phalanxbane Blade - Charged Skill DMG Boost", phalanxbaneMartialBoost: "Phalanxbane Blade - Martial Art Skill DMG Boost", snowpartingChargedBoost: "Snowparting Blade - Charged Skill DMG Boost", snowpartingVariedComboBoost: "Snowparting Blade - Light/Heavy Attack Varied Combo DMG Boost", snowpartingMartialBoost: "Snowparting Blade - Martial Art Skill DMG Boost" } as Record<string, string>)[key] ?? key, maxRoll: Number(amount) * (percentageAttunementKeys.has(key as keyof AttunementStats) ? 100 : 1), attunement: variantAttunement };
    }),
    innerWayPriority: selectedInnerWays.map((selected) => {
      const variantRules = innerWayEffectRules.filter((rule) => rule.source !== selected.innerWay);
      const variantConditions = loadInnerWayConditions(selected.innerWay);
      return { label: innerWayDefinitions[selected.innerWay as keyof typeof innerWayDefinitions]?.name ?? selected.innerWay, timeline: makeTimelineInput(variantConditions, variantRules), innerWayRules: variantRules, innerWayConditions: [...variantConditions] };
    }),
    setupComparisons: {
      arsenal: Object.keys(typedArsenalDefinitions).map((value) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { arsenal: value }) })),
      bowRingSet: Object.keys(typedBowRingSetDefinitions).map((value) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { bowRingSet: value }) })),
      food: Object.keys(typedFoodDefinitions).map((value) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { food: value }) })),
      divinecraft: Object.entries(typedDivinecraftDefinitions).filter(([, definition]) => definition.available !== false).map(([value]) => ({ label: value, setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { divinecraft: value }) })),
      "gear:Cleftpeak": [0, 2, 4].filter((tier) => tier > currentGearSets.Cleftpeak).map((tier) => {
        const setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, { gearSets: { Cleftpeak: tier as 0 | 2 | 4, RainWhisper: Math.min(currentGearSets.RainWhisper, 4 - tier) as 0 | 2 | 4 } });
        return { label: String(tier), setupEffects, timeline: makeTimelineInput(innerWayConditions, innerWayEffectRules, setupEffects) };
      }),
      "gear:RainWhisper": [0, 2, 4].filter((tier) => tier > currentGearSets.RainWhisper).map((tier) => {
        const setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, { gearSets: { Cleftpeak: Math.min(currentGearSets.Cleftpeak, 4 - tier) as 0 | 2 | 4, RainWhisper: tier as 0 | 2 | 4 } });
        return { label: String(tier), setupEffects, timeline: makeTimelineInput(innerWayConditions, innerWayEffectRules, setupEffects) };
      }),
    },
  }), [calculationStateKey, startAnchor.rowId, startAnchor.actionIndex]);
  const localRotationCalculation: RotationMetrics = { totalDamage: totalRotationDamage, dps: rotationDps, breakdown: emptyRotationBreakdown(), statPriority: priorityStats, attunementPriority: priorityAttunementRows, innerWayPriority: priorityInnerWays, setupComparisons };
  const rotationCalculation = workerMetrics ?? localRotationCalculation;
  useEffect(() => {
    let cancelled = false;
    requestRotationSimulation(calculationBundle).then((result) => {
      if (!cancelled) {
        setWorkerMetrics(result.metrics);
        setWorkerTimeline(result.timeline as TimelineRow[]);
        setWorkerAnchorTime(result.anchorTime);
        setWorkerDuration(result.duration);
        setWorkerActionBreakdowns(result.actionBreakdowns);
      }
    }).catch(() => {
      // Keep the synchronous calculation visible if a worker is unavailable.
    });
    return () => { cancelled = true; };
  }, [calculationBundle]);
  useEffect(() => onMetricsChange(rotationCalculation, editingRotationId === activeRotationId), [JSON.stringify(rotationCalculation), editingRotationId, activeRotationId]);
  return <section className="panel rotation-editor-panel"><div className="rotation-editor-layout">
    <aside className="rotation-list">
      <div className="rotation-list-heading"><span>Rotations</span><button className="icon-button" type="button" aria-label="Add rotation" onClick={addRotation}>＋</button></div>
      <div className="rotation-list-entries">{rotationEntries.map((entry) => <div className={`rotation-list-item ${entry.id === activeRotationId ? "active" : ""} ${entry.id === editingRotationId ? "editing" : ""}`} key={entry.id} role="button" tabIndex={0} onClick={() => editRotation(entry.id)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") editRotation(entry.id); }}><strong>{entry.id === activeRotationId && <span className="active-rotation-icon" title="Active rotation">●</span>}{entry.rotation.name || "Unnamed Rotation"}</strong><span className="rotation-list-actions"><button className="rotation-remove-button" type="button" aria-label={`Remove ${entry.rotation.name || "rotation"}`} title={entry.isDefault ? "The default rotation cannot be removed" : "Remove rotation"} disabled={entry.isDefault === true || rotationEntries.length <= 1} onClick={(event) => { event.stopPropagation(); removeRotation(entry.id); }}>×</button></span></div>)}</div>
      <div className="rotation-transfer-actions"><div><button className="button button-secondary button-small" type="button" onClick={exportRotations}>Export</button><label className="button button-secondary button-small rotation-import-button">Import<input type="file" accept="application/json,.json" aria-label="Import rotations" onChange={importRotations} /></label></div>{transferStatus && <p className={transferStatus.error ? "error" : ""} role={transferStatus.error ? "alert" : "status"}>{transferStatus.message}</p>}</div>
    </aside>
    <div className="rotation-editor-content">
    <div className="skill-detail-heading"><div><span className="detail-kicker">Rotation</span>{editingName && !rotationLocked ? <input className="rotation-name-input" autoFocus value={rotation.name} onChange={(event) => setRotation({ ...rotation, name: event.target.value })} onBlur={() => setEditingName(false)} onKeyDown={(event) => { if (event.key === "Enter") setEditingName(false); }} /> : <h3>{rotation.name || "Unnamed Rotation"}{!rotationLocked && <button className="icon-button" type="button" aria-label="Edit rotation name" onClick={() => setEditingName(true)}>✎</button>}</h3>}{rotationLocked && <p className="rotation-default-note">This is a prebuilt default rotation and cannot be changed. Duplicate it to edit.</p>}</div>{status && <span className="editor-status">{status}</span>}</div>
    <div className="rotation-toolbar"><span className="rotation-toolbar-actions"><button className="button button-small rotation-active-button" type="button" disabled={editingRotationId === activeRotationId} onClick={() => activateRotation(editingRotationId)}>{editingRotationId === activeRotationId ? "Active Rotation" : "Make Active"}</button><button className="button button-secondary button-small" type="button" disabled={!readableRotation} onClick={openReadableRotation}>Readable Format</button></span><span>{rotation.steps.filter((step) => step.type === "skill").length} steps · {formatNumber(totalRotationTime)}s total time</span><span className="rotation-results"><span>Total Damage: {formatNumber(rotationCalculation.totalDamage)}</span><span>DPS: {formatNumber(rotationCalculation.dps)}</span></span></div>
    <div className="rotation-scroll-content"><div className="rotation-table">
      <div className="rotation-table-header"><span></span><span>#</span><span>Start Time</span><span>Cast Time</span><span>Skill</span><span>Damage</span><span>Buff</span><span>Debuff</span><span>Actions</span></div>
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
          const stepSkill = step.type === "skill" ? step.skill : undefined;
          const actionsExpanded = skillActionsExpanded(row.id);
          const actionState = actionIndex === undefined ? undefined : row.actionStates[actionIndex] ?? { buffs: row.buffs, debuffs: row.debuffs };
          const actionBuffs = actionState?.buffs.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > actionTime) ?? [];
          const actionDebuffs = actionState?.debuffs.filter((effect) => effect.expiresAt === undefined || effect.expiresAt > actionTime) ?? [];
          const skillDamageRows = row.kind === "rotation" ? [row, ...timeline.filter((candidate) => candidate.kind === "trigger" && candidate.sourceRowId === row.id)] : [row];
          const skillBreakdown = skillDamageRows.reduce<DamageBreakdown>((skillTotal, damageRow) => damageRow.actions.reduce<DamageBreakdown>((total, action, damageIndex) => {
            if (action.type !== "damage") return total;
            const breakdown = calculateTimelineActionBreakdown(damageRow, damageIndex);
            return { physical: total.physical + breakdown.physical, bellstrike: total.bellstrike + breakdown.bellstrike, stonesplit: total.stonesplit + breakdown.stonesplit, silkbind: total.silkbind + breakdown.silkbind, bamboocut: total.bamboocut + breakdown.bamboocut, total: total.total + breakdown.total };
          }, skillTotal), { physical: 0, bellstrike: 0, stonesplit: 0, silkbind: 0, bamboocut: 0, total: 0 } as DamageBreakdown);
          return <div className="rotation-row-group" key={`${row.id}-${entry.kind}-${actionIndex ?? "skill"}`}>
            {!isAction && <div className={`rotation-table-row ${isManualEvent ? "rotation-event-row" : ""}`}>
              {row.kind === "rotation" ? <button className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "active" : ""}`} type="button" aria-label="Set fight start here" disabled={rotationLocked} onClick={() => selectStart(row.rotationIndex ?? 0)}>{startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "→" : "•"}</button> : <span aria-hidden="true" />}
              <span className="rotation-index">{isManualEvent ? "" : row.rotationIndex}</span>
              {isManualEvent ? <input className="rotation-event-time" type="number" step="0.01" disabled={rotationLocked} value={eventTimeDrafts[row.id] ?? formatNumber(displayTime(startTime))} onChange={(event) => setEventTimeDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onBlur={() => commitEventTime(row.id, row.rotationIndex ?? 0)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <span>{formatNumber(displayTime(startTime))}s</span>}
              {isManualEvent && step.event === "Controlled" ? <input className="rotation-event-time" type="number" min="0" step="0.01" disabled={rotationLocked} value={eventDurationDrafts[row.id] ?? String(step.duration ?? 3)} onChange={(event) => setEventDurationDrafts((current) => ({ ...current, [row.id]: event.target.value }))} onBlur={() => commitEventDuration(row.id, row.rotationIndex ?? 0)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /> : <span>{isManualEvent ? "" : row.kind === "rotation" ? `${formatNumber(castTime)}s` : "—"}</span>}
              {row.kind === "rotation" ? <select className="rotation-skill-select" value={isManualEvent ? `__event:${step.event}` : stepSkill ?? ""} disabled={rotationLocked} onChange={(event) => selectRotationItem(row.rotationIndex ?? 0, event.target.value)}>{rotationSkillIds.map((id) => <option key={id} value={id}>{skillDisplayName(findSkill(id), id)}</option>)}{rotationEventOptionIds.map((id) => <option key={id} value={id}>{rotationEventDefinitions[id.slice(8)]?.name ?? id}</option>)}</select> : <span className="rotation-skill-name"><span>{skillDisplayName(skill, stepSkill ?? "")}</span></span>}
              <span className="rotation-damage-value">{isManualEvent ? "" : step.type === "skill" && skillBreakdown.total > 0 ? <DamageBreakdownValue breakdown={skillBreakdown} /> : ""}</span>
              <span>{isManualEvent ? "" : effectNames(row.buffs)}</span>
              <span>{isManualEvent ? "" : effectNames(row.debuffs)}</span>
              <span className="rotation-controls">{row.kind === "rotation" && !isManualEvent && <button className="rotation-expand-button" type="button" aria-label={`${actionsExpanded ? "Collapse" : "Expand"} ${skillDisplayName(skill, stepSkill ?? "skill")} actions`} aria-expanded={actionsExpanded} onClick={() => toggleSkillActions(row.id)}>{actionsExpanded ? "▾" : "▸"}</button>}{row.kind === "rotation" && !isManualEvent && <><button type="button" aria-label="Move up" disabled={rotationLocked || (row.rotationIndex ?? 0) === 0} onClick={() => moveStep(row.rotationIndex ?? 0, -1)}>↑</button><button type="button" aria-label="Move down" disabled={rotationLocked || (row.rotationIndex ?? 0) === rotation.steps.length - 1} onClick={() => moveStep(row.rotationIndex ?? 0, 1)}>↓</button></>} {row.kind === "rotation" && <><button type="button" aria-label="Delete step" disabled={rotationLocked} onClick={() => removeStep(row.rotationIndex ?? 0)}>×</button>{!isManualEvent && <button type="button" aria-label="Add step below" disabled={rotationLocked} onClick={() => addStepBelow(row.rotationIndex ?? 0)}>＋</button>}</>}</span>
            </div>
            }
            {isAction && (() => {
              const actionKey = `${row.id}:${actionIndex ?? 0}`;
              const actionCalculated = Object.prototype.hasOwnProperty.call(workerActionBreakdowns, actionKey);
              return <div className={`rotation-action-row ${row.kind === "trigger" ? "rotation-action-trigger" : row.kind === "dot" ? "rotation-action-dot" : ""}`}>
                {row.kind === "rotation" ? <button className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex ? "active" : ""}`} type="button" aria-label="Set fight start here" disabled={rotationLocked} onClick={() => selectStart(row.rotationIndex ?? 0, actionIndex)}>{startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex ? "→" : "•"}</button> : <span aria-hidden="true" />}
                <span className="rotation-action-time">{formatNumber(displayTime(actionTime))}s</span><span className="rotation-action-skill">{skillDisplayName(skill, stepSkill ?? "")}</span><span className="rotation-action-damage">{actionCalculated ? <DamageBreakdownValue breakdown={calculateTimelineActionBreakdown(row, actionIndex ?? 0)} /> : null}</span><span className="rotation-action-buff">{effectNames(actionBuffs)}</span><span className="rotation-action-debuff">{effectNames(actionDebuffs)}</span>
              </div>;
            })()}
          </div>;
        })}
      </div>
    </div>
    </div>
    {error && <p className="editor-error">{error}</p>}
    <div className="editor-actions"><button className="button button-secondary" type="button" onClick={duplicateRotation}>Duplicate</button><button className="button button-primary" type="button" disabled={rotationLocked} title={rotationLocked ? "Duplicate the default rotation to edit it" : undefined} onClick={save}>Save</button></div>
    </div>
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
  const [activeTab, setActiveTab] = useState<"main" | "build" | "breakdown" | "rotations" | "skills" | "settings">("main");
  const rotationMetrics = useSyncExternalStore(subscribeToRotationMetrics, getRotationMetrics, getRotationMetrics);
  const [innerWayRevision, setInnerWayRevision] = useState(0);
  const [statOverrides, setStatOverrides] = useState<CharacterStatOverrides>(loadStatOverrides);
  const [attunementOverrides, setAttunementOverrides] = useState<AttunementOverrides>(loadAttunementOverrides);
  const [settings, setSettings] = useState<CalculatorSettings>(loadSettings);
  const [buildState, setBuildState] = useState<BuildState>(loadBuildState);
  const enemy = typedEnemyProfiles[settings.enemy] ?? typedEnemyProfiles[defaultSettings.enemy];
  const activeBuild = buildState.entries.find((entry) => entry.id === buildState.activeBuildId) ?? buildState.entries[0];
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
  const resetAllStatOverrides = () => {
    setStatOverrides({});
    setAttunementOverrides({});
    setBuildSetupOverrides({});
  };
  const handleRotationMetrics = (metrics: RotationMetrics, isActive: boolean) => {
    if (isActive) publishRotationMetrics(metrics);
  };

  useEffect(() => localStorage.setItem(statOverrideStorageKey, JSON.stringify(statOverrides)), [statOverrides]);
  useEffect(() => localStorage.setItem(buildListStorageKey, serializeBuildState(buildState)), [buildState]);
  useEffect(() => localStorage.setItem(activeBuildStorageKey, buildState.activeBuildId), [buildState.activeBuildId]);
  useEffect(() => sessionStorage.setItem(attunementOverrideStorageKey, JSON.stringify(attunementOverrides)), [attunementOverrides]);
  useEffect(() => sessionStorage.setItem(buildSetupOverrideStorageKey, JSON.stringify(buildSetupOverrides)), [buildSetupOverrides]);
  useEffect(() => sessionStorage.setItem(settingsStorageKey, JSON.stringify(settings)), [settings]);

  return (
    <main className={`page-shell ${activeTab === "build" || activeTab === "rotations" ? "viewport-page-shell" : ""}`}>
      <header className="page-header">
        <div>
          <h1>Where Builds Meet</h1>
          <p className="intro">Build, simulate, and optimize for Where Winds Meet.</p>
        </div>
      </header>
      <nav className="main-tabs" aria-label="Main sections">
        <button className={activeTab === "main" ? "active" : ""} type="button" onClick={() => setActiveTab("main")}>Main</button>
        <button className={activeTab === "build" ? "active" : ""} type="button" onClick={() => setActiveTab("build")}>Build</button>
        <button className={activeTab === "breakdown" ? "active" : ""} type="button" onClick={() => setActiveTab("breakdown")}>DPS Breakdown</button>
        <button className={activeTab === "rotations" ? "active" : ""} type="button" onClick={() => setActiveTab("rotations")}>Rotation Editor</button>
        <button className={activeTab === "skills" ? "active" : ""} type="button" onClick={() => setActiveTab("skills")}>Skill Editor</button>
        <button className={activeTab === "settings" ? "active" : ""} type="button" onClick={() => setActiveTab("settings")}>Settings</button>
      </nav>
      {activeTab === "main" ? <StatsTab character={character} statOverrides={statOverrides} attunementOverrides={attunementOverrides} buildSetupOverrides={buildSetupOverrides} onStatChange={updateStatOverride} onStatReset={resetStatOverride} onAttunementChange={updateAttunementOverride} onAttunementReset={resetAttunementOverride} onBuildSetupChange={updateBuildSetupOverride} onBuildSetupReset={resetBuildSetupOverride} onResetAll={resetAllStatOverrides} rotationMetrics={rotationMetrics} onInnerWayChange={() => setInnerWayRevision((current) => current + 1)} /> : activeTab === "build" ? <div className="viewport-tab-content"><BuildTab weapons={settings.weapons} buildState={buildState} onBuildStateChange={setBuildState} /></div> : activeTab === "breakdown" ? <BreakdownTab metrics={rotationMetrics} /> : activeTab === "skills" ? <SkillEditorTab /> : activeTab === "settings" ? <SettingsTab settings={settings} enemy={enemy} onSettingsChange={setSettings} /> : null}
      <div className={`viewport-tab-content ${activeTab === "rotations" ? "" : "tab-hidden"}`}><RotationEditorTab character={character} onMetricsChange={handleRotationMetrics} /></div>
      <footer className="page-footer">
        <span>Author: greydust (WWM IGN) / greydust (Discord)</span>
        <a href="https://github.com/greydust/where-builds-meet" target="_blank" rel="noreferrer">GitHub</a>
      </footer>
    </main>
  );
}
