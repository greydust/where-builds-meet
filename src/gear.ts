import gearJson from "../data/gear.json";
import attunementJson from "../data/attunement.json";
import arsenalJson from "../data/arsenal.json";
import bowRingSetJson from "../data/bow-ring-set.json";
import defaultSetupJson from "../data/default-setup.json";
import gearSetJson from "../data/gear-set.json";
import type { AttunementStats } from "./calculations/damage";
import type { CharacterStats, WeaponId } from "./types";

export const legacyGearStorageKey = "wwm-gear-inventory-v1";
export const buildListStorageKey = "wwm-build-list-v1";
export const activeBuildStorageKey = "wwm-active-build-v1";
export const buildExportFormat = "where-builds-meet-builds";

export const gearSlots = ["leftWeapon", "rightWeapon", "helmet", "chestpiece", "disc", "pendant", "greaves", "bracer"] as const;
export type GearSlot = typeof gearSlots[number];
export type GearLevel = 91 | 96;
export type GearRarity = "Purple" | "Gold";
export type GearSetTier = 0 | 2 | 4;
export type BuildSetup = {
  gearSets: { Cleftpeak: GearSetTier; RainWhisper: GearSetTier };
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
  baseAffix: GearValue;
  additionalAffixes: GearValue[];
  attunement: GearValue;
};

export type GearInventory = {
  items: GearItem[];
  equipped: Partial<Record<GearSlot, string>>;
};

export type BuildPresetGear = {
  definitionId: string;
  level: GearLevel;
  rarity: GearRarity;
  baseAffix: GearValue;
  additionalAffixes: GearValue[];
  attunement: GearValue;
};

export type BuildPreset = {
  id: string;
  name: string;
  order?: number;
  test?: boolean;
  setup?: BuildSetup;
  gear: Partial<Record<GearSlot, BuildPresetGear>>;
};

export type BuildEntry = {
  id: string;
  name: string;
  isDefault?: boolean;
  presetId?: string;
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
  gear: Record<string, GearDefinition>;
};

export const gearData = gearJson as unknown as GearData;
export const attunementData = attunementJson as unknown as Record<string, AttunementDefinition>;
const gearSetDefinitions = gearSetJson as Record<string, { options: Record<string, unknown> }>;
const bowRingSetDefinitions = bowRingSetJson as Record<string, unknown>;
const arsenalDefinitions = arsenalJson as Record<string, unknown>;
const configuredDefaultSetup = defaultSetupJson as BuildSetup;
const legacyArsenalStorageKey = "wwm-arsenal-session-v1";
const legacyBowRingSetStorageKey = "wwm-bow-ring-set-session-v1";
const legacyGearSetStorageKey = "wwm-gear-set-session-v1";

const cloneBuildSetup = (setup: BuildSetup): BuildSetup => ({ gearSets: { ...setup.gearSets }, bowRingSet: setup.bowRingSet, arsenal: setup.arsenal });
const validTier = (value: unknown): value is GearSetTier => value === 0 || value === 2 || value === 4;

export const defaultBuildSetup = cloneBuildSetup(configuredDefaultSetup);

export function normalizeBuildSetup(value: unknown, fallback: BuildSetup = defaultBuildSetup): BuildSetup {
  const candidate = value && typeof value === "object" && !Array.isArray(value) ? value as Partial<BuildSetup> : {};
  const gearSets = candidate.gearSets && typeof candidate.gearSets === "object" && !Array.isArray(candidate.gearSets) ? candidate.gearSets : undefined;
  const cleftpeak = gearSets?.Cleftpeak;
  const rainWhisper = gearSets?.RainWhisper;
  const validGearSets = validTier(cleftpeak) && validTier(rainWhisper)
    && cleftpeak + rainWhisper <= 4
    && String(cleftpeak) in gearSetDefinitions.Cleftpeak.options
    && String(rainWhisper) in gearSetDefinitions.RainWhisper.options;
  return {
    gearSets: validGearSets ? { Cleftpeak: cleftpeak, RainWhisper: rainWhisper } : { ...fallback.gearSets },
    bowRingSet: typeof candidate.bowRingSet === "string" && candidate.bowRingSet in bowRingSetDefinitions ? candidate.bowRingSet : fallback.bowRingSet,
    arsenal: typeof candidate.arsenal === "string" && candidate.arsenal in arsenalDefinitions ? candidate.arsenal : fallback.arsenal,
  };
}

export function normalizeBuildSetupOverrides(value: unknown): BuildSetupOverrides {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const candidate = value as Partial<BuildSetup>;
  const result: BuildSetupOverrides = {};
  if (candidate.gearSets) {
    const normalized = normalizeBuildSetup({ gearSets: candidate.gearSets }, defaultBuildSetup);
    const raw = candidate.gearSets;
    if (validTier(raw.Cleftpeak) && validTier(raw.RainWhisper) && raw.Cleftpeak + raw.RainWhisper <= 4) result.gearSets = normalized.gearSets;
  }
  if (typeof candidate.bowRingSet === "string" && candidate.bowRingSet in bowRingSetDefinitions) result.bowRingSet = candidate.bowRingSet;
  if (typeof candidate.arsenal === "string" && candidate.arsenal in arsenalDefinitions) result.arsenal = candidate.arsenal;
  return result;
}

function loadLegacyBuildSetup() {
  if (typeof sessionStorage === "undefined") return cloneBuildSetup(defaultBuildSetup);
  let gearSets: unknown;
  try { gearSets = JSON.parse(sessionStorage.getItem(legacyGearSetStorageKey) ?? "null"); } catch { gearSets = undefined; }
  return normalizeBuildSetup({
    gearSets,
    bowRingSet: sessionStorage.getItem(legacyBowRingSetStorageKey),
    arsenal: sessionStorage.getItem(legacyArsenalStorageKey),
  });
}
const buildPresetModules = import.meta.glob("../data/build/*.json", { eager: true, import: "default" }) as Record<string, BuildPreset>;
export const defaultBuildPresets = Object.values(buildPresetModules)
  .filter((preset) => !preset.test || import.meta.env.DEV)
  .sort((left, right) => (left.order ?? Number.MAX_SAFE_INTEGER) - (right.order ?? Number.MAX_SAFE_INTEGER) || left.name.localeCompare(right.name));

const weaponDefinitionIds: Record<WeaponId, string> = {
  snowparting: "hengBlade",
  phalanxbane: "moBlade",
};

export function gearDefinitionForSlot(slot: GearSlot, weapons: [WeaponId, WeaponId]) {
  const definitionId = slot === "leftWeapon"
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

function validGearValue(value: unknown, allowedKeys: string[], definitions: Record<string, unknown>): value is GearValue {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const candidate = value as Partial<GearValue>;
  return typeof candidate.key === "string"
    && allowedKeys.includes(candidate.key)
    && candidate.key in definitions
    && typeof candidate.value === "number"
    && Number.isFinite(candidate.value)
    && candidate.value >= 0;
}

function parseGearItem(value: unknown): GearItem | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const candidate = value as Partial<GearItem>;
  if (typeof candidate.id !== "string" || !candidate.id) return undefined;
  if (typeof candidate.definitionId !== "string") return undefined;
  const definition = gearData.gear[candidate.definitionId];
  const level = candidate.level === 91 || candidate.level === 96 ? candidate.level : undefined;
  const rarity = candidate.rarity === "Purple" || candidate.rarity === "Gold" ? candidate.rarity : undefined;
  const slot = gearSlots.includes(candidate.slot as GearSlot) ? candidate.slot as GearSlot : undefined;
  if (!definition || !level || !rarity || (!definition.weapon && (!slot || !definition.slots.includes(slot)))) return undefined;
  const levelKey = String(level);
  if (!validGearValue(candidate.baseAffix, definition.baseAffixes[levelKey] ?? [], gearData.affixes)) return undefined;
  if (!Array.isArray(candidate.additionalAffixes) || candidate.additionalAffixes.length !== 4) return undefined;
  if (!candidate.additionalAffixes.every((affix) => validGearValue(affix, definition.additionalAffixes[levelKey] ?? [], gearData.affixes))) return undefined;
  if (new Set(candidate.additionalAffixes.map((affix) => affix.key)).size !== 4) return undefined;
  if (!validGearValue(candidate.attunement, definition.attunements, attunementData)) return undefined;
  return {
    id: candidate.id,
    ...(definition.weapon ? {} : { slot }),
    definitionId: candidate.definitionId,
    level,
    rarity,
    baseAffix: candidate.baseAffix,
    additionalAffixes: candidate.additionalAffixes,
    attunement: candidate.attunement,
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
  const equippedValues = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const usedIds = new Set<string>();
  return Object.fromEntries(gearSlots.flatMap((slot) => {
    const id = equippedValues[slot];
    const item = typeof id === "string" && !usedIds.has(id) ? items.find((candidate) => candidate.id === id) : undefined;
    if (!item || !gearItemSupportsSlot(item, slot)) return [];
    usedIds.add(item.id);
    return [[slot, item.id]];
  })) as Partial<Record<GearSlot, string>>;
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
    const levelKey = String(presetGear.level);
    if (!validGearValue(presetGear.baseAffix, definition.baseAffixes[levelKey] ?? [], gearData.affixes)) throw new Error(`Invalid base affix in build preset ${preset.id}.`);
    if (presetGear.additionalAffixes.length !== 4 || !presetGear.additionalAffixes.every((affix) => validGearValue(affix, definition.additionalAffixes[levelKey] ?? [], gearData.affixes)) || new Set(presetGear.additionalAffixes.map((affix) => affix.key)).size !== 4) throw new Error(`Invalid additional affixes in build preset ${preset.id}.`);
    if (!validGearValue(presetGear.attunement, definition.attunements, attunementData)) throw new Error(`Invalid attunement in build preset ${preset.id}.`);
    return [{ slot, item: {
      id: `preset:${preset.id}:${slot}`,
      ...(definition.weapon ? {} : { slot }),
      definitionId: presetGear.definitionId,
      level: presetGear.level,
      rarity: presetGear.rarity,
      baseAffix: { ...presetGear.baseAffix },
      additionalAffixes: presetGear.additionalAffixes.map((affix) => ({ ...affix })),
      attunement: { ...presetGear.attunement },
    } }];
  });
  return { items: entries.map(({ item }) => item), equipped: Object.fromEntries(entries.map(({ slot, item }) => [slot, item.id])) };
}

export function resolveBuildInventory(entry: BuildEntry, sharedItems: GearItem[] = []): GearInventory {
  if (entry.isDefault) {
    const preset = defaultBuildPresets.find((candidate) => candidate.id === entry.presetId);
    return preset ? buildPresetInventory(preset) : { items: [], equipped: {} };
  }
  return { items: sharedItems, equipped: entry.equipped ?? {} };
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
  return Object.fromEntries(gearSlots.flatMap((slot) => {
    const legacyId = inventory.equipped[slot];
    const migratedId = legacyId ? migratedIds.get(legacyId) : undefined;
    return migratedId ? [[slot, migratedId]] : [];
  })) as Partial<Record<GearSlot, string>>;
}

export function serializeBuildState(state: BuildState) {
  return JSON.stringify({
    version: 4,
    entries: state.entries.filter((entry) => !entry.isDefault).map((entry) => ({ id: entry.id, name: entry.name, equipped: entry.equipped ?? {}, setup: normalizeBuildSetup(entry.setup) })),
    gearItems: state.gearItems.map(withoutWeaponSlot),
  });
}

export function exportBuildState(state: BuildState) {
  return JSON.stringify({
    format: buildExportFormat,
    version: 3,
    exportedAt: new Date().toISOString(),
    gearItems: state.gearItems.map(withoutWeaponSlot),
    builds: state.entries.filter((entry) => !entry.isDefault).map((entry) => ({ id: entry.id, name: entry.name, equipped: entry.equipped ?? {}, setup: normalizeBuildSetup(entry.setup) })),
  }, null, 2);
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

export function mergeImportedBuildState(current: BuildState, value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This is not a Where Builds Meet export file.");
  const source = value as { format?: unknown; version?: unknown; gearItems?: unknown; builds?: unknown };
  if (source.format !== buildExportFormat || (source.version !== 1 && source.version !== 2 && source.version !== 3) || !Array.isArray(source.gearItems) || !Array.isArray(source.builds)) {
    throw new Error("This file uses an unsupported build export format.");
  }

  const importedItems = parseGearItems(source.gearItems);
  const usedGearIds = new Set(current.gearItems.map((item) => item.id));
  const gearIdMap = new Map<string, string>();
  const addedItems = importedItems.map((item) => {
    const id = importedId(item.id, usedGearIds);
    gearIdMap.set(item.id, id);
    return id === item.id ? item : { ...item, id };
  });

  const usedBuildIds = new Set(current.entries.map((entry) => entry.id));
  const addedBuilds = source.builds.flatMap((value): BuildEntry[] => {
    if (!value || typeof value !== "object" || Array.isArray(value)) return [];
    const candidate = value as { id?: unknown; name?: unknown; isDefault?: unknown; equipped?: unknown; setup?: unknown };
    if (candidate.isDefault === true || typeof candidate.id !== "string" || !candidate.id || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
    const sourceEquipped = parseEquipped(candidate.equipped, importedItems);
    const equipped = Object.fromEntries(gearSlots.flatMap((slot) => {
      const originalId = sourceEquipped[slot];
      const id = originalId ? gearIdMap.get(originalId) : undefined;
      return id ? [[slot, id]] : [];
    })) as Partial<Record<GearSlot, string>>;
    return [{ id: importedId(candidate.id, usedBuildIds), name: candidate.name, equipped, setup: normalizeBuildSetup(candidate.setup) }];
  });

  return {
    state: {
      ...current,
      gearItems: [...current.gearItems, ...addedItems],
      entries: [...current.entries, ...addedBuilds],
    },
    importedGearCount: addedItems.length,
    importedBuildCount: addedBuilds.length,
    importedBuildIds: addedBuilds.map((entry) => entry.id),
  };
}

export function loadBuildState(): BuildState {
  try {
    const savedValue = localStorage.getItem(buildListStorageKey);
    const saved = JSON.parse(savedValue ?? "null") as unknown;
    const savedRecord = saved && typeof saved === "object" && !Array.isArray(saved)
      ? saved as { entries?: unknown; gearItems?: unknown }
      : undefined;
    const savedEntries = Array.isArray(saved) ? saved : Array.isArray(savedRecord?.entries) ? savedRecord.entries : [];
    const sharedItems = savedRecord ? parseGearItems(savedRecord.gearItems) : [];
    const legacySetup = loadLegacyBuildSetup();
    const defaultIds = new Set(defaultBuildPresets.map((preset) => preset.id));
    const defaults: BuildEntry[] = defaultBuildPresets.map((preset) => {
      const savedDefault = savedEntries.find((entry) => entry && typeof entry === "object" && !Array.isArray(entry) && (entry as { id?: unknown }).id === preset.id) as { name?: unknown } | undefined;
      return { id: preset.id, name: typeof savedDefault?.name === "string" && savedDefault.name.trim() ? savedDefault.name : preset.name, isDefault: true, presetId: preset.id };
    });
    const customEntries = savedEntries.flatMap((value): BuildEntry[] => {
      if (!value || typeof value !== "object" || Array.isArray(value)) return [];
      const candidate = value as { id?: unknown; name?: unknown; inventory?: unknown; equipped?: unknown; setup?: unknown };
      if (typeof candidate.id !== "string" || !candidate.id || defaultIds.has(candidate.id) || typeof candidate.name !== "string" || !candidate.name.trim()) return [];
      const equipped = candidate.inventory
        ? migrateInventoryToShared(parseGearInventory(candidate.inventory), candidate.id, sharedItems)
        : parseEquipped(candidate.equipped, sharedItems);
      return [{ id: candidate.id, name: candidate.name, equipped, setup: normalizeBuildSetup(candidate.setup, legacySetup) }];
    });
    const entries = [...defaults, ...customEntries];
    if (savedValue === null) {
      const legacyInventory = loadGearInventory();
      if (legacyInventory.items.length > 0) entries.push({ id: "migrated-build", name: "My Build", equipped: migrateInventoryToShared(legacyInventory, "migrated-build", sharedItems), setup: legacySetup });
    }
    const requestedActiveId = localStorage.getItem(activeBuildStorageKey);
    const fallbackActiveId = savedValue === null && entries.some((entry) => entry.id === "migrated-build") ? "migrated-build" : defaults[0]?.id;
    const activeBuildId = requestedActiveId && entries.some((entry) => entry.id === requestedActiveId) ? requestedActiveId : fallbackActiveId ?? entries[0]?.id ?? "";
    return { entries, activeBuildId, gearItems: sharedItems };
  } catch {
    const entries = defaultBuildPresets.map((preset): BuildEntry => ({ id: preset.id, name: preset.name, isDefault: true, presetId: preset.id }));
    return { entries, activeBuildId: entries[0]?.id ?? "", gearItems: [] };
  }
}

export function calculateEquippedGearEffects(inventory: GearInventory, weapons: [WeaponId, WeaponId], enforceWeaponCompatibility = true) {
  const stats: Partial<CharacterStats> = {};
  const attunement: Partial<AttunementStats> = {};
  const addStat = (key: keyof CharacterStats, value: number) => { stats[key] = (stats[key] ?? 0) + value; };
  const addAttunement = (key: keyof AttunementStats, value: number) => { attunement[key] = (attunement[key] ?? 0) + value; };

  for (const slot of gearSlots) {
    const equippedId = inventory.equipped[slot];
    const item = inventory.items.find((candidate) => candidate.id === equippedId && gearItemSupportsSlot(candidate, slot));
    if (!item || (enforceWeaponCompatibility && !isGearItemCompatible(item, slot, weapons))) continue;
    for (const [key, value] of Object.entries(gearBaseStats(item))) {
      if (typeof value === "number" && Number.isFinite(value)) addStat(key as keyof CharacterStats, value);
    }
    for (const affix of [item.baseAffix, ...item.additionalAffixes]) {
      if (gearData.affixes[affix.key]) addStat(affix.key as keyof CharacterStats, affix.value);
    }
    if (attunementData[item.attunement.key]) addAttunement(item.attunement.key as keyof AttunementStats, item.attunement.value);
  }

  return { stats, attunement };
}
