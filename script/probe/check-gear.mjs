import { build } from "esbuild";
import { createServer } from "vite";

const loadBundledModule = async (entryPoint) => {
  const bundled = await build({
    entryPoints: [entryPoint],
    bundle: true,
    format: "esm",
    platform: "node",
    target: "node22",
    write: false,
  });
  const source = bundled.outputFiles[0].text;
  return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
};

const viteServer = await createServer({ root: process.cwd(), server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });
const gear = await viteServer.ssrLoadModule("/src/gear.ts");
const damage = await loadBundledModule("./src/calculations/damage.ts");
const statDefinitions = await loadBundledModule("./src/data/statDefinitions.ts");
const statEffects = await loadBundledModule("./src/calculations/statEffects.ts");
const systemStats = (await import("../../data/system.json", { with: { type: "json" } })).default;
const defaultSetup = (await import("../../data/default-setup.json", { with: { type: "json" } })).default;
const phalanxbaneMartialArt = (await import("../../data/martial-art/phalanxbane-blade.json", { with: { type: "json" } })).default;
const steadfastDevotion = (await import("../../data/innerway/steadfast-devotion.json", { with: { type: "json" } })).default;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(gear.gearSlots.length === 8, "Expected eight gear slots.");
assert(gear.defaultBuildPresets.length === 2, "Expected the full and empty default builds.");
assert(gear.gearData.gear.hengBlade.baseStats["96"].Gold.minPhys === 65, "Unexpected Heng Blade base stat.");
assert(gear.gearData.affixes.precision.percentage === true, "Precision must be stored as a decimal ratio.");
assert(Object.keys(gear.gearData.affixes).every((key) => key in statDefinitions.emptyStats && !("stat" in gear.gearData.affixes[key])), "Every gear affix key must directly match CharacterStats.");
const attunementStatKeys = new Set(["physicalPenetration", "formlessPenetration", "phalanxbaneChargedBoost", "phalanxbaneMartialBoost", "snowpartingChargedBoost", "snowpartingVariedComboBoost", "snowpartingMartialBoost"]);
assert(Object.keys(gear.gearData.attunements).every((key) => attunementStatKeys.has(key) && !("stat" in gear.gearData.attunements[key])), "Every gear attunement key must directly match AttunementStats.");

const preset = gear.defaultBuildPresets[0];
const presetInventory = gear.buildPresetInventory(preset);
assert(preset.name === "Full Relayed Min Build", "Unexpected default build name.");
assert(presetInventory.items.length === 8 && Object.keys(presetInventory.equipped).length === 8, "The default build must resolve all eight synthetic gear slots.");
const presetLeftWeapon = presetInventory.items.find((item) => item.slot === "leftWeapon");
assert(presetLeftWeapon.baseAffix.value === 73.132, "Preset affixes must preserve their explicit saved values.");
assert(presetLeftWeapon.attunement.value === 11, "Preset attunements must preserve their explicit saved values.");
const presetEffects = gear.calculateEquippedGearEffects(presetInventory, ["snowparting", "phalanxbane"], false);
assert(Math.abs(presetEffects.stats.minPhys - 1093.584) < 1e-9, "Unexpected preset minimum Physical Attack total.");
assert(Math.abs(presetEffects.stats.maxPhys - 431) < 1e-9, "Unexpected preset maximum Physical Attack total.");
assert(Math.abs(presetEffects.stats.agility - 371.488) < 1e-9, "Unexpected preset Agility total.");
assert(Math.abs(presetEffects.stats.maxStonesplit - 332.384) < 1e-9, "Unexpected preset Stonesplit total.");
assert(Math.abs(presetEffects.stats.precision - 0.2256) < 1e-9, "Unexpected preset Precision total.");
assert(Math.abs(presetEffects.attunement.physicalPenetration - 44) < 1e-9, "Unexpected preset Physical Penetration total.");
assert(Math.abs(presetEffects.attunement.phalanxbaneChargedBoost - 0.24) < 1e-9, "Unexpected preset Phalanxbane Charged total.");
const emptyPresetInventory = gear.buildPresetInventory(gear.defaultBuildPresets[1]);
assert(gear.defaultBuildPresets[1].name === "Empty Build" && emptyPresetInventory.items.length === 0 && Object.keys(emptyPresetInventory.equipped).length === 0, "The empty default build must not synthesize gear.");

const hengBlade = {
  id: "test-heng",
  slot: "leftWeapon",
  definitionId: "hengBlade",
  level: 96,
  rarity: "Gold",
  baseAffix: { key: "minVoidAttack", value: 40 },
  additionalAffixes: [
    { key: "maxVoidAttack", value: 50 },
    { key: "agility", value: 10 },
    { key: "precision", value: 0.08 },
    { key: "hengBladeDmgBoost", value: 0.062 },
  ],
  attunement: { key: "physicalPenetration", value: 11 },
};
const inventory = { items: [hengBlade], equipped: { leftWeapon: hengBlade.id } };
const effects = gear.calculateEquippedGearEffects(inventory, ["snowparting", "phalanxbane"]);

assert(effects.stats.minPhys === 65, "Fixed minimum Physical Attack was not applied.");
assert(effects.stats.maxPhys === 151, "Fixed maximum Physical Attack was not applied.");
assert(effects.stats.minVoidAttack === 40 && effects.stats.maxVoidAttack === 50, "Selected attack affixes were not applied.");
assert(effects.stats.agility === 10, "Additional base stat was not applied.");
assert(effects.stats.precision === 0.08, "Percentage affix did not remain a decimal ratio.");
assert(effects.stats.hengBladeDmgBoost === 0.062, "Art of Heng was not applied.");
assert(effects.attunement.physicalPenetration === 11, "Gear attunement was not applied.");

const incompatible = gear.calculateEquippedGearEffects(inventory, ["phalanxbane", "snowparting"]);
assert(Object.keys(incompatible.stats).length === 0, "An incompatible weapon item should not affect the build.");

const duplicatedItem = {
  ...hengBlade,
  additionalAffixes: [
    { key: "agility", value: 10 },
    { key: "agility", value: 20 },
    { key: "precision", value: 0.08 },
    { key: "hengBladeDmgBoost", value: 0.062 },
  ],
};
const duplicateInventoryJson = JSON.stringify({ items: [duplicatedItem], equipped: { leftWeapon: duplicatedItem.id } });
globalThis.localStorage = { getItem: (key) => key === gear.legacyGearStorageKey ? duplicateInventoryJson : null };
const loaded = gear.loadGearInventory();
assert(loaded.items.length === 0, "Persisted duplicate additional affixes should be rejected.");

const legacyInventoryJson = JSON.stringify({ items: [hengBlade], equipped: { leftWeapon: hengBlade.id } });
globalThis.localStorage = { getItem: (key) => key === gear.legacyGearStorageKey ? legacyInventoryJson : null };
const migratedBuildState = gear.loadBuildState();
assert(migratedBuildState.entries[0].isDefault === true && migratedBuildState.entries[0].inventory === undefined, "Default builds must not persist real gear.");
assert(migratedBuildState.entries.some((entry) => entry.id === "migrated-build"), "Legacy saved gear should migrate into a custom build.");
assert(migratedBuildState.activeBuildId === "migrated-build", "Legacy gear migration should preserve the active calculation behavior.");
assert(migratedBuildState.gearItems.length === 1 && migratedBuildState.entries.find((entry) => entry.id === "migrated-build")?.equipped.leftWeapon === hengBlade.id, "Legacy single-inventory gear must migrate into shared storage.");

const legacyBuildList = [
  { id: "legacy-a", name: "Legacy A", inventory: { items: [hengBlade], equipped: { leftWeapon: hengBlade.id } } },
  { id: "legacy-b", name: "Legacy B", inventory: { items: [hengBlade], equipped: { leftWeapon: hengBlade.id } } },
];
globalThis.localStorage = { getItem: (key) => key === gear.buildListStorageKey ? JSON.stringify(legacyBuildList) : key === gear.activeBuildStorageKey ? "legacy-b" : null };
const migratedPerBuildState = gear.loadBuildState();
const migratedA = migratedPerBuildState.entries.find((entry) => entry.id === "legacy-a");
const migratedB = migratedPerBuildState.entries.find((entry) => entry.id === "legacy-b");
assert(migratedPerBuildState.gearItems.length === 2, "Every legacy per-build item must be preserved in shared storage.");
assert(migratedA?.equipped.leftWeapon && migratedB?.equipped.leftWeapon && migratedA.equipped.leftWeapon !== migratedB.equipped.leftWeapon, "Legacy gear ID collisions must be remapped without changing either loadout.");

const sharedBuildPayload = {
  version: 2,
  gearItems: [hengBlade],
  entries: [
    { id: "shared-a", name: "Shared A", equipped: { leftWeapon: hengBlade.id } },
    { id: "shared-b", name: "Shared B", equipped: { leftWeapon: hengBlade.id } },
  ],
};
globalThis.localStorage = { getItem: (key) => key === gear.buildListStorageKey ? JSON.stringify(sharedBuildPayload) : key === gear.activeBuildStorageKey ? "shared-b" : null };
const sharedBuildState = gear.loadBuildState();
const sharedA = sharedBuildState.entries.find((entry) => entry.id === "shared-a");
const sharedB = sharedBuildState.entries.find((entry) => entry.id === "shared-b");
assert(sharedBuildState.gearItems.length === 1 && sharedA?.equipped.leftWeapon === hengBlade.id && sharedB?.equipped.leftWeapon === hengBlade.id, "One shared gear item must be reusable in multiple build loadouts.");
const serializedBuildState = JSON.parse(gear.serializeBuildState(sharedBuildState));
assert(serializedBuildState.version === 2 && serializedBuildState.gearItems.length === 1 && serializedBuildState.entries.every((entry) => !("inventory" in entry)), "Build persistence must use the shared-inventory schema.");
const exportedBuildState = JSON.parse(gear.exportBuildState(sharedBuildState));
assert(exportedBuildState.format === gear.buildExportFormat && exportedBuildState.version === 1 && exportedBuildState.gearItems.length === 1, "Build export must use the versioned transfer schema.");
const mergedImport = gear.mergeImportedBuildState(sharedBuildState, exportedBuildState);
assert(mergedImport.importedGearCount === 1 && mergedImport.importedBuildCount === 2, "Import must append shared gear and custom builds while skipping default presets.");
assert(mergedImport.state.activeBuildId === sharedBuildState.activeBuildId && mergedImport.state.gearItems.length === 2, "Import must preserve the active build and existing gear.");
const firstImportedBuild = mergedImport.state.entries.find((entry) => entry.id === mergedImport.importedBuildIds[0]);
const secondImportedBuild = mergedImport.state.entries.find((entry) => entry.id === mergedImport.importedBuildIds[1]);
assert(firstImportedBuild?.equipped.leftWeapon && firstImportedBuild.equipped.leftWeapon === secondImportedBuild?.equipped.leftWeapon && firstImportedBuild.equipped.leftWeapon !== hengBlade.id, "Imported builds must share the same remapped gear without colliding with existing IDs.");
let invalidImportRejected = false;
try {
  gear.mergeImportedBuildState(sharedBuildState, { version: 1, gearItems: [], builds: [] });
} catch {
  invalidImportRejected = true;
}
assert(invalidImportRejected, "Import must reject files without the build export format identifier.");

const damageStats = {
  ...statDefinitions.emptyStats,
  minPhys: 100,
  maxPhys: 100,
  singleTargetMysticDmgBoost: 0.1,
  areaMysticDmgBoost: 0.2,
};
const damageContext = {
  stats: damageStats,
  attunement: {
    physicalPenetration: 0,
    formlessPenetration: 0,
    phalanxbaneChargedBoost: 0,
    phalanxbaneMartialBoost: 0,
    snowpartingChargedBoost: 0,
    snowpartingVariedComboBoost: 0,
    snowpartingMartialBoost: 0,
  },
  weapons: ["snowparting"],
  buffs: [],
  enemy: {
    name: "Probe",
    level: 1,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  },
  derivedStats: {},
  effects: [{ stat: {} }],
};
const baselineDamage = damage.calculateDamageBreakdown({ phyCoef: 1 }, { ...damageContext, skillTags: ["Mystic"] }).total;
const singleTargetDamage = damage.calculateDamageBreakdown({ phyCoef: 1 }, { ...damageContext, skillTags: ["Mystic", "SingleTargetMystic"] }).total;
const areaDamage = damage.calculateDamageBreakdown({ phyCoef: 1 }, { ...damageContext, skillTags: ["Mystic", "AreaMystic"] }).total;
assert(Math.abs(singleTargetDamage / baselineDamage - 1.1) < 1e-9, "Single-Target Mystic bonus did not apply only to its matching tag.");
assert(Math.abs(areaDamage / baselineDamage - 1.2) < 1e-9, "Area Mystic bonus did not apply only to its matching tag.");

const baselineEffects = [{ stat: {
  agility: 20,
  minPhys: { formula: { source: "agility", multiplier: 0.9 } },
} }];
const locked = statEffects.calculateStatsWithOverrides(statDefinitions.emptyStats, baselineEffects, 0, { agility: 100, minPhys: 150 });
assert(Math.abs(locked.stats.agility - 100) < 1e-9, "A modified source stat must resolve to its requested final value.");
assert(Math.abs(locked.stats.minPhys - 150) < 1e-9, "A modified dependent stat must resolve after formula effects.");

const changedBaseline = statEffects.calculateStatsWithOverrides(statDefinitions.emptyStats, [{ stat: {
  agility: 30,
  minPhys: { formula: { source: "agility", multiplier: 0.9 } },
} }], 0, { agility: 100, minPhys: 150 });
assert(Math.abs(changedBaseline.stats.agility - 100) < 1e-9 && Math.abs(changedBaseline.stats.minPhys - 150) < 1e-9, "Baseline input changes must not move modified stats.");

const comparison = statEffects.calculateStatsWithEffects(locked.baseStats, [{ stat: {
  agility: 30,
  minPhys: { formula: { source: "agility", multiplier: 0.9 } },
} }], 0);
assert(Math.abs(comparison.stats.agility - 110) < 1e-9, "Comparison variants must still apply their stat delta to a modified stat.");
assert(Math.abs(comparison.stats.minPhys - 159) < 1e-9, "Comparison variants must preserve dependent formula deltas.");

const systemEffects = [systemStats.baseStats, systemStats.levelBonusStats, ...systemStats.talentStats, ...systemStats.qingheOddityStats, ...systemStats.kaifengOddityStats, ...systemStats.imperialPalaceOddityStats, ...systemStats.hexiOddityStats, ...systemStats.hiddenMountainOddityStats, ...systemStats.attributeConversions];
const systemCharacter = statEffects.calculateStatsWithEffects(statDefinitions.emptyStats, systemEffects, 0).stats;
assert(systemStats.talentStats.length === 57, "Talent stat entries must remain individually represented.");
assert(systemStats.qingheOddityStats.length === 29, "Qinghe Oddity stat entries must remain individually represented.");
assert(systemStats.kaifengOddityStats.length === 39, "Kaifeng Oddity stat entries must remain individually represented.");
assert(systemStats.imperialPalaceOddityStats.length === 10, "Imperial Palace Oddity stat entries must remain individually represented.");
assert(systemStats.hexiOddityStats.length === 24, "Hexi Oddity stat entries must remain individually represented.");
assert(systemStats.hiddenMountainOddityStats.length === 23, "Hidden Mountain Oddity stat entries must remain individually represented.");
assert(systemCharacter.power === 153 && systemCharacter.agility === 153 && systemCharacter.momentum === 153 && systemCharacter.body === 153 && systemCharacter.defense === 153, "Unexpected base attribute totals.");
assert(systemStats.baseStats.stat.precision === 0.65 && systemStats.levelBonusStats.stat.precision === 0.153, "Innate and level Precision must remain separate.");
assert(systemStats.levelBonusStats.stat.agility === 138 && systemStats.levelBonusStats.stat.power === 138 && systemStats.levelBonusStats.stat.momentum === 138 && systemStats.levelBonusStats.stat.body === 138 && systemStats.levelBonusStats.stat.defense === 138, "Level attribute bonuses must remain separate from innate stats.");
assert(Math.abs(systemCharacter.precision - 0.968) < 1e-9, "Unexpected system Precision total.");
assert(Math.abs(systemCharacter.crit - 0.35628) < 1e-9, "Unexpected system Critical total.");
assert(Math.abs(systemCharacter.affinity - 0.17814) < 1e-9, "Unexpected system Affinity total.");
assert(Math.abs(systemCharacter.critDmgBonus - 0.5) < 1e-9 && Math.abs(systemCharacter.affinityDmgBonus - 0.35) < 1e-9, "Unexpected innate and talent outcome damage totals.");
assert(Math.abs(systemCharacter.minPhys - 800.725) < 1e-9 && Math.abs(systemCharacter.maxPhys - 1460.38) < 1e-9, "Unexpected innate and system Physical Attack totals.");
assert(Math.abs(systemCharacter.physicalDefense - 203.7) < 1e-9 && systemCharacter.maxHp === 25931, "Unexpected system defensive totals.");
assert(systemCharacter.maxEndurance === 120 && systemCharacter.maxVitality === 100, "Unexpected innate and Oddity resource totals.");
const defaultCriticalEffects = [
  ...systemEffects,
  ...phalanxbaneMartialArt.talent.flatMap((talent) => talent.effect ?? []),
  { stat: presetEffects.stats },
  steadfastDevotion.effect.SteadfastDevotionT2.effect[0],
];
const defaultCritical = statEffects.calculateStatsWithEffects(statDefinitions.emptyStats, defaultCriticalEffects, 0).stats.crit;
assert(Math.abs(defaultCritical - 1.12961088) < 1e-9, "Unexpected Full Relayed Min Build Critical total.");
assert(defaultSetup.innerWays.length === 4 && defaultSetup.innerWays.every((row) => row.innerWay !== "BreakingPoint" && row.tier === "T6"), "Unexpected default Inner Way selection.");
assert(defaultSetup.gearSets.Cleftpeak === 4 && defaultSetup.gearSets.RainWhisper === 0, "Unexpected default gear-set selection.");
assert(defaultSetup.bowRingSet === "Precision" && defaultSetup.arsenal === "Stonesplit" && defaultSetup.food === "SimmeringFishSlices", "Unexpected default setup choices.");

console.log("Gear, system-stat, equipped-effect, and stat-override checks passed.");
await viteServer.close();
