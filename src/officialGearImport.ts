import officialAffixMapJson from "../data/official/affix-map.json";
import officialImportMapJson from "../data/official/import-map.json";
import officialProfileMapJson from "../data/official/profile-map.json";
import {
  attunementData,
  attunementsForGearDefinition,
  buildExportFormat,
  defaultBuildSetup,
  gearData,
  gearDefinitionForSlot,
  type GearItem,
  type GearLevel,
  type GearRarity,
  type GearSlot,
} from "./gear";
import type { WeaponId } from "./types";

type UnknownRecord = Record<string, unknown>;
type OfficialAffixRow = { statId: string; value: number };

const officialAffixMap = officialAffixMapJson as Record<string, string>;
const officialProfileMap = officialProfileMapJson as {
  martialArts: Record<string, { name: string; weapon?: WeaponId }>;
  innerWays: Record<string, { name: string; innerWay?: string }>;
};
const officialImportMap = officialImportMapJson as {
  baseAttributeKeys: Record<string, string>;
  baseStats: Record<string, Partial<Record<string, Partial<Record<"legendary" | "epic", Record<string, number>>>>>>;
};

const officialSlotMap: Record<string, GearSlot> = {
  "1": "leftWeapon",
  "2": "rightWeapon",
  "3": "helmet",
  "4": "chestpiece",
  "5": "greaves",
  "8": "bracer",
  "10": "disc",
  "11": "pendant",
};

const asRecord = (value: unknown): UnknownRecord | undefined => value && typeof value === "object" && !Array.isArray(value) ? value as UnknownRecord : undefined;

function numericValue(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function parseAffixRow(value: unknown): OfficialAffixRow | undefined {
  const record = asRecord(value);
  const tuple = Array.isArray(value)
    ? value
    : record && Array.isArray(record.equipmentDetails)
      ? record.equipmentDetails
      : record && Array.isArray(record.baseAffix)
        ? record.baseAffix
        : undefined;
  if (!tuple || tuple.length < 2) return undefined;
  const statId = typeof tuple[0] === "string" || typeof tuple[0] === "number" ? String(tuple[0]) : "";
  const amount = numericValue(tuple[1]);
  return statId && amount !== undefined ? { statId, value: amount } : undefined;
}

function normalizedStoredValue(key: string, value: number, definitions: Record<string, { percentage?: boolean }>) {
  return definitions[key]?.percentage && value > 1 ? value / 100 : value;
}

function namedScalar(record: UnknownRecord | undefined, names: RegExp) {
  if (!record) return undefined;
  for (const [key, value] of Object.entries(record)) {
    if (!names.test(key)) continue;
    const numeric = numericValue(typeof value === "string" ? value.match(/\d+(?:\.\d+)?/)?.[0] : value);
    if (numeric !== undefined) return numeric;
  }
  return undefined;
}

function baseAttributes(value: unknown) {
  const record = asRecord(value);
  if (!record) return {} as Record<string, number>;
  return Object.fromEntries(Object.entries(record).flatMap(([key, amount]) => {
    const statKey = officialImportMap.baseAttributeKeys[key] ?? officialAffixMap[key];
    const numeric = numericValue(amount);
    return statKey && numeric !== undefined ? [[statKey, numeric]] : [];
  }));
}

function matchingBaseSignature(attributes: Record<string, number>, definitionId: string) {
  const matches: Array<{ level: GearLevel; rarity: GearRarity }> = [];
  const definition = gearData.gear[definitionId];
  for (const level of [91, 96] as const) {
    for (const rarity of ["Gold", "Purple"] as const) {
      const expected = definition?.baseStats[String(level)]?.[rarity];
      if (expected && Object.keys(expected).length && Object.entries(expected).every(([key, amount]) => typeof amount === "number" && Math.abs((attributes[key] ?? Number.NaN) - amount) < 0.001)) {
        matches.push({ level, rarity });
      }
    }
  }
  const directCategory = gearData.gear[definitionId]?.weapon ? "weapon" : definitionId;
  const categories = directCategory in officialImportMap.baseStats
    ? [directCategory]
    : Object.keys(officialImportMap.baseStats).filter((key) => key.startsWith("armor"));
  for (const category of categories) {
    for (const [levelText, rarities] of Object.entries(officialImportMap.baseStats[category] ?? {})) {
      const level = Number(levelText);
      if (level !== 91 && level !== 96) continue;
      for (const [officialRarity, expected] of Object.entries(rarities ?? {})) {
        if (!expected || !Object.entries(expected).every(([key, amount]) => Math.abs((attributes[key] ?? Number.NaN) - amount) < 0.001)) continue;
        const rarity = officialRarity === "legendary" ? "Gold" : "Purple";
        if (!matches.some((match) => match.level === level && match.rarity === rarity)) matches.push({ level, rarity });
      }
    }
  }
  return matches.length === 1 ? matches[0] : undefined;
}

function explicitRarity(...records: Array<UnknownRecord | undefined>): GearRarity | undefined {
  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      if (!/(?:rarity|quality|star)$/i.test(key)) continue;
      const text = String(value).toLowerCase();
      if (text === "5" || /gold|legendary/.test(text)) return "Gold";
      if (text === "4" || /purple|epic/.test(text)) return "Purple";
    }
  }
  return undefined;
}

function isRelayed(...records: Array<UnknownRecord | undefined>) {
  for (const record of records) {
    if (!record) continue;
    for (const [key, value] of Object.entries(record)) {
      if (!/relay/i.test(key)) continue;
      if (value === true || value === 1 || value === "1" || /true|relay/i.test(String(value))) return true;
    }
  }
  return false;
}

function createId(prefix: string) {
  return globalThis.crypto?.randomUUID?.() ?? `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function weaponFromImportedAffixes(rows: OfficialAffixRow[], selectedWeapons: [WeaponId, WeaponId]) {
  const keys = new Set(rows.map((row) => officialAffixMap[row.statId]));
  if (keys.has("hengBladeDmgBoost")) return "snowparting" as const;
  if (keys.has("moBladeDmgBoost")) return "phalanxbane" as const;
  if (keys.has("umbrellaDmgBoost")) return "everspring" as const;
  if (keys.has("gauntletDmgBoost")) return "heavenwill" as const;
  if (keys.has("ropeDartDmgBoost")) return selectedWeapons.find((weapon) => weapon === "unfettered" || weapon === "skygrasp");
  return undefined;
}

export type OfficialGearImport = {
  exportValue: unknown;
  roleName: string;
  gearCount: number;
  weapons: [WeaponId, WeaponId];
  warnings: string[];
};

export function parseOfficialGearExport(value: unknown, weapons: [WeaponId, WeaponId]): OfficialGearImport {
  const outer = asRecord(value);
  const role = asRecord(outer?.roleInfo) ?? asRecord(outer?.data) ?? outer;
  if (!role || (outer?.source !== undefined && outer.source !== "wwm-dashboard")) throw new Error("This is not a recognized official dashboard export.");
  const detailed = asRecord(role.wearEquipsDetailed);
  if (!detailed) throw new Error("The pasted data does not contain wearEquipsDetailed gear data.");

  const rawPieces: Array<{ slot: GearSlot; detail: UnknownRecord; exVo: UnknownRecord; rows: OfficialAffixRow[] }> = [];
  for (const [officialSlot, rawDetail] of Object.entries(detailed)) {
    const slot = officialSlotMap[officialSlot];
    if (!slot) continue;
    const detail = asRecord(rawDetail);
    const exVo = asRecord(detail?.exVo);
    const rows = Array.isArray(exVo?.baseAffixes) ? exVo.baseAffixes.map(parseAffixRow).filter((row): row is OfficialAffixRow => Boolean(row)) : [];
    if (!detail || !exVo || rows.length < 1) throw new Error(`${gearData.slots[slot]} is missing its base affix row in the dashboard export.`);
    rawPieces.push({ slot, detail, exVo, rows });
  }
  if (!rawPieces.length) throw new Error("No supported equipped gear was found in the dashboard export.");

  const martialArtIds = [role.kongfuMain, role.kongfuSub].map((value) => typeof value === "number" || typeof value === "string" ? String(value) : "");
  const mappedMartialArts = martialArtIds.map((id) => officialProfileMap.martialArts[id]);
  const unsupportedMartialArt = mappedMartialArts.find((entry) => entry && !entry.weapon);
  if (unsupportedMartialArt) throw new Error(`${unsupportedMartialArt.name} is not supported by Where Builds Meet yet.`);
  const mappedWeaponPair = mappedMartialArts.length === 2 && mappedMartialArts.every((entry) => entry?.weapon)
    ? mappedMartialArts.map((entry) => entry.weapon) as [WeaponId, WeaponId]
    : undefined;
  const importedWeaponHints: Array<WeaponId | undefined> = mappedWeaponPair ?? [
    weaponFromImportedAffixes(rawPieces.find((piece) => piece.slot === "leftWeapon")?.rows ?? [], weapons),
    weaponFromImportedAffixes(rawPieces.find((piece) => piece.slot === "rightWeapon")?.rows ?? [], weapons),
  ];
  const remainingSelectedWeapons = [...weapons];
  for (const hint of importedWeaponHints) {
    if (!hint) continue;
    const selectedIndex = remainingSelectedWeapons.indexOf(hint);
    if (selectedIndex >= 0) remainingSelectedWeapons.splice(selectedIndex, 1);
  }
  const importedWeapons = importedWeaponHints.map((hint, index) => hint ?? remainingSelectedWeapons.shift() ?? weapons[index]) as [WeaponId, WeaponId];
  const sameWeaponPair = [...importedWeapons].sort().every((weapon, index) => weapon === [...weapons].sort()[index]);
  const buildWeapons: [WeaponId, WeaponId] = sameWeaponPair ? [...weapons] : importedWeapons;
  const assignedWeaponSlots = new Set<GearSlot>();
  const parsedPieces = rawPieces.map((piece) => {
    const { definitionId } = gearDefinitionForSlot(piece.slot, importedWeapons);
    const definition = gearData.gear[definitionId];
    let equippedSlot = piece.slot;
    if (definition?.weapon) {
      const matchingIndex = buildWeapons.findIndex((weapon, index) => weapon === definition.weapon && !assignedWeaponSlots.has(index === 0 ? "leftWeapon" : "rightWeapon"));
      if (matchingIndex >= 0) equippedSlot = matchingIndex === 0 ? "leftWeapon" : "rightWeapon";
      assignedWeaponSlots.add(equippedSlot);
    }
    return { ...piece, equippedSlot, definitionId, signature: matchingBaseSignature(baseAttributes(piece.exVo.baseAttrs), definitionId) };
  });

  const commonLevel = parsedPieces.map((piece) => piece.signature?.level).find((level): level is GearLevel => level === 91 || level === 96)
    ?? ([91, 96].includes(Number(role.level)) ? Number(role.level) as GearLevel : 96);
  const warnings: string[] = [];
  const gearItems = parsedPieces.map((piece): GearItem => {
    const definition = gearData.gear[piece.definitionId];
    if (!definition) throw new Error(`${gearData.slots[piece.slot]} is not supported by the selected weapons.`);
    const level = (namedScalar(piece.exVo, /^(?:gear)?(?:tier|level)$/i) ?? namedScalar(piece.detail, /^(?:gear)?(?:tier|level)$/i)) as GearLevel | undefined;
    const resolvedLevel = level === 91 || level === 96 ? level : piece.signature?.level ?? commonLevel;
    const rarity = explicitRarity(piece.exVo, piece.detail) ?? piece.signature?.rarity;
    const resolvedRarity = rarity ?? "Gold";
    if (!rarity) warnings.push(`${gearData.slots[piece.slot]} rarity was not exposed; Gold was used.`);

    const mappedRows = piece.rows.map((row) => ({ row, key: officialAffixMap[row.statId] }));
    const allowedAttunements = attunementsForGearDefinition(definition);
    const attunementEntry = mappedRows.length > 1 && allowedAttunements.includes(mappedRows.at(-1)?.key ?? "")
      ? mappedRows.at(-1)
      : undefined;
    const affixRows = attunementEntry ? mappedRows.slice(0, -1) : mappedRows;
    if (affixRows.length > 5) throw new Error(`${gearData.slots[piece.slot]} has more than four additional affixes.`);
    const mappedAffixes = affixRows.map(({ row, key }, index) => {
      const allowed = index === 0 ? definition.baseAffixes[String(resolvedLevel)] ?? [] : definition.additionalAffixes[String(resolvedLevel)] ?? [];
      if (!key || !allowed.includes(key)) throw new Error(`${gearData.slots[piece.slot]} has an unsupported affix ID ${row.statId}${key ? ` (${key})` : ""}.`);
      return { key, value: normalizedStoredValue(key, row.value, gearData.affixes) };
    });
    const attunement = attunementEntry
      ? { key: attunementEntry.key as string, value: normalizedStoredValue(attunementEntry.key as string, attunementEntry.row.value, attunementData) }
      : undefined;

    return {
      id: createId(`official-${piece.slot}`),
      ...(definition.weapon ? {} : { slot: piece.slot }),
      definitionId: piece.definitionId,
      level: resolvedLevel,
      rarity: resolvedRarity,
      ...(isRelayed(piece.exVo, piece.detail) ? { relayed: true } : {}),
      baseAffix: mappedAffixes[0],
      additionalAffixes: mappedAffixes.slice(1),
      ...(attunement ? { attunement } : {}),
    };
  });

  const roleName = typeof role.roleName === "string" && role.roleName.trim() ? role.roleName.trim() : "Official Dashboard";
  const buildId = createId("official-build");
  const equipped = Object.fromEntries(parsedPieces.map((piece, index) => [piece.equippedSlot, gearItems[index].id]));
  return {
    roleName,
    gearCount: gearItems.length,
    weapons: buildWeapons,
    warnings,
    exportValue: {
      format: buildExportFormat,
      version: 5,
      gearItems,
      builds: [{
        id: buildId,
        name: `${roleName} Import`,
        weapons: [...buildWeapons],
        equipped,
        setup: defaultBuildSetup,
      }],
    },
  };
}
