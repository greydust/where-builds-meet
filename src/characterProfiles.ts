import type { AttunementStats } from "./calculations/damage";
import type { CharacterStatOverrides } from "./calculations/statEffects";
import { allStatDefinitions } from "./data/statDefinitions";
import { attunementData, defaultBuildSetup, normalizeBuildSetup, type BuildSetup } from "./gear";
import defaultSetupJson from "../data/default-setup.json";
import foodJson from "../data/food.json";
import divinecraftJson from "../data/divinecraft.json";
import { defaultGlobalDebuffs, normalizeGlobalDebuffs, type GlobalDebuffState } from "./globalDebuffs";

export const characterProfileStorageKey = "wwm-character-profiles-v1";
export const characterProfileExportFormat = "where-builds-meet-character-profiles";

export type CharacterProfile = {
  id: string;
  name: string;
  statOverrides: CharacterStatOverrides;
  attunementOverrides: Partial<AttunementStats>;
  innerWays: Array<{ innerWay: string; tier: string }>;
  buildSetup: BuildSetup;
  food: string;
  divinecraft: string;
  globalDebuffs: GlobalDebuffState;
};

const characterStatKeys = new Set(allStatDefinitions.map(({ key }) => key as string));
const attunementKeys = new Set(Object.keys(attunementData));
const defaultSetup = defaultSetupJson as { innerWays: Array<{ innerWay: string; tier: string }>; food: string; divinecraft: string };
const foodKeys = new Set(Object.keys(foodJson));
const divinecraftKeys = new Set(Object.keys(divinecraftJson));

const cloneDefaultInnerWays = () => defaultSetup.innerWays.map((row) => ({ ...row }));

function parseInnerWays(value: unknown) {
  if (!Array.isArray(value) || value.length !== defaultSetup.innerWays.length) return cloneDefaultInnerWays();
  const parsed = value.map((item) => {
    if (!item || typeof item !== "object" || Array.isArray(item)) return undefined;
    const row = item as Record<string, unknown>;
    return typeof row.innerWay === "string" && typeof row.tier === "string" && /^T[0-6]$/.test(row.tier) ? { innerWay: row.innerWay, tier: row.tier } : undefined;
  });
  return parsed.every(Boolean) ? parsed as Array<{ innerWay: string; tier: string }> : cloneDefaultInnerWays();
}

function finiteValues(value: unknown, keys: Set<string>) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => keys.has(key) && typeof item === "number" && Number.isFinite(item)));
}

function parseProfile(value: unknown): CharacterProfile | undefined {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const source = value as Record<string, unknown>;
  if (typeof source.id !== "string" || !source.id.trim() || typeof source.name !== "string" || !source.name.trim()) return undefined;
  return {
    id: source.id,
    name: source.name.trim(),
    statOverrides: finiteValues(source.statOverrides, characterStatKeys) as CharacterStatOverrides,
    attunementOverrides: finiteValues(source.attunementOverrides, attunementKeys) as Partial<AttunementStats>,
    innerWays: parseInnerWays(source.innerWays),
    buildSetup: normalizeBuildSetup(source.buildSetup, defaultBuildSetup),
    food: typeof source.food === "string" && foodKeys.has(source.food) ? source.food : defaultSetup.food,
    divinecraft: typeof source.divinecraft === "string" && divinecraftKeys.has(source.divinecraft) ? source.divinecraft : defaultSetup.divinecraft,
    globalDebuffs: source.globalDebuffs === undefined ? { ...defaultGlobalDebuffs } : normalizeGlobalDebuffs(source.globalDebuffs),
  };
}

export function parseCharacterProfiles(value: unknown): CharacterProfile[] {
  if (!Array.isArray(value)) return [];
  const usedIds = new Set<string>();
  return value.flatMap((item) => {
    const profile = parseProfile(item);
    if (!profile || usedIds.has(profile.id)) return [];
    usedIds.add(profile.id);
    return [profile];
  });
}

export function loadCharacterProfiles(): CharacterProfile[] {
  if (typeof localStorage === "undefined") return [];
  try {
    return parseCharacterProfiles(JSON.parse(localStorage.getItem(characterProfileStorageKey) ?? "[]"));
  } catch {
    return [];
  }
}

export function serializeCharacterProfiles(profiles: CharacterProfile[]) {
  return JSON.stringify(parseCharacterProfiles(profiles));
}

export function exportCharacterProfiles(profiles: CharacterProfile[]) {
  return JSON.stringify({
    format: characterProfileExportFormat,
    version: 3,
    exportedAt: new Date().toISOString(),
    profiles: parseCharacterProfiles(profiles),
  }, null, 2);
}

function importedId(originalId: string, usedIds: Set<string>) {
  if (!usedIds.has(originalId)) return originalId;
  const base = `${originalId}:imported`;
  let id = base;
  let suffix = 2;
  while (usedIds.has(id)) id = `${base}:${suffix++}`;
  return id;
}

export function mergeImportedCharacterProfiles(current: CharacterProfile[], value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("This is not a Where Builds Meet character profile file.");
  const source = value as Record<string, unknown>;
  if (source.format !== characterProfileExportFormat || source.version !== 1 && source.version !== 2 && source.version !== 3) throw new Error("This file uses an unsupported character profile format.");
  if (!Array.isArray(source.profiles)) throw new Error("The character profile file does not contain a profile list.");
  const parsed = parseCharacterProfiles(source.profiles);
  if (source.profiles.length > 0 && parsed.length === 0) throw new Error("The character profile file does not contain any valid profiles.");
  const usedIds = new Set(current.map(({ id }) => id));
  const imported = parsed.map((profile) => {
    const id = importedId(profile.id, usedIds);
    usedIds.add(id);
    return { ...profile, id };
  });
  return { profiles: [...current, ...imported], importedCount: imported.length };
}

export function characterProfileMatches(profile: CharacterProfile, current: Omit<CharacterProfile, "id" | "name">) {
  const sameValues = (left: Record<string, unknown>, right: Record<string, unknown>) => {
    const keys = new Set([...Object.keys(left), ...Object.keys(right)]);
    return [...keys].every((key) => left[key] === right[key]);
  };
  return sameValues(profile.statOverrides, current.statOverrides)
    && sameValues(profile.attunementOverrides, current.attunementOverrides)
    && JSON.stringify(profile.innerWays) === JSON.stringify(current.innerWays)
    && JSON.stringify(profile.buildSetup) === JSON.stringify(current.buildSetup)
    && profile.food === current.food
    && profile.divinecraft === current.divinecraft
    && JSON.stringify(profile.globalDebuffs) === JSON.stringify(current.globalDebuffs);
}
