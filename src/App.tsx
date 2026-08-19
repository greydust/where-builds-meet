import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type CSSProperties,
  type Dispatch,
  type SetStateAction,
} from "react";
import { type AttunementStats, type DamageBreakdown } from "./calculations/damage";
import { UiIcon } from "./UiIcon";
const BuildTab = lazy(() => import("./BuildTab"));
const SimulationTab = lazy(() => import("./SimulationTab"));
import {
  allStatDefinitions,
  combatStats,
  defenseStats,
  emptyStats,
  martialArtsStats,
  survivalStats,
} from "./data/statDefinitions";
import {
  activeBuildStorageKey,
  armorSetDefinitions,
  attunementData,
  availableSetEntriesForTags,
  buildEntryAvailableForMartialArts,
  buildEntryIsTestPreset,
  buildListStorageKey,
  calculateEquippedGearEffects,
  loadBuildState,
  maxGearRoll,
  normalizeBuildSetupOverrides,
  resolveBuildInventory,
  resolveBuildSetup,
  sameWeaponPair,
  selectSetTier,
  serializeBuildState,
  setAvailableForTags,
  statRollsForLevel,
  weaponSetDefinitions,
  type BuildSetup,
  type BuildSetupOverrides,
  type BuildState,
  type SetDefinition,
  type SetSelections,
} from "./gear";
import {
  weaponIds as allWeaponIds,
  type CharacterStats,
  type EnemyProfile,
  type StatDefinition,
  type WeaponId,
} from "./types";
import type { DerivedStats } from "./calculations/effectiveStats";
import snowpartingSkills from "../data/skill/snowparting-blade.json";
import phalanxbaneSkills from "../data/skill/phalanxbane-blade.json";
import thundercrySkills from "../data/skill/thundercry-blade.json";
import stormbreakerSkills from "../data/skill/stormbreaker-spear.json";
import mysticSkills from "../data/skill/mystic.json";
import generalSkills from "../data/skill/general.json";
import mysticBuffs from "../data/buff/mystic.json";
import generalBuffs from "../data/buff/general.json";
import stonesplitStrengthBuffs from "../data/buff/stonesplit-strength.json";
import stonesplitMightBuffs from "../data/buff/stonesplit-might.json";
import bamboocutWindBuffs from "../data/buff/bamboocut-wind.json";
import globalBuffs from "../data/buff/global.json";
import stonesplitStrengthDebuffs from "../data/debuff/stonesplit-strength.json";
import generalDebuffs from "../data/debuff/general.json";
import bellstrikeSplendorDebuffs from "../data/debuff/bellstrike-splendor.json";
import bellstrikeUmbraDebuffs from "../data/debuff/bellstrike-umbra.json";
import innerWayDebuffs from "../data/debuff/innerway.json";
import bamboocutDustDebuffs from "../data/debuff/bamboocut-dust.json";
import stonesplitMightDebuffs from "../data/debuff/stonesplit-might.json";
import mysticDots from "../data/dot/mystic.json";
import enemyProfiles from "../data/enemy.json";
import systemStats from "../data/system.json";
import { createBaseAttributeEffects, type BaseAttributeData } from "./data/baseAttributeEffects";
import { innerWayAvailableForTag, innerWayDefinitions, innerWayEntriesForTag } from "./data/innerWayDefinitions";
import defaultSetup from "../data/default-setup.json";
import {
  beginRotationCalculation,
  completeRotationCalculationCategory,
  emptyRotationBreakdown,
  endRotationCalculation,
  getRotationCalculationStatus,
  getRotationMetrics,
  publishRotationCategoryProgress,
  publishRotationMetrics,
  rotationCalculationCategories,
  subscribeToRotationCalculationStatus,
  subscribeToRotationMetrics,
  type RotationCalculationCategory,
  type RotationGroupBreakdown,
  type RotationMetrics,
  type RotationPriority,
} from "./calculations/rotationMetrics";
import arsenalDefinitions from "../data/arsenal.json";
import bowRingSetDefinitions from "../data/bow-ring-set.json";
import foodDefinitions from "../data/food.json";
import divinecraftDefinitions from "../data/divinecraft.json";
import scriptDefinitions from "../data/script.json";
import pathDefinitions from "../data/path.json";
import snowpartingMartialArt from "../data/martial-art/snowparting-blade.json";
import phalanxbaneMartialArt from "../data/martial-art/phalanxbane-blade.json";
import everspringMartialArt from "../data/martial-art/everspring-umbrella.json";
import unfetteredMartialArt from "../data/martial-art/unfettered-rope-dart.json";
import heavenwillMartialArt from "../data/martial-art/heavenwill-gauntlets.json";
import skygraspMartialArt from "../data/martial-art/skygrasp-rope-dart.json";
import thundercryMartialArt from "../data/martial-art/thundercry-blade.json";
import stormbreakerMartialArt from "../data/martial-art/stormbreaker-spear.json";
import {
  sortAttunementPriorityRows,
  sortRotationPriorityRows,
  type RotationSimulationBundle,
  type RotationSimulationResult,
  type RotationSimulationVariant,
} from "./calculations/rotationCalculator";
import {
  requestRotationBaseline,
  requestRotationComparisons,
  supersedeRotationCalculationRequests,
} from "./calculations/rotationWorkerClient";
import {
  RotationCalculationCache,
  calculationFingerprint,
  rotationBundleFingerprint,
  rotationVariantFingerprint,
} from "./calculations/rotationCalculationCache";
import {
  compareTimelineTime,
  type AttachedEventTarget,
  type EditableObject,
  type EffectDefinition,
  type InnerWayEffectRule,
  type RotationRecord,
  type RotationStep,
  type SkillRecord,
  type TimelineBuildInput,
  type TimelineRow,
} from "./calculations/rotationTimeline";
import {
  resolveSkillCalculationDefinitions,
  type EditorCategory,
  type SkillCategory,
  type SkillMap,
  type SkillOverrides,
} from "./skillOverrides";
import {
  calculateStatsWithOverrides,
  type CharacterStatOverrides,
  type EffectiveStatEffectContainer,
  type StatEffectContainer,
} from "./calculations/statEffects";
import {
  exportRotationEntries,
  mergeImportedRotationEntries,
  serializeRotationEntries,
  type RotationEntry,
} from "./rotationTransfer";
import { readableRotationText } from "./readableRotation";
import {
  characterProfileMatches,
  characterProfileStorageKey,
  exportCharacterProfiles,
  loadCharacterProfiles,
  mergeImportedCharacterProfiles,
  serializeCharacterProfiles,
  type CharacterProfile,
} from "./characterProfiles";
import {
  globalDebuffRows,
  globalDebuffStorageKey,
  globalDebuffTimelineEffects,
  loadGlobalDebuffs,
  type GlobalDebuffState,
} from "./globalDebuffs";
import {
  developmentModeStorageKey as devModeStorageKey,
  dataText,
  gameText,
  getLocale,
  getLocaleDisplayName,
  getSupportedLocales,
  isLocaleWip,
  selectLocale,
  t,
} from "./i18n";

const storageKey = "wwm-character-stats-v3";
const legacyStorageKey = "wwm-character-stats-v2";
const statOverrideStorageKey = "wwm-stat-overrides-v1";
const skillStorageKey = "wwm-skill-editor-session-v1";
const legacyInnerWayStorageKey = "wwm-inner-way-session-v1";
const attunementStorageKey = "wwm-attunement-session-v2";
const legacyAttunementStorageKey = "wwm-attunement-session-v1";
const attunementOverrideStorageKey = "wwm-attunement-overrides-v1";
const settingsStorageKey = "wwm-settings-session-v1";
const arsenalStorageKey = "wwm-arsenal-session-v1";
const bowRingSetStorageKey = "wwm-bow-ring-set-session-v1";
const gearSetStorageKey = "wwm-gear-set-session-v1";
const foodStorageKey = "wwm-food-session-v1";
const divinecraftStorageKey = "wwm-divinecraft-session-v1";
const scriptStorageKey = "wwm-script-session-v1";
const pathStorageKey = "wwm-path-session-v1";
const buildSetupOverrideStorageKey = "wwm-build-setup-overrides-v1";
const percentageStatKeys = new Set<keyof CharacterStats>(
  allStatDefinitions.filter(({ unit }) => unit === "%").map(({ key }) => key),
);

type CalculatorSettings = { weapons: [WeaponId, WeaponId]; enemy: string };
type PathId = "mixed" | "stonesplitStrength" | "stonesplitMight" | "bamboocutDust" | "bamboocutKite";
type PathDefinition = {
  name: string;
  icon?: string;
  tag?: string;
  wip?: boolean;
  devOnly?: boolean;
  lockedWeapons?: [WeaponId, WeaponId];
};
type DefaultSetup = {
  innerWays: Array<{ innerWay: string; tier: string }>;
  weaponSets: SetSelections;
  armorSets: SetSelections;
  bowRingSet: string;
  arsenal: string;
  food: string;
  divinecraft: string;
};
const typedDefaultSetup = defaultSetup as DefaultSetup;
const typedPathDefinitions = pathDefinitions as Record<PathId, PathDefinition>;
const productionWeaponIds = new Set<WeaponId>(
  (Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).flatMap(([id, definition]) =>
    id !== "mixed" && !definition.wip && !definition.devOnly ? (definition.lockedWeapons ?? []) : [],
  ),
);

function pathRequiresDev(definition: PathDefinition) {
  return definition.wip === true || definition.devOnly === true;
}

const defaultSkillMaps: Record<SkillCategory, SkillMap> = {
  Snowparting: snowpartingSkills as SkillMap,
  Phalanxbane: phalanxbaneSkills as SkillMap,
  Thundercry: thundercrySkills as SkillMap,
  Stormbreaker: stormbreakerSkills as SkillMap,
  Mystic: mysticSkills as SkillMap,
  General: generalSkills as SkillMap,
};
const defaultEditorMaps: Record<EditorCategory, SkillMap> = {
  ...defaultSkillMaps,
  Buff: {
    ...mysticBuffs,
    ...generalBuffs,
    ...stonesplitStrengthBuffs,
    ...stonesplitMightBuffs,
    ...bamboocutWindBuffs,
  } as SkillMap,
  Debuff: {
    ...stonesplitStrengthDebuffs,
    ...stonesplitMightDebuffs,
    ...bellstrikeSplendorDebuffs,
    ...bellstrikeUmbraDebuffs,
    ...bamboocutDustDebuffs,
    ...innerWayDebuffs,
    ...generalDebuffs,
  } as SkillMap,
  DOT: mysticDots as SkillMap,
};
const skillCategoryByWeapon: Partial<Record<WeaponId, SkillCategory>> = {
  snowparting: "Snowparting",
  phalanxbane: "Phalanxbane",
  thundercry: "Thundercry",
  stormbreaker: "Stormbreaker",
};
const rotationEventDefinitions: Record<string, SkillRecord> = {
  Controlled: {
    name: "Event: Controlled",
    castTime: 0,
    action: [{ type: "apply", target: "target", value: "Controlled", stack: 1, time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  ShieldBroken: {
    name: "Event: Shield Broken",
    castTime: 0,
    action: [
      { type: "consume", target: "self", value: "Shield", stack: "all", time: 0 },
      {
        type: "apply",
        target: "self",
        value: "HardenedFoe",
        stack: 1,
        requirement: [{ target: "self", value: "ArtOfResistanceT6" }],
        time: 0,
      },
    ],
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
  Delay: {
    name: "Event: Delay",
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
  SelfHP: {
    name: "Event: Self HP",
    castTime: 0,
    action: [{ type: "setHP", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  TakeDamage: {
    name: "Event: Take Damage",
    castTime: 0,
    action: [{ type: "takeDamage", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  HP: {
    name: "Event: HP",
    castTime: 0,
    action: [{ type: "setTargetHP", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  Qi: {
    name: "Event: Qi",
    castTime: 0,
    action: [
      { type: "setQi", time: 0 },
      {
        type: "apply",
        target: "target",
        value: "Exhausted",
        stack: 1,
        requirement: [{ target: "resource", value: "Qi", comparison: "==", amount: 0 }],
        time: 0,
      },
    ],
    modifier: [],
    tags: ["Event"],
  },
  Buff: {
    name: "Event: Buff",
    castTime: 0,
    action: [{ type: "apply", target: "self", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
  Debuff: {
    name: "Event: Debuff",
    castTime: 0,
    action: [{ type: "apply", target: "target", time: 0 }],
    modifier: [],
    tags: ["Event"],
  },
};

function rotationEventDisplayName(eventId: string) {
  const key = `${eventId.charAt(0).toLowerCase()}${eventId.slice(1)}`;
  return dataText(`game.event.${key}`, rotationEventDefinitions[eventId]?.name ?? eventId);
}

const rotationStorageKey = "wwm-rotation-editor-session-v2";
const rotationListStorageKey = "wwm-rotation-list-session-v1";
const allSkillDefinitions = Object.assign({}, ...Object.values(defaultSkillMaps)) as SkillMap;
const skillDataNamespaceByCategory: Record<SkillCategory, string> = {
  Snowparting: "snowpartingBlade",
  Phalanxbane: "phalanxbaneBlade",
  Thundercry: "thundercryBlade",
  Stormbreaker: "stormbreakerSpear",
  Mystic: "mystic",
  General: "general",
};
const skillDataNamespaceById = new Map<string, string>(
  (Object.entries(defaultSkillMaps) as Array<[SkillCategory, SkillMap]>).flatMap(([category, definitions]) =>
    Object.keys(definitions).map((id) => [id, skillDataNamespaceByCategory[category]]),
  ),
);
const allSkillIds = (Object.keys(defaultSkillMaps) as SkillCategory[]).flatMap((category) =>
  Object.keys(defaultSkillMaps[category]),
);
const editorSkillIds = Array.from(new Set(allSkillIds));
const martialArtBySkillId = new Map<string, WeaponId>([
  ...Object.keys(snowpartingSkills).map((id) => [id, "snowparting"] as const),
  ...Object.keys(phalanxbaneSkills).map((id) => [id, "phalanxbane"] as const),
  ...Object.keys(thundercrySkills).map((id) => [id, "thundercry"] as const),
  ...Object.keys(stormbreakerSkills).map((id) => [id, "stormbreaker"] as const),
]);
const rotationEventOptionIds = [
  "__event:Delay",
  "__event:Controlled",
  "__event:ShieldBroken",
  "__event:BattleEnd",
  "__event:Move",
  "__event:SelfHP",
  "__event:TakeDamage",
  "__event:HP",
  "__event:Qi",
  "__event:Buff",
  "__event:Debuff",
];
const dotDefinitions = mysticDots as Record<string, SkillRecord>;
const generalDebuffIds = new Set(Object.keys(generalDebuffs));
const dotEffectIds = new Set(Object.keys(dotDefinitions));
const effectDefinitions = {
  ...mysticBuffs,
  ...generalBuffs,
  ...stonesplitStrengthBuffs,
  ...stonesplitMightBuffs,
  ...bamboocutWindBuffs,
  ...stonesplitStrengthDebuffs,
  ...stonesplitMightDebuffs,
  ...bellstrikeSplendorDebuffs,
  ...bellstrikeUmbraDebuffs,
  ...bamboocutDustDebuffs,
  ...innerWayDebuffs,
  ...generalDebuffs,
  ...dotDefinitions,
} as Record<string, EffectDefinition>;
const globalEffectRules = Object.values(globalBuffs).flatMap(
  (definition) => definition.effect ?? [],
) as EditableObject[];
const manualBuffDefinitions = {
  ...mysticBuffs,
  ...generalBuffs,
  ...stonesplitStrengthBuffs,
  ...stonesplitMightBuffs,
  ...bamboocutWindBuffs,
} as Record<string, { name?: string }>;
const manualGeneralDebuffs = Object.fromEntries(Object.entries(generalDebuffs).filter(([id]) => id !== "Exhausted"));
const manualDebuffDefinitions = {
  ...stonesplitStrengthDebuffs,
  ...stonesplitMightDebuffs,
  ...bellstrikeSplendorDebuffs,
  ...bellstrikeUmbraDebuffs,
  ...bamboocutDustDebuffs,
  ...innerWayDebuffs,
  ...manualGeneralDebuffs,
} as Record<string, { name?: string }>;

function loadDevMode() {
  return localStorage.getItem(devModeStorageKey) === "true";
}

function loadSelectedPath(devMode = loadDevMode()): PathId {
  const saved = sessionStorage.getItem(pathStorageKey);
  const definition = saved ? typedPathDefinitions[saved as PathId] : undefined;
  return definition && (!pathRequiresDev(definition) || devMode) ? (saved as PathId) : "stonesplitStrength";
}

function innerWayAvailableForPath(innerWay: string, pathId = loadSelectedPath()) {
  return innerWayAvailableForTag(innerWay, typedPathDefinitions[pathId].tag);
}

function attunementAvailableForSettings(attunement: string, pathId: PathId, settings: CalculatorSettings) {
  const definition = attunementData[attunement];
  if (definition?.tags.includes("Defensive")) return false;
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
  return categories
    .flatMap((category) => Object.keys(defaultSkillMaps[category]))
    .filter((skillId) => !allSkillDefinitions[skillId]?.tags?.includes("Triggered"));
}

function innerWayConditionsFor(selectedInnerWays: BuildSetup["innerWays"], excludedInnerWay?: string) {
  const conditions = new Set<string>();
  const pathId = loadSelectedPath();
  for (const row of selectedInnerWays) {
    if (!row.innerWay || row.innerWay === excludedInnerWay || !innerWayAvailableForPath(row.innerWay, pathId)) continue;
    const tierNumber = Number(row.tier.slice(1));
    for (let tier = 0; tier <= tierNumber; tier += 1) conditions.add(`${row.innerWay}T${tier}`);
  }
  return conditions;
}

function innerWayEffectRulesFor(selectedInnerWays: BuildSetup["innerWays"]): InnerWayEffectRule[] {
  const pathId = loadSelectedPath();
  const selected = selectedInnerWays.filter(({ innerWay }) => innerWayAvailableForPath(innerWay, pathId));
  return selected.flatMap(({ innerWay, tier }) => {
    if (!innerWay || !innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions]) return [];
    const definition = innerWayDefinitions[innerWay as keyof typeof innerWayDefinitions] as {
      effect?: Record<string, { effect?: unknown[]; trigger?: unknown[] }>;
    };
    const tierNumber = Number(tier.slice(1));
    return Array.from({ length: tierNumber + 1 }, (_, currentTier) => {
      const tierDefinition = definition.effect?.[`${innerWay}T${currentTier}`];
      const effects = tierDefinition?.effect ?? [];
      const triggers = tierDefinition?.trigger ?? [];
      const effectRules = effects
        .filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
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
            item.stat && typeof item.stat === "object" && !Array.isArray(item.stat)
              ? { stat: item.stat as EditableObject }
              : item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
                ? (item.effect as EditableObject)
                : {},
          source: innerWay,
          tier: currentTier,
        }));
      const triggerRules = triggers
        .filter((item): item is EditableObject => Boolean(item) && typeof item === "object" && !Array.isArray(item))
        .map((item) => ({
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
  const steps: RotationStep[] = (rotation.steps as Array<RotationStep & { repeat?: number }>).flatMap(
    (step): RotationStep[] => {
      if (step.type === "event") return [step];
      const repeat = Math.max(1, step.repeat ?? 1);
      const { repeat: _repeat, ...stepWithoutRepeat } = step;
      return Array.from({ length: repeat }, (_, index) => ({
        ...stepWithoutRepeat,
        causesBreak: index === repeat - 1 ? step.causesBreak : undefined,
      })) as RotationStep[];
    },
  );
  return {
    name: rotation.name,
    steps,
    ...(typeof rotation.targetHP === "number" && rotation.targetHP > 0 ? { targetHP: rotation.targetHP } : {}),
    start: rotation.start,
    ...(rotation.eventTimeReference === "battleStart" ? { eventTimeReference: "battleStart" as const } : {}),
  };
}

function attachedTargetForStep(step: RotationStep | undefined) {
  if (step?.type !== "event") return undefined;
  if (
    (step.event === "Move" ||
      step.event === "SelfHP" ||
      step.event === "TakeDamage" ||
      step.event === "HP" ||
      step.event === "Qi" ||
      step.event === "Buff" ||
      step.event === "Debuff") &&
    "before" in step
  )
    return step.before;
  if (step.event === "Qi" && "after" in step) return step.after;
  return undefined;
}

function eventDefaultDuration(event: "Exhausted" | "Controlled") {
  return effectDefinitions[event]?.duration ?? 0;
}

function baseRotationAnchorTime(rotation: RotationRecord) {
  if (!rotation.start) return 0;
  let time = 0;
  for (const [stepIndex, step] of rotation.steps.entries()) {
    if (stepIndex === rotation.start.step) {
      if (step.type !== "skill") return time;
      const skill = allSkillDefinitions[step.skill ?? ""];
      return (
        time +
        (rotation.start.action === undefined || !Array.isArray(skill?.action)
          ? 0
          : Number((skill.action[rotation.start.action] as EditableObject | undefined)?.time ?? 0))
      );
    }
    if (step.type === "skill")
      time +=
        typeof allSkillDefinitions[step.skill ?? ""]?.castTime === "number"
          ? allSkillDefinitions[step.skill ?? ""].castTime!
          : 0;
    else if (step.event === "Delay") time += Math.max(0, step.duration);
  }
  return 0;
}

function migrateRotation(rotation: RotationRecord): RotationRecord {
  const migrated = normalizeRotation(rotation);
  migrated.steps = migrated.steps.map((step) => {
    const legacyStep = step as unknown as Record<string, unknown>;
    if (step.type !== "event") return step;
    if (step.event === "HP" && typeof legacyStep.currentHPRatio === "number")
      return {
        type: "event",
        event: "SelfHP",
        before: legacyStep.before as AttachedEventTarget,
        currentHPRatio: legacyStep.currentHPRatio,
      };
    if (step.event === "Debuff" && step.debuff === "Exhausted")
      return { type: "event", event: "Qi", before: step.before, targetQiRatio: 0 };
    if (legacyStep.event === "Exhausted" && (legacyStep.after || legacyStep.before))
      return {
        type: "event",
        event: "Qi",
        after: (legacyStep.after ?? legacyStep.before) as AttachedEventTarget,
        targetQiRatio: 0,
      };
    return step;
  });
  if (migrated.steps[6]?.type === "skill" && migrated.steps[6].skill === "SnowpartingQ")
    migrated.steps[6] = { ...migrated.steps[6], skill: "SnowpartingQStab" };
  if (migrated.eventTimeReference !== "battleStart") {
    const previousAnchorTime = baseRotationAnchorTime(migrated);
    migrated.steps = migrated.steps.map((step) =>
      step.type === "event" && "startTime" in step ? { ...step, startTime: step.startTime - previousAnchorTime } : step,
    );
    migrated.eventTimeReference = "battleStart";
  }
  const legacyEvents = migrated.steps.flatMap((step, index) =>
    step.type === "event" &&
    (step.event === "Move" || (step as unknown as { event: string }).event === "Exhausted") &&
    "startTime" in step
      ? [{ step, index }]
      : [],
  );
  if (legacyEvents.length) {
    const anchor = baseRotationAnchorTime(migrated);
    let elapsed = 0;
    const candidates = migrated.steps.flatMap((step, index) => {
      if (step.type !== "skill") return [];
      const skill = allSkillDefinitions[step.skill ?? ""];
      const castStart = elapsed;
      elapsed += Number(skill?.castTime ?? 0);
      const actions = Array.isArray(skill?.action) ? (skill.action as EditableObject[]) : [];
      return [
        { index, time: castStart - anchor, before: { action: "start" } as AttachedEventTarget },
        ...actions.flatMap((action, actionIndex) => {
          const time = castStart + Number(action.time ?? 0) - anchor;
          const direct = { index, time, before: { action: actionIndex } as AttachedEventTarget };
          if (action.type !== "trigger" || typeof action.value !== "string") return [direct];
          const triggered = allSkillDefinitions[action.value];
          const triggeredActions = Array.isArray(triggered?.action) ? (triggered.action as EditableObject[]) : [];
          const triggerOrdinal =
            actions.slice(0, actionIndex + 1).filter((candidate) => candidate.type === "trigger").length - 1;
          return [
            direct,
            ...triggeredActions.map((triggeredAction, triggeredActionIndex) => ({
              index,
              time: time + Number(triggeredAction.time ?? 0),
              before: { trigger: triggerOrdinal, action: triggeredActionIndex } as AttachedEventTarget,
            })),
          ];
        }),
      ];
    });
    const attachments = new Map<number, RotationStep[]>();
    legacyEvents.forEach(({ step }) => {
      if (!candidates.length) return;
      const target = candidates.reduce(
        (best, candidate) =>
          Math.abs(candidate.time - step.startTime) < Math.abs(best.time - step.startTime) ? candidate : best,
        candidates[0],
      );
      if (!target) return;
      const attached =
        step.event === "Move"
          ? ({ type: "event", event: "Move", before: target.before, distance: step.distance } as RotationStep)
          : ({
              type: "event",
              event: "Qi",
              after: target.before,
              targetQiRatio: 0,
            } as RotationStep);
      attachments.set(target.index, [...(attachments.get(target.index) ?? []), attached]);
    });
    const startSkill = migrated.steps[migrated.start?.step ?? -1];
    migrated.steps = migrated.steps.flatMap((step, index) =>
      step.type === "event" &&
      (step.event === "Move" || (step as unknown as { event: string }).event === "Exhausted") &&
      "startTime" in step
        ? []
        : step.type === "skill"
          ? [...(attachments.get(index) ?? []), step]
          : [step],
    );
    const startStep = migrated.steps.indexOf(startSkill);
    if (startStep >= 0 && migrated.start) migrated.start = { ...migrated.start, step: startStep };
  }
  return migrated;
}

type RotationPresetRecord = RotationRecord & { martialArts?: WeaponId[]; test?: boolean };
const rotationPresetModules = import.meta.glob("../data/rotation/**/*.json", {
  eager: true,
  import: "default",
}) as Record<string, RotationPresetRecord>;
function rotationMartialArts(rotation: RotationRecord, explicit?: unknown) {
  const configured = Array.isArray(explicit)
    ? [
        ...new Set(
          explicit.filter(
            (item): item is WeaponId => typeof item === "string" && allWeaponIds.includes(item as WeaponId),
          ),
        ),
      ]
    : [];
  if (configured.length) return configured;
  const inferred = [
    ...new Set(
      rotation.steps.flatMap((step) =>
        step.type === "skill" ? (martialArtBySkillId.get(step.skill ?? "") ?? []) : [],
      ),
    ),
  ];
  return inferred.length ? inferred : [...allWeaponIds];
}
function rotationAvailableForWeapons(entry: RotationEntry, weapons: [WeaponId, WeaponId]) {
  if (allWeaponIds.every((weapon) => entry.martialArts.includes(weapon))) return true;
  const selected = [...new Set(weapons)];
  const tagged = [...new Set(entry.martialArts)];
  return tagged.length === selected.length && selected.every((weapon) => tagged.includes(weapon));
}
const defaultRotationEntries = Object.entries(rotationPresetModules)
  .sort(
    ([leftPath, left], [rightPath, right]) =>
      Number(left.test === true) - Number(right.test === true) || leftPath.localeCompare(rightPath),
  )
  .map(([path, rotation]): RotationEntry => ({
    id:
      path
        .split("/")
        .pop()
        ?.replace(/\.json$/, "") ?? path,
    rotation: migrateRotation(rotation),
    martialArts: rotationMartialArts(rotation, rotation.martialArts),
    isDefault: true,
    test: rotation.test === true,
  }));
const defaultRotation = defaultRotationEntries[0]?.rotation ?? { name: "Default Rotation", steps: [] };
const defaultRotationId = defaultRotationEntries[0]?.id ?? "default-rotation";
const formerDefaultRotationIds = new Set(["dummy-1-min"]);

const typedEnemyProfiles = enemyProfiles as Record<string, EnemyProfile>;
const defaultSettings: CalculatorSettings = { weapons: ["snowparting", "phalanxbane"], enemy: "96" };

type SetupEffect = StatEffectContainer &
  EffectiveStatEffectContainer & {
    condition?: string;
    requirement?: unknown;
    trigger?: EditableObject;
    target?: string;
    modify?: EditableObject;
  };
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
  baseAttributes: BaseAttributeData;
};
const typedSystemStats = systemStats as SystemStatsDefinition;
const baseAttributeEffects = createBaseAttributeEffects(typedSystemStats.baseAttributes);
const systemStatEffects: SetupEffect[] = [
  typedSystemStats.baseStats,
  typedSystemStats.levelBonusStats,
  ...typedSystemStats.enhancementStats,
  ...typedSystemStats.talentStats,
  ...typedSystemStats.qingheOddityStats,
  ...typedSystemStats.kaifengOddityStats,
  ...typedSystemStats.imperialPalaceOddityStats,
  ...typedSystemStats.hexiOddityStats,
  ...typedSystemStats.hiddenMountainOddityStats,
  ...baseAttributeEffects,
];
type ArsenalDefinition = { name: string; effect?: SetupEffect };
const typedArsenalDefinitions = arsenalDefinitions as Record<string, ArsenalDefinition>;
const typedBowRingSetDefinitions = bowRingSetDefinitions as Record<string, ArsenalDefinition>;
type GearSetOption = { name: string; effect?: SetupEffect | SetupEffect[] };
type GearSetDefinition = Omit<SetDefinition, "options"> & { options: Record<string, GearSetOption> };
const typedWeaponSetDefinitions = weaponSetDefinitions as Record<string, GearSetDefinition>;
const typedArmorSetDefinitions = armorSetDefinitions as Record<string, GearSetDefinition>;
const typedFoodDefinitions = foodDefinitions as Record<string, ArsenalDefinition>;
type DivinecraftDefinition = ArsenalDefinition & { description: string; image?: string; available?: boolean };
const typedDivinecraftDefinitions = divinecraftDefinitions as Record<string, DivinecraftDefinition>;
type ScriptDefinition = ArsenalDefinition & { description: string; image?: string; altersTimeline?: boolean };
const typedScriptDefinitions = scriptDefinitions as Record<string, ScriptDefinition>;
const scriptDisplayOrder = [
  "Wraithstrike",
  "Voidrot",
  "Convergence",
  "Opportunity",
  "Detachment",
  "Insight",
  "Revelry",
  "None",
] as const;
const divinecraftDisplayOrder = [
  "Fire",
  "FireWater",
  "FirePoison",
  "None",
  "WaterFire",
  "WaterPoison",
  null,
  "PoisonFire",
  "PoisonWater",
] as const;
const comparisonCategoryOrder: RotationCalculationCategory[] = rotationCalculationCategories.filter(
  (category) => category !== "baseline",
);

function setupGroupMatchesCategory(group: string, category: RotationCalculationCategory) {
  if (category === "weaponSets") return group.startsWith("weaponSets:");
  if (category === "armorSets") return group.startsWith("armorSets:");
  if (category === "globalDebuffs") return group.startsWith("debuff:");
  return group === category;
}

type ComparisonVariantRequest = { key: string; bundle: RotationSimulationBundle };

function comparisonVariantRequests(
  bundle: RotationSimulationBundle,
  category: RotationCalculationCategory,
): ComparisonVariantRequest[] {
  const singleVariantBundle = (
    variant: RotationSimulationVariant,
    field: "statPriority" | "attunementPriority" | "innerWayPriority" | "setupComparisons",
    group?: string,
  ): RotationSimulationBundle => ({
    ...bundle,
    statPriority: field === "statPriority" ? [variant] : [],
    attunementPriority: field === "attunementPriority" ? [variant] : [],
    innerWayPriority: field === "innerWayPriority" ? [variant] : [],
    setupComparisons: field === "setupComparisons" && group ? { [group]: [variant] } : {},
  });
  const descriptor = (
    variant: RotationSimulationVariant,
    field: "statPriority" | "attunementPriority" | "innerWayPriority" | "setupComparisons",
    group?: string,
  ) => {
    return {
      key: rotationVariantFingerprint(category, field, group, variant),
      bundle: singleVariantBundle(variant, field, group),
    };
  };
  if (category === "statPriority") return bundle.statPriority.map((variant) => descriptor(variant, "statPriority"));
  if (category === "attunementPriority")
    return bundle.attunementPriority.map((variant) => descriptor(variant, "attunementPriority"));
  if (category === "innerWays")
    return bundle.innerWayPriority.map((variant) => descriptor(variant, "innerWayPriority"));
  return Object.entries(bundle.setupComparisons)
    .filter(([group]) => setupGroupMatchesCategory(group, category))
    .flatMap(([group, variants]) => variants.map((variant) => descriptor(variant, "setupComparisons", group)));
}

function combineComparisonVariantMetrics(
  current: RotationMetrics,
  results: RotationMetrics[],
  category: RotationCalculationCategory,
) {
  const combined: RotationMetrics = {
    ...current,
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };
  if (category === "statPriority")
    combined.statPriority = sortRotationPriorityRows(results.flatMap((result) => result.statPriority));
  else if (category === "attunementPriority")
    combined.attunementPriority = sortAttunementPriorityRows(results.flatMap((result) => result.attunementPriority));
  else if (category === "innerWays")
    combined.innerWayPriority = sortRotationPriorityRows(
      results.flatMap((result) => result.innerWayPriority),
      "ascending",
    );
  else {
    for (const result of results)
      for (const [group, rows] of Object.entries(result.setupComparisons))
        combined.setupComparisons[group] = sortRotationPriorityRows([
          ...(combined.setupComparisons[group] ?? []),
          ...rows,
        ]);
  }
  return mergeComparisonCategory(current, combined, category);
}

function baselineMetricsWithPreviousComparisons(
  baseline: RotationMetrics,
  previous?: RotationMetrics,
): RotationMetrics {
  return {
    ...baseline,
    statPriority: previous?.statPriority ?? [],
    attunementPriority: previous?.attunementPriority ?? [],
    innerWayPriority: previous?.innerWayPriority ?? [],
    setupComparisons: previous?.setupComparisons ?? {},
  };
}

function mergeComparisonCategory(
  current: RotationMetrics,
  calculated: RotationMetrics,
  category: RotationCalculationCategory,
) {
  if (category === "statPriority") return { ...current, statPriority: calculated.statPriority };
  if (category === "attunementPriority") return { ...current, attunementPriority: calculated.attunementPriority };
  if (category === "innerWays") return { ...current, innerWayPriority: calculated.innerWayPriority };
  const setupComparisons = Object.fromEntries(
    Object.entries(current.setupComparisons).filter(([group]) => !setupGroupMatchesCategory(group, category)),
  );
  for (const [group, rows] of Object.entries(calculated.setupComparisons)) setupComparisons[group] = rows;
  return { ...current, setupComparisons };
}

type MartialArtWeapon = "HengBlade" | "MoBlade" | "Spear" | "Umbrella" | "RopeDart" | "Gauntlet";
type MartialArtDefinition = {
  name: string;
  weapon: MartialArtWeapon;
  tag: string;
  talent: Array<{ name: string; effect?: SetupEffect[] }>;
};
const martialArtDefinitions: Record<WeaponId, MartialArtDefinition> = {
  snowparting: snowpartingMartialArt as MartialArtDefinition,
  phalanxbane: phalanxbaneMartialArt as MartialArtDefinition,
  thundercry: thundercryMartialArt as MartialArtDefinition,
  stormbreaker: stormbreakerMartialArt as MartialArtDefinition,
  everspring: everspringMartialArt as MartialArtDefinition,
  unfettered: unfetteredMartialArt as MartialArtDefinition,
  heavenwill: heavenwillMartialArt as MartialArtDefinition,
  skygrasp: skygraspMartialArt as MartialArtDefinition,
};
const weaponFamilyNames: Record<MartialArtWeapon, string> = {
  HengBlade: "Heng Blade",
  MoBlade: "Mo Blade",
  Spear: "Spear",
  Umbrella: "Umbrella",
  RopeDart: "Rope Dart",
  Gauntlet: "Gauntlet",
};
const weaponIdSet = new Set<WeaponId>(allWeaponIds);
const isWeaponId = (value: unknown): value is WeaponId =>
  typeof value === "string" && weaponIdSet.has(value as WeaponId);

const artStatByWeaponFamily: Record<MartialArtWeapon, keyof CharacterStats> = {
  HengBlade: "hengBladeDmgBoost",
  MoBlade: "moBladeDmgBoost",
  Spear: "spearDmgBoost",
  Umbrella: "umbrellaDmgBoost",
  RopeDart: "ropeDartDmgBoost",
  Gauntlet: "gauntletDmgBoost",
};

function characterStatAvailableForSettings(key: keyof CharacterStats, settings: CalculatorSettings) {
  const artStats = new Set(Object.values(artStatByWeaponFamily));
  if (artStats.has(key))
    return settings.weapons.some((weapon) => artStatByWeaponFamily[martialArtDefinitions[weapon].weapon] === key);
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

function loadScript() {
  const saved = sessionStorage.getItem(scriptStorageKey);
  return saved && typedScriptDefinitions[saved] ? saved : "None";
}

function scriptEffectFor(value: string) {
  return typedScriptDefinitions[value]?.effect ?? {};
}

function selectedMartialArtEffects(settings: CalculatorSettings) {
  return Array.from(new Set(settings.weapons)).flatMap((weapon) =>
    (martialArtDefinitions[weapon]?.talent ?? []).flatMap((talent) => talent.effect ?? []),
  );
}

function selectedSetupEffects(
  settings: CalculatorSettings,
  gearStatEffect: StatEffectContainer,
  buildSetup: BuildSetup,
  overrides: Partial<BuildSetup> & { food?: string; divinecraft?: string; script?: string } = {},
) {
  const selectedBuildSetup = {
    ...buildSetup,
    ...overrides,
    weaponSets: overrides.weaponSets ?? buildSetup.weaponSets,
    armorSets: overrides.armorSets ?? buildSetup.armorSets,
  };
  const foodEffect = overrides.food ? (typedFoodDefinitions[overrides.food]?.effect ?? {}) : selectedFoodEffect();
  const divinecraftEffect = divinecraftEffectFor(overrides.divinecraft ?? loadDivinecraft());
  const scriptEffect = scriptEffectFor(overrides.script ?? loadScript());
  return [
    ...globalEffectRules,
    ...systemStatEffects,
    ...selectedMartialArtEffects(settings),
    arsenalEffectFor(selectedBuildSetup.arsenal),
    bowRingSetEffectFor(selectedBuildSetup.bowRingSet),
    ...setEffectsFor(selectedBuildSetup.weaponSets, typedWeaponSetDefinitions, settings),
    ...setEffectsFor(selectedBuildSetup.armorSets, typedArmorSetDefinitions, settings),
    foodEffect,
    scriptEffect,
    divinecraftEffect,
    gearStatEffect,
  ];
}

function setAvailableForSettings(
  definition: GearSetDefinition,
  settings: CalculatorSettings,
  pathId = loadSelectedPath(),
) {
  return setAvailableForTags(
    definition,
    settings.weapons.map((weapon) => martialArtDefinitions[weapon].tag),
    typedPathDefinitions[pathId].tag,
  );
}

function availableSetEntriesForSettings<T extends GearSetDefinition>(
  definitions: Record<string, T>,
  settings: CalculatorSettings,
  pathId = loadSelectedPath(),
) {
  return availableSetEntriesForTags(
    definitions,
    settings.weapons.map((weapon) => martialArtDefinitions[weapon].tag),
    typedPathDefinitions[pathId].tag,
  );
}

function setEffectsFor(
  selected: SetSelections,
  definitions: Record<string, GearSetDefinition>,
  settings: CalculatorSettings,
) {
  return Object.entries(selected)
    .filter(([setName]) => definitions[setName] && setAvailableForSettings(definitions[setName], settings))
    .flatMap(([setName, tier]) => {
      const effect = definitions[setName]?.options[String(tier)]?.effect;
      return Array.isArray(effect) ? effect : [effect ?? {}];
    });
}

function setupConditionsFor(effects: SetupEffect[]) {
  return effects.flatMap((effect) => (typeof effect.condition === "string" ? [effect.condition] : []));
}

function sameBuildSetupValue(
  key: keyof BuildSetup,
  left: BuildSetup[keyof BuildSetup],
  right: BuildSetup[keyof BuildSetup],
) {
  return key === "weaponSets" || key === "armorSets" || key === "innerWays"
    ? JSON.stringify(left) === JSON.stringify(right)
    : left === right;
}

export function loadBuildSetupOverrides(baseline: BuildSetup): BuildSetupOverrides {
  try {
    const saved = sessionStorage.getItem(buildSetupOverrideStorageKey);
    if (saved !== null) return normalizeBuildSetupOverrides(JSON.parse(saved));
    const legacy: Record<string, unknown> = {};
    const legacyInnerWays = sessionStorage.getItem(legacyInnerWayStorageKey);
    const legacyGearSets = sessionStorage.getItem(gearSetStorageKey);
    const legacyBowRingSet = sessionStorage.getItem(bowRingSetStorageKey);
    const legacyArsenal = sessionStorage.getItem(arsenalStorageKey);
    if (legacyInnerWays !== null) legacy.innerWays = JSON.parse(legacyInnerWays);
    if (legacyGearSets !== null) legacy.weaponSets = JSON.parse(legacyGearSets);
    if (legacyBowRingSet !== null) legacy.bowRingSet = legacyBowRingSet;
    if (legacyArsenal !== null) legacy.arsenal = legacyArsenal;
    const parsed = normalizeBuildSetupOverrides(legacy);
    return Object.fromEntries(
      Object.entries(parsed).filter(
        ([key, value]) =>
          !sameBuildSetupValue(
            key as keyof BuildSetup,
            value as BuildSetup[keyof BuildSetup],
            baseline[key as keyof BuildSetup],
          ),
      ),
    ) as BuildSetupOverrides;
  } catch {
    return {};
  }
}

function formatNumber(value: number) {
  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function skillFieldText(skillId: string, skill: SkillRecord | undefined, field: "name" | "shortName") {
  const value = skill?.[field]?.trim();
  if (!value) return field === "name" ? skillId : "";
  const namespace = skillDataNamespaceById.get(skillId);
  const defaultValue = allSkillDefinitions[skillId]?.[field]?.trim();
  return namespace && value === defaultValue ? dataText(`data.skill.${namespace}.${skillId}.${field}`, value) : value;
}

function skillDisplayName(skill: SkillRecord | undefined, fallback = "", skillId = fallback) {
  const name = skillFieldText(skillId, skill, "name");
  const shortName = skillFieldText(skillId, skill, "shortName");
  return shortName ? `${name} (${shortName})` : name;
}

function RotationSkillName({ skill, fallback = "" }: { skill: SkillRecord | undefined; fallback?: string }) {
  const name = skillFieldText(fallback, skill, "name");
  const shortName = skillFieldText(fallback, skill, "shortName");
  return (
    <span className="rotation-skill-label">
      <span>{name}</span>
      {shortName && <span>({shortName})</span>}
    </span>
  );
}

function loadStats(): CharacterStats {
  try {
    const currentSaved = localStorage.getItem(storageKey);
    const isLegacy = currentSaved === null;
    const saved = JSON.parse(currentSaved ?? localStorage.getItem(legacyStorageKey) ?? "null") as
      (Partial<CharacterStats> & Record<string, unknown> & { attributeDmgBonus?: unknown }) | null;
    if (!saved) return { ...emptyStats };
    const legacyAttributeBonus =
      typeof saved.attributeDmgBonus === "number" && Number.isFinite(saved.attributeDmgBonus)
        ? saved.attributeDmgBonus / (isLegacy ? 100 : 1)
        : 0;
    const pathBonusKeys = new Set<keyof CharacterStats>([
      "bellstrikeDmgBonus",
      "stonesplitDmgBonus",
      "silkbindDmgBonus",
      "bamboocutDmgBonus",
    ]);
    const legacyPenetrationKeys: Partial<Record<keyof CharacterStats, string>> = {
      bellstrikePenetration: "bellstrikePen",
      silkbindPenetration: "silkbindPen",
      stonesplitPenetration: "stonesplitPen",
      bamboocutPenetration: "bamboocutPen",
    };
    return Object.fromEntries(
      allStatDefinitions.map(({ key }) => {
        const savedValue = saved[key] ?? (legacyPenetrationKeys[key] ? saved[legacyPenetrationKeys[key]!] : undefined);
        const hasSavedValue = typeof savedValue === "number" && Number.isFinite(savedValue);
        const value = hasSavedValue ? savedValue : pathBonusKeys.has(key) ? legacyAttributeBonus : 0;
        return [key, isLegacy && hasSavedValue && percentageStatKeys.has(key) ? value / 100 : value];
      }),
    ) as CharacterStats;
  } catch {
    return { ...emptyStats };
  }
}

function loadStatOverrides(): CharacterStatOverrides {
  try {
    const currentSaved = localStorage.getItem(statOverrideStorageKey);
    if (currentSaved !== null) {
      const values = JSON.parse(currentSaved) as Record<string, unknown>;
      return Object.fromEntries(
        allStatDefinitions.flatMap(({ key }) => {
          const value = values?.[key];
          return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : [];
        }),
      ) as CharacterStatOverrides;
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
    const saved = JSON.parse(
      sessionStorage.getItem(settingsStorageKey) ?? "null",
    ) as Partial<CalculatorSettings> | null;
    const savedWeapons = Array.isArray(saved?.weapons) ? saved.weapons.filter(isWeaponId) : [];
    const legacyWeapon = saved && "weapon" in saved && saved.weapon === "phalanxbane" ? "phalanxbane" : "snowparting";
    const weapons: [WeaponId, WeaponId] =
      savedWeapons.length === 2
        ? [savedWeapons[0], savedWeapons[1]]
        : [legacyWeapon, legacyWeapon === "snowparting" ? "phalanxbane" : "snowparting"];
    const savedEnemy = saved?.enemy === "level100" || saved?.enemy === "level96" ? "96" : saved?.enemy;
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

function hasSkillOverrides(overrides: SkillOverrides) {
  return Object.values(overrides).some(
    (categoryOverrides) => categoryOverrides && Object.keys(categoryOverrides).length > 0,
  );
}

const defaultAttunementStats = Object.fromEntries(
  Object.keys(attunementData).map((key) => [key, 0]),
) as AttunementStats;
const percentageAttunementKeys = new Set<keyof AttunementStats>(
  Object.entries(attunementData)
    .filter(([, definition]) => definition.percentage)
    .map(([key]) => key as keyof AttunementStats),
);
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
    return Object.fromEntries(
      Object.keys(defaultAttunementStats).map((key) => {
        const statKey = key as keyof AttunementStats;
        const value = typeof values[key] === "number" && Number.isFinite(values[key]) ? (values[key] as number) : 0;
        return [key, isLegacy && percentageAttunementKeys.has(statKey) ? value / 100 : value];
      }),
    ) as typeof defaultAttunementStats;
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
      return Object.fromEntries(
        Object.keys(defaultAttunementStats).flatMap((key) => {
          const value = values?.[key];
          return typeof value === "number" && Number.isFinite(value) ? [[key, value]] : [];
        }),
      ) as AttunementOverrides;
    }
    return Object.fromEntries(
      Object.entries(loadAttunementStats()).filter(([, value]) => value !== 0),
    ) as AttunementOverrides;
  } catch {
    return {};
  }
}

function loadRotationEntries(): RotationEntry[] {
  const bundledDefaults = (): RotationEntry[] =>
    defaultRotationEntries.map((entry) => ({
      ...entry,
      martialArts: [...entry.martialArts],
      rotation: JSON.parse(JSON.stringify(entry.rotation)) as RotationRecord,
    }));
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
        if (
          !entry ||
          typeof entry.id !== "string" ||
          !entry.id ||
          !entry.rotation ||
          !Array.isArray(entry.rotation.steps)
        )
          return;
        if (entry.isDefault === true || bundledDefaultIds.has(entry.id) || formerDefaultRotationIds.has(entry.id))
          preserveFormerDefault(entry.rotation);
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
  return savedId && entries.some((entry) => entry.id === savedId) ? savedId : (entries[0]?.id ?? defaultRotationId);
}

function initialRotationEditorState(devMode: boolean) {
  const entries = loadRotationEntries();
  const selectableEntries = entries.filter((entry) => devMode || !entry.test);
  const activeId = initialRotationId(selectableEntries);
  const activeRotation =
    selectableEntries.find((entry) => entry.id === activeId)?.rotation ??
    selectableEntries[0]?.rotation ??
    defaultRotation;
  const rotation = JSON.parse(JSON.stringify(activeRotation)) as RotationRecord;
  const startAnchor = rotation.start
    ? { rowId: `rotation-${rotation.start.step}`, actionIndex: rotation.start.action }
    : { rowId: "rotation-0" };
  return { entries, activeId, rotation, startAnchor };
}

function rotationEntryDisplayName(entry: RotationEntry) {
  const name = entry.rotation.name || "Unnamed Rotation";
  return entry.isDefault ? gameText(name) : name;
}

function globalStatEffects(settings: CalculatorSettings, gearStatEffect: StatEffectContainer, buildSetup: BuildSetup) {
  const innerWayStatEffects = innerWayEffectRulesFor(buildSetup.innerWays)
    .filter((rule) => !rule.requirement && rule.effect.stat)
    .map((rule) => rule.effect as StatEffectContainer);
  // A setup effect with requirements is a per-action rule. It is resolved by
  // the rotation calculator against the current skill and timeline state and
  // must not leak into the always-visible character-stat baseline.
  const unconditionalSetupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup).filter(
    (effect) => !("requirement" in effect) || !effect.requirement,
  );
  return [...unconditionalSetupEffects, ...innerWayStatEffects];
}

function calculateGlobalStatState(
  overrides: CharacterStatOverrides,
  settings: CalculatorSettings,
  gearStatEffect: StatEffectContainer,
  buildSetup: BuildSetup,
) {
  const enemy = typedEnemyProfiles[settings.enemy] ?? typedEnemyProfiles[defaultSettings.enemy];
  return calculateStatsWithOverrides(
    emptyStats,
    globalStatEffects(settings, gearStatEffect, buildSetup),
    enemy.judgementResistance,
    overrides,
  );
}

function StatField({
  definition,
  stats,
  onChange,
  onReset,
  modified = false,
  derivedLabel,
  derivedValue,
  derivedUnit,
  compact,
}: {
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
  const displayValue = (value: number) => (definition.unit === "%" ? value * 100 : value);
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
      <span className="field-label">
        <span>
          {gameText(definition.label)}
          {definition.unit && definition.showUnitInLabel !== false ? ` ${definition.unit}` : ""}
        </span>
        {modified && (
          <button
            className="stat-reset-button"
            type="button"
            aria-label={t("ui.app.resetNamedValue", { name: gameText(definition.label) })}
            title={t("ui.app.resetToCalculatedValue")}
            onClick={(event) => {
              event.preventDefault();
              onReset?.();
            }}
          >
            <UiIcon name="reset" />
          </button>
        )}
      </span>
      <span className="input-wrap">
        <input
          type="number"
          min="0"
          max={definition.unit === "%" ? 100 : undefined}
          step={definition.step ?? "0.01"}
          value={draftValue}
          onFocus={() => {
            setEditing(true);
            setDirty(false);
          }}
          onChange={(event) => {
            setDraftValue(event.target.value);
            setDirty(true);
          }}
          onBlur={(event) => finishEditing(event.currentTarget.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.currentTarget.blur();
          }}
        />
        {definition.unit && definition.showUnitInInput !== false && (
          <span className="input-unit">{definition.unit}</span>
        )}
      </span>
      {derivedLabel ? <small className="inline-derived">{derivedLabel}</small> : <span className="derived-spacer" />}
      {derivedLabel ? (
        <strong className="inline-derived-value">
          {derivedValue === undefined ? "—" : formatNumber(derivedValue)}
          {derivedUnit ?? ""}
        </strong>
      ) : (
        <span className="derived-spacer" />
      )}
    </label>
  );
}

function PriorityPanel({
  title,
  rows,
  calculationCategory,
  sectionBreakAt,
  showMaxRoll = false,
}: {
  title: string;
  rows: RotationPriority[];
  calculationCategory: RotationCalculationCategory;
  sectionBreakAt?: number;
  showMaxRoll?: boolean;
}) {
  return (
    <section className="panel priority-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <CalculationStatus category={calculationCategory} />
        </div>
      </div>
      {rows.length > 0 ? (
        <div className={`priority-list ${showMaxRoll ? "priority-list-with-roll" : ""}`}>
          <div className="priority-header">
            <span>{t("ui.app.name")}</span>
            {showMaxRoll && <span>{t("ui.app.maxRoll")}</span>}
            <span>{t("ui.app.dpsChange", { dps: t("system.dps") })}</span>
            <span>{t("ui.app.percentage")}</span>
          </div>
          {rows.map((row, index) => (
            <div className={`priority-row ${sectionBreakAt === index ? "priority-section-start" : ""}`} key={row.label}>
              <span>{gameText(row.label)}</span>
              {showMaxRoll && (
                <strong className="priority-max-roll">
                  {row.maxRoll === undefined ? "—" : formatNumber(row.maxRoll)}
                </strong>
              )}
              <strong className={row.dpsDifference >= 0 ? "priority-positive" : "priority-negative"}>
                {row.dpsDifference >= 0 ? "+" : ""}
                {formatNumber(row.dpsDifference)}
              </strong>
              <strong className={row.increase >= 0 ? "priority-positive" : "priority-negative"}>
                {row.increase >= 0 ? "+" : ""}
                {formatNumber(row.increase)}%
              </strong>
            </div>
          ))}
        </div>
      ) : (
        <p className="priority-empty">{t("ui.app.openTheRotationEditorToCalculatePriority")}</p>
      )}
    </section>
  );
}

function BreakdownGroupTable({
  title,
  rows,
  colored = false,
}: {
  title: string;
  rows: RotationGroupBreakdown[];
  colored?: boolean;
}) {
  return (
    <section className="panel breakdown-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="breakdown-table breakdown-group-table">
        <div className="breakdown-table-header">
          <span>{t("ui.app.category")}</span>
          <span>{t("ui.app.damage")}</span>
          <span>{t("ui.app.total")}</span>
        </div>
        {rows.map((row) => (
          <div className="breakdown-table-row" key={row.id}>
            <span className={colored ? `damage-${row.id}` : ""}>{gameText(row.name)}</span>
            <strong>{formatNumber(row.damage)}</strong>
            <strong>{formatNumber(row.percentage)}%</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function CastBreakdownComparison({
  value,
  valueWithBuff,
  stacked,
}: {
  value: number | undefined;
  valueWithBuff: number | undefined;
  stacked: boolean;
}) {
  if (valueWithBuff === undefined) return value === undefined ? "—" : formatNumber(value);
  if (!stacked) return `${formatNumber(value ?? 0)} (${formatNumber(valueWithBuff)})`;
  return (
    <span className="breakdown-stacked-value">
      <span>{formatNumber(value ?? 0)}</span>
      <span>({formatNumber(valueWithBuff)})</span>
    </span>
  );
}

const stackedBuffAttributionTags = new Set(["FluteOfTheTides", "GhostlySteps"]);

function BreakdownTab({ metrics }: { metrics?: RotationMetrics }) {
  if (!metrics)
    return (
      <section className="panel breakdown-empty">
        <h2>{t("ui.app.dpsBreakdown", { dps: t("system.dps") })}</h2>
        <p>{t("ui.app.openTheRotationEditorToCalculateTheActive")}</p>
      </section>
    );
  const { breakdown } = metrics;
  return (
    <div className="breakdown-page">
      <section className="panel breakdown-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("ui.app.perSkillBreakdown")}</h2>
          </div>
          <div className="breakdown-totals">
            <span>
              {t("system.totalDamage")} <strong>{formatNumber(metrics.totalDamage)}</strong>
            </span>
            <span>
              {t("system.dps")} <strong>{formatNumber(metrics.dps)}</strong>
            </span>
          </div>
        </div>
        <div className="breakdown-table breakdown-skill-table">
          <div className="breakdown-table-header">
            <span>{t("ui.app.skill")}</span>
            <span>{t("ui.app.casts")}</span>
            <span>{t("ui.app.triggers")}</span>
            <span>{t("ui.app.hits")}</span>
            <span>{t("system.abrasion")}</span>
            <span>{t("system.normal")}</span>
            <span>{t("system.critical")}</span>
            <span>{t("system.affinity")}</span>
            <span>{t("ui.app.damage")}</span>
            <span>{t("ui.app.total")}</span>
          </div>
          {breakdown.skills.map((row) => (
            <div className="breakdown-table-row" key={row.id}>
              <span>{skillDisplayName(allSkillDefinitions[row.id], row.name, row.id)}</span>
              <strong>{row.casts || ""}</strong>
              <strong>{row.triggers || ""}</strong>
              <strong>{row.hits || ""}</strong>
              <strong>{formatNumber(row.abrasionRate)}%</strong>
              <strong>{formatNumber(row.normalRate)}%</strong>
              <strong>{formatNumber(row.criticalRate)}%</strong>
              <strong>{formatNumber(row.affinityRate)}%</strong>
              <strong>{formatNumber(row.damage)}</strong>
              <strong>{formatNumber(row.percentage)}%</strong>
            </div>
          ))}
        </div>
      </section>
      <section className="panel breakdown-panel">
        <div className="panel-heading">
          <div>
            <h2>{t("ui.app.perCastBreakdown")}</h2>
          </div>
        </div>
        <div className="breakdown-table breakdown-cast-table">
          <div className="breakdown-table-header breakdown-cast-table-header">
            <span>{t("ui.app.skill")}</span>
            <span>{t("ui.app.casts")}</span>
            <span>{t("ui.app.avgCastTime")}</span>
            <span>{t("ui.app.averageDps")}</span>
            <span className="breakdown-damage-header">
              <span>{t("ui.app.damage")}</span>
              <span>{t("ui.app.perCast")}</span>
              <span>{t("ui.app.total")}</span>
            </span>
            <span>{t("ui.app.percentage")}</span>
          </div>
          {breakdown.casts.map((row) => {
            const stackBuffComparison =
              allSkillDefinitions[row.skillId]?.tags?.some((tag) => stackedBuffAttributionTags.has(tag)) ?? false;
            return (
              <div className="breakdown-table-row" key={row.id}>
                <span>{skillDisplayName(allSkillDefinitions[row.skillId], row.name, row.skillId)}</span>
                <strong>{row.casts}</strong>
                <strong>
                  {formatNumber(row.averageCastTime)}
                  {t("ui.app.s")}
                </strong>
                <strong>
                  <CastBreakdownComparison
                    value={row.averageDps}
                    valueWithBuff={row.averageDpsWithBuff}
                    stacked={stackBuffComparison}
                  />
                </strong>
                <strong>
                  <CastBreakdownComparison
                    value={row.averageDamage}
                    valueWithBuff={row.averageDamageWithBuff}
                    stacked={stackBuffComparison}
                  />
                </strong>
                <strong>
                  <CastBreakdownComparison
                    value={row.damage}
                    valueWithBuff={row.damageWithBuff}
                    stacked={stackBuffComparison}
                  />
                </strong>
                <strong>{formatNumber(row.percentage)}%</strong>
              </div>
            );
          })}
        </div>
      </section>
      <BreakdownGroupTable title={t("ui.app.skillTypeBreakdown")} rows={breakdown.categories} />
      <BreakdownGroupTable title={t("ui.app.physicalAndAttributeBreakdown")} rows={breakdown.damageTypes} colored />
    </div>
  );
}

function DamageBreakdownValue({ breakdown, className = "" }: { breakdown: DamageBreakdown; className?: string }) {
  const parts: Array<[keyof DamageBreakdown, string]> = [
    ["physical", "Physical"],
    ["bellstrike", "Bellstrike"],
    ["stonesplit", "Stonesplit"],
    ["silkbind", "Silkbind"],
    ["bamboocut", "Bamboocut"],
  ];
  return (
    <span className={`damage-breakdown-wrap ${className}`}>
      <span>{formatNumber(breakdown.total)}</span>
      <span className="damage-breakdown-tooltip">
        {parts.map(([key, label]) => (
          <span className={`damage-breakdown-part damage-${key}`} key={key}>
            <i>{label}</i>
            {formatNumber(breakdown[key] as number)}
          </span>
        ))}
      </span>
    </span>
  );
}

function CalculationStatus({
  category,
  className = "",
}: {
  category: RotationCalculationCategory;
  className?: string;
}) {
  const statuses = useSyncExternalStore(
    subscribeToRotationCalculationStatus,
    getRotationCalculationStatus,
    getRotationCalculationStatus,
  );
  const { recalculating, progress } = statuses[category];
  const percentage = Math.round(progress * 100);
  return (
    <div
      className={`calculation-status ${className} ${recalculating ? "" : "idle"}`}
      style={{ "--calculation-progress": `${percentage}%` } as CSSProperties}
      role="progressbar"
      aria-label={t("ui.app.recalculatingProgress", { percentage })}
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={recalculating ? percentage : 100}
      aria-live="polite"
    >
      {recalculating ? t("ui.app.recalculatingProgress", { percentage }) : t("ui.app.upToDate")}
    </div>
  );
}

function StatsTab({
  character,
  pathId,
  statOverrides,
  attunementOverrides,
  characterProfiles,
  buildSetupOverrides,
  onStatChange,
  onStatReset,
  onAttunementChange,
  onAttunementReset,
  onApplyCharacterProfile,
  onCharacterProfilesChange,
  onBuildSetupChange,
  onBuildSetupReset,
  rotationMetrics,
  activeBuildName,
  activeRotationName,
  onInnerWayChange,
}: {
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
  activeBuildName: string;
  activeRotationName: string;
  onInnerWayChange: () => void;
}) {
  const { stats, derivedStats, attunementStats, buildSetup, settings } = character;
  const [food, setFood] = useState(loadFood);
  const [script, setScript] = useState(loadScript);
  const [divinecraft, setDivinecraft] = useState(loadDivinecraft);
  const [globalDebuffs, setGlobalDebuffs] = useState(loadGlobalDebuffs);
  const [attunementDrafts, setAttunementDrafts] = useState<Partial<Record<keyof AttunementStats, string>>>({});
  const [newProfileName, setNewProfileName] = useState("");
  const [profileTransferStatus, setProfileTransferStatus] = useState<{ message: string; error?: boolean }>();
  const profileDialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => sessionStorage.setItem(foodStorageKey, food), [food]);
  useEffect(() => sessionStorage.setItem(scriptStorageKey, script), [script]);
  useEffect(() => sessionStorage.setItem(divinecraftStorageKey, divinecraft), [divinecraft]);
  useEffect(() => sessionStorage.setItem(globalDebuffStorageKey, JSON.stringify(globalDebuffs)), [globalDebuffs]);

  const { arsenal, bowRingSet, weaponSets, armorSets, innerWays } = buildSetup;
  const currentProfileData = { statOverrides, attunementOverrides, innerWays, buildSetup };
  const matchingProfile = characterProfiles.find((profile) => characterProfileMatches(profile, currentProfileData));
  const isCalculated =
    Object.keys(statOverrides).length === 0 &&
    Object.keys(attunementOverrides).length === 0 &&
    Object.keys(buildSetupOverrides).length === 0;
  const [selectedProfileId, setSelectedProfileId] = useState(() =>
    isCalculated ? "__calculated" : (matchingProfile?.id ?? "__modified"),
  );

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
    onCharacterProfilesChange(
      characterProfiles.map((profile) =>
        profile.id === selectedProfileId
          ? {
              ...profile,
              statOverrides: { ...statOverrides },
              attunementOverrides: { ...attunementOverrides },
              innerWays: innerWays.map((row) => ({ ...row })),
              buildSetup: {
                ...buildSetup,
                innerWays: innerWays.map((row) => ({ ...row })),
                weaponSets: { ...buildSetup.weaponSets },
                armorSets: { ...buildSetup.armorSets },
              },
            }
          : profile,
      ),
    );
  }, [
    attunementOverrides,
    buildSetup,
    characterProfiles,
    innerWays,
    isCalculated,
    onCharacterProfilesChange,
    selectedProfileId,
    statOverrides,
  ]);

  function applyProfile(profile?: CharacterProfile) {
    setAttunementDrafts({});
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
    onCharacterProfilesChange([
      ...characterProfiles,
      {
        id,
        name,
        statOverrides: { ...statOverrides },
        attunementOverrides: { ...attunementOverrides },
        innerWays: innerWays.map((row) => ({ ...row })),
        buildSetup: {
          ...buildSetup,
          innerWays: innerWays.map((row) => ({ ...row })),
          weaponSets: { ...buildSetup.weaponSets },
          armorSets: { ...buildSetup.armorSets },
        },
      },
    ]);
    setSelectedProfileId(id);
    setNewProfileName("");
    setProfileTransferStatus({ message: t("ui.app.profileSaved", { name }) });
  }

  function exportProfiles() {
    const blob = new Blob([exportCharacterProfiles(characterProfiles)], { type: "application/json" });
    const href = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = href;
    link.download = `where-builds-meet-character-profiles-${new Date().toISOString().slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(href);
    setProfileTransferStatus({ message: t("ui.app.profilesExported", { count: characterProfiles.length }) });
  }

  async function importProfiles(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const result = mergeImportedCharacterProfiles(characterProfiles, JSON.parse(await file.text()));
      onCharacterProfilesChange(result.profiles);
      setProfileTransferStatus({ message: t("ui.app.profilesImported", { count: result.importedCount }) });
    } catch (error) {
      setProfileTransferStatus({
        message: error instanceof Error ? error.message : t("ui.app.profileImportError"),
        error: true,
      });
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

  function CalculatedStatField({
    definition,
    derivedLabel,
    derivedValue,
    derivedUnit,
    compact,
  }: {
    definition: StatDefinition;
    derivedLabel?: string;
    derivedValue?: number;
    derivedUnit?: string;
    compact?: boolean;
  }) {
    return (
      <StatField
        definition={definition}
        stats={stats}
        onChange={updateStat}
        modified={Object.prototype.hasOwnProperty.call(statOverrides, definition.key)}
        onReset={() => onStatReset(definition.key)}
        derivedLabel={derivedLabel}
        derivedValue={derivedValue}
        derivedUnit={derivedUnit}
        compact={compact}
      />
    );
  }

  const physicalRows = [
    [combatStats[0], combatStats[1]],
    [combatStats[2], combatStats[3]],
    [combatStats[4], combatStats[5]],
    [combatStats[6], combatStats[7]],
    [combatStats[8], combatStats[9]],
  ];
  const [bodyStat, defenseStat, maxHpStat, physicalDefenseStat] = survivalStats;
  const martialRows = [0, 1, 2, 3].map((index) => [martialArtsStats[index * 2], martialArtsStats[index * 2 + 1]]);
  const selectedArtStats = Array.from(
    new Set(settings.weapons.map((weapon) => artStatByWeaponFamily[martialArtDefinitions[weapon].weapon])),
  ).flatMap((key) => {
    const definition = allStatDefinitions.find((candidate) => candidate.key === key);
    return definition ? [definition] : [];
  });
  const penetrationRows = [
    [defenseStats[0], defenseStats[1]],
    [defenseStats[2], defenseStats[3]],
  ];
  const innerWayOptions = [
    ["", t("ui.app.none")],
    ...innerWayEntriesForTag(typedPathDefinitions[pathId].tag).map(
      ([value, definition]) =>
        [value, dataText(`system.innerWay.${value.charAt(0).toLowerCase()}${value.slice(1)}`, definition.name)] as [
          string,
          string,
        ],
    ),
  ];
  const attunementFields = Object.entries(attunementData)
    .filter(([key]) => attunementAvailableForSettings(key, pathId, settings))
    .map(
      ([key, definition]) =>
        [
          key as keyof AttunementStats,
          dataText(`system.attunement.${key}`, definition.name),
          definition.percentage ? "%" : "",
        ] as const,
    );
  const armorAttunementStart = attunementFields.findIndex(([key]) => attunementData[key]?.tags.includes("Armor"));
  const availableWeaponSets = availableSetEntriesForSettings(typedWeaponSetDefinitions, settings, pathId);
  const availableArmorSets = availableSetEntriesForSettings(typedArmorSetDefinitions, settings, pathId);
  const setupStatus = (group: string, value: string, active: boolean) => {
    if (active) return <small className="setup-active-label">{t("ui.app.active")}</small>;
    const comparison = rotationMetrics?.setupComparisons[group]?.find((row) => row.label === value);
    return comparison ? (
      <small
        className={`setup-delta-label ${comparison.dpsDifference >= 0 ? "setup-positive-label" : "setup-negative-label"}`}
      >
        <span>
          {comparison.dpsDifference >= 0 ? "+" : ""}
          {formatNumber(comparison.dpsDifference)} {t("system.dps")}
        </span>
        <span>
          ({comparison.increase >= 0 ? "+" : ""}
          {formatNumber(comparison.increase)}%)
        </span>
      </small>
    ) : (
      <small className="setup-inactive-label">—</small>
    );
  };
  const setPanel = (
    title: string,
    key: "weaponSets" | "armorSets",
    definitions: Record<string, GearSetDefinition>,
    entries: Array<[string, GearSetDefinition]>,
  ) => (
    <section className="panel setup-placeholder-panel">
      <div className="panel-heading">
        <div>
          <h2>{title}</h2>
          <CalculationStatus category={key} />
        </div>
        {buildSetupOverrides[key] && (
          <button
            className="stat-reset-button"
            type="button"
            aria-label={t("ui.app.resetNamedValue", { name: title })}
            title={t("ui.app.resetToBuildValue")}
            onClick={() => onBuildSetupReset(key)}
          >
            <UiIcon name="reset" />
          </button>
        )}
      </div>
      <div className="gear-set-list">
        {entries.map(([setName, definition]) => {
          const selectedTier = buildSetup[key][setName] ?? 0;
          return (
            <div className="setup-field" key={setName}>
              <span>{gameText(definition.name)}</span>
              <div className="setup-option-control">
                <div className="setup-option-list">
                  {[0, 2, 4].map((tier) => (
                    <button
                      className={selectedTier === tier ? "selected" : ""}
                      type="button"
                      key={tier}
                      onClick={() =>
                        onBuildSetupChange(key, selectSetTier(buildSetup[key], setName, tier as 0 | 2 | 4, definitions))
                      }
                    >
                      {t(`system.setPieces.${tier}`)}
                      <span>{setupStatus(`${key}:${setName}`, String(tier), selectedTier === tier)}</span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
  const globalDebuffOption = (key: (typeof globalDebuffRows)[number]["key"], value: boolean, label: string) => {
    const active = globalDebuffs[key] === value;
    const optionValue = value ? "on" : "off";
    return (
      <button
        className={active ? "selected" : ""}
        type="button"
        key={optionValue}
        onClick={() => updateGlobalDebuff(key, value)}
      >
        {label}
        <span>{setupStatus(`debuff:${key}`, optionValue, active)}</span>
      </button>
    );
  };

  return (
    <>
      <div className="app-layout">
        <div className="character-stats-column">
          <section className="panel stats-panel">
            <div className="panel-heading character-stats-heading">
              <div>
                <h2>{t("ui.app.characterStats")}</h2>
              </div>
              <div className="character-profile-controls">
                <select
                  aria-label={t("ui.app.characterProfile")}
                  value={selectedProfileId}
                  onChange={(event) => {
                    if (event.target.value === "__calculated") selectProfile();
                    else selectProfile(characterProfiles.find(({ id }) => id === event.target.value));
                  }}
                >
                  <option value="__calculated">{t("ui.app.calculated")}</option>
                  {selectedProfileId === "__modified" && (
                    <option value="__modified" disabled>
                      {t("ui.app.unsavedChanges")}
                    </option>
                  )}
                  {characterProfiles.map((profile) => (
                    <option value={profile.id} key={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <button
                  className="button button-secondary"
                  type="button"
                  onClick={() => {
                    setProfileTransferStatus(undefined);
                    profileDialogRef.current?.showModal();
                  }}
                >
                  {t("ui.app.profiles")}
                </button>
                <button className="button button-secondary" type="button" onClick={() => selectProfile()}>
                  {t("ui.app.reset")}
                </button>
              </div>
            </div>
            <div className="stats-grid">
              {physicalRows.map(([left, right], index) => (
                <div className="stat-row" key={left.key}>
                  <CalculatedStatField
                    definition={left}
                    derivedLabel={
                      index === 0
                        ? t("ui.app.effectiveMinPhysicalAttack")
                        : index === 3
                          ? t("ui.app.effectiveCritical")
                          : index === 4
                            ? t("ui.app.effectiveAffinity")
                            : undefined
                    }
                    derivedValue={
                      index === 0
                        ? derivedStats.effectiveMinPhys
                        : index === 3
                          ? derivedStats.effectiveCrit * 100
                          : index === 4
                            ? derivedStats.effectiveAffinity * 100
                            : undefined
                    }
                    derivedUnit={index === 3 || index === 4 ? "%" : undefined}
                  />
                  <CalculatedStatField
                    definition={right}
                    derivedLabel={
                      index === 0
                        ? t("ui.app.effectiveMaxPhysicalAttack")
                        : index === 2
                          ? t("ui.app.effectivePrecision")
                          : index === 3
                            ? t("ui.app.finalCritical")
                            : index === 4
                              ? t("ui.app.finalAffinity")
                              : undefined
                    }
                    derivedValue={
                      index === 0
                        ? derivedStats.effectiveMaxPhys
                        : index === 2
                          ? derivedStats.effectivePrecision * 100
                          : index === 3
                            ? derivedStats.finalCrit * 100
                            : index === 4
                              ? derivedStats.finalAffinity * 100
                              : undefined
                    }
                    derivedUnit={index === 2 || index === 3 || index === 4 ? "%" : undefined}
                  />
                </div>
              ))}
              {martialRows.map(([left, right], index) => (
                <div className="stat-row" key={left.key}>
                  <CalculatedStatField
                    definition={left}
                    derivedLabel={t("ui.app.effectiveNamedStat", { name: gameText(left.label) })}
                    derivedValue={
                      derivedStats[
                        [
                          "effectiveMinBellstrike",
                          "effectiveMinStonesplit",
                          "effectiveMinSilkbind",
                          "effectiveMinBamboocut",
                        ][index] as keyof typeof derivedStats
                      ] as number
                    }
                  />
                  <CalculatedStatField
                    definition={right}
                    derivedLabel={t("ui.app.effectiveNamedStat", { name: gameText(right.label) })}
                    derivedValue={
                      derivedStats[
                        [
                          "effectiveMaxBellstrike",
                          "effectiveMaxStonesplit",
                          "effectiveMaxSilkbind",
                          "effectiveMaxBamboocut",
                        ][index] as keyof typeof derivedStats
                      ] as number
                    }
                  />
                </div>
              ))}
              <div className="stat-row">
                <CalculatedStatField definition={martialArtsStats[8]} compact />
                <CalculatedStatField definition={martialArtsStats[9]} compact />
              </div>
              {penetrationRows.map(([left, right]) => (
                <div className="stat-row" key={left.key}>
                  <CalculatedStatField definition={left} compact />
                  <CalculatedStatField definition={right} compact />
                </div>
              ))}
              <div className="stat-row">
                <CalculatedStatField
                  definition={defenseStats[13]}
                  derivedLabel={t("ui.app.effectiveNamedStat", { name: gameText(defenseStats[13].label) })}
                  derivedValue={derivedStats.effectiveCritDmgBonus * 100}
                  derivedUnit="%"
                  compact
                />
                <CalculatedStatField definition={defenseStats[14]} compact />
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={defenseStats[4]} compact />
                <CalculatedStatField definition={defenseStats[5]} compact />
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={defenseStats[6]} compact />
                <CalculatedStatField definition={defenseStats[7]} compact />
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={defenseStats[8]} compact />
                <span />
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={defenseStats[9]} compact />
                <CalculatedStatField definition={defenseStats[10]} compact />
              </div>
              <div className="stat-row">
                {selectedArtStats.map((definition) => (
                  <CalculatedStatField definition={definition} compact key={definition.key} />
                ))}
                {selectedArtStats.length === 1 && <span />}
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={defenseStats[15]} compact />
                <CalculatedStatField definition={defenseStats[16]} compact />
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={maxHpStat} compact />
                <CalculatedStatField definition={bodyStat} compact />
              </div>
              <div className="stat-row">
                <CalculatedStatField definition={physicalDefenseStat} compact />
                <CalculatedStatField definition={defenseStat} compact />
              </div>
            </div>
          </section>
          <div className="character-secondary-stats">
            <section className="panel attunement-panel">
              <div className="panel-heading">
                <div>
                  <h2>{t("ui.app.attunementStats")}</h2>
                  <CalculationStatus category="attunementPriority" />
                </div>
              </div>
              <div className="attunement-list">
                {attunementFields.map(([key, label, unit], index) => (
                  <label
                    className={`attunement-field ${index === armorAttunementStart ? "attunement-section-start" : ""} ${Object.prototype.hasOwnProperty.call(attunementOverrides, key) ? "modified-field" : ""}`}
                    key={key}
                  >
                    <span className="attunement-label">
                      <span>{label}</span>
                      {Object.prototype.hasOwnProperty.call(attunementOverrides, key) && (
                        <button
                          className="stat-reset-button"
                          type="button"
                          aria-label={t("ui.app.resetNamedValue", { name: label })}
                          title={t("ui.app.resetToCalculatedValue")}
                          onClick={(event) => {
                            event.preventDefault();
                            resetAttunement(key);
                          }}
                        >
                          <UiIcon name="reset" />
                        </button>
                      )}
                    </span>
                    <span className="attunement-input-wrap">
                      <input
                        type="number"
                        step="0.01"
                        value={
                          attunementDrafts[key] ??
                          formatNumber(unit ? attunementStats[key] * 100 : attunementStats[key])
                        }
                        onChange={(event) =>
                          setAttunementDrafts((current) => ({ ...current, [key]: event.target.value }))
                        }
                        onBlur={(event) => {
                          if (attunementDrafts[key] !== undefined) commitAttunement(key, event.currentTarget.value);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") event.currentTarget.blur();
                        }}
                      />
                      {unit && <i>{unit}</i>}
                    </span>
                  </label>
                ))}
              </div>
            </section>
            <section className="panel global-debuff-panel">
              <div className="panel-heading">
                <div>
                  <h2>{t("ui.app.globalBuffsDebuffs")}</h2>
                  <CalculationStatus category="globalDebuffs" />
                </div>
              </div>
              <div className="global-debuff-list">
                {globalDebuffRows.map(({ key, name, path }) => (
                  <div className="global-debuff-row" key={key}>
                    <span>
                      {gameText(name)} ({gameText(path)})
                    </span>
                    <div className="setup-option-list global-debuff-options">
                      {globalDebuffOption(key, false, t("ui.app.off"))}
                      {globalDebuffOption(key, true, t("ui.app.on"))}
                    </div>
                  </div>
                ))}
                <div className="global-debuff-row">
                  <span>{t("system.innerWay.bitterSeasons")}</span>
                  <div className="setup-option-list global-debuff-options qingyi-options">
                    {(["none", "T1", "T6"] as const).map((value) => {
                      const active = globalDebuffs.qingyisCharm === value;
                      return (
                        <button
                          className={active ? "selected" : ""}
                          type="button"
                          key={value}
                          onClick={() => updateGlobalDebuff("qingyisCharm", value)}
                        >
                          {value === "none" ? t("ui.app.none") : value}
                          <span>{setupStatus("debuff:qingyisCharm", value, active)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
        <section className="middle-stats-column">
          <section className="panel inner-way-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.app.innerWays")}</h2>
              </div>
              {buildSetupOverrides.innerWays && (
                <button
                  className="stat-reset-button"
                  type="button"
                  aria-label={t("ui.app.resetInnerWays")}
                  title={t("ui.app.resetToBuildValue")}
                  onClick={() => onBuildSetupReset("innerWays")}
                >
                  <UiIcon name="reset" />
                </button>
              )}
            </div>
            <div className="inner-way-list">
              {innerWays.map((row, index) => (
                <div className="inner-way-row" key={index}>
                  <select
                    aria-label={t("ui.app.innerWayNumber", { number: index + 1 })}
                    value={innerWayAvailableForPath(row.innerWay, pathId) ? row.innerWay : ""}
                    onChange={(event) => {
                      const next = innerWays.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, innerWay: event.target.value } : item,
                      );
                      onBuildSetupChange("innerWays", next);
                      onInnerWayChange();
                    }}
                  >
                    {innerWayOptions.map(([value, label]) => (
                      <option
                        key={value}
                        value={value}
                        disabled={
                          Boolean(value) &&
                          innerWays.some((item, itemIndex) => itemIndex !== index && item.innerWay === value)
                        }
                      >
                        {label}
                      </option>
                    ))}
                  </select>
                  <select
                    aria-label={t("ui.app.innerWayTierNumber", { number: index + 1 })}
                    value={row.tier}
                    onChange={(event) => {
                      const next = innerWays.map((item, itemIndex) =>
                        itemIndex === index ? { ...item, tier: event.target.value } : item,
                      );
                      onBuildSetupChange("innerWays", next);
                      onInnerWayChange();
                    }}
                  >
                    {Array.from({ length: 7 }, (_, tier) => (
                      <option value={`T${tier}`} key={tier}>{`T${tier}`}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          </section>
          {setPanel(t("ui.app.weaponSet"), "weaponSets", typedWeaponSetDefinitions, availableWeaponSets)}
          {availableArmorSets.length > 0 &&
            setPanel(t("ui.app.armorSet"), "armorSets", typedArmorSetDefinitions, availableArmorSets)}
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.app.bowRingSet")}</h2>
                <CalculationStatus category="bowRingSet" />
              </div>
              {buildSetupOverrides.bowRingSet !== undefined && (
                <button
                  className="stat-reset-button"
                  type="button"
                  aria-label={t("ui.app.resetBowRingSet")}
                  title={t("ui.app.resetToBuildValue")}
                  onClick={() => onBuildSetupReset("bowRingSet")}
                >
                  <UiIcon name="reset" />
                </button>
              )}
            </div>
            <div className="setup-option-list setup-option-list-wide">
              {Object.entries(typedBowRingSetDefinitions).map(([value, definition]) => (
                <button
                  className={bowRingSet === value ? "selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => onBuildSetupChange("bowRingSet", value)}
                >
                  {gameText(definition.name)}
                  <span>{setupStatus("bowRingSet", value, bowRingSet === value)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.app.arsenal")}</h2>
                <CalculationStatus category="arsenal" />
              </div>
              {buildSetupOverrides.arsenal !== undefined && (
                <button
                  className="stat-reset-button"
                  type="button"
                  aria-label={t("ui.app.resetArsenal")}
                  title={t("ui.app.resetToBuildValue")}
                  onClick={() => onBuildSetupReset("arsenal")}
                >
                  <UiIcon name="reset" />
                </button>
              )}
            </div>
            <div className="setup-option-list setup-option-list-arsenal">
              {Object.entries(typedArsenalDefinitions).map(([value, definition]) => (
                <button
                  className={arsenal === value ? "selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => onBuildSetupChange("arsenal", value)}
                >
                  {gameText(definition.name)}
                  <span>{setupStatus("arsenal", value, arsenal === value)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.app.food")}</h2>
                <CalculationStatus category="food" />
              </div>
            </div>
            <div className="setup-option-list setup-option-list-food">
              {Object.entries(typedFoodDefinitions).map(([value, definition]) => (
                <button
                  className={food === value ? "selected" : ""}
                  type="button"
                  key={value}
                  onClick={() => {
                    setFood(value);
                    sessionStorage.setItem(foodStorageKey, value);
                    onInnerWayChange();
                  }}
                >
                  {gameText(definition.name)}
                  <span>{setupStatus("food", value, food === value)}</span>
                </button>
              ))}
            </div>
          </section>
          <section className="panel setup-placeholder-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.app.script")}</h2>
                <CalculationStatus category="script" />
              </div>
            </div>
            <div className="script-option-list">
              {scriptDisplayOrder.map((value) => {
                const definition = typedScriptDefinitions[value];
                if (!definition) return null;
                return (
                  <button
                    className={`script-option ${script === value ? "selected" : ""}`}
                    type="button"
                    key={value}
                    title={`${gameText(definition.name)}: ${gameText(definition.description)}`}
                    onClick={() => {
                      setScript(value);
                      sessionStorage.setItem(scriptStorageKey, value);
                      onInnerWayChange();
                    }}
                  >
                    <span className="script-image-frame">
                      {definition.image ? (
                        <img src={`${import.meta.env.BASE_URL}script/${definition.image}`} alt="" />
                      ) : (
                        <span className="script-none-mark" aria-hidden="true" />
                      )}
                    </span>
                    <strong>{gameText(definition.name)}</strong>
                    <span className="script-option-status">{setupStatus("script", value, script === value)}</span>
                  </button>
                );
              })}
            </div>
          </section>
          <section className="panel setup-placeholder-panel divinecraft-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("ui.app.divinecraft")}</h2>
                <CalculationStatus category="divinecraft" />
              </div>
            </div>
            <div className="divinecraft-option-list">
              {divinecraftDisplayOrder.map((value, index) => {
                if (value === null)
                  return <span className="divinecraft-option-spacer" aria-hidden="true" key={`spacer-${index}`} />;
                const definition = typedDivinecraftDefinitions[value];
                if (!definition) return null;
                const available = definition.available !== false;
                return (
                  <button
                    className={`divinecraft-option ${divinecraft === value ? "selected" : ""}`}
                    type="button"
                    key={value}
                    disabled={!available}
                    title={`${gameText(definition.name)}: ${gameText(definition.description)}${available ? "" : t("ui.app.notAvailableYet")}`}
                    onClick={() => {
                      setDivinecraft(value);
                      sessionStorage.setItem(divinecraftStorageKey, value);
                      onInnerWayChange();
                    }}
                  >
                    <span className="divinecraft-image-frame">
                      {definition.image ? (
                        <img src={`${import.meta.env.BASE_URL}divinecraft/${definition.image}`} alt="" />
                      ) : (
                        <span className="divinecraft-none-mark" aria-hidden="true" />
                      )}
                    </span>
                    <strong>{gameText(definition.name)}</strong>
                    <span className="divinecraft-option-status">
                      {available ? (
                        setupStatus("divinecraft", value, divinecraft === value)
                      ) : (
                        <small>{t("ui.app.divinecraftUnavailableBadge")}</small>
                      )}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        </section>
        <aside className="results-column">
          <section className="panel dps-panel">
            <div className="panel-heading">
              <div>
                <h2>{t("system.dps")}</h2>
              </div>
            </div>
            <div className="dps-value">{rotationMetrics ? formatNumber(rotationMetrics.dps) : "—"}</div>
            <CalculationStatus category="baseline" className="dps-calculation-status" />
            <div className="dps-context">
              <div>
                <span>{t("ui.app.build")}</span>
                <strong title={activeBuildName}>{activeBuildName}</strong>
              </div>
              <div>
                <span>{t("ui.app.rotation")}</span>
                <strong title={activeRotationName}>{activeRotationName}</strong>
              </div>
            </div>
          </section>
          <PriorityPanel
            title={t("ui.app.statsPriority")}
            rows={rotationMetrics?.statPriority ?? []}
            calculationCategory="statPriority"
            showMaxRoll
          />
          <PriorityPanel
            title={t("ui.app.attunementStatsPriority")}
            rows={rotationMetrics?.attunementPriority ?? []}
            calculationCategory="attunementPriority"
            sectionBreakAt={2}
            showMaxRoll
          />
          <PriorityPanel
            title={t("ui.app.innerWaysPriority")}
            rows={rotationMetrics?.innerWayPriority ?? []}
            calculationCategory="innerWays"
          />
        </aside>
      </div>
      <dialog
        className="character-profile-dialog"
        ref={profileDialogRef}
        onCancel={() => setProfileTransferStatus(undefined)}
      >
        <div className="character-profile-dialog-heading">
          <div>
            <h2>{t("ui.app.characterProfiles")}</h2>
            <p>{t("ui.app.profilesSaveModifiedStatsAndTheCompleteMain")}</p>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t("ui.app.closeCharacterProfiles")}
            onClick={() => profileDialogRef.current?.close()}
          >
            <UiIcon name="close" />
          </button>
        </div>
        <div className="character-profile-create">
          <input
            value={newProfileName}
            placeholder={t("ui.app.profileName")}
            aria-label={t("ui.app.newCharacterProfileName")}
            onChange={(event) => setNewProfileName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") createProfile();
            }}
          />
          <button
            className="button button-primary"
            type="button"
            disabled={!newProfileName.trim()}
            onClick={createProfile}
          >
            {t("ui.app.saveCurrent")}
          </button>
        </div>
        <div className="character-profile-list">
          <div className="character-profile-row calculated-profile-row">
            <strong>{t("ui.app.calculated")}</strong>
            <button
              className="button button-secondary button-small"
              type="button"
              onClick={() => {
                selectProfile();
                profileDialogRef.current?.close();
              }}
            >
              {t("ui.app.load")}
            </button>
          </div>
          {characterProfiles.map((profile) => (
            <div className="character-profile-row" key={profile.id}>
              <input
                defaultValue={profile.name}
                aria-label={t("ui.app.renameNamedProfile", { name: profile.name })}
                onBlur={(event) => {
                  const name = event.currentTarget.value.trim();
                  if (!name) {
                    event.currentTarget.value = profile.name;
                    return;
                  }
                  if (name !== profile.name)
                    onCharacterProfilesChange(
                      characterProfiles.map((candidate) =>
                        candidate.id === profile.id ? { ...candidate, name } : candidate,
                      ),
                    );
                }}
              />
              <div>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    selectProfile(profile);
                    profileDialogRef.current?.close();
                  }}
                >
                  {t("ui.app.load")}
                </button>
                <button
                  className="button button-secondary button-small"
                  type="button"
                  onClick={() => {
                    const usedIds = new Set(characterProfiles.map(({ id }) => id));
                    const baseId = `${profile.id}:copy`;
                    let id = baseId;
                    let suffix = 2;
                    while (usedIds.has(id)) id = `${baseId}:${suffix++}`;
                    onCharacterProfilesChange([
                      ...characterProfiles,
                      {
                        ...profile,
                        id,
                        name: `${profile.name} Copy`,
                        statOverrides: { ...profile.statOverrides },
                        attunementOverrides: { ...profile.attunementOverrides },
                        innerWays: profile.innerWays.map((row) => ({ ...row })),
                        buildSetup: {
                          ...profile.buildSetup,
                          innerWays: profile.innerWays.map((row) => ({ ...row })),
                          weaponSets: { ...profile.buildSetup.weaponSets },
                          armorSets: { ...profile.buildSetup.armorSets },
                        },
                      },
                    ]);
                  }}
                >
                  {t("ui.app.duplicate")}
                </button>
                <button
                  className="button button-danger button-small"
                  type="button"
                  onClick={() => onCharacterProfilesChange(characterProfiles.filter(({ id }) => id !== profile.id))}
                >
                  {t("ui.app.delete")}
                </button>
              </div>
            </div>
          ))}
        </div>
        <div className="character-profile-transfer">
          <div>
            <button
              className="button button-secondary button-small"
              type="button"
              disabled={characterProfiles.length === 0}
              onClick={exportProfiles}
            >
              {t("ui.app.export")}
            </button>
            <label className="button button-secondary button-small character-profile-import">
              {t("ui.app.import")}
              <input
                type="file"
                accept="application/json,.json"
                aria-label={t("ui.app.importCharacterProfiles")}
                onChange={importProfiles}
              />
            </label>
          </div>
          {profileTransferStatus && (
            <p
              className={profileTransferStatus.error ? "error" : ""}
              role={profileTransferStatus.error ? "alert" : "status"}
            >
              {profileTransferStatus.message}
            </p>
          )}
          <button className="button button-primary" type="button" onClick={() => profileDialogRef.current?.close()}>
            {t("ui.app.done")}
          </button>
        </div>
      </dialog>
    </>
  );
}

function skillToDraft(skill: SkillRecord) {
  const { name = "", shortName = "", castTime = 0, action = [], modifier = [], tags = [] } = skill;
  const toObjects = (items: unknown[]) =>
    items.map((item) => (item && typeof item === "object" && !Array.isArray(item) ? (item as EditableObject) : {}));
  const stackEffects = Array.isArray(skill.stackEffects) ? skill.stackEffects : [];
  const periodicActions = Array.isArray(skill.periodic?.action) ? skill.periodic.action : [];
  const isDot = tags.includes("DOT");
  return {
    name,
    shortName,
    description: asString(skill.description),
    refresh: skill.refresh !== false,
    castTime: String(castTime),
    cooldown: typeof skill.cooldown === "number" ? String(skill.cooldown) : "",
    duration: typeof skill.duration === "number" ? String(skill.duration) : "",
    maxStack: typeof skill.maxStack === "number" ? String(skill.maxStack) : "",
    periodicInterval: typeof skill.periodic?.interval === "number" ? String(skill.periodic.interval) : "",
    firstTick: typeof skill.periodic?.firstTick === "number" ? String(skill.periodic.firstTick) : "",
    resetOnRefresh: skill.periodic?.resetOnRefresh === true,
    tags: tags.join(", "),
    actionItems: toObjects(isDot ? periodicActions : action),
    modifierItems: toObjects(modifier),
    effectItems: toObjects(Array.isArray(skill.effect) ? skill.effect : []),
    stackEffectGroups: stackEffects.map((group) => toObjects(Array.isArray(group) ? group : [])),
  };
}

const actionTypes = ["damage", "consume", "apply", "trigger", "extend", "clearCD"];
const conditionTargets = ["self", "target", "skillTag", "martialArt"];
const effectFields = [
  "castTimeModifier",
  "castTimeMultiplier",
  "baseDMGBonus",
  "hpDMGBonus",
  "globalDmgBonus",
  "globalHPDMGBonus",
  "globalBellstrikeDMGBonus",
  "dotDamage",
  "dmgBonus",
  "defenseBonus",
  "physicalPenetration",
  "formlessPenetration",
  "physicalResistance",
  "bellstrikeResistance",
  "stonesplitResistance",
  "silkbindResistance",
  "bamboocutResistance",
  "critDmgBonus",
  "affinityDmgBonus",
  "SteadfastGuaranteedCrit",
  "enhanceDrunkenPoet",
];
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
      const payload =
        parsed.effect && typeof parsed.effect === "object" && !Array.isArray(parsed.effect)
          ? (parsed.effect as EditableObject)
          : parsed;
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
  const requirements = Array.isArray(value) ? (value as unknown[]) : [];
  function editLeaf(leaf: unknown, field: string, fieldValue: string) {
    const current = leaf && typeof leaf === "object" && !Array.isArray(leaf) ? (leaf as EditableObject) : {};
    return { ...current, [field]: fieldValue };
  }
  function updateLeaf(index: number, field: string, fieldValue: string) {
    const next = [...requirements];
    next[index] = editLeaf(next[index], field, fieldValue);
    onChange(next);
  }
  function updateOrLeaf(
    groupIndex: number,
    operandIndex: number,
    field: string,
    fieldValue: string,
    nestedIndex?: number,
  ) {
    const group = requirements[groupIndex] as EditableObject;
    const operands = Array.isArray(group.operand) ? [...group.operand] : [];
    if (nestedIndex === undefined) operands[operandIndex] = editLeaf(operands[operandIndex], field, fieldValue);
    else {
      const nested = Array.isArray(operands[operandIndex]) ? [...(operands[operandIndex] as unknown[])] : [];
      nested[nestedIndex] = editLeaf(nested[nestedIndex], field, fieldValue);
      operands[operandIndex] = nested;
    }
    const next = [...requirements];
    next[groupIndex] = { ...group, operand: operands };
    onChange(next);
  }
  function addOrGroup() {
    onChange([
      ...requirements,
      {
        operator: "or",
        operand: [
          { target: "self", value: "" },
          { target: "self", value: "" },
        ],
      },
    ]);
  }
  function addOrOperand(groupIndex: number) {
    const group = requirements[groupIndex] as EditableObject;
    const next = [...requirements];
    next[groupIndex] = {
      ...group,
      operand: [...(Array.isArray(group.operand) ? group.operand : []), { target: "self", value: "" }],
    };
    onChange(next);
  }
  function removeOrOperand(groupIndex: number, operandIndex: number, nestedIndex?: number) {
    const group = requirements[groupIndex] as EditableObject;
    const operands = Array.isArray(group.operand) ? [...group.operand] : [];
    if (nestedIndex === undefined) operands.splice(operandIndex, 1);
    else {
      const nested = Array.isArray(operands[operandIndex]) ? [...(operands[operandIndex] as unknown[])] : [];
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
      <div className="sub-editor-heading">
        <span>
          {t("ui.app.requirements")} <small>{t("ui.app.allConditionsMustPass")}</small>
        </span>
        <div className="sub-editor-buttons">
          <button className="button button-small" type="button" onClick={addLeaf}>
            {t("ui.app.addCondition")}
          </button>
          <button className="button button-small" type="button" onClick={addOrGroup}>
            {t("ui.app.addOr")}
          </button>
        </div>
      </div>
      {requirements.length === 0 && <span className="sub-editor-empty">{t("ui.app.noRequirements")}</span>}
      {requirements.map((requirement, index) => {
        const item =
          requirement && typeof requirement === "object" && !Array.isArray(requirement)
            ? (requirement as EditableObject)
            : {};
        if (item.operator === "or") {
          const operands = Array.isArray(item.operand) ? item.operand : [];
          return (
            <div className="or-condition" key={index}>
              <div className="or-condition-heading">
                <span>{t("ui.app.orGroup")}</span>
                <button type="button" onClick={() => remove(index)}>
                  {t("ui.app.remove")}
                </button>
              </div>
              {operands.map((operand, operandIndex) =>
                Array.isArray(operand) ? (
                  <div className="and-group" key={operandIndex}>
                    <small>{t("ui.app.andGroup")}</small>
                    {operand.map((leaf, nestedIndex) => (
                      <div className="condition-row" key={nestedIndex}>
                        <select
                          value={asString((leaf as EditableObject)?.target) || "self"}
                          onChange={(event) =>
                            updateOrLeaf(index, operandIndex, "target", event.target.value, nestedIndex)
                          }
                        >
                          {conditionTargets.map((target) => (
                            <option key={target}>{target}</option>
                          ))}
                        </select>
                        <input
                          value={asString((leaf as EditableObject)?.value)}
                          placeholder={t("ui.app.value")}
                          onChange={(event) =>
                            updateOrLeaf(index, operandIndex, "value", event.target.value, nestedIndex)
                          }
                        />
                        <button
                          type="button"
                          aria-label={t("ui.app.removeAlternative")}
                          onClick={() => removeOrOperand(index, operandIndex, nestedIndex)}
                        >
                          <UiIcon name="close" />
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="condition-row" key={operandIndex}>
                    <select
                      value={asString((operand as EditableObject)?.target) || "self"}
                      onChange={(event) => updateOrLeaf(index, operandIndex, "target", event.target.value)}
                    >
                      {conditionTargets.map((target) => (
                        <option key={target}>{target}</option>
                      ))}
                    </select>
                    <input
                      value={asString((operand as EditableObject)?.value)}
                      placeholder={t("ui.app.value")}
                      onChange={(event) => updateOrLeaf(index, operandIndex, "value", event.target.value)}
                    />
                    <button
                      type="button"
                      aria-label={t("ui.app.removeAlternative")}
                      onClick={() => removeOrOperand(index, operandIndex)}
                    >
                      <UiIcon name="close" />
                    </button>
                  </div>
                ),
              )}
              <button className="button button-small" type="button" onClick={() => addOrOperand(index)}>
                {t("ui.app.addAlternative")}
              </button>
            </div>
          );
        }
        return (
          <div className="condition-row" key={index}>
            <select
              value={asString(item.target) || "self"}
              onChange={(event) => updateLeaf(index, "target", event.target.value)}
            >
              {conditionTargets.map((target) => (
                <option key={target}>{target}</option>
              ))}
            </select>
            <input
              value={asString(item.value)}
              placeholder={t("ui.app.value")}
              onChange={(event) => updateLeaf(index, "value", event.target.value)}
            />
            <button type="button" aria-label={t("ui.app.removeCondition")} onClick={() => remove(index)}>
              <UiIcon name="close" />
            </button>
          </div>
        );
      })}
    </div>
  );
}

function NumberField({ label, value, onChange }: { label: string; value: unknown; onChange: (value: number) => void }) {
  return (
    <label className="detail-field">
      <span>{label}</span>
      <input
        type="number"
        step="0.0001"
        value={typeof value === "number" ? value : ""}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </label>
  );
}

function ActionDetails({
  item,
  onChange,
  skillIds,
}: {
  item: EditableObject;
  onChange: (item: EditableObject) => void;
  skillIds: string[];
}) {
  const type = asString(item.type) || "damage";
  const set = (field: string, value: unknown) => onChange(updateObjectField(item, field, value));
  const firstConsume =
    item.value &&
    typeof item.value === "object" &&
    !Array.isArray(item.value) &&
    (item.value as EditableObject).operator === "first";
  const consumeText = firstConsume
    ? Array.isArray((item.value as EditableObject).operand)
      ? ((item.value as EditableObject).operand as unknown[]).map(asString).join(", ")
      : ""
    : asString(item.value);
  function setConsumeMode(mode: string) {
    const current = consumeText
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);
    set("value", mode === "first" ? { operator: "first", operand: current } : (current[0] ?? ""));
  }
  function setConsumeText(value: string) {
    set(
      "value",
      firstConsume
        ? {
            operator: "first",
            operand: value
              .split(",")
              .map((part) => part.trim())
              .filter(Boolean),
          }
        : value,
    );
  }
  return (
    <div className="structured-detail">
      <div className="detail-fields">
        <label className="detail-field">
          <span>{t("ui.app.type")}</span>
          <select value={type} onChange={(event) => set("type", event.target.value)}>
            {actionTypes.map((actionType) => (
              <option key={actionType}>{actionType}</option>
            ))}
          </select>
        </label>
        <NumberField label={t("ui.app.time")} value={item.time} onChange={(value) => set("time", value)} />
      </div>
      {type === "damage" && (
        <div className="detail-fields detail-fields-four">
          <NumberField
            label={t("ui.app.physicalCoefficient")}
            value={item.phyCoef}
            onChange={(value) => set("phyCoef", value)}
          />
          <NumberField
            label={t("ui.app.physicalBonus")}
            value={item.phyBonus}
            onChange={(value) => set("phyBonus", value)}
          />
          <NumberField
            label={t("ui.app.attributeBonus")}
            value={item.attrBonus}
            onChange={(value) => set("attrBonus", value)}
          />
        </div>
      )}
      {(type === "apply" || type === "extend" || type === "clearCD") && (
        <div className="detail-fields">
          <label className="detail-field">
            <span>{t("ui.app.target")}</span>
            <select value={asString(item.target) || "self"} onChange={(event) => set("target", event.target.value)}>
              <option value="self">{"self"}</option>
              <option value="target">{"target"}</option>
            </select>
          </label>
          <label className="detail-field">
            <span>{t("ui.app.value")}</span>
            <input value={asString(item.value)} onChange={(event) => set("value", event.target.value)} />
          </label>
        </div>
      )}
      {type === "consume" && (
        <div className="detail-fields consume-fields">
          <label className="detail-field">
            <span>{t("ui.app.target")}</span>
            <select value={asString(item.target) || "self"} onChange={(event) => set("target", event.target.value)}>
              <option value="self">{"self"}</option>
              <option value="target">{"target"}</option>
            </select>
          </label>
          <label className="detail-field">
            <span>{t("ui.app.valueMode")}</span>
            <select value={firstConsume ? "first" : "name"} onChange={(event) => setConsumeMode(event.target.value)}>
              <option value="name">{t("ui.app.singleName")}</option>
              <option value="first">{t("ui.app.firstAvailable")}</option>
            </select>
          </label>
          <label className="detail-field consume-value-field">
            <span>{firstConsume ? t("ui.app.valuesCommaSeparated") : t("ui.app.value")}</span>
            <input value={consumeText} onChange={(event) => setConsumeText(event.target.value)} />
          </label>
        </div>
      )}
      {(type === "apply" || type === "consume") && (
        <div className="detail-fields">
          {type === "consume" && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={item.stack === "all"}
                onChange={(event) => set("stack", event.target.checked ? "all" : 1)}
              />
              <span>{t("ui.app.allStacks")}</span>
            </label>
          )}
          {item.stack !== "all" && (
            <NumberField label={t("ui.app.stack")} value={item.stack} onChange={(value) => set("stack", value)} />
          )}
          {type === "apply" && (
            <label className="checkbox-field">
              <input
                type="checkbox"
                checked={item.reapply === true}
                onChange={(event) => set("reapply", event.target.checked)}
              />
              <span>{t("ui.app.reapply")}</span>
            </label>
          )}
        </div>
      )}
      {(type === "apply" || type === "extend") && (
        <NumberField label={t("ui.app.duration")} value={item.duration} onChange={(value) => set("duration", value)} />
      )}
      {type === "trigger" && (
        <label className="detail-field">
          <span>{t("ui.app.triggeredSkill")}</span>
          <select value={asString(item.value)} onChange={(event) => set("value", event.target.value)}>
            <option value="">{t("ui.app.selectASkill")}</option>
            {skillIds.map((skillId) => (
              <option key={skillId}>{skillId}</option>
            ))}
          </select>
        </label>
      )}
      {(type === "apply" || type === "trigger" || type === "extend" || type === "clearCD") && (
        <RequirementEditor value={item.requirement} onChange={(value) => set("requirement", value)} />
      )}
    </div>
  );
}

function ModifierDetails({ item, onChange }: { item: EditableObject; onChange: (item: EditableObject) => void }) {
  const set = (field: string, value: unknown) => onChange(updateObjectField(item, field, value));
  const effect =
    item.effect && typeof item.effect === "object" && !Array.isArray(item.effect)
      ? (item.effect as EditableObject)
      : {};
  const effectEntries = Object.entries(effect);
  function updateEffect(field: string, value: unknown) {
    set("effect", { ...effect, [field]: value });
  }
  function addEffect() {
    const field = effectFields.find((candidate) => !(candidate in effect));
    if (field) updateEffect(field, booleanEffectFields.has(field) ? false : 0);
  }
  function removeEffect(field: string) {
    const next = { ...effect };
    delete next[field];
    set("effect", next);
  }
  return (
    <div className="structured-detail">
      <RequirementEditor value={item.requirement} onChange={(value) => set("requirement", value)} />
      <div className="sub-editor-heading">
        <span>{t("ui.app.effects")}</span>
        <button className="button button-small" type="button" onClick={addEffect}>
          {t("ui.app.addEffect")}
        </button>
      </div>
      {effectEntries.map(([field, value]) => (
        <div className="effect-row" key={field}>
          <select
            value={field}
            onChange={(event) => {
              const next = { ...effect };
              const nextField = event.target.value;
              if (nextField !== field) {
                next[nextField] = next[field];
                delete next[field];
                set("effect", next);
              }
            }}
          >
            {!effectFields.includes(field) && <option value={field}>{field}</option>}
            {effectFields.map((effectField) => (
              <option key={effectField}>{effectField}</option>
            ))}
          </select>
          <EffectValueEditor value={value} onChange={(nextValue) => updateEffect(field, nextValue)} />
          <button type="button" aria-label={t("ui.app.removeEffect")} onClick={() => removeEffect(field)}>
            <UiIcon name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}

function DynamicByStackValueEditor({
  value,
  onChange,
}: {
  value: EditableObject;
  onChange: (value: EditableObject) => void;
}) {
  return (
    <div className="dynamic-effect-editor">
      <label className="detail-field">
        <span>{t("ui.app.effect")}</span>
        <input
          value={asString(value.param1)}
          onChange={(event) => onChange({ ...value, function: "byStack", param1: event.target.value })}
        />
      </label>
      <label className="detail-field">
        <span>{t("ui.app.valuePerStack")}</span>
        <input
          type="number"
          step="0.0001"
          value={typeof value.param2 === "number" ? value.param2 : ""}
          onChange={(event) => onChange({ ...value, function: "byStack", param2: Number(event.target.value) })}
        />
      </label>
      <label className="detail-field">
        <span>{t("ui.app.target")}</span>
        <select
          value={value.target === "target" ? "target" : "self"}
          onChange={(event) => onChange({ ...value, function: "byStack", target: event.target.value })}
        >
          <option value="self">{"self"}</option>
          <option value="target">{"target"}</option>
        </select>
      </label>
    </div>
  );
}

function DynamicMultiplyValueEditor({
  value,
  onChange,
}: {
  value: EditableObject;
  onChange: (value: EditableObject) => void;
}) {
  return (
    <div className="dynamic-effect-editor">
      <label className="detail-field">
        <span>{t("ui.app.parameter")}</span>
        <input
          value={asString(value.param1)}
          onChange={(event) => onChange({ ...value, function: "multiply", param1: event.target.value })}
        />
      </label>
      <label className="detail-field">
        <span>{t("ui.app.multiplier")}</span>
        <input
          type="number"
          step="0.0001"
          value={typeof value.param2 === "number" || typeof value.param2 === "string" ? value.param2 : ""}
          onChange={(event) => onChange({ ...value, function: "multiply", param2: Number(event.target.value) })}
        />
      </label>
    </div>
  );
}

function DynamicSegmentValueEditor({
  value,
  onChange,
}: {
  value: EditableObject;
  onChange: (value: EditableObject) => void;
}) {
  const thresholds = Array.isArray(value.param2) ? value.param2.map((item) => asNumber(item)) : [];
  const results = Array.isArray(value.param3) ? value.param3.map((item) => asNumber(item)) : [];
  const resizeResults = (nextThresholds: number[]) =>
    Array.from({ length: nextThresholds.length + 1 }, (_, index) => results[index] ?? 0);
  return (
    <div className="dynamic-effect-editor">
      <label className="detail-field">
        <span>{t("ui.app.parameter")}</span>
        <input
          value={typeof value.param1 === "number" ? value.param1 : asString(value.param1)}
          onChange={(event) => onChange({ ...value, function: "segment", param1: event.target.value })}
        />
      </label>
      <div className="sub-editor-heading">
        <span>{t("ui.app.thresholds")}</span>
        <button
          className="button button-small"
          type="button"
          onClick={() => {
            const nextThresholds = [...thresholds, 0];
            onChange({ ...value, function: "segment", param2: nextThresholds, param3: resizeResults(nextThresholds) });
          }}
        >
          {t("ui.app.add")}
        </button>
      </div>
      <div className="dynamic-effect-values">
        {thresholds.map((item, index) => (
          <div key={index}>
            <input
              aria-label={t("ui.app.thresholdNumber", { number: index + 1 })}
              type="number"
              step="0.0001"
              value={item}
              onChange={(event) =>
                onChange({
                  ...value,
                  function: "segment",
                  param2: thresholds.map((threshold, thresholdIndex) =>
                    thresholdIndex === index ? Number(event.target.value) : threshold,
                  ),
                })
              }
            />
            <button
              type="button"
              aria-label={t("ui.app.removeThresholdNumber", { number: index + 1 })}
              onClick={() => {
                const nextThresholds = thresholds.filter((_, thresholdIndex) => thresholdIndex !== index);
                const nextResults = results.filter((_, resultIndex) => resultIndex !== index);
                onChange({
                  ...value,
                  function: "segment",
                  param2: nextThresholds,
                  param3: Array.from(
                    { length: nextThresholds.length + 1 },
                    (_, resultIndex) => nextResults[resultIndex] ?? 0,
                  ),
                });
              }}
            >
              <UiIcon name="close" />
            </button>
          </div>
        ))}
      </div>
      <div className="sub-editor-heading">
        <span>{t("ui.app.segmentValues")}</span>
      </div>
      <div className="dynamic-effect-values">
        {Array.from({ length: thresholds.length + 1 }, (_, index) => results[index] ?? 0).map((item, index) => (
          <div key={index}>
            <input
              aria-label={t("ui.app.segmentValueNumber", { number: index + 1 })}
              type="number"
              step="0.0001"
              value={item}
              onChange={(event) =>
                onChange({
                  ...value,
                  function: "segment",
                  param3: Array.from({ length: thresholds.length + 1 }, (_, resultIndex) =>
                    resultIndex === index ? Number(event.target.value) : (results[resultIndex] ?? 0),
                  ),
                })
              }
            />
          </div>
        ))}
      </div>
    </div>
  );
}

function EffectValueEditor({ value, onChange }: { value: unknown; onChange: (value: unknown) => void }) {
  const objectValue =
    value && typeof value === "object" && !Array.isArray(value) ? (value as EditableObject) : undefined;
  const dynamicValue =
    objectValue?.function === "byStack" || objectValue?.function === "segment" || objectValue?.function === "multiply"
      ? objectValue
      : undefined;
  const kind =
    dynamicValue?.function === "byStack"
      ? "byStack"
      : dynamicValue?.function === "segment"
        ? "segment"
        : dynamicValue?.function === "multiply"
          ? "multiply"
          : typeof value === "boolean"
            ? "boolean"
            : typeof value === "string"
              ? "text"
              : "number";
  return (
    <div className="effect-value-editor">
      <select
        aria-label={t("ui.app.effectValueType")}
        value={kind}
        onChange={(event) => {
          const nextKind = event.target.value;
          onChange(
            nextKind === "byStack"
              ? { function: "byStack", param1: "", param2: 0.2, target: "self" }
              : nextKind === "segment"
                ? { function: "segment", param1: "actionTime", param2: [], param3: [0] }
                : nextKind === "multiply"
                  ? { function: "multiply", param1: "missingHPPercentage", param2: 0.0045 }
                  : nextKind === "boolean"
                    ? false
                    : nextKind === "text"
                      ? ""
                      : 0,
          );
        }}
      >
        <option value="number">{"number"}</option>
        <option value="boolean">{"boolean"}</option>
        <option value="byStack">{"byStack"}</option>
        <option value="segment">{"segment"}</option>
        <option value="multiply">{"multiply"}</option>
        <option value="text">{"text"}</option>
      </select>
      {kind === "byStack" && dynamicValue ? (
        <DynamicByStackValueEditor value={dynamicValue} onChange={onChange} />
      ) : kind === "segment" && dynamicValue ? (
        <DynamicSegmentValueEditor value={dynamicValue} onChange={onChange} />
      ) : kind === "multiply" && dynamicValue ? (
        <DynamicMultiplyValueEditor value={dynamicValue} onChange={onChange} />
      ) : kind === "boolean" ? (
        <label className="checkbox-field">
          <input type="checkbox" checked={value === true} onChange={(event) => onChange(event.target.checked)} />
          <span>{value === true ? "true" : "false"}</span>
        </label>
      ) : (
        <input
          type={kind === "number" ? "number" : "text"}
          step={kind === "number" ? "0.0001" : undefined}
          value={kind === "number" ? (typeof value === "number" ? value : "") : asString(value)}
          onChange={(event) => onChange(kind === "number" ? Number(event.target.value) : event.target.value)}
        />
      )}
    </div>
  );
}

function EffectRuleDetails({ item, onChange }: { item: EditableObject; onChange: (item: EditableObject) => void }) {
  const wrapped = item.effect && typeof item.effect === "object" && !Array.isArray(item.effect);
  const effect = wrapped
    ? (item.effect as EditableObject)
    : Object.fromEntries(Object.entries(item).filter(([field]) => field !== "requirement"));
  const effectEntries = Object.entries(effect);
  function setEffect(nextEffect: EditableObject) {
    if (wrapped) onChange({ ...item, effect: nextEffect });
    else onChange({ ...(Array.isArray(item.requirement) ? { requirement: item.requirement } : {}), ...nextEffect });
  }
  function updateEffect(field: string, value: unknown) {
    setEffect({ ...effect, [field]: value });
  }
  function addEffect() {
    const field = effectFields.find((candidate) => !(candidate in effect));
    if (field) updateEffect(field, booleanEffectFields.has(field) ? false : 0);
  }
  function removeEffect(field: string) {
    const next = { ...effect };
    delete next[field];
    setEffect(next);
  }
  return (
    <div className="structured-detail">
      <RequirementEditor value={item.requirement} onChange={(requirement) => onChange({ ...item, requirement })} />
      <div className="sub-editor-heading">
        <span>
          {t("ui.app.effects")} <small>({wrapped ? t("ui.app.wrapped") : t("ui.app.direct")})</small>
        </span>
        <button className="button button-small" type="button" onClick={addEffect}>
          {t("ui.app.addEffect")}
        </button>
      </div>
      {effectEntries.length === 0 && <span className="sub-editor-empty">{t("ui.app.noEffects")}</span>}
      {effectEntries.map(([field, value]) => (
        <div className="effect-row effect-rule-row" key={field}>
          <select
            value={field}
            onChange={(event) => {
              const next = { ...effect };
              const nextField = event.target.value;
              if (nextField !== field) {
                next[nextField] = next[field];
                delete next[field];
                setEffect(next);
              }
            }}
          >
            {!effectFields.includes(field) && <option value={field}>{field}</option>}
            {effectFields.map((effectField) => (
              <option key={effectField}>{effectField}</option>
            ))}
          </select>
          <EffectValueEditor value={value} onChange={(nextValue) => updateEffect(field, nextValue)} />
          <button
            type="button"
            aria-label={t("ui.app.removeNamedEffect", { name: field })}
            onClick={() => removeEffect(field)}
          >
            <UiIcon name="close" />
          </button>
        </div>
      ))}
    </div>
  );
}

function ArrayItemEditor({
  label,
  kind,
  items,
  onChange,
  skillIds,
}: {
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
      <div className="array-editor-heading">
        <span>{label}</span>
        <button className="button button-small" type="button" onClick={addItem}>
          {t("ui.app.add")}
        </button>
      </div>
      {items.length === 0 && (
        <p className="array-editor-empty">
          {t("ui.app.no")} {label.toLowerCase()} {t("ui.app.yet")}
        </p>
      )}
      <div className="array-editor-list">
        {items.map((item, index) => {
          return (
            <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={index}>
              <div className="array-item-header">
                <button
                  className="array-item-toggle"
                  type="button"
                  onClick={() => setExpanded(expanded === index ? null : index)}
                >
                  {itemSummary(JSON.stringify(item), index, kind)}
                </button>
                <div className="array-item-controls">
                  <button
                    type="button"
                    aria-label={t("ui.app.moveUp")}
                    disabled={index === 0}
                    onClick={() => moveItem(index, -1)}
                  >
                    <UiIcon name="up" />
                  </button>
                  <button
                    type="button"
                    aria-label={t("ui.app.moveDown")}
                    disabled={index === items.length - 1}
                    onClick={() => moveItem(index, 1)}
                  >
                    <UiIcon name="down" />
                  </button>
                  <button type="button" aria-label={t("ui.app.delete")} onClick={() => deleteItem(index)}>
                    <UiIcon name="close" />
                  </button>
                </div>
              </div>
              {expanded === index && (
                <div className="array-item-detail">
                  {kind === "action" ? (
                    <ActionDetails item={item} onChange={(next) => updateItem(index, next)} skillIds={skillIds} />
                  ) : kind === "modifier" ? (
                    <ModifierDetails item={item} onChange={(next) => updateItem(index, next)} />
                  ) : (
                    <EffectRuleDetails item={item} onChange={(next) => updateItem(index, next)} />
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function StackEffectsEditor({
  groups,
  onChange,
  skillIds,
}: {
  groups: EditableObject[][];
  onChange: (groups: EditableObject[][]) => void;
  skillIds: string[];
}) {
  const [expanded, setExpanded] = useState<number | null>(groups.length ? 0 : null);
  function moveGroup(index: number, direction: -1 | 1) {
    const target = index + direction;
    if (target < 0 || target >= groups.length) return;
    const next = [...groups];
    [next[index], next[target]] = [next[target], next[index]];
    onChange(next);
    setExpanded(target);
  }
  return (
    <section className="array-editor stack-effects-editor">
      <div className="array-editor-heading">
        <span>{t("ui.app.stackEffects")}</span>
        <button
          className="button button-small"
          type="button"
          onClick={() => {
            const next = [...groups, []];
            onChange(next);
            setExpanded(next.length - 1);
          }}
        >
          {t("ui.app.addStack")}
        </button>
      </div>
      {groups.length === 0 && <p className="array-editor-empty">{t("ui.app.noStackEffectsYet")}</p>}
      <div className="array-editor-list">
        {groups.map((group, index) => (
          <div className={`array-item ${expanded === index ? "expanded" : ""}`} key={index}>
            <div className="array-item-header">
              <button
                className="array-item-toggle"
                type="button"
                onClick={() => setExpanded(expanded === index ? null : index)}
              >
                {t("ui.app.stack")} {index + 1} · {group.length} {t("ui.app.stackEffectCountNoun")}
                {group.length === 1 ? "" : t("ui.app.s")}
              </button>
              <div className="array-item-controls">
                <button
                  type="button"
                  aria-label={t("ui.app.moveStackUp")}
                  disabled={index === 0}
                  onClick={() => moveGroup(index, -1)}
                >
                  <UiIcon name="up" />
                </button>
                <button
                  type="button"
                  aria-label={t("ui.app.moveStackDown")}
                  disabled={index === groups.length - 1}
                  onClick={() => moveGroup(index, 1)}
                >
                  <UiIcon name="down" />
                </button>
                <button
                  type="button"
                  aria-label={t("ui.app.deleteStack")}
                  onClick={() => {
                    onChange(groups.filter((_, groupIndex) => groupIndex !== index));
                    setExpanded(null);
                  }}
                >
                  <UiIcon name="close" />
                </button>
              </div>
            </div>
            {expanded === index && (
              <div className="array-item-detail">
                <ArrayItemEditor
                  label={t("ui.app.stackEffectsNumber", { number: index + 1 })}
                  kind="effect"
                  items={group}
                  skillIds={skillIds}
                  onChange={(items) =>
                    onChange(groups.map((candidate, groupIndex) => (groupIndex === index ? items : candidate)))
                  }
                />
              </div>
            )}
          </div>
        ))}
      </div>
    </section>
  );
}

function SkillEditorTab({
  weapons,
  overrides,
  onOverridesChange,
}: {
  weapons: [WeaponId, WeaponId];
  overrides: SkillOverrides;
  onOverridesChange: (overrides: SkillOverrides) => void;
}) {
  const [category, setCategory] = useState<EditorCategory>("Snowparting");
  const [selectedSkill, setSelectedSkill] = useState(Object.keys(defaultEditorMaps.Snowparting)[0]);
  const [draft, setDraft] = useState(() => skillToDraft(defaultEditorMaps.Snowparting[selectedSkill]));
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");

  const skills = useMemo(
    () => ({ ...defaultEditorMaps[category], ...(overrides[category] ?? {}) }),
    [category, overrides],
  );
  const skillIds = useMemo(() => Object.keys(skills), [skills]);
  const editorModified = hasSkillOverrides(overrides);
  const visibleCategories = useMemo<EditorCategory[]>(() => {
    const martialCategories = weapons.flatMap((weapon) => {
      const item = skillCategoryByWeapon[weapon];
      return item ? [item] : [];
    });
    return [
      ...new Set<EditorCategory>([...martialCategories, "Mystic", "General", "Buff", "Debuff", "DOT"]),
    ] as EditorCategory[];
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
          refresh: draft.refresh,
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
        const firstOutOfOrder = numericActionTimes.findIndex(
          (time, index) => index > 0 && time < numericActionTimes[index - 1],
        );
        if (firstOutOfOrder !== -1) {
          throw new Error(
            `Actions are out of order: action ${firstOutOfOrder + 1} occurs before action ${firstOutOfOrder}.`,
          );
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
          tags: draft.tags
            .split(",")
            .map((tag) => tag.trim())
            .filter(Boolean),
          ...(category === "DOT"
            ? {
                action: undefined,
                periodic: {
                  interval: optionalNumber(draft.periodicInterval, "Periodic interval"),
                  firstTick: optionalNumber(draft.firstTick, "First tick"),
                  resetOnRefresh: draft.resetOnRefresh,
                  action,
                },
                duration: optionalNumber(draft.duration, "Duration"),
                maxStack: optionalNumber(draft.maxStack, "Max stack"),
                refresh: draft.refresh,
              }
            : {}),
        };
      }
      const nextCategoryOverrides = { ...(overrides[category] ?? {}) };
      if (JSON.stringify(updatedSkill) === JSON.stringify(defaultEditorMaps[category][selectedSkill])) {
        delete nextCategoryOverrides[selectedSkill];
      } else {
        nextCategoryOverrides[selectedSkill] = updatedSkill;
      }
      const nextOverrides: SkillOverrides = { ...overrides };
      if (Object.keys(nextCategoryOverrides).length > 0) nextOverrides[category] = nextCategoryOverrides;
      else delete nextOverrides[category];
      onOverridesChange(nextOverrides);
      setStatus(t("ui.app.savedForThisSession"));
      setError("");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : t("ui.app.recordSaveError"));
      setStatus("");
    }
  }

  function restoreDefault() {
    const nextCategoryOverrides = { ...(overrides[category] ?? {}) };
    delete nextCategoryOverrides[selectedSkill];
    const nextOverrides: SkillOverrides = { ...overrides };
    if (Object.keys(nextCategoryOverrides).length > 0) nextOverrides[category] = nextCategoryOverrides;
    else delete nextOverrides[category];
    onOverridesChange(nextOverrides);
    setDraft(skillToDraft(defaultEditorMaps[category][selectedSkill]));
    setError("");
    setStatus("");
  }

  function restoreAllDefaults() {
    onOverridesChange({});
    setDraft(skillToDraft(defaultEditorMaps[category][selectedSkill]));
    setError("");
    setStatus("");
  }

  const isDefinitionCategory = category === "Buff" || category === "Debuff";
  const categoryLabel = (item: EditorCategory) =>
    item === "Snowparting" ? "Snowparting Blade" : item === "Phalanxbane" ? "Phalanxbane Blade" : item;

  return (
    <>
      <section className="panel skill-editor-panel">
        <div className="skill-editor-toolbar">
          <div className="skill-category-tabs" role="tablist" aria-label={t("ui.app.skillCategories")}>
            {visibleCategories.map((item) => {
              const categoryModified = Object.keys(overrides[item] ?? {}).length > 0;
              return (
                <button
                  key={item}
                  className={`category-tab ${category === item ? "active" : ""} ${categoryModified ? "modified" : ""}`}
                  type="button"
                  onClick={() => setCategory(item)}
                >
                  {categoryLabel(item)}
                </button>
              );
            })}
          </div>
          <button
            className={`category-tab skill-editor-reset ${editorModified ? "modified" : ""}`}
            type="button"
            disabled={!editorModified}
            onClick={restoreAllDefaults}
          >
            {t("ui.app.reset")}
          </button>
        </div>
        <div className="skill-editor-layout">
          <aside className="skill-list" aria-label={t("ui.app.namedSkills", { name: category })}>
            {skillIds.map((id) => (
              <button
                key={id}
                className={`skill-list-item ${selectedSkill === id ? "active" : ""} ${overrides[category]?.[id] ? "modified" : ""}`}
                type="button"
                onClick={() => selectSkill(id)}
              >
                <strong>{skillDisplayName(skills[id], id)}</strong>
                <small>{id}</small>
              </button>
            ))}
          </aside>
          <div className="skill-detail">
            <div className="skill-detail-heading">
              <div>
                <span className="detail-kicker">{category}</span>
                <h3>{skillDisplayName(skills[selectedSkill], selectedSkill)}</h3>
              </div>
              {status && <span className="editor-status">{status}</span>}
            </div>
            {isDefinitionCategory ? (
              <>
                <div className="skill-basic-fields definition-basic-fields">
                  <label className="editor-field">
                    <span>{t("ui.app.name")}</span>
                    <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.maxStack")}</span>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={draft.maxStack}
                      onChange={(event) => setDraft({ ...draft, maxStack: event.target.value })}
                    />
                  </label>
                  <label className="editor-field editor-field-wide">
                    <span>{t("ui.app.description")}</span>
                    <input
                      value={draft.description}
                      onChange={(event) => setDraft({ ...draft, description: event.target.value })}
                    />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.duration")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={draft.duration}
                      onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                    />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.cooldown")}</span>
                    <input
                      type="number"
                      min="0"
                      step="0.0001"
                      value={draft.cooldown}
                      onChange={(event) => setDraft({ ...draft, cooldown: event.target.value })}
                    />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.refreshDuration")}</span>
                    <input
                      type="checkbox"
                      checked={draft.refresh}
                      onChange={(event) => setDraft({ ...draft, refresh: event.target.checked })}
                    />
                  </label>
                </div>
                <div className="structured-editor-grid">
                  <ArrayItemEditor
                    label={t("ui.app.effects")}
                    kind="effect"
                    items={draft.effectItems}
                    onChange={(effectItems) => setDraft({ ...draft, effectItems })}
                    skillIds={editorSkillIds}
                  />
                  <StackEffectsEditor
                    groups={draft.stackEffectGroups}
                    onChange={(stackEffectGroups) => setDraft({ ...draft, stackEffectGroups })}
                    skillIds={editorSkillIds}
                  />
                </div>
              </>
            ) : (
              <>
                <div className="skill-basic-fields">
                  <label className="editor-field">
                    <span>{t("ui.app.name")}</span>
                    <input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />
                  </label>
                  <label className="editor-field">
                    <span>{t("ui.app.shortName")}</span>
                    <input
                      value={draft.shortName}
                      onChange={(event) => setDraft({ ...draft, shortName: event.target.value })}
                    />
                  </label>
                  {category === "DOT" ? (
                    <>
                      <label className="editor-field">
                        <span>{t("ui.app.interval")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.periodicInterval}
                          onChange={(event) => setDraft({ ...draft, periodicInterval: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.firstTick")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.firstTick}
                          onChange={(event) => setDraft({ ...draft, firstTick: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.duration")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.duration}
                          onChange={(event) => setDraft({ ...draft, duration: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.maxStack")}</span>
                        <input
                          type="number"
                          min="1"
                          step="1"
                          value={draft.maxStack}
                          onChange={(event) => setDraft({ ...draft, maxStack: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.refreshDuration")}</span>
                        <input
                          type="checkbox"
                          checked={draft.refresh}
                          onChange={(event) => setDraft({ ...draft, refresh: event.target.checked })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.resetPeriodOnRefresh")}</span>
                        <input
                          type="checkbox"
                          checked={draft.resetOnRefresh}
                          onChange={(event) => setDraft({ ...draft, resetOnRefresh: event.target.checked })}
                        />
                      </label>
                    </>
                  ) : (
                    <>
                      <label className="editor-field">
                        <span>{t("ui.app.castTime")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.castTime}
                          onChange={(event) => setDraft({ ...draft, castTime: event.target.value })}
                        />
                      </label>
                      <label className="editor-field">
                        <span>{t("ui.app.cooldown")}</span>
                        <input
                          type="number"
                          min="0"
                          step="0.0001"
                          value={draft.cooldown}
                          onChange={(event) => setDraft({ ...draft, cooldown: event.target.value })}
                        />
                      </label>
                    </>
                  )}
                  <label className="editor-field editor-field-wide">
                    <span>
                      {t("ui.app.tags")} <small>{t("ui.app.commaSeparated")}</small>
                    </span>
                    <input value={draft.tags} onChange={(event) => setDraft({ ...draft, tags: event.target.value })} />
                  </label>
                </div>
                <div className="json-editor-grid">
                  <ArrayItemEditor
                    label={t("ui.app.actions")}
                    kind="action"
                    items={draft.actionItems}
                    onChange={(actionItems) => setDraft({ ...draft, actionItems })}
                    skillIds={editorSkillIds}
                  />
                  <ArrayItemEditor
                    label={t("ui.app.modifiers")}
                    kind="modifier"
                    items={draft.modifierItems}
                    onChange={(modifierItems) => setDraft({ ...draft, modifierItems })}
                    skillIds={editorSkillIds}
                  />
                </div>
              </>
            )}
            {error && <p className="editor-error">{error}</p>}
            <div className="editor-actions">
              <button className="button button-secondary" type="button" onClick={restoreDefault}>
                {t("ui.app.default")}
              </button>
              <button className="button button-primary" type="button" onClick={save}>
                {t("ui.app.save")}
              </button>
            </div>
          </div>
        </div>
      </section>
    </>
  );
}

function SettingsTab({
  settings,
  enemy,
  pathId,
  devMode,
  onSettingsChange,
}: {
  settings: CalculatorSettings;
  enemy: EnemyProfile;
  pathId: PathId;
  devMode: boolean;
  onSettingsChange: Dispatch<SetStateAction<CalculatorSettings>>;
}) {
  const weaponsLocked = Boolean(typedPathDefinitions[pathId].lockedWeapons);

  return (
    <section className="panel settings-panel">
      <div className="settings-fields">
        <div className="settings-weapon-row">
          {settings.weapons.map((weapon, index) => (
            <label className="editor-field" key={index}>
              <span>{index === 0 ? t("system.gearSlot.leftWeapon") : t("system.gearSlot.rightWeapon")}</span>
              <select
                value={weapon}
                disabled={weaponsLocked}
                onChange={(event) =>
                  onSettingsChange((current) => {
                    const nextWeapon = event.target.value as WeaponId;
                    const otherWeapon = current.weapons[index === 0 ? 1 : 0];
                    if (pathId === "mixed" && nextWeapon === otherWeapon) return current;
                    const weapons: [WeaponId, WeaponId] = [...current.weapons] as [WeaponId, WeaponId];
                    weapons[index] = nextWeapon;
                    return { ...current, weapons };
                  })
                }
              >
                {Object.entries(martialArtDefinitions)
                  .filter(([value]) => devMode || productionWeaponIds.has(value as WeaponId))
                  .map(([value, definition]) => (
                    <option
                      key={value}
                      value={value}
                      disabled={pathId === "mixed" && value === settings.weapons[index === 0 ? 1 : 0]}
                    >
                      {gameText(definition.name)} ({gameText(weaponFamilyNames[definition.weapon])})
                    </option>
                  ))}
              </select>
            </label>
          ))}
        </div>
        <div className="settings-enemy-row">
          <label className="editor-field">
            <span>{t("ui.app.enemy")}</span>
            <select
              value={settings.enemy}
              onChange={(event) => onSettingsChange((current) => ({ ...current, enemy: event.target.value }))}
            >
              {Object.entries(typedEnemyProfiles).map(([key, profile]) => (
                <option key={key} value={key}>
                  {gameText(profile.name)}
                </option>
              ))}
            </select>
          </label>
        </div>
      </div>
      <div className="settings-summary">
        <span>
          {t("ui.app.defense")} {enemy.defense}
        </span>
        <span>
          {t("ui.app.physicalResistance")} {enemy.physicalResistance}
        </span>
        <span>
          {t("ui.app.attributeResistance")} {enemy.bellstrikeResistance}
        </span>
        <span>
          {t("ui.app.judgementResistance")} {formatNumber(enemy.judgementResistance * 100)}%
        </span>
      </div>
    </section>
  );
}

function RotationEditorTab({
  character,
  devMode,
  skillOverrides,
  onMetricsChange,
  onActiveSimulationBundleChange,
}: {
  character: CharacterState;
  devMode: boolean;
  skillOverrides: SkillOverrides;
  onMetricsChange: (metrics: RotationMetrics, isActive: boolean) => void;
  onActiveSimulationBundleChange: (
    bundle: RotationSimulationBundle,
    rotationName: string,
    bundleKey: string,
    isDefault: boolean,
  ) => void;
}) {
  const {
    stats: displayedCharacterStats,
    rawStats: characterStats,
    attunementStats,
    settings,
    enemy,
    derivedStats,
    innerWayRevision: _innerWayRevision,
    gearStatEffect,
    buildSetup,
  } = character;
  const rotationSkillIds = useMemo(() => selectableRotationSkillIds(settings.weapons), [settings.weapons]);
  const innerWayConditions = useMemo(() => innerWayConditionsFor(buildSetup.innerWays), [buildSetup.innerWays]);
  const innerWayEffectRules = useMemo(() => innerWayEffectRulesFor(buildSetup.innerWays), [buildSetup.innerWays]);
  const calculationDefinitions = useMemo(
    () => resolveSkillCalculationDefinitions(defaultSkillMaps, effectDefinitions, dotDefinitions, skillOverrides),
    [skillOverrides],
  );
  const [initialState] = useState(() => initialRotationEditorState(devMode));
  const [rotationEntries, setRotationEntries] = useState<RotationEntry[]>(initialState.entries);
  const savedRotationSnapshotsRef = useRef<Map<string, RotationRecord> | null>(null);
  if (savedRotationSnapshotsRef.current === null)
    savedRotationSnapshotsRef.current = new Map(
      initialState.entries.map((entry) => [entry.id, JSON.parse(JSON.stringify(entry.rotation)) as RotationRecord]),
    );
  const [activeRotationId, setActiveRotationId] = useState(initialState.activeId);
  const [editingRotationId, setEditingRotationId] = useState(initialState.activeId);
  const [rotation, setRotation] = useState<RotationRecord>(initialState.rotation);
  const [startAnchor, setStartAnchor] = useState<{ rowId: string; actionIndex?: number }>(initialState.startAnchor);
  const [expandedSkillRows, setExpandedSkillRows] = useState<Set<string>>(() => new Set());
  const [editingName, setEditingName] = useState(false);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [transferStatus, setTransferStatus] = useState<{ message: string; error?: boolean } | null>(null);
  const [eventTimeDrafts, setEventTimeDrafts] = useState<Record<string, string>>({});
  const [eventDurationDrafts, setEventDurationDrafts] = useState<Record<string, string>>({});
  const [eventDistanceDrafts, setEventDistanceDrafts] = useState<Record<string, string>>({});
  const [eventHPDrafts, setEventHPDrafts] = useState<Record<string, string>>({});
  const [rotationResults, setRotationResults] = useState<
    Record<string, { key: string; result: RotationSimulationResult }>
  >({});
  const rotationResultsRef = useRef(rotationResults);
  const calculationCacheRef = useRef(new RotationCalculationCache());
  const editorPreviewRequestSequenceRef = useRef(0);
  const diffRequestSequenceRef = useRef(0);
  const scheduledRefreshTargetRef = useRef<string | null>(null);
  const runningRefreshTargetRef = useRef<string | null>(null);
  const [refreshRetryRevision, setRefreshRetryRevision] = useState(0);
  const [readableDialogOpen, setReadableDialogOpen] = useState(false);
  const [readableCopyStatus, setReadableCopyStatus] = useState("");
  const readableDialogRef = useRef<HTMLDialogElement>(null);
  const readableTextRef = useRef<HTMLTextAreaElement>(null);
  const rotationScrollRef = useRef<HTMLDivElement>(null);
  const pendingEventScrollRef = useRef<{ stepIndex: number; top: number } | null>(null);
  const pendingSkillFocusRef = useRef<number | null>(null);
  const visibleRotationEntries = useMemo(
    () =>
      rotationEntries.filter(
        (entry) => (devMode || !entry.test) && rotationAvailableForWeapons(entry, settings.weapons),
      ),
    [devMode, rotationEntries, settings.weapons],
  );
  const editingEntry =
    visibleRotationEntries.find((entry) => entry.id === editingRotationId) ?? visibleRotationEntries[0];
  const resolvedActiveRotationId =
    visibleRotationEntries.find((entry) => entry.id === activeRotationId)?.id ?? visibleRotationEntries[0]?.id;
  const resolvedActiveRotationIdRef = useRef(resolvedActiveRotationId);
  resolvedActiveRotationIdRef.current = resolvedActiveRotationId;
  const rotationLocked = editingEntry?.isDefault === true;
  const editingRotationDisplayName = (rotationLocked ? gameText(rotation.name) : rotation.name) || "Unnamed Rotation";
  const currentGlobalDebuffs = loadGlobalDebuffs();
  const currentFood = loadFood();
  const currentScript = loadScript();
  const currentDivinecraft = loadDivinecraft();
  const currentGlobalDebuffsKey = JSON.stringify(currentGlobalDebuffs);
  const calculationContextKey = useMemo(
    () =>
      calculationFingerprint({
        characterStats,
        attunementStats,
        settings,
        enemy,
        innerWayConditions: [...innerWayConditions],
        innerWayEffectRules,
        innerWayRevision: _innerWayRevision,
        gearStatEffect,
        buildSetup,
        food: currentFood,
        script: currentScript,
        divinecraft: currentDivinecraft,
        globalDebuffs: currentGlobalDebuffs,
        skillOverrides,
      }),
    [
      characterStats,
      attunementStats,
      settings,
      enemy,
      innerWayConditions,
      innerWayEffectRules,
      _innerWayRevision,
      gearStatEffect,
      buildSetup,
      currentFood,
      currentScript,
      currentDivinecraft,
      currentGlobalDebuffsKey,
      skillOverrides,
    ],
  );
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
      setStartAnchor(
        fallback.rotation.start
          ? { rowId: `rotation-${fallback.rotation.start.step}`, actionIndex: fallback.rotation.start.action }
          : { rowId: "rotation-0" },
      );
      setEventTimeDrafts({});
    }
  }, [activeRotationId, editingRotationId, visibleRotationEntries]);

  useEffect(() => {
    if (startAnchor.actionIndex === undefined) return;
    const key = `${editingRotationId}:${startAnchor.rowId}`;
    setExpandedSkillRows((current) => (current.has(key) ? current : new Set(current).add(key)));
  }, [editingRotationId, startAnchor.rowId, startAnchor.actionIndex]);

  useEffect(() => {
    const dialog = readableDialogRef.current;
    if (!dialog) return;
    if (readableDialogOpen && !dialog.open) dialog.showModal();
    else if (!readableDialogOpen && dialog.open) dialog.close();
  }, [readableDialogOpen]);

  function findSkill(skillId: string) {
    return calculationDefinitions.skills[skillId];
  }
  function findDot(dotId: string) {
    return calculationDefinitions.dots[dotId];
  }

  function updateStep(index: number, changes: Record<string, unknown>) {
    if (rotationLocked) return;
    setRotation((current) => ({
      ...current,
      steps: current.steps.map((step, stepIndex) =>
        stepIndex === index ? ({ ...step, ...changes } as RotationStep) : step,
      ),
    }));
  }
  function selectRotationItem(index: number, value: string, control: HTMLSelectElement) {
    if (rotationLocked) return;
    if (
      [
        "__event:Move",
        "__event:SelfHP",
        "__event:TakeDamage",
        "__event:HP",
        "__event:Qi",
        "__event:Buff",
        "__event:Debuff",
      ].includes(value)
    ) {
      const scrollContainer = rotationScrollRef.current;
      const row = control.closest<HTMLElement>("[data-rotation-step-index]");
      if (scrollContainer && row)
        pendingEventScrollRef.current = {
          stepIndex: index,
          top: row.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
        };
    }
    const rowId = `rotation-${index}`;
    setEventDistanceDrafts((current) => {
      if (!(rowId in current)) return current;
      const next = { ...current };
      delete next[rowId];
      return next;
    });
    const previousSkills = timeline.filter(
      (row) => row.kind === "rotation" && (row.rotationIndex ?? -1) < index && row.step.type === "skill",
    );
    const previousSkill = previousSkills[previousSkills.length - 1];
    setRotation((current) => {
      let steps = current.steps.map((step, stepIndex) => {
        if (stepIndex !== index) return step;
        if (value === "__event:Delay") return { type: "event", event: "Delay", duration: 1 };
        if (value === "__event:Controlled")
          return {
            type: "event",
            event: "Controlled",
            startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
            duration: eventDefaultDuration("Controlled"),
          };
        if (value === "__event:ShieldBroken")
          return {
            type: "event",
            event: "ShieldBroken",
            startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
          };
        if (value === "__event:BattleEnd")
          return {
            type: "event",
            event: "BattleEnd",
            startTime: previousSkill ? previousSkill.startTime - anchorTime : 0,
          };
        if (value === "__event:Move") return { type: "event", event: "Move", before: { action: "start" }, distance: 1 };
        if (value === "__event:SelfHP")
          return {
            type: "event",
            event: "SelfHP",
            before: { action: "start" },
            currentHP: displayedCharacterStats.maxHp,
          };
        if (value === "__event:TakeDamage")
          return { type: "event", event: "TakeDamage", before: { action: "start" }, damage: 0 };
        if (value === "__event:HP")
          return { type: "event", event: "HP", before: { action: "start" }, targetHPRatio: 1 };
        if (value === "__event:Qi")
          return { type: "event", event: "Qi", before: { action: "start" }, targetQiRatio: 1 };
        if (value === "__event:Buff")
          return {
            type: "event",
            event: "Buff",
            before: { action: "start" },
            buff: Object.keys(manualBuffDefinitions)[0],
            stack: 1,
          };
        if (value === "__event:Debuff")
          return {
            type: "event",
            event: "Debuff",
            before: { action: "start" },
            debuff: Object.keys(manualDebuffDefinitions)[0],
            stack: 1,
          };
        return { type: "skill", skill: value };
      }) as RotationStep[];
      const attached = [
        "__event:Move",
        "__event:SelfHP",
        "__event:TakeDamage",
        "__event:HP",
        "__event:Qi",
        "__event:Buff",
        "__event:Debuff",
      ].includes(value);
      if (attached && !steps.slice(index + 1).some((step) => step.type === "skill"))
        steps.push({ type: "skill", skill: rotationSkillIds[0] });
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
  function commitEventHP(rowId: string, stepIndex: number) {
    const draft = eventHPDrafts[rowId];
    if (draft === undefined) return;
    const value = Number(draft);
    const step = rotation.steps[stepIndex];
    if (Number.isFinite(value) && step?.type === "event") {
      switch (step.event) {
        case "SelfHP":
          updateStep(stepIndex, {
            currentHP: (Math.min(100, Math.max(0, value)) / 100) * displayedCharacterStats.maxHp,
            currentHPRatio: undefined,
          });
          break;
        case "TakeDamage":
          updateStep(stepIndex, { damage: Math.max(0, value) });
          break;
        case "HP":
          updateStep(stepIndex, { targetHPRatio: Math.min(1, Math.max(0, value / 100)) });
          break;
        case "Qi":
          updateStep(stepIndex, { targetQiRatio: Math.min(1, Math.max(0, value / 100)) });
          break;
      }
    }
    setEventHPDrafts((current) => {
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
    const eventAfterAction = eventStep.event === "Qi" && "after" in eventStep;
    const availableTargets = eventAfterAction
      ? attachmentTargets.filter((target) => target.target.action !== "start")
      : attachmentTargets;
    const eventRow = timeline.find((row) => row.id === `rotation-${stepIndex}`);
    const currentTargetIndex = availableTargets.findIndex(
      (target) =>
        target.skillRowId === eventRow?.sourceRowId &&
        target.target.action === eventTarget.action &&
        target.target.trigger === eventTarget.trigger,
    );
    const nextTarget = availableTargets[currentTargetIndex + direction];
    if (!nextTarget) return;

    const startStep = rotation.start ? rotation.steps[rotation.start.step] : undefined;
    const currentTargetRow = timeline.find((row) => row.id === eventRow?.sourceRowId);
    const currentTargetSkill =
      currentTargetRow?.rotationIndex === undefined ? undefined : rotation.steps[currentTargetRow.rotationIndex];
    const targetSkill = rotation.steps[nextTarget.skillStepIndex];
    const withoutEvent = rotation.steps.filter((_, index) => index !== stepIndex);
    const targetIndex = withoutEvent.indexOf(targetSkill);
    if (targetIndex < 0) return;
    const movedEvent = eventAfterAction
      ? ({ ...eventStep, after: nextTarget.target } as RotationStep)
      : ({ ...eventStep, before: nextTarget.target } as RotationStep);
    const steps = [...withoutEvent.slice(0, targetIndex), movedEvent, ...withoutEvent.slice(targetIndex)];
    const movedEventIndex = steps.indexOf(movedEvent);
    const nextStartStep = startStep ? steps.indexOf(startStep) : -1;
    const nextRotation = {
      ...rotation,
      steps,
      ...(rotation.start && nextStartStep >= 0 ? { start: { ...rotation.start, step: nextStartStep } } : {}),
    };
    const scrollContainer = rotationScrollRef.current;
    const eventElement = control.closest<HTMLElement>("[data-rotation-step-index]");
    if (scrollContainer && eventElement)
      pendingEventScrollRef.current = {
        stepIndex: movedEventIndex,
        top: eventElement.getBoundingClientRect().top - scrollContainer.getBoundingClientRect().top,
      };
    setRotation(nextRotation);
    if (nextStartStep >= 0 && rotation.start)
      setStartAnchor({ rowId: `rotation-${nextStartStep}`, actionIndex: rotation.start.action });
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
    setRotation((current) => ({
      ...current,
      steps: [
        ...current.steps.slice(0, index + 1),
        { type: "skill", skill: rotationSkillIds[0] },
        ...current.steps.slice(index + 1),
      ],
    }));
  }
  function moveStep(index: number, direction: number) {
    if (rotationLocked) return;
    setRotation((current) => {
      const movable = (step: RotationStep | undefined) =>
        step?.type === "skill" || (step?.type === "event" && step.event === "Delay");
      if (!movable(current.steps[index])) return current;
      const attached = (step: RotationStep | undefined) => Boolean(attachedTargetForStep(step));
      let blockStart = index;
      if (current.steps[index]?.type === "skill")
        while (blockStart > 0 && attached(current.steps[blockStart - 1])) blockStart -= 1;
      const currentBlock = current.steps.slice(blockStart, index + 1);
      if (direction < 0) {
        let previousSkill = blockStart - 1;
        while (previousSkill >= 0 && !movable(current.steps[previousSkill])) previousSkill -= 1;
        if (previousSkill < 0) return current;
        let previousStart = previousSkill;
        if (current.steps[previousSkill]?.type === "skill")
          while (previousStart > 0 && attached(current.steps[previousStart - 1])) previousStart -= 1;
        return {
          ...current,
          steps: [
            ...current.steps.slice(0, previousStart),
            ...currentBlock,
            ...current.steps.slice(previousStart, blockStart),
            ...current.steps.slice(index + 1),
          ],
        };
      }
      let nextSkill = index + 1;
      while (nextSkill < current.steps.length && !movable(current.steps[nextSkill])) nextSkill += 1;
      if (nextSkill >= current.steps.length) return current;
      return {
        ...current,
        steps: [
          ...current.steps.slice(0, blockStart),
          ...current.steps.slice(index + 1, nextSkill + 1),
          ...currentBlock,
          ...current.steps.slice(nextSkill + 1),
        ],
      };
    });
  }
  function removeStep(index: number) {
    if (rotationLocked) return;
    setRotation((current) => {
      if (current.steps[index]?.type !== "skill")
        return { ...current, steps: current.steps.filter((_, stepIndex) => stepIndex !== index) };
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
    if (!rotation.name.trim()) {
      setError(t("ui.app.rotationNameRequired"));
      setStatus("");
      return;
    }
    const normalized = migrateRotation(rotation);
    const nextEntries = rotationEntries.map((entry) =>
      entry.id === editingRotationId ? { ...entry, rotation: normalized } : entry,
    );
    setRotationEntries(nextEntries);
    setRotation(normalized);
    savedRotationSnapshotsRef.current?.set(editingRotationId, JSON.parse(JSON.stringify(normalized)) as RotationRecord);
    persistRotationEntries(nextEntries);
    sessionStorage.setItem("wwm-active-rotation-session-v1", activeRotationId);
    setError("");
    setStatus(t("ui.app.savedForThisSession"));
    if (editingRotationId === activeRotationId) void calculateDiffsForRotation(editingRotationId, normalized);
  }
  function resetRotation() {
    if (rotationLocked) return;
    const saved = savedRotationSnapshotsRef.current?.get(editingRotationId);
    if (!saved) return;
    const restored = JSON.parse(JSON.stringify(saved)) as RotationRecord;
    setRotation(restored);
    setStartAnchor(
      restored.start
        ? { rowId: `rotation-${restored.start.step}`, actionIndex: restored.start.action }
        : { rowId: "rotation-0" },
    );
    setEventTimeDrafts({});
    setEventDurationDrafts({});
    setEventDistanceDrafts({});
    setEventHPDrafts({});
    setEditingName(false);
    setStatus("");
    setError("");
  }
  function activateRotation(id: string) {
    if (id === activeRotationId) return;
    const current = migrateRotation(rotation);
    const nextEntries = rotationEntries.map((entry) =>
      entry.id === editingRotationId ? { ...entry, rotation: current } : entry,
    );
    const nextRotation = nextEntries.find((entry) => entry.id === id)?.rotation;
    if (!nextRotation) return;
    setRotationEntries(nextEntries);
    setActiveRotationId(id);
    setEditingRotationId(id);
    setRotation(JSON.parse(JSON.stringify(nextRotation)) as RotationRecord);
    setStartAnchor(
      nextRotation.start
        ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action }
        : { rowId: "rotation-0" },
    );
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
    sessionStorage.setItem("wwm-active-rotation-session-v1", id);
  }
  function editRotation(id: string) {
    if (id === editingRotationId) return;
    const current = migrateRotation(rotation);
    const nextEntries = rotationEntries.map((entry) =>
      entry.id === editingRotationId ? { ...entry, rotation: current } : entry,
    );
    const nextRotation = nextEntries.find((entry) => entry.id === id)?.rotation;
    if (!nextRotation) return;
    setRotationEntries(nextEntries);
    setEditingRotationId(id);
    setRotation(JSON.parse(JSON.stringify(nextRotation)) as RotationRecord);
    setStartAnchor(
      nextRotation.start
        ? { rowId: `rotation-${nextRotation.start.step}`, actionIndex: nextRotation.start.action }
        : { rowId: "rotation-0" },
    );
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
  }
  function addRotation() {
    const current = migrateRotation(rotation);
    const id = `rotation-${Date.now()}`;
    const nextRotation: RotationRecord = {
      name: t("ui.app.newRotation"),
      steps: [{ type: "skill", skill: rotationSkillIds[0] }],
      eventTimeReference: "battleStart",
    };
    const nextEntries = [
      ...rotationEntries.map((entry) => (entry.id === editingRotationId ? { ...entry, rotation: current } : entry)),
      { id, rotation: nextRotation, martialArts: [...new Set(settings.weapons)] },
    ];
    setRotationEntries(nextEntries);
    setEditingRotationId(id);
    setRotation(nextRotation);
    savedRotationSnapshotsRef.current?.set(id, JSON.parse(JSON.stringify(nextRotation)) as RotationRecord);
    setStartAnchor({ rowId: "rotation-0" });
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
  }
  function duplicateRotation() {
    const id = `rotation-${Date.now()}`;
    const source = migrateRotation(rotation);
    const duplicate: RotationRecord = JSON.parse(
      JSON.stringify({ ...source, name: `${source.name || "Rotation"} Copy` }),
    ) as RotationRecord;
    const sourceEntry = rotationEntries.find((entry) => entry.id === editingRotationId);
    const nextEntries = [
      ...rotationEntries,
      { id, rotation: duplicate, martialArts: [...(sourceEntry?.martialArts ?? new Set(settings.weapons))] },
    ];
    setRotationEntries(nextEntries);
    setEditingRotationId(id);
    setRotation(duplicate);
    savedRotationSnapshotsRef.current?.set(id, JSON.parse(JSON.stringify(duplicate)) as RotationRecord);
    setStartAnchor(
      duplicate.start
        ? { rowId: `rotation-${duplicate.start.step}`, actionIndex: duplicate.start.action }
        : { rowId: "rotation-0" },
    );
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
    savedRotationSnapshotsRef.current?.delete(id);
    if (id !== editingRotationId && id !== activeRotationId) {
      setRotationEntries(nextEntries);
      persistRotationEntries(nextEntries);
      return;
    }
    const nextVisibleEntries = nextEntries.filter((entry) => rotationAvailableForWeapons(entry, settings.weapons));
    const nextActive =
      nextVisibleEntries[Math.max(0, visibleRotationEntries.findIndex((entry) => entry.id === id) - 1)] ??
      nextVisibleEntries[0];
    if (!nextActive) return;
    setRotationEntries(nextEntries);
    if (id === activeRotationId) {
      setActiveRotationId(nextActive.id);
    }
    if (id === editingRotationId) {
      setEditingRotationId(nextActive.id);
      setRotation(JSON.parse(JSON.stringify(nextActive.rotation)) as RotationRecord);
      setStartAnchor(
        nextActive.rotation.start
          ? { rowId: `rotation-${nextActive.rotation.start.step}`, actionIndex: nextActive.rotation.start.action }
          : { rowId: "rotation-0" },
      );
    }
    setEventTimeDrafts({});
    persistRotationEntries(nextEntries);
    sessionStorage.setItem(
      "wwm-active-rotation-session-v1",
      id === activeRotationId ? nextActive.id : activeRotationId,
    );
  }

  function currentRotationEntries() {
    const current = migrateRotation(rotation);
    return rotationEntries.map((entry) =>
      entry.id === editingRotationId && !entry.isDefault ? { ...entry, rotation: current } : entry,
    );
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
    setTransferStatus({ message: t("ui.app.rotationsExported", { count: exportedCount }) });
  }

  async function importRotations(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    try {
      const result = mergeImportedRotationEntries(currentRotationEntries(), JSON.parse(await file.text()) as unknown);
      const migratedEntries = result.entries.map((entry) =>
        result.importedIds.includes(entry.id) ? { ...entry, rotation: migrateRotation(entry.rotation) } : entry,
      );
      result.importedIds.forEach((id) => {
        const imported = migratedEntries.find((entry) => entry.id === id);
        if (imported)
          savedRotationSnapshotsRef.current?.set(id, JSON.parse(JSON.stringify(imported.rotation)) as RotationRecord);
      });
      setRotationEntries(migratedEntries);
      persistRotationEntries(migratedEntries);
      const importedEntry = migratedEntries.find((entry) => entry.id === result.importedIds[0]);
      if (importedEntry) {
        setEditingRotationId(importedEntry.id);
        setRotation(JSON.parse(JSON.stringify(importedEntry.rotation)) as RotationRecord);
        setStartAnchor(
          importedEntry.rotation.start
            ? {
                rowId: `rotation-${importedEntry.rotation.start.step}`,
                actionIndex: importedEntry.rotation.start.action,
              }
            : { rowId: "rotation-0" },
        );
        setEventTimeDrafts({});
        setEventDurationDrafts({});
        setEditingName(false);
        setStatus("");
        setError("");
      }
      setTransferStatus({ message: t("ui.app.rotationsImported", { count: result.importedCount }) });
    } catch (error) {
      setTransferStatus({
        message: error instanceof Error ? error.message : t("ui.app.rotationImportError"),
        error: true,
      });
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
      const select = scrollContainer.querySelector<HTMLSelectElement>(
        `select[data-rotation-step-index="${pendingFocus}"]`,
      );
      if (select) {
        select.focus({ preventScroll: true });
        select.scrollIntoView({ block: "nearest" });
        pendingSkillFocusRef.current = null;
      }
    }
  }, [timeline]);
  const workerActionBreakdowns = currentCachedResult?.actionBreakdowns ?? {};
  const displayTime = (time: number) => time - anchorTime;
  const calculateTimelineActionBreakdown = (row: TimelineRow, actionIndex: number): DamageBreakdown =>
    workerActionBreakdowns[`${row.id}:${actionIndex}`] ?? {
      physical: 0,
      bellstrike: 0,
      stonesplit: 0,
      silkbind: 0,
      bamboocut: 0,
      total: 0,
    };
  const skillExpansionKey = (rowId: string) => `${editingRotationId}:${rowId}`;
  const skillActionsExpanded = (rowId: string) => expandedSkillRows.has(skillExpansionKey(rowId));
  const toggleSkillActions = (rowId: string) =>
    setExpandedSkillRows((current) => {
      const next = new Set(current);
      const key = skillExpansionKey(rowId);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  const timelineRowsById = useMemo(() => new Map(timeline.map((row) => [row.id, row])), [timeline]);
  const attachmentTargets = useMemo(() => {
    const triggeredRowsBySourceAndSkill = new Map<string, TimelineRow[]>();
    timeline.forEach((row) => {
      if (row.kind !== "trigger" || !row.sourceRowId || row.step.type !== "skill") return;
      const key = `${row.sourceRowId}:${row.step.skill}`;
      const matches = triggeredRowsBySourceAndSkill.get(key);
      if (matches) matches.push(row);
      else triggeredRowsBySourceAndSkill.set(key, [row]);
    });

    return timeline
      .filter((row) => row.kind === "rotation" && row.step.type === "skill" && !row.skipped)
      .flatMap((skillRow) => {
        const skillStepIndex = skillRow.rotationIndex ?? -1;
        const targets: Array<{
          skillRowId: string;
          skillStepIndex: number;
          target: AttachedEventTarget;
          time: number;
          order: number;
        }> = [
          {
            skillRowId: skillRow.id,
            skillStepIndex,
            target: { action: "start" },
            time: skillRow.startTime,
            order: skillRow.order,
          },
        ];
        skillRow.actions.forEach((action, actionIndex) => {
          if (action.type === "damage")
            targets.push({
              skillRowId: skillRow.id,
              skillStepIndex,
              target: { action: actionIndex },
              time: skillRow.startTime + Number(action.time ?? 0),
              order: skillRow.order + 10 + actionIndex,
            });
        });
        const nextTriggeredRowBySkill = new Map<string, number>();
        let triggerOrdinal = 0;
        skillRow.actions.forEach((action) => {
          if (action.type !== "trigger" || typeof action.value !== "string") return;
          const key = `${skillRow.id}:${action.value}`;
          const matchIndex = nextTriggeredRowBySkill.get(action.value) ?? 0;
          const triggeredRow = triggeredRowsBySourceAndSkill.get(key)?.[matchIndex];
          nextTriggeredRowBySkill.set(action.value, matchIndex + 1);
          if (triggeredRow) {
            triggeredRow.actions.forEach((triggeredAction, actionIndex) => {
              if (triggeredAction.type === "damage")
                targets.push({
                  skillRowId: skillRow.id,
                  skillStepIndex,
                  target: { trigger: triggerOrdinal, action: actionIndex },
                  time: triggeredRow.startTime + Number(triggeredAction.time ?? 0),
                  order: triggeredRow.order + 10 + actionIndex,
                });
            });
          }
          triggerOrdinal += 1;
        });
        return targets;
      })
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order);
  }, [timeline]);
  const displayEntries = useMemo(() => {
    const actionsExpanded = (rowId: string) => expandedSkillRows.has(`${editingRotationId}:${rowId}`);
    const derivedSourceExpanded = (row: TimelineRow) => {
      if (row.kind === "rotation") return false;
      const sourceRow = row.sourceRowId ? timelineRowsById.get(row.sourceRowId) : undefined;
      return Boolean(sourceRow && (sourceRow.step.type !== "skill" || actionsExpanded(sourceRow.id)));
    };

    return timeline
      .flatMap((row) => {
        if (row.skipped) return [];
        const entries: Array<{
          row: TimelineRow;
          kind: "skill" | "action";
          time: number;
          order: number;
          actionIndex?: number;
        }> = [];
        const derivedActionsVisible = derivedSourceExpanded(row);
        if (row.kind === "rotation") entries.push({ row, kind: "skill", time: row.startTime, order: row.order });
        row.actions.forEach((action, actionIndex) => {
          const isStartingAction = startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex;
          const actionsVisible =
            (row.kind !== "rotation" && derivedActionsVisible) ||
            row.step.type !== "skill" ||
            actionsExpanded(row.id) ||
            isStartingAction;
          if (action.type === "damage" && actionsVisible)
            entries.push({
              row,
              kind: "action",
              actionIndex,
              time: row.startTime + (typeof action.time === "number" ? action.time : 0),
              order: row.order + 10 + actionIndex,
            });
        });
        return entries;
      })
      .sort((left, right) => compareTimelineTime(left.time, right.time) || left.order - right.order);
  }, [editingRotationId, expandedSkillRows, startAnchor, timeline, timelineRowsById]);
  const showDistanceColumn = useMemo(
    () =>
      rotation.steps.some(
        (step) =>
          (step.type === "event" && step.event === "Move") ||
          (step.type === "skill" && findSkill(step.skill ?? "")?.tags?.includes("Distance")),
      ),
    [rotation.steps],
  );
  const showSelfHPColumn = useMemo(
    () =>
      rotation.steps.some(
        (step) =>
          (step.type === "event" && (step.event === "SelfHP" || step.event === "TakeDamage")) ||
          (step.type === "skill" && findSkill(step.skill ?? "")?.tags?.includes("HP")),
      ),
    [rotation.steps],
  );
  const showTargetHPColumn = useMemo(
    () =>
      rotation.targetHP !== undefined || rotation.steps.some((step) => step.type === "event" && step.event === "HP"),
    [rotation.steps, rotation.targetHP],
  );
  const showQiColumn = useMemo(
    () => rotation.steps.some((step) => step.type === "event" && step.event === "Qi"),
    [rotation.steps],
  );
  const totalRotationTime = currentCachedResult?.duration ?? 0;
  const readableRotation = useMemo(
    () => (readableDialogOpen ? readableRotationText(timeline, startAnchor, anchorTime) : ""),
    [anchorTime, readableDialogOpen, startAnchor, timeline],
  );
  const totalRotationDamage = currentCachedResult?.metrics.totalDamage ?? 0;
  const rotationDps = currentCachedResult?.metrics.dps ?? 0;
  const applyPriorityStatLine = (key: keyof CharacterStats, amount: number) => {
    return { ...characterStats, [key]: characterStats[key] + amount };
  };
  const priorityLevelData = statRollsForLevel(enemy.level);
  const priorityCharacter = Object.fromEntries(
    Object.entries(priorityLevelData?.affix ?? {}).filter(([key]) =>
      characterStatAvailableForSettings(key as keyof CharacterStats, settings),
    ),
  ) as Partial<Record<keyof CharacterStats, number>>;
  const priorityAttunement = Object.keys(attunementData)
    .filter((key) => attunementAvailableForSettings(key, loadSelectedPath(), settings))
    .flatMap((key) => {
      const amount = maxGearRoll(key, "attunement", false, enemy.level);
      return typeof amount === "number" ? [[key, amount] as const] : [];
    });
  const selectedInnerWays = buildSetup.innerWays.filter(
    (row) => row.innerWay && innerWayAvailableForPath(row.innerWay),
  );
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
      setReadableCopyStatus(t("ui.app.copied"));
    } catch {
      readableTextRef.current?.focus();
      readableTextRef.current?.select();
      setReadableCopyStatus(t("ui.app.manualCopyInstruction"));
    }
  }
  const makeTimelineInput = (
    rotationRecord: RotationRecord,
    conditions = innerWayConditions,
    rules = innerWayEffectRules,
    setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup),
    globalDebuffs = currentGlobalDebuffs,
  ): TimelineBuildInput => ({
    rotation: rotationRecord,
    skills: calculationDefinitions.skills,
    eventDefinitions: rotationEventDefinitions,
    dots: calculationDefinitions.dots,
    effectDefinitions: calculationDefinitions.effectDefinitions,
    innerWayConditions: [...conditions, ...setupConditionsFor(setupEffects)],
    innerWayRules: rules,
    setupEffects,
    weapons: settings.weapons,
    initialDebuffs: globalDebuffTimelineEffects(globalDebuffs),
    maxHP: displayedCharacterStats.maxHp,
  });
  function calculationBundleFor(rotationRecord: RotationRecord, includeDiffs: boolean): RotationSimulationBundle {
    const rotationAnchor = rotationRecord.start
      ? { rowId: `rotation-${rotationRecord.start.step}`, actionIndex: rotationRecord.start.action }
      : { rowId: "rotation-0" };
    const baselineSetupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup);
    const setComparisonGroups = includeDiffs
      ? Object.fromEntries(
          (
            [
              ["weaponSets", typedWeaponSetDefinitions],
              ["armorSets", typedArmorSetDefinitions],
            ] as const
          ).flatMap(([key, definitions]) =>
            Object.entries(definitions)
              .filter(([, definition]) => setAvailableForSettings(definition, settings))
              .map(([setName, definition]) => [
                `${key}:${setName}`,
                [0, 2, 4]
                  .filter((tier) => tier !== buildSetup[key][setName])
                  .map((tier) => {
                    const selections = selectSetTier(buildSetup[key], setName, tier as 0 | 2 | 4, definitions);
                    const setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, {
                      [key]: selections,
                    });
                    return {
                      label: String(tier),
                      setupEffects,
                      ...(definition.altersTimeline
                        ? {
                            timeline: makeTimelineInput(
                              rotationRecord,
                              innerWayConditions,
                              innerWayEffectRules,
                              setupEffects,
                            ),
                          }
                        : {}),
                    };
                  }),
              ]),
          ),
        )
      : {};
    const selectedFood = currentFood;
    const selectedScript = currentScript;
    const selectedDivinecraft = currentDivinecraft;
    return {
      timeline: makeTimelineInput(rotationRecord, innerWayConditions, innerWayEffectRules, baselineSetupEffects),
      startAnchor: rotationAnchor,
      stats: characterStats,
      attunement: attunementStats,
      enemy,
      derivedStats,
      weapons: settings.weapons,
      statPriority: includeDiffs
        ? Object.entries(priorityCharacter).map(([key, amount]) => {
            const variantStats = applyPriorityStatLine(key as keyof CharacterStats, Number(amount));
            const definition = allStatDefinitions.find((candidate) => candidate.key === key);
            return {
              label: definition?.label ?? key,
              maxRoll: Number(amount) * (definition?.unit === "%" ? 100 : 1),
              stats: variantStats,
            };
          })
        : [],
      attunementPriority: includeDiffs
        ? priorityAttunement.map(([key, amount]) => {
            const variantAttunement = {
              ...attunementStats,
              [key]: attunementStats[key as keyof AttunementStats] + Number(amount),
            };
            return {
              label: attunementData[key]?.name ?? key,
              maxRoll: Number(amount) * (percentageAttunementKeys.has(key as keyof AttunementStats) ? 100 : 1),
              attunement: variantAttunement,
            };
          })
        : [],
      innerWayPriority: includeDiffs
        ? selectedInnerWays.map((selected) => {
            const definition = innerWayDefinitions[selected.innerWay as keyof typeof innerWayDefinitions];
            const variantRules = innerWayEffectRules.filter((rule) => rule.source !== selected.innerWay);
            const variantConditions = innerWayConditionsFor(buildSetup.innerWays, selected.innerWay);
            const setupEffects = baselineSetupEffects;
            return {
              label: definition?.name ?? selected.innerWay,
              ...(definition?.altersTimeline
                ? { timeline: makeTimelineInput(rotationRecord, variantConditions, variantRules, setupEffects) }
                : {}),
              innerWayRules: variantRules,
              innerWayConditions: [...variantConditions, ...setupConditionsFor(setupEffects)],
            };
          })
        : [],
      setupComparisons: includeDiffs
        ? {
            arsenal: Object.keys(typedArsenalDefinitions)
              .filter((value) => value !== buildSetup.arsenal)
              .map((value) => ({
                label: value,
                setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { arsenal: value }),
              })),
            bowRingSet: Object.keys(typedBowRingSetDefinitions)
              .filter((value) => value !== buildSetup.bowRingSet)
              .map((value) => ({
                label: value,
                setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { bowRingSet: value }),
              })),
            food: Object.keys(typedFoodDefinitions)
              .filter((value) => value !== selectedFood)
              .map((value) => ({
                label: value,
                setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { food: value }),
              })),
            script: Object.entries(typedScriptDefinitions)
              .filter(([value]) => value !== selectedScript)
              .map(([value, definition]) => {
                const setupEffects = selectedSetupEffects(settings, gearStatEffect, buildSetup, { script: value });
                return {
                  label: value,
                  setupEffects,
                  ...(definition.altersTimeline
                    ? {
                        timeline: makeTimelineInput(
                          rotationRecord,
                          innerWayConditions,
                          innerWayEffectRules,
                          setupEffects,
                        ),
                      }
                    : {}),
                };
              }),
            divinecraft: Object.entries(typedDivinecraftDefinitions)
              .filter(([value, definition]) => definition.available !== false && value !== selectedDivinecraft)
              .map(([value]) => ({
                label: value,
                setupEffects: selectedSetupEffects(settings, gearStatEffect, buildSetup, { divinecraft: value }),
              })),
            ...Object.fromEntries(
              globalDebuffRows.map(({ key }) => [
                `debuff:${key}`,
                [false, true]
                  .filter((enabled) => enabled !== currentGlobalDebuffs[key])
                  .map((enabled) => {
                    const globalDebuffs = { ...currentGlobalDebuffs, [key]: enabled };
                    return {
                      label: enabled ? "on" : "off",
                      timeline: makeTimelineInput(
                        rotationRecord,
                        innerWayConditions,
                        innerWayEffectRules,
                        baselineSetupEffects,
                        globalDebuffs,
                      ),
                    };
                  }),
              ]),
            ),
            "debuff:qingyisCharm": (["none", "T1", "T6"] as const)
              .filter((value) => value !== currentGlobalDebuffs.qingyisCharm)
              .map((value) => {
                const globalDebuffs = { ...currentGlobalDebuffs, qingyisCharm: value };
                return {
                  label: value,
                  timeline: makeTimelineInput(
                    rotationRecord,
                    innerWayConditions,
                    innerWayEffectRules,
                    baselineSetupEffects,
                    globalDebuffs,
                  ),
                };
              }),
            ...setComparisonGroups,
          }
        : ({} as Record<string, RotationSimulationVariant[]>),
    };
  }

  useEffect(() => {
    const activeRotation =
      activeRotationId === editingRotationId
        ? rotation
        : rotationEntries.find((entry) => entry.id === activeRotationId)?.rotation;
    const activeEntry = rotationEntries.find((entry) => entry.id === activeRotationId);
    if (activeRotation)
      onActiveSimulationBundleChange(
        calculationBundleFor(activeRotation, false),
        activeRotation.name || "Active rotation",
        `${activeRotationId}:${calculationContextKey}:${JSON.stringify(activeRotation)}`,
        activeEntry?.isDefault === true,
      );
  }, [
    activeRotationId,
    editingRotationId,
    rotation,
    rotationEntries,
    calculationContextKey,
    onActiveSimulationBundleChange,
  ]);

  const prepareBaselineCalculation = (rotationRecord: RotationRecord) => {
    const bundle = calculationBundleFor(rotationRecord, false);
    return { bundle, fingerprint: rotationBundleFingerprint(bundle) };
  };
  const workerCacheKeyFor = (fingerprint: string) => `rotation:${fingerprint}`;

  function storeBaselineResult(id: string, key: string, result: RotationSimulationResult) {
    const next = { ...rotationResultsRef.current, [id]: { key, result } };
    rotationResultsRef.current = next;
    setRotationResults(next);
  }

  async function calculateBaselineForRotation(
    id: string,
    rotationRecord: RotationRecord,
    priority = 100,
    prepared = prepareBaselineCalculation(rotationRecord),
  ) {
    const resultKey = prepared.fingerprint;
    const displayed = rotationResultsRef.current[id];
    if (displayed?.key === resultKey) {
      const cachedBaseline = calculationCacheRef.current.baseline(resultKey);
      if (cachedBaseline) return cachedBaseline;
    }
    const cachedBaseline = calculationCacheRef.current.baseline(resultKey);
    if (cachedBaseline) {
      storeBaselineResult(id, resultKey, cachedBaseline);
      return cachedBaseline;
    }
    const result = await requestRotationBaseline(prepared.bundle, workerCacheKeyFor(resultKey), {
      key: `baseline:${id}`,
      priority,
    });
    calculationCacheRef.current.storeBaseline(resultKey, result);
    storeBaselineResult(id, resultKey, result);
    return result;
  }

  async function calculateEditorPreview(id: string, rotationRecord: RotationRecord, requestSequence: number) {
    const prepared = prepareBaselineCalculation(rotationRecord);
    const resultKey = prepared.fingerprint;
    const refreshTarget = `${id}:${resultKey}`;
    const cachedBaseline = calculationCacheRef.current.baseline(resultKey);
    if (cachedBaseline) {
      if (editorPreviewRequestSequenceRef.current === requestSequence)
        storeBaselineResult(id, resultKey, cachedBaseline);
      return;
    }
    if (runningRefreshTargetRef.current === refreshTarget) return;
    const result = await requestRotationBaseline(prepared.bundle, workerCacheKeyFor(resultKey), {
      key: `preview:${id}`,
      priority: 200,
    });
    calculationCacheRef.current.storeBaseline(resultKey, result);
    if (editorPreviewRequestSequenceRef.current === requestSequence) storeBaselineResult(id, resultKey, result);
  }

  async function calculateDiffsForRotation(
    id: string,
    rotationRecord: RotationRecord,
    prepared = prepareBaselineCalculation(rotationRecord),
  ) {
    const requestSequence = ++diffRequestSequenceRef.current;
    supersedeRotationCalculationRequests();
    beginRotationCalculation();
    const contextKey = calculationContextKey;
    const resultKey = prepared.fingerprint;
    const refreshTarget = `${id}:${resultKey}`;
    scheduledRefreshTargetRef.current = refreshTarget;
    runningRefreshTargetRef.current = refreshTarget;
    try {
      const baseline = await calculateBaselineForRotation(id, rotationRecord, 400, prepared);
      if (calculationContextKeyRef.current !== contextKey) {
        if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const;
        endRotationCalculation();
        return "discarded" as const;
      }
      if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const;
      if (resolvedActiveRotationIdRef.current !== id) {
        endRotationCalculation();
        return "discarded" as const;
      }

      let metrics = baselineMetricsWithPreviousComparisons(baseline.metrics, getRotationMetrics());
      onMetricsChange(metrics, true);
      completeRotationCalculationCategory("baseline");

      const comparisonBundle = calculationBundleFor(rotationRecord, true);
      for (const category of comparisonCategoryOrder) {
        const variants = comparisonVariantRequests(comparisonBundle, category);
        if (variants.length === 0) {
          metrics = mergeComparisonCategory(metrics, baseline.metrics, category);
          onMetricsChange(metrics, true);
          completeRotationCalculationCategory(category);
          continue;
        }
        const variantMetrics: RotationMetrics[] = [];
        for (let index = 0; index < variants.length; index += 1) {
          const variant = variants[index];
          let calculated = calculationCacheRef.current.variant(resultKey, variant.key);
          if (!calculated) {
            calculated = await requestRotationComparisons(variant.bundle, workerCacheKeyFor(resultKey), baseline, {
              key: `diff:${id}:${category}:${variant.key}`,
              priority: 350,
              onProgress: (progress) => {
                if (diffRequestSequenceRef.current === requestSequence)
                  publishRotationCategoryProgress(category, (index + progress) / variants.length);
              },
            });
            calculationCacheRef.current.storeVariant(resultKey, variant.key, calculated);
          }
          variantMetrics.push(calculated);
          if (diffRequestSequenceRef.current === requestSequence)
            publishRotationCategoryProgress(category, (index + 1) / variants.length);
        }
        if (calculationContextKeyRef.current !== contextKey) {
          if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const;
          endRotationCalculation();
          return "discarded" as const;
        }
        if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const;
        if (resolvedActiveRotationIdRef.current !== id) {
          endRotationCalculation();
          return "discarded" as const;
        }
        metrics = combineComparisonVariantMetrics(metrics, variantMetrics, category);
        onMetricsChange(metrics, true);
        completeRotationCalculationCategory(category);
      }
      return "published" as const;
    } catch (calculationError) {
      if (diffRequestSequenceRef.current === requestSequence) endRotationCalculation();
      if (diffRequestSequenceRef.current !== requestSequence) return "superseded" as const;
      console.error("Rotation calculation failed", calculationError);
      return "failed" as const;
    } finally {
      if (diffRequestSequenceRef.current === requestSequence) runningRefreshTargetRef.current = null;
    }
  }

  const localRotationCalculation: RotationMetrics = {
    totalDamage: totalRotationDamage,
    dps: rotationDps,
    breakdown: currentCachedResult?.metrics.breakdown ?? emptyRotationBreakdown(),
    statPriority: priorityStats,
    attunementPriority: priorityAttunementRows,
    innerWayPriority: priorityInnerWays,
    setupComparisons,
  };
  const rotationCalculation = currentCachedResult?.metrics ?? localRotationCalculation;

  useEffect(() => {
    const requestSequence = ++editorPreviewRequestSequenceRef.current;
    const timer = window.setTimeout(() => {
      void calculateEditorPreview(editingRotationId, rotation, requestSequence).catch((calculationError) => {
        if (editorPreviewRequestSequenceRef.current !== requestSequence) return;
        if (calculationError instanceof Error && calculationError.message.includes("superseded")) return;
        console.error("Rotation editor preview calculation failed", calculationError);
      });
    }, 250);
    return () => {
      window.clearTimeout(timer);
      if (editorPreviewRequestSequenceRef.current === requestSequence) editorPreviewRequestSequenceRef.current += 1;
    };
  }, [calculationContextKey, editingRotationId, rotation]);

  useEffect(() => {
    const entries = rotationEntries.filter((entry) => rotationAvailableForWeapons(entry, settings.weapons));
    const activeEntry = entries.find((entry) => entry.id === activeRotationId) ?? entries[0];
    if (!activeEntry) return;
    const prepared = prepareBaselineCalculation(activeEntry.rotation);
    const refreshTarget = `${activeEntry.id}:${prepared.fingerprint}`;
    if (scheduledRefreshTargetRef.current === refreshTarget) return;
    void (async () => {
      const outcome = await calculateDiffsForRotation(activeEntry.id, activeEntry.rotation, prepared);
      if (outcome === "discarded") {
        setRefreshRetryRevision((current) => current + 1);
        return;
      }
      if (outcome !== "published") return;
      if (calculationContextKeyRef.current !== calculationContextKey) return;
      for (const entry of entries) {
        if (entry.id === activeEntry.id) continue;
        try {
          await calculateBaselineForRotation(entry.id, entry.rotation, 100);
        } catch {
          /* Superseded by newer work. */
        }
      }
    })();
  }, [activeRotationId, calculationContextKey, refreshRetryRevision, rotationEntries]);
  return (
    <section className="panel rotation-editor-panel">
      <div className="rotation-editor-layout">
        <aside className="rotation-list">
          <div className="rotation-list-heading">
            <span>{t("ui.app.rotations")}</span>
            <button className="button button-secondary button-small" type="button" onClick={addRotation}>
              {t("ui.app.newRotation")}
            </button>
          </div>
          <div className="rotation-list-entries">
            {visibleRotationEntries.map((entry) => (
              <div
                className={`rotation-list-item ${entry.id === activeRotationId ? "active" : ""} ${entry.id === editingRotationId ? "editing" : ""}`}
                key={entry.id}
                role="button"
                tabIndex={0}
                onClick={() => editRotation(entry.id)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") editRotation(entry.id);
                }}
              >
                <strong>
                  {entry.id === activeRotationId && (
                    <span className="active-rotation-icon" title={t("ui.app.activeRotation")}>
                      <UiIcon name="active" />
                    </span>
                  )}
                  {rotationEntryDisplayName(entry)}
                </strong>
                {!entry.isDefault && (
                  <span className="rotation-list-actions">
                    <button
                      className="rotation-remove-button"
                      type="button"
                      aria-label={t("ui.app.removeNamedRotation", {
                        name: entry.rotation.name || t("ui.app.rotation"),
                      })}
                      title={t("ui.app.removeRotation")}
                      disabled={visibleRotationEntries.length <= 1}
                      onClick={(event) => {
                        event.stopPropagation();
                        removeRotation(entry.id);
                      }}
                    >
                      <UiIcon name="close" />
                    </button>
                  </span>
                )}
              </div>
            ))}
          </div>
          <div className="rotation-transfer-actions">
            <div>
              <button className="button button-secondary button-small" type="button" onClick={exportRotations}>
                {t("ui.app.export")}
              </button>
              <label className="button button-secondary button-small rotation-import-button">
                {t("ui.app.import")}
                <input
                  type="file"
                  accept="application/json,.json"
                  aria-label={t("ui.app.importRotations")}
                  onChange={importRotations}
                />
              </label>
            </div>
            {transferStatus && (
              <p className={transferStatus.error ? "error" : ""} role={transferStatus.error ? "alert" : "status"}>
                {transferStatus.message}
              </p>
            )}
          </div>
        </aside>
        {editingEntry ? (
          <div className="rotation-editor-content">
            <div className="skill-detail-heading">
              <div>
                {editingName && !rotationLocked ? (
                  <input
                    className="rotation-name-input"
                    autoFocus
                    value={rotation.name}
                    onChange={(event) => setRotation({ ...rotation, name: event.target.value })}
                    onBlur={() => setEditingName(false)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") setEditingName(false);
                    }}
                  />
                ) : (
                  <h3>
                    {editingRotationDisplayName}
                    {!rotationLocked && (
                      <button
                        className="icon-button"
                        type="button"
                        aria-label={t("ui.app.editRotationName")}
                        onClick={() => setEditingName(true)}
                      >
                        <UiIcon name="edit" />
                      </button>
                    )}
                  </h3>
                )}
                {rotationLocked && (
                  <p className="rotation-default-note">{t("ui.app.thisIsAPrebuiltDefaultRotationAndCannot")}</p>
                )}
                <label className="rotation-target-hp">
                  <span>{t("ui.app.targetHp")}</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    disabled={rotationLocked}
                    placeholder={t("ui.app.notSpecified")}
                    value={rotation.targetHP ?? ""}
                    onChange={(event) => {
                      const value = event.target.value;
                      const parsed = Number(value);
                      if (value !== "" && !Number.isFinite(parsed)) return;
                      setRotation((current) => ({
                        ...current,
                        ...(value === "" ? { targetHP: undefined } : { targetHP: Math.max(1, parsed) }),
                      }));
                    }}
                  />
                </label>
              </div>
              <div className="detail-active-actions">
                {status && <span className="editor-status">{status}</span>}
                <span className="rotation-heading-actions">
                  <button
                    className="button button-secondary button-small"
                    type="button"
                    disabled={timeline.length === 0}
                    onClick={openReadableRotation}
                  >
                    {t("ui.app.readableFormat")}
                  </button>
                  <button className="button button-secondary button-small" type="button" onClick={duplicateRotation}>
                    {t("ui.app.duplicate")}
                  </button>
                  {!rotationLocked && (
                    <>
                      <button className="button button-secondary button-small" type="button" onClick={resetRotation}>
                        {t("ui.app.reset")}
                      </button>
                      <button className="button button-primary button-small" type="button" onClick={save}>
                        {t("ui.app.save")}
                      </button>
                    </>
                  )}
                  <button
                    className="button button-small detail-active-button"
                    type="button"
                    disabled={editingRotationId === activeRotationId}
                    onClick={() => activateRotation(editingRotationId)}
                  >
                    {editingRotationId === activeRotationId ? t("ui.app.active") : t("ui.app.makeActive")}
                  </button>
                </span>
              </div>
            </div>
            <div className="rotation-toolbar">
              <span>
                {rotation.steps.filter((step) => step.type === "skill").length} {t("ui.app.steps")}{" "}
                {formatNumber(totalRotationTime)}
                {t("ui.app.sTotalTime")}
              </span>
              <span className="rotation-results">
                <span>
                  {t("system.totalDamage")}: {formatNumber(rotationCalculation.totalDamage)}
                </span>
                <span>
                  {t("system.dps")}: {formatNumber(rotationCalculation.dps)}
                </span>
              </span>
            </div>
            <div className="rotation-scroll-content" ref={rotationScrollRef}>
              <div
                className="rotation-table"
                style={
                  {
                    "--rotation-state-columns": [
                      showDistanceColumn ? "10ch" : "",
                      showSelfHPColumn ? "8ch" : "",
                      showTargetHPColumn ? "8ch" : "",
                      showQiColumn ? "8ch" : "",
                    ]
                      .filter(Boolean)
                      .join(" "),
                    minInlineSize: `${67.5 + (Number(showDistanceColumn) + Number(showSelfHPColumn) + Number(showTargetHPColumn) + Number(showQiColumn)) * 5.3125}rem`,
                  } as CSSProperties
                }
              >
                <div className="rotation-table-header">
                  <span></span>
                  <span>#</span>
                  <span>{t("ui.app.startTime")}</span>
                  <span>{t("ui.app.castTime")}</span>
                  <span>{t("ui.app.skill")}</span>
                  {showDistanceColumn && <span>{t("ui.app.distance")}</span>}
                  {showSelfHPColumn && <span>{t("ui.app.selfHp")}</span>}
                  {showTargetHPColumn && <span>{t("ui.app.hp")}</span>}
                  {showQiColumn && <span>{t("ui.app.qi")}</span>}
                  <span className="rotation-damage-heading">{t("ui.app.damage")}</span>
                  <span>{t("ui.app.buff")}</span>
                  <span>{t("ui.app.debuff")}</span>
                  <span>{t("ui.app.actions")}</span>
                </div>
                <div className="rotation-step-list">
                  {displayEntries.map((entry, index) => {
                    const row = entry.row;
                    const isAction = entry.kind === "action";
                    const { step, startTime, skill, actions } = row;
                    const castTime = row.effectiveCastTime;
                    const effectNames = (
                      effects: Array<{ name: string; stack?: number; maxStack?: number; expiresAt?: number }>,
                      atTime: number,
                    ) =>
                      effects.length === 0 ? (
                        ""
                      ) : (
                        <span className="effect-plates">
                          {effects.map((effect) => {
                            const definition = calculationDefinitions.effectDefinitions[effect.name];
                            const description = gameText(definition?.description?.trim());
                            const name = gameText(definition?.name ?? effect.name);
                            const label = `${gameText(definition?.shortName) || name}${effect.stack && (effect.maxStack === undefined || effect.maxStack > 1) ? ` ×${effect.stack}` : ""}`;
                            const timeLeft =
                              effect.expiresAt === undefined ? "∞" : Math.max(0, effect.expiresAt - atTime).toFixed(2);
                            const plateKind = dotEffectIds.has(effect.name)
                              ? " effect-plate-dot"
                              : generalDebuffIds.has(effect.name)
                                ? " effect-plate-general-debuff"
                                : "";
                            return (
                              <span className={`effect-plate${plateKind}`} key={`${effect.name}-${effect.stack ?? 1}`}>
                                {label}
                                <span className="effect-plate-tooltip" role="tooltip">
                                  <strong>
                                    {name} - {t("ui.app.sLeft", { number: timeLeft })}
                                  </strong>
                                  {description && <span>{description}</span>}
                                </span>
                              </span>
                            );
                          })}
                        </span>
                      );
                    const actionIndex = entry.actionIndex;
                    const actionTime = entry.time;
                    const isManualEvent = step.type === "event";
                    const isDelayEvent = isManualEvent && step.event === "Delay";
                    const skillNumber =
                      step.type === "skill" && row.rotationIndex !== undefined
                        ? rotation.steps.slice(0, row.rotationIndex).filter((candidate) => candidate.type === "skill")
                            .length
                        : "";
                    const attachedTarget = attachedTargetForStep(step);
                    const isAttachedEvent = Boolean(attachedTarget);
                    const availableAttachmentTargets =
                      step.type === "event" && step.event === "Qi" && "after" in step
                        ? attachmentTargets.filter((target) => target.target.action !== "start")
                        : attachmentTargets;
                    const attachedTargetIndex = attachedTarget
                      ? availableAttachmentTargets.findIndex(
                          (target) =>
                            target.skillRowId === row.sourceRowId &&
                            target.target.action === attachedTarget.action &&
                            target.target.trigger === attachedTarget.trigger,
                        )
                      : -1;
                    const stepSkill = step.type === "skill" ? step.skill : undefined;
                    const actionsExpanded = skillActionsExpanded(row.id);
                    const actionState =
                      actionIndex === undefined
                        ? undefined
                        : (row.actionStates[actionIndex] ?? {
                            buffs: row.buffs,
                            debuffs: row.debuffs,
                            distance: row.distance,
                            currentHPRatio: row.currentHPRatio,
                            targetHPRatio: row.targetHPRatio,
                            targetQiRatio: row.targetQiRatio,
                            resources: row.resources,
                          });
                    const selfHPMaximum = Math.max(1, displayedCharacterStats.maxHp);
                    const selfHPPercentage = (actionState?.currentHPRatio ?? row.currentHPRatio) * 100;
                    const selfHPEventPercentage =
                      step.type === "event" && step.event === "SelfHP"
                        ? ("currentHP" in step && typeof step.currentHP === "number"
                            ? step.currentHP / selfHPMaximum
                            : (step.currentHPRatio ?? 1)) * 100
                        : selfHPPercentage;
                    const postDamageSelfHPPercentage =
                      step.type === "event" && step.event === "TakeDamage"
                        ? (Math.max(0, row.currentHP - step.damage) / selfHPMaximum) * 100
                        : selfHPPercentage;
                    const durationEvent =
                      isManualEvent && (step.event === "Controlled" || step.event === "Delay") ? step.event : undefined;
                    const durationValue = durationEvent
                      ? (("duration" in step ? step.duration : undefined) ??
                        (durationEvent === "Delay" ? 1 : eventDefaultDuration(durationEvent)))
                      : 0;
                    const actionBuffs =
                      actionState?.buffs.filter(
                        (effect) => effect.expiresAt === undefined || effect.expiresAt > actionTime,
                      ) ?? [];
                    const actionDebuffs =
                      actionState?.debuffs.filter(
                        (effect) => effect.expiresAt === undefined || effect.expiresAt > actionTime,
                      ) ?? [];
                    const skillDamageRows =
                      row.kind === "rotation"
                        ? [
                            row,
                            ...timeline.filter(
                              (candidate) => candidate.kind !== "rotation" && candidate.sourceRowId === row.id,
                            ),
                          ]
                        : [row];
                    const skillBreakdown = skillDamageRows.reduce<DamageBreakdown>(
                      (skillTotal, damageRow) =>
                        damageRow.actions.reduce<DamageBreakdown>((total, action, damageIndex) => {
                          if (action.type !== "damage") return total;
                          const breakdown = calculateTimelineActionBreakdown(damageRow, damageIndex);
                          return {
                            physical: total.physical + breakdown.physical,
                            bellstrike: total.bellstrike + breakdown.bellstrike,
                            stonesplit: total.stonesplit + breakdown.stonesplit,
                            silkbind: total.silkbind + breakdown.silkbind,
                            bamboocut: total.bamboocut + breakdown.bamboocut,
                            total: total.total + breakdown.total,
                          };
                        }, skillTotal),
                      {
                        physical: 0,
                        bellstrike: 0,
                        stonesplit: 0,
                        silkbind: 0,
                        bamboocut: 0,
                        total: 0,
                      } as DamageBreakdown,
                    );
                    return (
                      <div className="rotation-row-group" key={`${row.id}-${entry.kind}-${actionIndex ?? "skill"}`}>
                        {!isAction && (
                          <div
                            className={`rotation-table-row ${isManualEvent ? "rotation-event-row" : ""} ${isManualEvent && step.event === "Move" ? "rotation-move-event-row" : ""}`}
                            data-rotation-step-index={row.rotationIndex}
                          >
                            {row.kind === "rotation" ? (
                              <button
                                className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "active" : ""}`}
                                type="button"
                                aria-label={t("ui.app.setFightStartHere")}
                                disabled={rotationLocked}
                                onClick={() => selectStart(row.rotationIndex ?? 0)}
                              >
                                {startAnchor.rowId === row.id && startAnchor.actionIndex === undefined ? "→" : "•"}
                              </button>
                            ) : (
                              <span aria-hidden="true" />
                            )}
                            <span className="rotation-index">{skillNumber}</span>
                            {isManualEvent ? (
                              isAttachedEvent || isDelayEvent || rotationLocked ? (
                                <span>
                                  {formatNumber(displayTime(startTime))}
                                  {t("ui.app.s")}
                                </span>
                              ) : (
                                <input
                                  className="rotation-event-time"
                                  type="number"
                                  step="0.01"
                                  value={eventTimeDrafts[row.id] ?? formatNumber(displayTime(startTime))}
                                  onChange={(event) =>
                                    setEventTimeDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                                  }
                                  onBlur={() => commitEventTime(row.id, row.rotationIndex ?? 0)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                />
                              )
                            ) : (
                              <span>
                                {formatNumber(displayTime(startTime))}
                                {t("ui.app.s")}
                              </span>
                            )}
                            {durationEvent ? (
                              rotationLocked ? (
                                <span>
                                  {formatNumber(durationValue)}
                                  {t("ui.app.s")}
                                </span>
                              ) : (
                                <input
                                  className="rotation-event-time"
                                  type="number"
                                  min="0"
                                  step="0.01"
                                  value={eventDurationDrafts[row.id] ?? String(durationValue)}
                                  onChange={(event) =>
                                    setEventDurationDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                                  }
                                  onBlur={() => commitEventDuration(row.id, row.rotationIndex ?? 0)}
                                  onKeyDown={(event) => {
                                    if (event.key === "Enter") event.currentTarget.blur();
                                  }}
                                />
                              )
                            ) : isAttachedEvent ? (
                              <span />
                            ) : (
                              <span>
                                {isManualEvent ? "" : row.kind === "rotation" ? `${formatNumber(castTime)}s` : "—"}
                              </span>
                            )}
                            {row.kind === "rotation" ? (
                              rotationLocked ? (
                                <span className="rotation-skill-name">
                                  {isManualEvent ? (
                                    <span>{rotationEventDisplayName(step.event)}</span>
                                  ) : (
                                    <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />
                                  )}
                                </span>
                              ) : (
                                <span className="rotation-skill-select-wrap">
                                  <RotationSkillName
                                    skill={isManualEvent ? undefined : skill}
                                    fallback={isManualEvent ? rotationEventDisplayName(step.event) : (stepSkill ?? "")}
                                  />
                                  <select
                                    className="rotation-skill-select"
                                    data-rotation-step-index={row.rotationIndex}
                                    aria-label={t("ui.app.skillOrEvent")}
                                    value={isManualEvent ? `__event:${step.event}` : (stepSkill ?? "")}
                                    onChange={(event) =>
                                      selectRotationItem(
                                        row.rotationIndex ?? 0,
                                        event.target.value,
                                        event.currentTarget,
                                      )
                                    }
                                  >
                                    {stepSkill && !rotationSkillIds.includes(stepSkill) && (
                                      <option value={stepSkill} disabled>
                                        {skillDisplayName(findSkill(stepSkill), stepSkill)} {t("ui.app.unavailable")}
                                      </option>
                                    )}
                                    {rotationSkillIds.map((id) => (
                                      <option key={id} value={id}>
                                        {skillDisplayName(findSkill(id), id)}
                                      </option>
                                    ))}
                                    {rotationEventOptionIds.map((id) => (
                                      <option key={id} value={id}>
                                        {rotationEventDisplayName(id.slice(8))}
                                      </option>
                                    ))}
                                  </select>
                                </span>
                              )
                            ) : (
                              <span className="rotation-skill-name">
                                <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />
                              </span>
                            )}
                            {showDistanceColumn &&
                              (isManualEvent && step.event === "Move" ? (
                                rotationLocked ? (
                                  <span>
                                    {step.distance}
                                    {t("ui.app.m")}
                                  </span>
                                ) : (
                                  <span className="rotation-distance-input-wrap">
                                    <input
                                      className="rotation-event-time"
                                      aria-label={t("ui.app.distanceAfterMove")}
                                      type="number"
                                      min="1"
                                      step="1"
                                      value={eventDistanceDrafts[row.id] ?? String(step.distance)}
                                      onChange={(event) =>
                                        setEventDistanceDrafts((current) => ({
                                          ...current,
                                          [row.id]: event.target.value,
                                        }))
                                      }
                                      onBlur={() => commitEventDistance(row.id, row.rotationIndex ?? 0)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                      }}
                                    />
                                    <span>{t("ui.app.m")}</span>
                                  </span>
                                )
                              ) : (
                                <span>
                                  {formatNumber(row.distance)}
                                  {t("ui.app.m")}
                                </span>
                              ))}
                            {showSelfHPColumn &&
                              (isManualEvent && (step.event === "SelfHP" || step.event === "TakeDamage") ? (
                                rotationLocked ? (
                                  <span>
                                    {formatNumber(
                                      step.event === "SelfHP" ? selfHPEventPercentage : postDamageSelfHPPercentage,
                                    )}
                                    %
                                  </span>
                                ) : (
                                  <span className="rotation-distance-input-wrap">
                                    <input
                                      className="rotation-event-time"
                                      aria-label={
                                        step.event === "SelfHP" ? t("ui.app.currentSelfHp") : t("ui.app.damageTaken")
                                      }
                                      type="number"
                                      min="0"
                                      {...(step.event === "SelfHP" ? { max: 100 } : {})}
                                      step="0.01"
                                      value={
                                        eventHPDrafts[row.id] ??
                                        String(step.event === "SelfHP" ? selfHPEventPercentage : step.damage)
                                      }
                                      onChange={(event) =>
                                        setEventHPDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                                      }
                                      onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                      }}
                                    />
                                    {step.event === "SelfHP" ? (
                                      <span>%</span>
                                    ) : (
                                      <>
                                        <span>{t("ui.app.damage")}</span>
                                        <span>({formatNumber(postDamageSelfHPPercentage)}%)</span>
                                      </>
                                    )}
                                  </span>
                                )
                              ) : (
                                <span>{formatNumber(row.currentHPRatio * 100)}%</span>
                              ))}
                            {showTargetHPColumn &&
                              (isManualEvent && step.event === "HP" ? (
                                rotationLocked ? (
                                  <span>{formatNumber(step.targetHPRatio * 100)}%</span>
                                ) : (
                                  <span className="rotation-distance-input-wrap">
                                    <input
                                      className="rotation-event-time"
                                      aria-label={t("ui.app.targetHpPercentage")}
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={eventHPDrafts[row.id] ?? String(step.targetHPRatio * 100)}
                                      onChange={(event) =>
                                        setEventHPDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                                      }
                                      onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                      }}
                                    />
                                    <span>%</span>
                                  </span>
                                )
                              ) : (
                                <span>{formatNumber(row.targetHPRatio * 100)}%</span>
                              ))}
                            {showQiColumn &&
                              (isManualEvent && step.event === "Qi" ? (
                                rotationLocked ? (
                                  <span>{formatNumber(step.targetQiRatio * 100)}%</span>
                                ) : (
                                  <span className="rotation-distance-input-wrap">
                                    <input
                                      className="rotation-event-time"
                                      aria-label={t("ui.app.targetQiPercentage")}
                                      type="number"
                                      min="0"
                                      max="100"
                                      step="0.01"
                                      value={eventHPDrafts[row.id] ?? String(step.targetQiRatio * 100)}
                                      onChange={(event) =>
                                        setEventHPDrafts((current) => ({ ...current, [row.id]: event.target.value }))
                                      }
                                      onBlur={() => commitEventHP(row.id, row.rotationIndex ?? 0)}
                                      onKeyDown={(event) => {
                                        if (event.key === "Enter") event.currentTarget.blur();
                                      }}
                                    />
                                    <span>%</span>
                                  </span>
                                )
                              ) : (
                                <span>{formatNumber(row.targetQiRatio * 100)}%</span>
                              ))}
                            <span className="rotation-damage-value">
                              {isManualEvent ? (
                                ""
                              ) : step.type === "skill" && skillBreakdown.total > 0 ? (
                                <DamageBreakdownValue breakdown={skillBreakdown} />
                              ) : (
                                ""
                              )}
                            </span>
                            <span>
                              {isManualEvent && step.event === "Buff" ? (
                                rotationLocked ? (
                                  <span>
                                    {calculationDefinitions.effectDefinitions[step.buff]?.name ?? step.buff}
                                    {(step.stack ?? 1) > 1 ? ` ×${step.stack}` : ""}
                                  </span>
                                ) : (
                                  <span
                                    className={`rotation-effect-event-control ${(calculationDefinitions.effectDefinitions[step.buff]?.maxStack ?? 1) <= 1 ? "single" : ""}`}
                                  >
                                    <select
                                      className="rotation-effect-select"
                                      aria-label={t("ui.app.buffToApply")}
                                      value={step.buff}
                                      onChange={(event) => {
                                        const buff = event.target.value;
                                        updateStep(row.rotationIndex ?? 0, {
                                          buff,
                                          stack: Math.min(
                                            step.stack ?? 1,
                                            calculationDefinitions.effectDefinitions[buff]?.maxStack ?? 1,
                                          ),
                                        });
                                      }}
                                    >
                                      {Object.keys(manualBuffDefinitions).map((id) => (
                                        <option value={id} key={id}>
                                          {calculationDefinitions.effectDefinitions[id]?.name ?? id}
                                        </option>
                                      ))}
                                    </select>
                                    {(calculationDefinitions.effectDefinitions[step.buff]?.maxStack ?? 1) > 1 && (
                                      <input
                                        className="rotation-effect-stack"
                                        aria-label={t("ui.app.buffStacks")}
                                        type="number"
                                        min="1"
                                        max={calculationDefinitions.effectDefinitions[step.buff]?.maxStack}
                                        step="1"
                                        value={step.stack ?? 1}
                                        onChange={(event) => {
                                          const stack = Number(event.target.value);
                                          if (Number.isFinite(stack))
                                            updateStep(row.rotationIndex ?? 0, {
                                              stack: Math.max(
                                                1,
                                                Math.min(
                                                  calculationDefinitions.effectDefinitions[step.buff]?.maxStack ?? 1,
                                                  Math.floor(stack),
                                                ),
                                              ),
                                            });
                                        }}
                                      />
                                    )}
                                  </span>
                                )
                              ) : isManualEvent ? (
                                ""
                              ) : (
                                effectNames(row.buffs, startTime)
                              )}
                            </span>
                            <span>
                              {isManualEvent && step.event === "Debuff" ? (
                                rotationLocked ? (
                                  <span>
                                    {calculationDefinitions.effectDefinitions[step.debuff]?.name ?? step.debuff}
                                    {(step.stack ?? 1) > 1 ? ` ×${step.stack}` : ""}
                                  </span>
                                ) : (
                                  <span
                                    className={`rotation-effect-event-control ${(calculationDefinitions.effectDefinitions[step.debuff]?.maxStack ?? 1) <= 1 ? "single" : ""}`}
                                  >
                                    <select
                                      className="rotation-effect-select"
                                      aria-label={t("ui.app.debuffToApply")}
                                      value={step.debuff}
                                      onChange={(event) => {
                                        const debuff = event.target.value;
                                        updateStep(row.rotationIndex ?? 0, {
                                          debuff,
                                          stack: Math.min(
                                            step.stack ?? 1,
                                            calculationDefinitions.effectDefinitions[debuff]?.maxStack ?? 1,
                                          ),
                                        });
                                      }}
                                    >
                                      {Object.keys(manualDebuffDefinitions).map((id) => (
                                        <option value={id} key={id}>
                                          {calculationDefinitions.effectDefinitions[id]?.name ?? id}
                                        </option>
                                      ))}
                                    </select>
                                    {(calculationDefinitions.effectDefinitions[step.debuff]?.maxStack ?? 1) > 1 && (
                                      <input
                                        className="rotation-effect-stack"
                                        aria-label={t("ui.app.debuffStacks")}
                                        type="number"
                                        min="1"
                                        max={calculationDefinitions.effectDefinitions[step.debuff]?.maxStack}
                                        step="1"
                                        value={step.stack ?? 1}
                                        onChange={(event) => {
                                          const stack = Number(event.target.value);
                                          if (Number.isFinite(stack))
                                            updateStep(row.rotationIndex ?? 0, {
                                              stack: Math.max(
                                                1,
                                                Math.min(
                                                  calculationDefinitions.effectDefinitions[step.debuff]?.maxStack ?? 1,
                                                  Math.floor(stack),
                                                ),
                                              ),
                                            });
                                        }}
                                      />
                                    )}
                                  </span>
                                )
                              ) : isManualEvent ? (
                                ""
                              ) : (
                                effectNames(row.debuffs, startTime)
                              )}
                            </span>
                            <span className="rotation-controls">
                              {isAttachedEvent && (
                                <>
                                  <span className="rotation-control-placeholder" aria-hidden="true" />
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveEventToPreviousAction")}
                                    disabled={rotationLocked || attachedTargetIndex <= 0}
                                    onClick={(event) =>
                                      moveAttachedEvent(row.rotationIndex ?? 0, -1, event.currentTarget)
                                    }
                                  >
                                    <UiIcon name="up" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveEventToNextAction")}
                                    disabled={
                                      rotationLocked ||
                                      attachedTargetIndex < 0 ||
                                      attachedTargetIndex >= availableAttachmentTargets.length - 1
                                    }
                                    onClick={(event) =>
                                      moveAttachedEvent(row.rotationIndex ?? 0, 1, event.currentTarget)
                                    }
                                  >
                                    <UiIcon name="down" />
                                  </button>
                                </>
                              )}
                              {row.kind === "rotation" && !isManualEvent && (
                                <button
                                  className="rotation-expand-button"
                                  type="button"
                                  aria-label={t("ui.app.toggleNamedSkillActions", {
                                    action: actionsExpanded ? t("ui.app.collapse") : t("ui.app.expand"),
                                    name: skillDisplayName(skill, stepSkill ?? t("ui.app.skillFallback")),
                                  })}
                                  aria-expanded={actionsExpanded}
                                  onClick={() => toggleSkillActions(row.id)}
                                >
                                  <UiIcon name={actionsExpanded ? "chevronDown" : "chevronRight"} />
                                </button>
                              )}
                              {row.kind === "rotation" && (!isManualEvent || isDelayEvent) && (
                                <>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveUp")}
                                    disabled={rotationLocked || (row.rotationIndex ?? 0) === 0}
                                    onClick={() => moveStep(row.rotationIndex ?? 0, -1)}
                                  >
                                    <UiIcon name="up" />
                                  </button>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.moveDown")}
                                    disabled={rotationLocked || (row.rotationIndex ?? 0) === rotation.steps.length - 1}
                                    onClick={() => moveStep(row.rotationIndex ?? 0, 1)}
                                  >
                                    <UiIcon name="down" />
                                  </button>
                                </>
                              )}{" "}
                              {row.kind === "rotation" && (
                                <>
                                  <button
                                    type="button"
                                    aria-label={t("ui.app.deleteStep")}
                                    disabled={rotationLocked}
                                    onClick={() => removeStep(row.rotationIndex ?? 0)}
                                  >
                                    <UiIcon name="close" />
                                  </button>
                                  {(!isManualEvent || isDelayEvent) && (
                                    <button
                                      type="button"
                                      aria-label={t("ui.app.addStepBelow")}
                                      disabled={rotationLocked}
                                      onClick={() => addStepBelow(row.rotationIndex ?? 0)}
                                    >
                                      <UiIcon name="plus" />
                                    </button>
                                  )}
                                </>
                              )}
                              {isAttachedEvent && <span className="rotation-control-placeholder" aria-hidden="true" />}
                            </span>
                          </div>
                        )}
                        {isAction &&
                          (() => {
                            const actionKey = `${row.id}:${actionIndex ?? 0}`;
                            const actionCalculated = Object.prototype.hasOwnProperty.call(
                              workerActionBreakdowns,
                              actionKey,
                            );
                            return (
                              <div
                                className={`rotation-action-row ${row.kind === "trigger" ? "rotation-action-trigger" : row.kind === "dot" ? "rotation-action-dot" : ""}`}
                              >
                                {row.kind === "rotation" ? (
                                  <button
                                    className={`start-marker ${startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex ? "active" : ""}`}
                                    type="button"
                                    aria-label={t("ui.app.setFightStartHere")}
                                    disabled={rotationLocked}
                                    onClick={() => selectStart(row.rotationIndex ?? 0, actionIndex)}
                                  >
                                    {startAnchor.rowId === row.id && startAnchor.actionIndex === actionIndex
                                      ? "→"
                                      : "•"}
                                  </button>
                                ) : (
                                  <span aria-hidden="true" />
                                )}
                                <span aria-hidden="true" />
                                <span>
                                  {formatNumber(displayTime(actionTime))}
                                  {t("ui.app.s")}
                                </span>
                                <span aria-hidden="true" />
                                <span>
                                  <RotationSkillName skill={skill} fallback={stepSkill ?? ""} />
                                </span>
                                {showDistanceColumn && (
                                  <span>
                                    {formatNumber(actionState?.distance ?? row.distance)}
                                    {t("ui.app.m")}
                                  </span>
                                )}
                                {showSelfHPColumn && <span>{formatNumber(selfHPPercentage)}%</span>}
                                {showTargetHPColumn && (
                                  <span>{formatNumber((actionState?.targetHPRatio ?? row.targetHPRatio) * 100)}%</span>
                                )}
                                {showQiColumn && (
                                  <span>{formatNumber((actionState?.targetQiRatio ?? row.targetQiRatio) * 100)}%</span>
                                )}
                                <span className="rotation-action-damage">
                                  {actionCalculated ? (
                                    <DamageBreakdownValue
                                      breakdown={calculateTimelineActionBreakdown(row, actionIndex ?? 0)}
                                    />
                                  ) : null}
                                </span>
                                <span>{effectNames(actionBuffs, actionTime)}</span>
                                <span>{effectNames(actionDebuffs, actionTime)}</span>
                                <span aria-hidden="true" />
                              </div>
                            );
                          })()}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
            {error && <p className="editor-error">{error}</p>}
          </div>
        ) : (
          <div className="rotation-editor-content">
            <p className="array-editor-empty">{t("ui.app.noRotationsMatchTheSelectedMartialArtsAdd")}</p>
          </div>
        )}
      </div>
      <dialog className="rotation-readable-dialog" ref={readableDialogRef} onClose={() => setReadableDialogOpen(false)}>
        <div className="rotation-readable-heading">
          <div>
            <span className="detail-kicker">{t("ui.app.readableFormat")}</span>
            <h3>{editingRotationDisplayName}</h3>
          </div>
          <button
            className="icon-button"
            type="button"
            aria-label={t("ui.app.closeReadableRotation")}
            onClick={() => readableDialogRef.current?.close()}
          >
            <UiIcon name="close" />
          </button>
        </div>
        <p>{t("ui.app.skillsBeforeTheStartUseARoundedPre")}</p>
        <textarea
          ref={readableTextRef}
          readOnly
          value={readableRotation}
          aria-label={t("ui.app.readableRotation")}
          onFocus={(event) => event.currentTarget.select()}
        />
        <div className="rotation-readable-actions">
          <span role="status">{readableCopyStatus}</span>
          <button className="button button-secondary" type="button" onClick={() => readableDialogRef.current?.close()}>
            {t("ui.app.close")}
          </button>
          <button className="button button-primary" type="button" onClick={copyReadableRotation}>
            {t("ui.app.copy")}
          </button>
        </div>
      </dialog>
    </section>
  );
}

export default function App() {
  const [locale, setLocale] = useState(getLocale);
  const [activeTab, setActiveTab] = useState<
    "main" | "build" | "breakdown" | "rotations" | "simulation" | "skills" | "settings"
  >("main");
  // Load the large simulator only on first use, then keep it mounted while hidden.
  // Remounting would cancel its worker and discard progress/results on every tab switch.
  const [simulationMounted, setSimulationMounted] = useState(false);
  const [skillOverrides, setSkillOverrides] = useState<SkillOverrides>(loadSkillOverrides);
  const skillEditorModified = hasSkillOverrides(skillOverrides);
  const [activeSimulation, setActiveSimulation] = useState<{
    bundle: RotationSimulationBundle;
    rotationName: string;
    bundleKey: string;
    rotationIsDefault: boolean;
  }>();
  const rotationMetrics = useSyncExternalStore(subscribeToRotationMetrics, getRotationMetrics, getRotationMetrics);
  const [innerWayRevision, setInnerWayRevision] = useState(0);
  const [statOverrides, setStatOverrides] = useState<CharacterStatOverrides>(loadStatOverrides);
  const [attunementOverrides, setAttunementOverrides] = useState<AttunementOverrides>(loadAttunementOverrides);
  const [characterProfiles, setCharacterProfiles] = useState<CharacterProfile[]>(loadCharacterProfiles);
  const [devMode, setDevMode] = useState(loadDevMode);
  const [pathId, setPathId] = useState<PathId>(() => loadSelectedPath(devMode));
  const [settings, setSettings] = useState<CalculatorSettings>(() => settingsForPath(loadSettings(), pathId));
  const [buildState, setBuildState] = useState<BuildState>(loadBuildState);
  const enemy = typedEnemyProfiles[settings.enemy] ?? typedEnemyProfiles[defaultSettings.enemy];
  const availableBuildEntries = buildState.entries.filter(
    (entry) =>
      (devMode || !buildEntryIsTestPreset(entry)) && buildEntryAvailableForMartialArts(entry, settings.weapons),
  );
  const activeBuild =
    availableBuildEntries.find((entry) => entry.id === buildState.activeBuildId) ?? availableBuildEntries[0];
  const activeBuildDisplayName = activeBuild
    ? (activeBuild.isDefault ? gameText(activeBuild.name) : activeBuild.name) || "Unnamed Build"
    : "Unnamed Build";
  const activeBuildSetup = useMemo(() => resolveBuildSetup(activeBuild), [activeBuild]);
  const [buildSetupOverrides, setBuildSetupOverrides] = useState<BuildSetupOverrides>(() =>
    loadBuildSetupOverrides(activeBuildSetup),
  );
  const buildSetup = useMemo<BuildSetup>(
    () => ({
      innerWays: (buildSetupOverrides.innerWays ?? activeBuildSetup.innerWays).map((row) => ({ ...row })),
      weaponSets: { ...(buildSetupOverrides.weaponSets ?? activeBuildSetup.weaponSets) },
      armorSets: { ...(buildSetupOverrides.armorSets ?? activeBuildSetup.armorSets) },
      bowRingSet: buildSetupOverrides.bowRingSet ?? activeBuildSetup.bowRingSet,
      arsenal: buildSetupOverrides.arsenal ?? activeBuildSetup.arsenal,
    }),
    [activeBuildSetup, buildSetupOverrides],
  );
  const activeGearInventory = useMemo(
    () =>
      activeBuild
        ? resolveBuildInventory(activeBuild, buildState.gearItems, settings.weapons)
        : { items: [], equipped: {} },
    [activeBuild, buildState.gearItems, settings.weapons],
  );
  const equippedGearEffects = useMemo(
    () => calculateEquippedGearEffects(activeGearInventory, settings.weapons, activeBuild?.isDefault !== true),
    [activeGearInventory, settings.weapons, activeBuild?.isDefault],
  );
  const gearStatEffect = useMemo<StatEffectContainer>(
    () => ({ stat: equippedGearEffects.stats }),
    [equippedGearEffects],
  );
  const globalStatState = useMemo(
    () => calculateGlobalStatState(statOverrides, settings, gearStatEffect, buildSetup),
    [statOverrides, settings, gearStatEffect, buildSetup, innerWayRevision],
  );
  const displayedStats = globalStatState.stats;
  const derivedStats = globalStatState.derivedStats;
  const displayedAttunementStats = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(defaultAttunementStats).map((key) => {
          const statKey = key as keyof AttunementStats;
          return [
            statKey,
            Object.prototype.hasOwnProperty.call(attunementOverrides, statKey)
              ? attunementOverrides[statKey]
              : (equippedGearEffects.attunement[statKey] ?? 0),
          ];
        }),
      ) as AttunementStats,
    [attunementOverrides, equippedGearEffects],
  );
  const character = useMemo(
    () => ({
      stats: displayedStats,
      rawStats: globalStatState.baseStats,
      attunementStats: displayedAttunementStats,
      settings,
      enemy,
      derivedStats,
      innerWayRevision,
      gearStatEffect,
      buildSetup,
    }),
    [
      displayedStats,
      globalStatState.baseStats,
      displayedAttunementStats,
      settings,
      enemy,
      derivedStats,
      innerWayRevision,
      gearStatEffect,
      buildSetup,
    ],
  );
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
  const updateAttunementOverride = (key: keyof AttunementStats, value: number) =>
    setAttunementOverrides((current) => ({ ...current, [key]: value }));
  const resetAttunementOverride = (key: keyof AttunementStats) =>
    setAttunementOverrides((current) => {
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
  const resetBuildSetupOverride = (key: keyof BuildSetup) =>
    setBuildSetupOverrides((current) => {
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
      innerWays: profile.innerWays.map((row) => ({ ...row })),
      weaponSets: { ...profile.buildSetup.weaponSets },
      armorSets: { ...profile.buildSetup.armorSets },
      bowRingSet: profile.buildSetup.bowRingSet,
      arsenal: profile.buildSetup.arsenal,
    });
  };
  const handleRotationMetrics = (metrics: RotationMetrics, isActive: boolean) => {
    if (isActive) publishRotationMetrics(metrics);
  };
  const handleActiveSimulationBundle = useCallback(
    (bundle: RotationSimulationBundle, rotationName: string, bundleKey: string, rotationIsDefault: boolean) =>
      setActiveSimulation({ bundle, rotationName, bundleKey, rotationIsDefault }),
    [],
  );
  const activeRotationDisplayName = activeSimulation
    ? activeSimulation.rotationIsDefault
      ? gameText(activeSimulation.rotationName)
      : activeSimulation.rotationName
    : "—";
  const selectPath = (nextPathId: PathId) => {
    if (pathRequiresDev(typedPathDefinitions[nextPathId]) && !devMode) return;
    sessionStorage.setItem(pathStorageKey, nextPathId);
    setPathId(nextPathId);
    setSettings((current) => settingsForPath(current, nextPathId));
    setInnerWayRevision((current) => current + 1);
  };
  const selectBuildWeapons = (nextWeapons: [WeaponId, WeaponId]) => {
    const matchingPath = (Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).find(
      ([candidateId, definition]) =>
        candidateId !== "mixed" &&
        (!pathRequiresDev(definition) || devMode) &&
        definition.lockedWeapons &&
        sameWeaponPair(definition.lockedWeapons, nextWeapons),
    );
    const nextPathId = matchingPath?.[0] ?? (devMode ? "mixed" : undefined);
    if (!nextPathId) return false;
    sessionStorage.setItem(pathStorageKey, nextPathId);
    setPathId(nextPathId);
    setSettings((current) =>
      nextPathId === "mixed"
        ? { ...settingsForPath(current, nextPathId), weapons: [...nextWeapons] }
        : settingsForPath(current, nextPathId),
    );
    setInnerWayRevision((current) => current + 1);
    return true;
  };
  const toggleDevMode = () => {
    const nextDevMode = !devMode;
    localStorage.setItem(devModeStorageKey, String(nextDevMode));
    setDevMode(nextDevMode);
    if (!nextDevMode && pathRequiresDev(typedPathDefinitions[pathId])) selectPath("stonesplitStrength");
    if (!nextDevMode && isLocaleWip(locale)) void changeLocale("en");
  };
  const changeLocale = async (nextLocale: string) => {
    if (await selectLocale(nextLocale)) setLocale(getLocale());
  };
  const updateSkillOverrides = (nextOverrides: SkillOverrides) => {
    setSkillOverrides(nextOverrides);
    if (hasSkillOverrides(nextOverrides)) sessionStorage.setItem(skillStorageKey, JSON.stringify(nextOverrides));
    else sessionStorage.removeItem(skillStorageKey);
  };

  useEffect(() => localStorage.setItem(statOverrideStorageKey, JSON.stringify(statOverrides)), [statOverrides]);
  useEffect(
    () => localStorage.setItem(characterProfileStorageKey, serializeCharacterProfiles(characterProfiles)),
    [characterProfiles],
  );
  useEffect(() => {
    if (activeBuild && activeBuild.id !== buildState.activeBuildId)
      setBuildState((current) => ({ ...current, activeBuildId: activeBuild.id }));
  }, [activeBuild, buildState.activeBuildId]);
  useEffect(() => localStorage.setItem(buildListStorageKey, serializeBuildState(buildState)), [buildState]);
  useEffect(() => localStorage.setItem(activeBuildStorageKey, buildState.activeBuildId), [buildState.activeBuildId]);
  useEffect(
    () => sessionStorage.setItem(attunementOverrideStorageKey, JSON.stringify(attunementOverrides)),
    [attunementOverrides],
  );
  useEffect(
    () => sessionStorage.setItem(buildSetupOverrideStorageKey, JSON.stringify(buildSetupOverrides)),
    [buildSetupOverrides],
  );
  useEffect(() => sessionStorage.setItem(settingsStorageKey, JSON.stringify(settings)), [settings]);
  useEffect(() => sessionStorage.setItem(pathStorageKey, pathId), [pathId]);

  return (
    <main className={`page-shell ${activeTab === "build" || activeTab === "rotations" ? "viewport-page-shell" : ""}`}>
      <header className="page-header">
        <div>
          <h1>{t("ui.app.whereBuildsMeet")}</h1>
          <p className="intro">{t("ui.app.buildSimulateAndOptimizeForWhereWindsMeet")}</p>
        </div>
        <div className="page-header-controls">
          <label className="locale-selector">
            <span>{t("ui.app.language")}</span>
            <select value={locale} onChange={(event) => void changeLocale(event.target.value)}>
              {getSupportedLocales().map((supportedLocale) => (
                <option
                  value={supportedLocale}
                  key={supportedLocale}
                  disabled={!devMode && isLocaleWip(supportedLocale)}
                >
                  {getLocaleDisplayName(supportedLocale)}
                </option>
              ))}
            </select>
          </label>
          <button
            className="button button-secondary dev-mode-button"
            type="button"
            aria-pressed={devMode}
            onClick={toggleDevMode}
          >
            {t("ui.app.dev")}
          </button>
        </div>
      </header>
      <section className="path-selector" aria-label={t("ui.app.combatPath")}>
        <div className="path-selector-options">
          {(Object.entries(typedPathDefinitions) as Array<[PathId, PathDefinition]>).map(([value, definition]) => (
            <button
              className={pathId === value ? "selected" : ""}
              type="button"
              key={value}
              aria-pressed={pathId === value}
              disabled={pathRequiresDev(definition) && !devMode}
              onClick={() => selectPath(value)}
            >
              {definition.icon && <img src={`${import.meta.env.BASE_URL}paths/${definition.icon}`} alt="" />}
              <span>{gameText(definition.name)}</span>
              {(definition.wip || definition.devOnly) && (
                <small className="path-status-badge">{definition.devOnly ? t("ui.app.dev") : t("ui.app.wip")}</small>
              )}
            </button>
          ))}
        </div>
      </section>
      <nav className="main-tabs" aria-label={t("ui.app.mainSections")}>
        <button className={activeTab === "main" ? "active" : ""} type="button" onClick={() => setActiveTab("main")}>
          {t("ui.app.main")}
        </button>
        <button className={activeTab === "build" ? "active" : ""} type="button" onClick={() => setActiveTab("build")}>
          {t("ui.app.build")}
        </button>
        <button
          className={activeTab === "breakdown" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("breakdown")}
        >
          {t("ui.app.dpsBreakdown", { dps: t("system.dps") })}
        </button>
        <button
          className={activeTab === "rotations" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("rotations")}
        >
          {t("ui.app.rotationEditor")}
        </button>
        <button
          className={activeTab === "simulation" ? "active" : ""}
          type="button"
          onClick={() => {
            setSimulationMounted(true);
            setActiveTab("simulation");
          }}
        >
          {t("ui.app.simulation")}
        </button>
        <button
          className={`${activeTab === "skills" ? "active" : ""} ${skillEditorModified ? "modified" : ""}`}
          type="button"
          onClick={() => setActiveTab("skills")}
        >
          {t("ui.app.skillEditor")}
        </button>
        <button
          className={activeTab === "settings" ? "active" : ""}
          type="button"
          onClick={() => setActiveTab("settings")}
        >
          {t("ui.app.settings")}
        </button>
      </nav>
      {activeTab === "main" ? (
        <StatsTab
          character={character}
          pathId={pathId}
          statOverrides={statOverrides}
          attunementOverrides={attunementOverrides}
          characterProfiles={characterProfiles}
          buildSetupOverrides={buildSetupOverrides}
          onStatChange={updateStatOverride}
          onStatReset={resetStatOverride}
          onAttunementChange={updateAttunementOverride}
          onAttunementReset={resetAttunementOverride}
          onApplyCharacterProfile={applyCharacterProfile}
          onCharacterProfilesChange={setCharacterProfiles}
          onBuildSetupChange={updateBuildSetupOverride}
          onBuildSetupReset={resetBuildSetupOverride}
          rotationMetrics={rotationMetrics}
          activeBuildName={activeBuildDisplayName}
          activeRotationName={activeRotationDisplayName}
          onInnerWayChange={() => setInnerWayRevision((current) => current + 1)}
        />
      ) : activeTab === "build" ? (
        <Suspense fallback={<div className="viewport-tab-content" />}>
          <div className="viewport-tab-content">
            <BuildTab
              weapons={settings.weapons}
              martialArtTags={settings.weapons.map((weapon) => martialArtDefinitions[weapon].tag)}
              pathTag={pathId === "mixed" ? undefined : typedPathDefinitions[pathId].tag}
              devMode={devMode}
              buildState={buildState}
              onBuildStateChange={setBuildState}
              onSelectBuildWeapons={selectBuildWeapons}
            />
          </div>
        </Suspense>
      ) : activeTab === "breakdown" ? (
        <BreakdownTab metrics={rotationMetrics} />
      ) : activeTab === "skills" ? (
        <SkillEditorTab
          weapons={settings.weapons}
          overrides={skillOverrides}
          onOverridesChange={updateSkillOverrides}
        />
      ) : activeTab === "settings" ? (
        <SettingsTab
          settings={settings}
          enemy={enemy}
          pathId={pathId}
          devMode={devMode}
          onSettingsChange={setSettings}
        />
      ) : null}
      <div className={`viewport-tab-content ${activeTab === "rotations" ? "" : "tab-hidden"}`}>
        <RotationEditorTab
          character={character}
          devMode={devMode}
          skillOverrides={skillOverrides}
          onMetricsChange={handleRotationMetrics}
          onActiveSimulationBundleChange={handleActiveSimulationBundle}
        />
      </div>
      {simulationMounted && (
        <div className={activeTab === "simulation" ? "" : "tab-hidden"}>
          <Suspense fallback={null}>
            <SimulationTab
              bundle={activeSimulation?.bundle}
              bundleKey={activeSimulation?.bundleKey}
              rotationName={activeSimulation ? activeRotationDisplayName : undefined}
              buildName={activeBuildDisplayName}
            />
          </Suspense>
        </div>
      )}
      <footer className="page-footer">
        <span>{t("ui.app.authorGreydustWwmIgnGreydustDiscord")}</span>
        <a href="https://github.com/greydust/where-builds-meet" target="_blank" rel="noreferrer">
          {t("ui.app.github")}
        </a>
      </footer>
    </main>
  );
}
