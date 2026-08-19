import gearJson from "../data/gear.json";
import attunementJson from "../data/attunement.json";
import arsenalJson from "../data/arsenal.json";
import bowRingSetJson from "../data/bow-ring-set.json";
import defaultSetupJson from "../data/default-setup.json";
import gearSetJson from "../data/gear-set.json";
import armorSetJson from "../data/armor-set.json";
import statJson from "../data/stat.json";
import type { AttunementStats } from "./calculations/damage";
import { weaponIds, type CharacterStats, type WeaponId } from "./types";

export const legacyGearStorageKey = "wwm-gear-inventory-v1";
export const buildListStorageKey = "wwm-build-list-v1";
export const activeBuildStorageKey = "wwm-active-build-v1";
export const buildExportFormat = "where-builds-meet-builds";

export const gearSlots = [
  "leftWeapon",
  "rightWeapon",
  "helmet",
  "chestpiece",
  "disc",
  "pendant",
  "greaves",
  "bracer",
] as const;
export type GearSlot = (typeof gearSlots)[number];
export type GearLevel = 91 | 96;
export type GearRarity = "Purple" | "Gold";
export type GearSetTier = 0 | 2 | 4;
export type SetSelections = Record<string, GearSetTier>;
export type InnerWaySelection = { innerWay: string; tier: string };
export type BuildSetup = {
  innerWays: InnerWaySelection[];
  weaponSets: SetSelections;
  armorSets: SetSelections;
  bowRingSet: string;
  arsenal: string;
};
export type BuildSetupOverrides = Partial<BuildSetup>;

export type GearValue = { key: string; value: number };
export type GearItem = {
  id: string;
  slot?: GearSlot;
  definitionId: string;
  level: GearLevel;
  rarity: GearRarity;
  relayed?: boolean;
  baseAffix: GearValue;
  additionalAffixes: GearValue[];
  attunement?: GearValue;
};

export type GearInventory = {
  items: GearItem[];
  equipped: Partial<Record<GearSlot, string>>;
};

export type BuildPresetGear = {
  definitionId: string;
  level: GearLevel;
  rarity: GearRarity;
  relayed?: boolean;
  baseAffix: GearValue;
  additionalAffixes: GearValue[];
  attunement: GearValue;
};

export type BuildPreset = {
  id: string;
  name: string;
  order?: number;
  test?: boolean;
  relayed?: boolean;
  martialArts: WeaponId[];
  setup?: BuildSetup;
  gear: Partial<Record<GearSlot, BuildPresetGear>>;
};

export type BuildEntry = {
  id: string;
  name: string;
  isDefault?: boolean;
  presetId?: string;
  martialArts?: WeaponId[];
  equipped?: Partial<Record<GearSlot, string>>;
  setup?: BuildSetup;
};

export type BuildState = {
  entries: BuildEntry[];
  activeBuildId: string;
  gearItems: GearItem[];
};

export type GearValueDefinition = {
  name: string;
  percentage?: boolean;
};

export type AttunementDefinition = GearValueDefinition & {
  implemented?: boolean;
  tags: string[];
  effect: {
    stat: Record<string, number>;
    tags?: string[];
  };
};

export type GearDefinition = {
  name: string;
  slots: GearSlot[];
  weapon?: WeaponId;
  baseStats: Partial<Record<string, Partial<Record<GearRarity, Partial<CharacterStats>>>>>;
  baseAffixes: Record<string, string[]>;
  additionalAffixes: Record<string, string[]>;
  attunements: string[];
};

type GearData = {
  slots: Record<GearSlot, string>;
  affixes: Record<string, GearValueDefinition>;
  universalAdditionalAffixes: Record<string, string[]>;
  gear: Record<string, GearDefinition>;
};

export const gearData = gearJson as unknown as GearData;
export const attunementData = attunementJson as unknown as Record<string, AttunementDefinition>;
export function attunementsForGearDefinition(definition: GearDefinition) {
  return Object.entries(attunementData).flatMap(([id, attunement]) =>
    definition.attunements.some((selector) => selector === id || attunement.tags.includes(selector)) ? [id] : [],
  );
}
export function affixOptionsForGearDefinition(
  definition: GearDefinition,
  category: "baseAffixes" | "additionalAffixes",
  level: GearLevel,
  relayed = false,
) {
  const options = definition[category];
  const relayOnly = options[`${level}Relayed`] ?? [];
  const standard = (options[String(level)] ?? []).filter((key) => relayed || !relayOnly.includes(key));
  const universal = category === "additionalAffixes" ? (gearData.universalAdditionalAffixes[String(level)] ?? []) : [];
  return Array.from(new Set([...standard, ...(relayed ? relayOnly : []), ...universal]));
}
export type StatRollData = { affix: Record<string, number>; attunement: Record<string, number> };
const statData = statJson as Record<string, StatRollData>;
export function statRollsForLevel(level: number) {
  return statData[String(level)];
}
export const relayedAffixMultiplier = 0.94;
export function maxGearRoll(key: string, category: "affix" | "attunement", relayed = false, level: number = 96) {
  const levelData = statRollsForLevel(level);
  if (!levelData) return undefined;
  const priorityKey = category === "attunement" && attunementData[key]?.tags.includes("Armor") ? "armor" : key;
  const value = levelData[category][priorityKey];
  if (typeof value !== "number") return undefined;
  return value * (category === "affix" && relayed ? relayedAffixMultiplier : 1);
}
export function clampGearRoll(
  key: string,
  value: number,
  category: "affix" | "attunement",
  relayed = false,
  level: number = 96,
) {
  const maximum = maxGearRoll(key, category, relayed, level);
  return typeof maximum === "number" ? Math.min(value, maximum) : value;
}
export type SetDefinition = {
  name: string;
  altersTimeline: boolean;
  tags: string[];
  options: Record<string, { name: string; effect?: unknown }>;
};
export const weaponSetDefinitions = gearSetJson as Record<string, SetDefinition>;
export const armorSetDefinitions = armorSetJson as Record<string, SetDefinition>;
const bowRingSetDefinitions = bowRingSetJson as Record<string, unknown>;
const arsenalDefinitions = arsenalJson as Record<string, unknown>;
const configuredDefaultSetup = defaultSetupJson as BuildSetup;
const legacyArsenalStorageKey = "wwm-arsenal-session-v1";
const legacyBowRingSetStorageKey = "wwm-bow-ring-set-session-v1";
const legacyGearSetStorageKey = "wwm-gear-set-session-v1";
const legacyInnerWayStorageKey = "wwm-inner-way-session-v1";

const cloneBuildSetup = (setup: BuildSetup): BuildSetup => ({
  innerWays: setup.innerWays.map((row) => ({ ...row })),
  weaponSets: { ...setup.weaponSets },
  armorSets: { ...setup.armorSets },
  bowRingSet: setup.bowRingSet,
  arsenal: setup.arsenal,
});
const validTier = (value: unknown): value is GearSetTier => value === 0 || value === 2 || value === 4;

function normalizeSetSelections(value: unknown, definitions: Record<string, SetDefinition>, fallback: SetSelections) {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  let remaining = 4;
  return Object.fromEntries(
    Object.keys(definitions).map((setName) => {
      const raw = candidate[setName];
      const fallbackTier = fallback[setName] ?? 0;
      const requested = validTier(raw) && String(raw) in definitions[setName].options ? raw : fallbackTier;
      const tier = Math.min(requested, remaining) as GearSetTier;
      remaining -= tier;
      return [setName, tier];
    }),
  );
}

function validSetSelections(value: unknown, definitions: Record<string, SetDefinition>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Object.keys(definitions).every(
      (setName) => validTier(candidate[setName]) && String(candidate[setName]) in definitions[setName].options,
    ) && Object.keys(definitions).reduce((total, setName) => total + Number(candidate[setName]), 0) <= 4
  );
}

export function setAvailableForTags(definition: SetDefinition, martialArtTags: string[], pathTag?: string) {
  return (
    (!pathTag || definition.tags.includes(pathTag)) &&
    [...new Set(martialArtTags)].every((tag) => definition.tags.includes(tag))
  );
}

export function availableSetEntriesForTags<T extends SetDefinition>(
  definitions: Record<string, T>,
  martialArtTags: string[],
  pathTag?: string,
) {
  return Object.entries(definitions).filter(([, definition]) =>
    setAvailableForTags(definition, martialArtTags, pathTag),
  );
}

export function selectSetTier(
  current: SetSelections,
  setName: string,
  tier: GearSetTier,
  definitions: Record<string, SetDefinition>,
) {
  let remaining = 4 - tier;
  return Object.fromEntries(
    Object.keys(definitions).map((name) => {
      if (name === setName) return [name, tier];
      const kept = Math.min(current[name] ?? 0, remaining) as GearSetTier;
      remaining -= kept;
      return [name, kept];
    }),
  );
}

function parseInnerWays(value: unknown, expectedLength: number) {
  if (!Array.isArray(value) || value.length !== expectedLength) return undefined;
  const parsed = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const row = item as Record<string, unknown>;
    return typeof row.innerWay === "string" && typeof row.tier === "string" && /^T[0-6]$/.test(row.tier)
      ? { innerWay: row.innerWay === "None" ? "" : row.innerWay, tier: row.tier }
      : undefined;
  });
  if (!parsed.every(Boolean)) return undefined;
  const rows = parsed as InnerWaySelection[];
  const selected = rows.map((row) => row.innerWay).filter(Boolean);
  return new Set(selected).size === selected.length ? rows : undefined;
}

function normalizeInnerWays(value: unknown, fallback: InnerWaySelection[]) {
  return parseInnerWays(value, fallback.length) ?? fallback.map((row) => ({ ...row }));
}

export const defaultBuildSetup = cloneBuildSetup(configuredDefaultSetup);

export function normalizeBuildSetup(value: unknown, fallback: BuildSetup = defaultBuildSetup): BuildSetup {
  const candidate =
    value && typeof value === "object" && !Array.isArray(value)
      ? (value as Partial<BuildSetup> & { gearSets?: unknown })
      : {};
  const weaponSets = candidate.weaponSets ?? candidate.gearSets;
  return {
    innerWays: normalizeInnerWays(candidate.innerWays, fallback.innerWays),
    weaponSets: normalizeSetSelections(weaponSets, weaponSetDefinitions, fallback.weaponSets),
    armorSets: normalizeSetSelections(candidate.armorSets, armorSetDefinitions, fallback.armorSets),
    bowRingSet:
      typeof candidate.bowRingSet === "string" && candidate.bowRingSet in bowRingSetDefinitions
        ? candidate.bowRingSet
        : fallback.bowRingSet,
    arsenal:
      typeof candidate.arsenal === "string" && candidate.arsenal in arsenalDefinitions
        ? candidate.arsenal
        : fallback.arsenal,
  };
}

export function normalizeBuildSetupOverrides(value: unknown): BuildSetupOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Partial<BuildSetup> & { gearSets?: unknown };
  const result: BuildSetupOverrides = {};
  const innerWays = parseInnerWays(candidate.innerWays, defaultBuildSetup.innerWays.length);
  if (innerWays) result.innerWays = innerWays;
  const weaponSets = candidate.weaponSets ?? candidate.gearSets;
  if (validSetSelections(weaponSets, weaponSetDefinitions))
    result.weaponSets = normalizeSetSelections(weaponSets, weaponSetDefinitions, defaultBuildSetup.weaponSets);
  if (validSetSelections(candidate.armorSets, armorSetDefinitions))
    result.armorSets = normalizeSetSelections(candidate.armorSets, armorSetDefinitions, defaultBuildSetup.armorSets);
  if (typeof candidate.bowRingSet === "string" && candidate.bowRingSet in bowRingSetDefinitions)
    result.bowRingSet = candidate.bowRingSet;
  if (typeof candidate.arsenal === "string" && candidate.arsenal in arsenalDefinitions)
    result.arsenal = candidate.arsenal;
  return result;
}

function loadLegacyBuildSetup() {
  if (typeof sessionStorage === "undefined") return cloneBuildSetup(defaultBuildSetup);
  let gearSets: unknown;
  let innerWays: unknown;
  try {
    gearSets = JSON.parse(sessionStorage.getItem(legacyGearSetStorageKey) ?? "null");
  } catch {
    gearSets = undefined;
  }
  try {
    innerWays = JSON.parse(sessionStorage.getItem(legacyInnerWayStorageKey) ?? "null");
  } catch {
    innerWays = undefined;
  }
  return normalizeBuildSetup({
    innerWays,
    weaponSets: gearSets,
    bowRingSet: sessionStorage.getItem(legacyBowRingSetStorageKey),
    arsenal: sessionStorage.getItem(legacyArsenalStorageKey),
  });
}
const buildPresetModules = import.meta.glob("../data/build/**/*.json", { eager: true, import: "default" }) as Record<
  string,
  BuildPreset
>;
export const defaultBuildPresets = Object.values(buildPresetModules).sort(
  (left, right) =>
    (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) ||
    left.name.localeCompare(right.name),
);

export function buildEntryIsTestPreset(entry: BuildEntry) {
  return entry.isDefault === true && defaultBuildPresets.find((preset) => preset.id === entry.presetId)?.test === true;
}
const weaponIdSet = new Set<WeaponId>(weaponIds);

function normalizedMartialArts(
  value: unknown,
  equipped: Partial<Record<GearSlot, string>> = {},
  items: GearItem[] = [],
) {
  const explicit = Array.isArray(value)
    ? value.filter((item): item is WeaponId => typeof item === "string" && weaponIdSet.has(item as WeaponId))
    : [];
  if (explicit.length) return explicit;
  const inferred = ["leftWeapon", "rightWeapon"].flatMap((slot) => {
    const itemId = equipped[slot as GearSlot];
    const item = itemId ? items.find((candidate) => candidate.id === itemId) : undefined;
    const weapon = item ? gearData.gear[item.definitionId]?.weapon : undefined;
    return weapon ? [weapon] : [];
  });
  return inferred.length === 2 ? inferred : [...weaponIds];
}

export function buildEntryMartialArts(entry: BuildEntry) {
  return entry.isDefault
    ? (defaultBuildPresets.find((preset) => preset.id === entry.presetId)?.martialArts ?? entry.martialArts ?? [])
    : (entry.martialArts ?? []);
}

export function sameWeaponPair(left: readonly WeaponId[], right: readonly WeaponId[]) {
  if (left.length !== 2 || right.length !== 2) return false;
  return [...left].sort().every((weapon, index) => weapon === [...right].sort()[index]);
}

export function buildEntryAvailableForMartialArts(entry: BuildEntry, selectedMartialArts: [WeaponId, WeaponId]) {
  const tags = buildEntryMartialArts(entry);
  if (weaponIds.every((weapon) => tags.includes(weapon))) return true;
  return sameWeaponPair(tags, selectedMartialArts);
}

const weaponDefinitionIds: Record<WeaponId, string> = {
  snowparting: "hengBlade",
  phalanxbane: "moBlade",
  thundercry: "moBlade",
  stormbreaker: "spear",
  everspring: "umbrella",
  unfettered: "unfetteredRopeDart",
  heavenwill: "gauntlet",
  skygrasp: "skygraspRopeDart",
};

export function gearDefinitionForSlot(slot: GearSlot, weapons: [WeaponId, WeaponId]) {
  const definitionId =
    slot === "leftWeapon"
      ? weaponDefinitionIds[weapons[0]]
      : slot === "rightWeapon"
        ? weaponDefinitionIds[weapons[1]]
        : slot;
  return { definitionId, definition: gearData.gear[definitionId] };
}

export function gearItemSupportsSlot(item: GearItem, slot: GearSlot) {
  const definition = gearData.gear[item.definitionId];
  if (!definition?.slots.includes(slot)) return false;
  return definition.weapon ? slot === "leftWeapon" || slot === "rightWeapon" : item.slot === slot;
}

export function isGearItemCompatible(item: GearItem, slot: GearSlot, weapons: [WeaponId, WeaponId]) {
  const expected = gearDefinitionForSlot(slot, weapons);
  return gearItemSupportsSlot(item, slot) && expected.definitionId === item.definitionId;
}

export function gearBaseStats(item: GearItem) {
  return gearData.gear[item.definitionId]?.baseStats[String(item.level)]?.[item.rarity] ?? {};
}

function validGearValue(
  value: unknown,
  allowedKeys: string[],
  definitions: Record<string, unknown>,
): value is GearValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<GearValue>;
  return (
    typeof candidate.key === "string" &&
    allowedKeys.includes(candidate.key) &&
    candidate.key in definitions &&
    typeof candidate.value === "number" &&
    Number.isFinite(candidate.value) &&
    candidate.value >= 0
  );
}

function parseGearItem(value: unknown): GearItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<GearItem>;
  if (typeof candidate.id !== "string" || !candidate.id) return undefined;
  if (typeof candidate.definitionId !== "string") return undefined;
  const definition = gearData.gear[candidate.definitionId];
  const level = candidate.level === 91 || candidate.level === 96 ? candidate.level : undefined;
  const rarity = candidate.rarity === "Purple" || candidate.rarity === "Gold" ? candidate.rarity : undefined;
  const slot = gearSlots.includes(candidate.slot as GearSlot) ? (candidate.slot as GearSlot) : undefined;
  if (!definition || !level || !rarity || (!definition.weapon && (!slot || !definition.slots.includes(slot))))
    return undefined;
  const relayed = candidate.relayed === true;
  if (
    !validGearValue(
      candidate.baseAffix,
      affixOptionsForGearDefinition(definition, "baseAffixes", level, relayed),
      gearData.affixes,
    )
  )
    return undefined;
  const additionalAffixes = candidate.additionalAffixes === undefined ? [] : candidate.additionalAffixes;
  if (!Array.isArray(additionalAffixes) || additionalAffixes.length > 4) return undefined;
  if (
    !additionalAffixes.every((affix) =>
      validGearValue(
        affix,
        affixOptionsForGearDefinition(definition, "additionalAffixes", level, relayed),
        gearData.affixes,
      ),
    )
  )
    return undefined;
  if (new Set(additionalAffixes.map((affix) => affix.key)).size !== additionalAffixes.length) return undefined;
  const attunement =
    candidate.attunement === undefined
      ? undefined
      : validGearValue(candidate.attunement, attunementsForGearDefinition(definition), attunementData)
        ? candidate.attunement
        : undefined;
  if (candidate.attunement !== undefined && !attunement) return undefined;
  return {
    id: candidate.id,
    ...(definition.weapon ? {} : { slot }),
    definitionId: candidate.definitionId,
    level,
    rarity,
    ...(relayed ? { relayed: true } : {}),
    baseAffix: candidate.baseAffix,
    additionalAffixes,
    ...(attunement ? { attunement } : {}),
  };
}

function parseGearItems(value: unknown): GearItem[] {
  if (!Array.isArray(value)) return [];
  const seenIds = new Set<string>();
  return value.flatMap((candidate): GearItem[] => {
    const item = parseGearItem(candidate);
    if (!item || seenIds.has(item.id)) return [];
    seenIds.add(item.id);
    return [item];
  });
}

function parseEquipped(value: unknown, items: GearItem[]) {
  const equippedValues =
    value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  const usedIds = new Set<string>();
  return Object.fromEntries(
    gearSlots.flatMap((slot) => {
      const id = equippedValues[slot];
      const item =
        typeof id === "string" && !usedIds.has(id) ? items.find((candidate) => candidate.id === id) : undefined;
      if (!item || !gearItemSupportsSlot(item, slot)) return [];
      usedIds.add(item.id);
      return [[slot, item.id]];
    }),
  ) as Partial<Record<GearSlot, string>>;
}

export function parseGearInventory(value: unknown): GearInventory {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { items: [], equipped: {} };
  const saved = value as { items?: unknown; equipped?: unknown };
  const items = parseGearItems(saved.items);
  return { items, equipped: parseEquipped(saved.equipped, items) };
}

export function loadGearInventory(): GearInventory {
  try {
    return parseGearInventory(JSON.parse(localStorage.getItem(legacyGearStorageKey) ?? "null"));
  } catch {
    return { items: [], equipped: {} };
  }
}

export function buildPresetInventory(preset: BuildPreset): GearInventory {
  const entries = gearSlots.flatMap((slot): Array<{ slot: GearSlot; item: GearItem }> => {
    const presetGear = preset.gear[slot];
    if (!presetGear) return [];
    const definition = gearData.gear[presetGear.definitionId];
    if (!definition?.slots.includes(slot)) throw new Error(`Invalid ${slot} definition in build preset ${preset.id}.`);
    const relayed = presetGear.relayed === true || preset.relayed === true;
    if (
      !validGearValue(
        presetGear.baseAffix,
        affixOptionsForGearDefinition(definition, "baseAffixes", presetGear.level, relayed),
        gearData.affixes,
      )
    )
      throw new Error(`Invalid base affix in build preset ${preset.id}.`);
    if (
      presetGear.additionalAffixes.length !== 4 ||
      !presetGear.additionalAffixes.every((affix) =>
        validGearValue(
          affix,
          affixOptionsForGearDefinition(definition, "additionalAffixes", presetGear.level, relayed),
          gearData.affixes,
        ),
      ) ||
      new Set(presetGear.additionalAffixes.map((affix) => affix.key)).size !== 4
    )
      throw new Error(`Invalid additional affixes in build preset ${preset.id}.`);
    if (!validGearValue(presetGear.attunement, attunementsForGearDefinition(definition), attunementData))
      throw new Error(`Invalid attunement in build preset ${preset.id}.`);
    return [
      {
        slot,
        item: {
          id: `preset:${preset.id}:${slot}`,
          ...(definition.weapon ? {} : { slot }),
          definitionId: presetGear.definitionId,
          level: presetGear.level,
          rarity: presetGear.rarity,
          ...(relayed ? { relayed: true } : {}),
          baseAffix: { ...presetGear.baseAffix },
          additionalAffixes: presetGear.additionalAffixes.map((affix) => ({ ...affix })),
          attunement: { ...presetGear.attunement },
        },
      },
    ];
  });
  return {
    items: entries.map(({ item }) => item),
    equipped: Object.fromEntries(entries.map(({ slot, item }) => [slot, item.id])),
  };
}

function alignEquippedWeapons(inventory: GearInventory, weapons: [WeaponId, WeaponId]): GearInventory {
  const weaponSlots: GearSlot[] = ["leftWeapon", "rightWeapon"];
  const candidates = weaponSlots.flatMap((slot) => {
    const itemId = inventory.equipped[slot];
    const item = itemId ? inventory.items.find((candidate) => candidate.id === itemId) : undefined;
    return item ? [item] : [];
  });
  const usedIds = new Set<string>();
  const equipped = { ...inventory.equipped };
  for (const slot of weaponSlots) {
    const expectedDefinitionId = gearDefinitionForSlot(slot, weapons).definitionId;
    const item = candidates.find(
      (candidate) => !usedIds.has(candidate.id) && candidate.definitionId === expectedDefinitionId,
    );
    if (item) {
      equipped[slot] = item.id;
      usedIds.add(item.id);
    } else {
      delete equipped[slot];
    }
  }
  return { ...inventory, equipped };
}

export function resolveBuildInventory(
  entry: BuildEntry,
  sharedItems: GearItem[] = [],
  weapons?: [WeaponId, WeaponId],
): GearInventory {
  let inventory: GearInventory;
  if (entry.isDefault) {
    const preset = defaultBuildPresets.find((candidate) => candidate.id === entry.presetId);
    inventory = preset ? buildPresetInventory(preset) : { items: [], equipped: {} };
  } else {
    inventory = { items: sharedItems, equipped: entry.equipped ?? {} };
  }
  return weapons ? alignEquippedWeapons(inventory, weapons) : inventory;
}

export function resolveBuildSetup(entry?: BuildEntry): BuildSetup {
  if (entry?.isDefault) {
    const preset = defaultBuildPresets.find((candidate) => candidate.id === entry.presetId);
    return normalizeBuildSetup(preset?.setup);
  }
  return normalizeBuildSetup(entry?.setup);
}

function migrateInventoryToShared(inventory: GearInventory, ownerId: string, sharedItems: GearItem[]) {
  const usedIds = new Set(sharedItems.map((item) => item.id));
  const migratedIds = new Map<string, string>();
  for (const item of inventory.items) {
    let id = item.id;
    if (usedIds.has(id)) {
      const baseId = `${id}:migrated:${ownerId}`;
      id = baseId;
      let suffix = 2;
      while (usedIds.has(id)) id = `${baseId}:${suffix++}`;
    }
    usedIds.add(id);
    migratedIds.set(item.id, id);
    sharedItems.push(id === item.id ? item : { ...item, id });
  }
  return Object.fromEntries(
    gearSlots.flatMap((slot) => {
      const legacyId = inventory.equipped[slot];
      const migratedId = legacyId ? migratedIds.get(legacyId) : undefined;
      return migratedId ? [[slot, migratedId]] : [];
    }),
  ) as Partial<Record<GearSlot, string>>;
}

export function serializeBuildState(state: BuildState) {
  return JSON.stringify({
    version: 8,
    entries: state.entries
      .filter((entry) => !entry.isDefault)
      .map((entry) => ({
        id: entry.id,
        name: entry.name,
        martialArts: normalizedMartialArts(entry.martialArts, entry.equipped, state.gearItems),
        equipped: entry.equipped ?? {},
        setup: normalizeBuildSetup(entry.setup),
      })),
    gearItems: state.gearItems.map(withoutWeaponSlot),
  });
}

export function exportBuildState(state: BuildState) {
  return JSON.stringify(
    {
      format: buildExportFormat,
      version: 7,
      exportedAt: new Date().toISOString(),
      gearItems: state.gearItems.map(withoutWeaponSlot),
      builds: state.entries
        .filter((entry) => !entry.isDefault)
        .map((entry) => ({
          id: entry.id,
          name: entry.name,
          martialArts: normalizedMartialArts(entry.martialArts, entry.equipped, state.gearItems),
          equipped: entry.equipped ?? {},
          setup: normalizeBuildSetup(entry.setup),
        })),
    },
    null,
    2,
  );
}

function importedId(originalId: string, usedIds: Set<string>) {
  if (!usedIds.has(originalId)) {
    usedIds.add(originalId);
    return originalId;
  }
  const baseId = `${originalId}:imported`;
  let id = baseId;
  let suffix = 2;
  while (usedIds.has(id)) id = `${baseId}:${suffix++}`;
  usedIds.add(id);
  return id;
}

function withoutWeaponSlot(item: GearItem): GearItem {
  if (!gearData.gear[item.definitionId]?.weapon || item.slot === undefined) return item;
  const { slot: _legacySlot, ...slotlessItem } = item;
  return slotlessItem;
}

function comparableGearValue(value: GearValue) {
  return `${value.key}\u0000${value.value}`;
}

function gearItemsExactlyMatch(left: GearItem, right: GearItem) {
  if (
    left.definitionId !== right.definitionId ||
    left.level !== right.level ||
    left.rarity !== right.rarity ||
    Boolean(left.relayed) !== Boolean(right.relayed) ||
    comparableGearValue(left.baseAffix) !== comparableGearValue(right.baseAffix) ||
    (left.attunement ? comparableGearValue(left.attunement) : "") !==
      (right.attunement ? comparableGearValue(right.attunement) : "")
  )
    return false;
  const leftAdditional = left.additionalAffixes.map(comparableGearValue).sort();
  const rightAdditional = right.additionalAffixes.map(comparableGearValue).sort();
  return (
    leftAdditional.length === rightAdditional.length &&
    leftAdditional.every((value, index) => value === rightAdditional[index])
  );
}

export function mergeImportedBuildState(
  current: BuildState,
  value: unknown,
  options: { reuseIdenticalGear?: boolean } = {},
) {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("This is not a Where Builds Meet export file.");
  const source = value as { format?: unknown; version?: unknown; gearItems?: unknown; builds?: unknown };
  if (
    source.format !== buildExportFormat ||
    (source.version !== 1 &&
      source.version !== 2 &&
      source.version !== 3 &&
      source.version !== 4 &&
      source.version !== 5 &&
      source.version !== 6 &&
      source.version !== 7) ||
    !Array.isArray(source.gearItems) ||
    !Array.isArray(source.builds)
  ) {
    throw new Error("This file uses an unsupported build export format.");
  }

  const importedItems = parseGearItems(source.gearItems);
  const usedGearIds = new Set(current.gearItems.map((item) => item.id));
  const gearIdMap = new Map<string, string>();
  let reusedGearCount = 0;
  const addedItems: GearItem[] = [];
  for (const item of importedItems) {
    const existing = options.reuseIdenticalGear
      ? [...current.gearItems, ...addedItems].find((candidate) => gearItemsExactlyMatch(candidate, item))
      : undefined;
    if (existing) {
      gearIdMap.set(item.id, existing.id);
      reusedGearCount += 1;
      continue;
    }
    const id = importedId(item.id, usedGearIds);
    gearIdMap.set(item.id, id);
    addedItems.push(id === item.id ? item : { ...item, id });
  }

  const usedBuildIds = new Set(current.entries.map((entry) => entry.id));
  const addedBuilds = source.builds.flatMap((value): BuildEntry[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const candidate = value as {
      id?: unknown;
      name?: unknown;
      isDefault?: unknown;
      martialArts?: unknown;
      weapons?: unknown;
      equipped?: unknown;
      setup?: unknown;
    };
    if (
      candidate.isDefault === true ||
      typeof candidate.id !== "string" ||
      !candidate.id ||
      typeof candidate.name !== "string" ||
      !candidate.name.trim()
    )
      return [];
    const sourceEquipped = parseEquipped(candidate.equipped, importedItems);
    const equipped = Object.fromEntries(
      gearSlots.flatMap((slot) => {
        const originalId = sourceEquipped[slot];
        const id = originalId ? gearIdMap.get(originalId) : undefined;
        return id ? [[slot, id]] : [];
      }),
    ) as Partial<Record<GearSlot, string>>;
    return [
      {
        id: importedId(candidate.id, usedBuildIds),
        name: candidate.name,
        martialArts: normalizedMartialArts(candidate.martialArts ?? candidate.weapons, equipped, [
          ...current.gearItems,
          ...addedItems,
        ]),
        equipped,
        setup: normalizeBuildSetup(candidate.setup),
      },
    ];
  });

  return {
    state: {
      ...current,
      gearItems: [...current.gearItems, ...addedItems],
      entries: [...current.entries, ...addedBuilds],
    },
    importedGearCount: addedItems.length,
    reusedGearCount,
    importedBuildCount: addedBuilds.length,
    importedBuildIds: addedBuilds.map((entry) => entry.id),
  };
}

export function loadBuildState(): BuildState {
  try {
    const savedValue = localStorage.getItem(buildListStorageKey);
    const saved = JSON.parse(savedValue ?? "null") as unknown;
    const savedRecord =
      saved && typeof saved === "object" && !Array.isArray(saved)
        ? (saved as { entries?: unknown; gearItems?: unknown })
        : undefined;
    const savedEntries = Array.isArray(saved) ? saved : Array.isArray(savedRecord?.entries) ? savedRecord.entries : [];
    const sharedItems = savedRecord ? parseGearItems(savedRecord.gearItems) : [];
    const legacySetup = loadLegacyBuildSetup();
    const defaultIds = new Set(defaultBuildPresets.map((preset) => preset.id));
    const defaults: BuildEntry[] = defaultBuildPresets.map((preset) => {
      const savedDefault = savedEntries.find(
        (entry) =>
          entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { id?: unknown }).id === preset.id,
      ) as { name?: unknown } | undefined;
      return {
        id: preset.id,
        name: typeof savedDefault?.name === "string" && savedDefault.name.trim() ? savedDefault.name : preset.name,
        isDefault: true,
        presetId: preset.id,
        martialArts: [...preset.martialArts],
      };
    });
    const customEntries = savedEntries.flatMap((value): BuildEntry[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const candidate = value as {
        id?: unknown;
        name?: unknown;
        martialArts?: unknown;
        weapons?: unknown;
        inventory?: unknown;
        equipped?: unknown;
        setup?: unknown;
      };
      if (
        typeof candidate.id !== "string" ||
        !candidate.id ||
        defaultIds.has(candidate.id) ||
        typeof candidate.name !== "string" ||
        !candidate.name.trim()
      )
        return [];
      const equipped = candidate.inventory
        ? migrateInventoryToShared(parseGearInventory(candidate.inventory), candidate.id, sharedItems)
        : parseEquipped(candidate.equipped, sharedItems);
      return [
        {
          id: candidate.id,
          name: candidate.name,
          martialArts: normalizedMartialArts(candidate.martialArts ?? candidate.weapons, equipped, sharedItems),
          equipped,
          setup: normalizeBuildSetup(candidate.setup, legacySetup),
        },
      ];
    });
    const entries = [...defaults, ...customEntries];
    if (savedValue === null) {
      const legacyInventory = loadGearInventory();
      if (legacyInventory.items.length > 0) {
        const equipped = migrateInventoryToShared(legacyInventory, "migrated-build", sharedItems);
        entries.push({
          id: "migrated-build",
          name: "My Build",
          martialArts: normalizedMartialArts(undefined, equipped, sharedItems),
          equipped,
          setup: legacySetup,
        });
      }
    }
    const requestedActiveId = localStorage.getItem(activeBuildStorageKey);
    const fallbackActiveId =
      savedValue === null && entries.some((entry) => entry.id === "migrated-build")
        ? "migrated-build"
        : defaults[0]?.id;
    const activeBuildId =
      requestedActiveId && entries.some((entry) => entry.id === requestedActiveId)
        ? requestedActiveId
        : (fallbackActiveId ?? entries[0]?.id ?? "");
    return { entries, activeBuildId, gearItems: sharedItems };
  } catch {
    const entries = defaultBuildPresets.map((preset): BuildEntry => ({
      id: preset.id,
      name: preset.name,
      isDefault: true,
      presetId: preset.id,
      martialArts: [...preset.martialArts],
    }));
    return { entries, activeBuildId: entries[0]?.id ?? "", gearItems: [] };
  }
}

export function calculateEquippedGearEffects(
  inventory: GearInventory,
  weapons: [WeaponId, WeaponId],
  enforceWeaponCompatibility = true,
) {
  const stats: Partial<CharacterStats> = {};
  const attunement: Partial<AttunementStats> = {};
  const addStat = (key: keyof CharacterStats, value: number) => {
    stats[key] = (stats[key] ?? 0) + value;
  };
  const addAttunement = (key: keyof AttunementStats, value: number) => {
    attunement[key] = (attunement[key] ?? 0) + value;
  };

  for (const slot of gearSlots) {
    const equippedId = inventory.equipped[slot];
    const item = inventory.items.find(
      (candidate) => candidate.id === equippedId && gearItemSupportsSlot(candidate, slot),
    );
    if (!item || (enforceWeaponCompatibility && !isGearItemCompatible(item, slot, weapons))) continue;
    for (const [key, value] of Object.entries(gearBaseStats(item))) {
      if (typeof value === "number" && Number.isFinite(value)) addStat(key as keyof CharacterStats, value);
    }
    for (const affix of [item.baseAffix, ...item.additionalAffixes]) {
      if (gearData.affixes[affix.key]) addStat(affix.key as keyof CharacterStats, affix.value);
    }
    if (item.attunement && attunementData[item.attunement.key])
      addAttunement(item.attunement.key as keyof AttunementStats, item.attunement.value);
  }

  return { stats, attunement };
}
