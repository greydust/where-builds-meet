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

const viteServer = await createServer({
  root: process.cwd(),
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
const gear = await viteServer.ssrLoadModule("/src/gear.ts");
const damage = await loadBundledModule("./src/calculations/damage.ts");
const statDefinitions = await loadBundledModule("./src/data/statDefinitions.ts");
const statEffects = await loadBundledModule("./src/calculations/statEffects.ts");
const { createBaseAttributeEffects } = await loadBundledModule("./src/data/baseAttributeEffects.ts");
const systemStats = (await import("../../data/system.json", { with: { type: "json" } })).default;
const enemies = (await import("../../data/enemy.json", { with: { type: "json" } })).default;
const statRolls = (await import("../../data/stat.json", { with: { type: "json" } })).default;
const defaultSetup = (await import("../../data/default-setup.json", { with: { type: "json" } })).default;
const gearSetDefinitions = (await import("../../data/gear-set.json", { with: { type: "json" } })).default;
const phalanxbaneMartialArt = (
  await import("../../data/martial-art/phalanxbane-blade.json", { with: { type: "json" } })
).default;
const steadfastDevotion = (await import("../../data/innerway/steadfast-devotion.json", { with: { type: "json" } }))
  .default;

const assert = (condition, message) => {
  if (!condition) throw new Error(message);
};

assert(gear.gearSlots.length === 8, "Expected eight gear slots.");
assert(gear.defaultBuildPresets.length >= 2, "Expected populated and empty default builds.");
assert(gear.gearData.gear.hengBlade.baseStats["96"].Gold.minPhys === 65, "Unexpected Heng Blade base stat.");
assert(
  gear.gearData.gear.helmet.baseStats["96"].Gold.maxHp === 5774 &&
    gear.gearData.gear.helmet.baseStats["96"].Gold.physicalDefense === 22 &&
    gear.gearData.gear.chestpiece.baseStats["96"].Purple.maxHp === 10392 &&
    gear.gearData.gear.greaves.baseStats["91"].Gold.physicalDefense === 36 &&
    gear.gearData.gear.bracer.baseStats["91"].Purple.maxHp === 4153,
  "Armor base HP and Physical Defense must match the official gear signatures.",
);
assert(enemies["96"].level === 96, "The level 96 enemy must use the numeric level key consumed by stat priorities.");
assert(
  gear.statRollsForLevel(enemies["96"].level) === gear.statRollsForLevel(96),
  "Enemy levels must select the matching stat roll table.",
);
const expectedLevel91Affixes = {
  power: 40.4,
  agility: 40.4,
  momentum: 40.4,
  minPhys: 63.8,
  maxPhys: 63.8,
  precision: 0.066,
  crit: 0.074,
  affinity: 0.044,
  minBellstrike: 36.2,
  maxBellstrike: 36.2,
  minStonesplit: 36.2,
  maxStonesplit: 36.2,
  minSilkbind: 36.2,
  maxSilkbind: 36.2,
  minBamboocut: 36.2,
  maxBamboocut: 36.2,
  minVoidAttack: 36.2,
  maxVoidAttack: 36.2,
  allMartialArts: 0.026,
  moBladeDmgBoost: 0.052,
  hengBladeDmgBoost: 0.052,
  umbrellaDmgBoost: 0.052,
  ropeDartDmgBoost: 0.052,
  gauntletDmgBoost: 0.052,
  vsBossDmg: 0.026,
  singleTargetMysticDmgBoost: 0.08,
  areaMysticDmgBoost: 0.08,
};
assert(
  Object.entries(expectedLevel91Affixes).every(([key, value]) => statRolls["91"].affix[key] === value),
  "Level 91 affix rolls must match the complete requested roll table.",
);
assert(
  statRolls["91"].attunement.physicalPenetration === 9 &&
    statRolls["91"].attunement.formlessPenetration === 10.8 &&
    statRolls["91"].attunement.armor === 0.05,
  "Level 91 attunement rolls must match the requested roll table.",
);
assert(gear.gearData.affixes.precision.percentage === true, "Precision must be stored as a decimal ratio.");
assert(
  gear
    .affixOptionsForGearDefinition(gear.gearData.gear.hengBlade, "additionalAffixes", 96, true)
    .slice(-2)
    .join(",") === "body,defense",
  "Universal defensive affixes must remain at the bottom of Build tab affix dropdowns.",
);
assert(
  Object.keys(gear.gearData.affixes).every(
    (key) => key in statDefinitions.emptyStats && !("stat" in gear.gearData.affixes[key]),
  ),
  "Every gear affix key must directly match CharacterStats.",
);
const attunementStatKeys = new Set([
  "physicalPenetration",
  "formlessPenetration",
  "physicalResistance",
  "phalanxbaneChargedBoost",
  "phalanxbaneMartialBoost",
  "snowpartingChargedBoost",
  "snowpartingVariedComboBoost",
  "snowpartingMartialBoost",
  "thundercryChargedBoost",
  "thundercryShieldBoost",
  "thundercrySpecialBoost",
  "stormbreakerChargedBoost",
  "stormbreakerSpecialBoost",
  "everspringMartialBoost",
  "everspringSpecialBoost",
  "unfetteredChargedBoost",
  "unfetteredSpecialBoost",
  "unfetteredMartialBoost",
  "heavenwillChargedBoost",
  "heavenwillMartialBoost",
  "heavenwillLightVariedComboBoost",
  "skygraspHeavyBoost",
  "skygraspSpecialBoost",
]);
assert(
  Object.keys(gear.attunementData).every((key) => attunementStatKeys.has(key)),
  "Every attunement definition ID must have a centralized AttunementStats input.",
);
assert(
  gear.attunementData.physicalPenetration.effect.stat.physicalPenetration === 1 &&
    gear.attunementData.formlessPenetration.effect.stat.formlessPenetration === 1,
  "Weapon attunements must target their penetration channels.",
);
assert(
  Object.entries(gear.attunementData)
    .filter(([, definition]) => definition.tags.includes("Armor") && definition.implemented !== false)
    .every(([, definition]) => definition.effect.stat.attunementDMGBonus === 1 && definition.effect.tags.length > 0),
  "Armor attunements must target the tagged standalone attunement DMG Bonus.",
);
assert(
  gear.attunementData.thundercryShieldBoost.implemented === false &&
    Object.keys(gear.attunementData.thundercryShieldBoost.effect.stat).length === 0,
  "Thundercry Shield Boost must remain available without applying an unimplemented calculation effect.",
);
const weaponDefinitions = [
  "hengBlade",
  "moBlade",
  "umbrella",
  "unfetteredRopeDart",
  "gauntlet",
  "skygraspRopeDart",
].map((id) => gear.gearData.gear[id]);
assert(
  weaponDefinitions.every(
    (definition) =>
      JSON.stringify(definition.baseStats) === JSON.stringify(weaponDefinitions[0].baseStats) &&
      JSON.stringify(definition.baseAffixes) === JSON.stringify(weaponDefinitions[0].baseAffixes),
  ),
  "Every weapon must share the same base stats and base-affix pools.",
);
const expectedWeaponBoosts = [
  "hengBladeDmgBoost",
  "moBladeDmgBoost",
  "umbrellaDmgBoost",
  "ropeDartDmgBoost",
  "gauntletDmgBoost",
  "ropeDartDmgBoost",
];
assert(
  weaponDefinitions.every((definition, index) =>
    ["96", "91"].every((level) => {
      const boosts = definition.additionalAffixes[level].filter((key) => key.endsWith("DmgBoost"));
      return boosts.length === 1 && boosts[0] === expectedWeaponBoosts[index];
    }),
  ),
  "Each weapon additional-affix pool must contain only its own weapon damage boost.",
);
assert(
  weaponDefinitions.every((definition) => JSON.stringify(definition.attunements) === JSON.stringify(["Weapon"])) &&
    ["disc", "pendant"].every(
      (id) => JSON.stringify(gear.gearData.gear[id].attunements) === JSON.stringify(["Weapon"]),
    ),
  "Weapons, Disc, and Pendant must select Weapon-tagged attunements.",
);
assert(
  ["helmet", "chestpiece", "greaves", "bracer"].every(
    (id) => JSON.stringify(gear.gearData.gear[id].attunements) === JSON.stringify(["Armor"]),
  ),
  "Armor gear must select Armor-tagged attunements.",
);
assert(
  gear.attunementsForGearDefinition(gear.gearData.gear.hengBlade).includes("physicalPenetration") &&
    !gear.attunementsForGearDefinition(gear.gearData.gear.hengBlade).includes("phalanxbaneChargedBoost") &&
    gear.attunementsForGearDefinition(gear.gearData.gear.helmet).includes("phalanxbaneChargedBoost"),
  "Gear attunement selectors must resolve through attunement definition tags.",
);

const preset = gear.defaultBuildPresets.find(
  (candidate) =>
    candidate.id === "mixed-fully-relayed-min" ||
    candidate.id === "fully-relayed-min" ||
    candidate.id === "full-relayed-min",
);
assert(preset, "Expected the fully relayed min default build.");
const presetInventory = gear.buildPresetInventory(preset);
assert(
  preset.name === "Mixed Fully Relayed Min Build" ||
    preset.name === "Fully Relayed Min Build" ||
    preset.name === "Full Relayed Min Build",
  "Unexpected default build name.",
);
assert(
  gear.buildEntryAvailableForMartialArts({ id: preset.id, name: preset.name, isDefault: true, presetId: preset.id }, [
    "snowparting",
    "phalanxbane",
  ]),
  "The Mixed fully-relayed preset must match its weapon pair.",
);
assert(
  gear.buildEntryAvailableForMartialArts({ id: preset.id, name: preset.name, isDefault: true, presetId: preset.id }, [
    "phalanxbane",
    "snowparting",
  ]),
  "Build weapon-pair matching must not depend on left/right order.",
);
assert(
  !gear.buildEntryAvailableForMartialArts({ id: preset.id, name: preset.name, isDefault: true, presetId: preset.id }, [
    "everspring",
    "unfettered",
  ]),
  "A build preset must be hidden for a different weapon pair.",
);
const reversedPresetInventory = gear.resolveBuildInventory(
  { id: preset.id, name: preset.name, isDefault: true, presetId: preset.id },
  [],
  ["phalanxbane", "snowparting"],
);
assert(
  reversedPresetInventory.items.find((item) => item.id === reversedPresetInventory.equipped.leftWeapon)
    ?.definitionId === "moBlade",
  "A reversed build pair must align the matching gear to the selected left weapon.",
);
assert(
  reversedPresetInventory.items.find((item) => item.id === reversedPresetInventory.equipped.rightWeapon)
    ?.definitionId === "hengBlade",
  "A reversed build pair must align the matching gear to the selected right weapon.",
);
assert(
  presetInventory.items.length === 8 && Object.keys(presetInventory.equipped).length === 8,
  "The default build must resolve all eight synthetic gear slots.",
);
assert(
  presetInventory.items.every((item) => item.relayed === true),
  "Fully relayed presets must mark every synthetic gear item as relayed.",
);
const presetLeftWeapon = presetInventory.items.find((item) => item.id === presetInventory.equipped.leftWeapon);
assert(
  presetLeftWeapon && !("slot" in presetLeftWeapon),
  "Preset weapon gear must use its definition ID instead of a stored slot.",
);
assert(presetLeftWeapon.baseAffix.value === 73.132, "Preset affixes must preserve their explicit saved values.");
assert(presetLeftWeapon.attunement.value === 11, "Preset attunements must preserve their explicit saved values.");
assert(gear.maxGearRoll("minPhys", "affix", false) === 77.8, "Level 96 Normal Max must use the full affix roll.");
assert(
  Math.abs(gear.maxGearRoll("minPhys", "affix", true) - 73.132) < 1e-9,
  "Level 96 Relayed Max must use 94% of the affix roll.",
);
const normalWeaponAffixes = gear.affixOptionsForGearDefinition(
  gear.gearData.gear.hengBlade,
  "additionalAffixes",
  96,
  false,
);
const relayedWeaponAffixes = gear.affixOptionsForGearDefinition(
  gear.gearData.gear.hengBlade,
  "additionalAffixes",
  96,
  true,
);
assert(
  !normalWeaponAffixes.includes("minStonesplit") && !normalWeaponAffixes.includes("maxBamboocut"),
  "Tier 96 attribute attack must not be available on a normal weapon.",
);
assert(
  ["minBellstrike", "maxStonesplit", "minSilkbind", "maxBamboocut"].every((key) => relayedWeaponAffixes.includes(key)),
  "Tier 96 relayed weapons must expose every min/max attribute attack.",
);
assert(
  gear.maxGearRoll("maxBellstrike", "affix", true, 96) === gear.maxGearRoll("maxVoidAttack", "affix", true, 96),
  "Relayed attribute attack must share the Tier 96 Void Attack roll.",
);
assert(
  gear.maxGearRoll("physicalPenetration", "attunement", true) === 11,
  "Relayed Max must keep the full attunement roll.",
);
assert(gear.clampGearRoll("minPhys", 100, "affix", false) === 77.8, "Normal affix input must clamp to its level roll.");
assert(
  Math.abs(gear.clampGearRoll("minPhys", 77.8, "affix", true) - 73.132) < 1e-9,
  "Enabling Relayed must clamp an existing affix to 94%.",
);
assert(
  gear.clampGearRoll("physicalPenetration", 20, "attunement", true) === 11,
  "Relayed attunement input must retain its full cap.",
);
assert(gear.clampGearRoll("minPhys", 60, "affix", true) === 60, "Values below the cap must remain unchanged.");
assert(gear.maxGearRoll("minPhys", "affix", false, 91) === 63.8, "Level 91 affixes must use the level 91 roll table.");
assert(
  Math.abs(gear.maxGearRoll("minPhys", "affix", true, 91) - 59.972) < 1e-9,
  "Level 91 relayed affixes must use 94% of the level 91 roll.",
);
assert(
  gear.maxGearRoll("formlessPenetration", "attunement", false, 91) === 10.8,
  "Level 91 weapon attunements must use the level 91 roll table.",
);
assert(
  gear.maxGearRoll("phalanxbaneChargedBoost", "attunement", false, 91) === 0.05,
  "Level 91 armor attunements must use the shared armor roll.",
);
assert(
  gear.maxGearRoll("singleTargetMysticDmgBoost", "affix", false, 96) === 0.098,
  "Level 96 Single-Target Mystic affixes must have a 9.8% cap.",
);
assert(
  gear.maxGearRoll("areaMysticDmgBoost", "affix", false, 91) === 0.08,
  "Level 91 Area Mystic affixes must have an 8% cap.",
);
assert(
  gear.maxGearRoll("umbrellaDmgBoost", "affix", false, 96) === 0.062 &&
    gear.maxGearRoll("ropeDartDmgBoost", "affix", false, 91) === 0.052 &&
    gear.maxGearRoll("gauntletDmgBoost", "affix", false, 91) === 0.052,
  "All weapon-specific damage affixes must share their level's weapon roll.",
);
const presetEffects = gear.calculateEquippedGearEffects(presetInventory, ["snowparting", "phalanxbane"], false);
assert(Math.abs(presetEffects.stats.minPhys - 1093.584) < 1e-9, "Unexpected preset minimum Physical Attack total.");
assert(Math.abs(presetEffects.stats.maxPhys - 431) < 1e-9, "Unexpected preset maximum Physical Attack total.");
assert(Math.abs(presetEffects.stats.agility - 371.488) < 1e-9, "Unexpected preset Agility total.");
assert(Math.abs(presetEffects.stats.maxStonesplit - 332.384) < 1e-9, "Unexpected preset Stonesplit total.");
assert(Math.abs(presetEffects.stats.precision - 0.1504) < 1e-9, "Unexpected preset Precision total.");
assert(
  presetEffects.stats.maxHp === 28869 && presetEffects.stats.physicalDefense === 110,
  "The four equipped Tier 96 Gold armor pieces must contribute their fixed defensive base stats.",
);
assert(
  Math.abs(presetEffects.attunement.physicalPenetration - 44) < 1e-9,
  "Unexpected preset Physical Penetration total.",
);
assert(
  Math.abs(presetEffects.attunement.phalanxbaneChargedBoost - 0.24) < 1e-9,
  "Unexpected preset Phalanxbane Charged total.",
);
const presetSetup = gear.resolveBuildSetup({ id: preset.id, name: preset.name, isDefault: true, presetId: preset.id });
assert(
  presetSetup.weaponSets.Cleftpeak === 4 &&
    presetSetup.weaponSets.RainWhisper === 0 &&
    presetSetup.armorSets.Formbend === 0 &&
    presetSetup.bowRingSet === "Critical" &&
    presetSetup.arsenal === "Stonesplit",
  "Unexpected populated preset setup.",
);
assert(
  presetSetup.innerWays.length === 4 &&
    presetSetup.innerWays.every((row) => row.innerWay !== "BreakingPoint" && row.tier === "T6"),
  "Default builds must include their Inner Way setup.",
);
const emptyPreset = gear.defaultBuildPresets.find((candidate) => candidate.id === "empty");
assert(emptyPreset, "Expected the empty default build.");
assert(
  gear.buildEntryIsTestPreset({
    id: emptyPreset.id,
    name: emptyPreset.name,
    isDefault: true,
    presetId: emptyPreset.id,
  }),
  "The Empty Build must remain bundled and identifiable by the runtime Dev gate.",
);
const emptyPresetInventory = gear.buildPresetInventory(emptyPreset);
assert(
  emptyPreset.name === "Empty Build" &&
    emptyPresetInventory.items.length === 0 &&
    Object.keys(emptyPresetInventory.equipped).length === 0,
  "The empty default build must not synthesize gear.",
);
assert(
  gear.buildEntryAvailableForMartialArts(
    { id: emptyPreset.id, name: emptyPreset.name, isDefault: true, presetId: emptyPreset.id },
    ["heavenwill", "skygrasp"],
  ),
  "The dev empty build must match every weapon pair.",
);
const emptySetup = gear.resolveBuildSetup({
  id: emptyPreset.id,
  name: emptyPreset.name,
  isDefault: true,
  presetId: emptyPreset.id,
});
assert(
  emptySetup.weaponSets.Cleftpeak === 0 &&
    emptySetup.weaponSets.RainWhisper === 0 &&
    emptySetup.armorSets.Formbend === 0 &&
    emptySetup.bowRingSet === "None",
  "The empty default build must use its empty setup preset.",
);
assert(
  emptySetup.innerWays.length === 4 && emptySetup.innerWays.every((row) => row.innerWay === ""),
  "The empty default build must not equip any Inner Ways.",
);

const hengBlade = {
  id: "test-heng",
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
const baseOnlyInventory = gear.parseGearInventory({
  items: [{ ...hengBlade, id: "base-only", additionalAffixes: [], attunement: undefined }],
  equipped: { leftWeapon: "base-only" },
});
assert(
  baseOnlyInventory.items.length === 1 &&
    baseOnlyInventory.items[0].additionalAffixes.length === 0 &&
    baseOnlyInventory.items[0].attunement === undefined,
  "A gear item must remain valid with only its required base affix.",
);

assert(effects.stats.minPhys === 65, "Fixed minimum Physical Attack was not applied.");
assert(effects.stats.maxPhys === 151, "Fixed maximum Physical Attack was not applied.");
assert(
  effects.stats.minVoidAttack === 40 && effects.stats.maxVoidAttack === 50,
  "Selected attack affixes were not applied.",
);
assert(effects.stats.agility === 10, "Additional base stat was not applied.");
assert(effects.stats.precision === 0.08, "Percentage affix did not remain a decimal ratio.");
assert(effects.stats.hengBladeDmgBoost === 0.062, "Art of Heng was not applied.");
assert(effects.attunement.physicalPenetration === 11, "Gear attunement was not applied.");

const incompatible = gear.calculateEquippedGearEffects(inventory, ["phalanxbane", "snowparting"]);
assert(Object.keys(incompatible.stats).length === 0, "An incompatible weapon item should not affect the build.");
const movedInventory = { items: [hengBlade], equipped: { rightWeapon: hengBlade.id } };
const movedEffects = gear.calculateEquippedGearEffects(movedInventory, ["phalanxbane", "snowparting"]);
assert(
  movedEffects.stats.minPhys === 65,
  "A slotless weapon item must be reusable in the compatible opposite weapon position.",
);

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
globalThis.localStorage = { getItem: (key) => (key === gear.legacyGearStorageKey ? duplicateInventoryJson : null) };
const loaded = gear.loadGearInventory();
assert(loaded.items.length === 0, "Persisted duplicate additional affixes should be rejected.");

const relayedHengBlade = { ...hengBlade, relayed: true };
globalThis.localStorage = {
  getItem: (key) =>
    key === gear.legacyGearStorageKey
      ? JSON.stringify({ items: [relayedHengBlade], equipped: { leftWeapon: relayedHengBlade.id } })
      : null,
};
const loadedRelayed = gear.loadGearInventory();
assert(loadedRelayed.items[0]?.relayed === true, "Relayed metadata must survive persisted gear validation.");

const legacyHengBlade = { ...hengBlade, slot: "leftWeapon" };
const legacyInventoryJson = JSON.stringify({ items: [legacyHengBlade], equipped: { leftWeapon: legacyHengBlade.id } });
const legacyInnerWays = [
  { innerWay: "BreakingPoint", tier: "T3" },
  { innerWay: "MoraleChant", tier: "T6" },
  { innerWay: "SteadfastDevotion", tier: "T6" },
  { innerWay: "ThroatPiercingArt", tier: "T6" },
];
globalThis.sessionStorage = {
  getItem: (key) =>
    key === "wwm-inner-way-session-v1"
      ? JSON.stringify(legacyInnerWays)
      : key === "wwm-gear-set-session-v1"
        ? JSON.stringify({ Cleftpeak: 2, RainWhisper: 2 })
        : key === "wwm-bow-ring-set-session-v1"
          ? "Critical"
          : key === "wwm-arsenal-session-v1"
            ? "General"
            : null,
};
globalThis.localStorage = { getItem: (key) => (key === gear.legacyGearStorageKey ? legacyInventoryJson : null) };
const migratedBuildState = gear.loadBuildState();
assert(
  migratedBuildState.entries[0].isDefault === true && migratedBuildState.entries[0].inventory === undefined,
  "Default builds must not persist real gear.",
);
assert(
  migratedBuildState.entries.some((entry) => entry.id === "migrated-build"),
  "Legacy saved gear should migrate into a custom build.",
);
assert(
  migratedBuildState.activeBuildId === "migrated-build",
  "Legacy gear migration should preserve the active calculation behavior.",
);
assert(
  migratedBuildState.gearItems.length === 1 &&
    migratedBuildState.entries.find((entry) => entry.id === "migrated-build")?.equipped.leftWeapon === hengBlade.id,
  "Legacy single-inventory gear must migrate into shared storage.",
);
assert(!("slot" in migratedBuildState.gearItems[0]), "Legacy weapon slots must be removed during migration.");
assert(
  gear.resolveBuildSetup(migratedBuildState.entries.find((entry) => entry.id === "migrated-build")).weaponSets
    .RainWhisper === 2 &&
    gear.resolveBuildSetup(migratedBuildState.entries.find((entry) => entry.id === "migrated-build")).bowRingSet ===
      "Critical",
  "Legacy global setup selections must migrate into custom builds.",
);
assert(
  gear.resolveBuildSetup(migratedBuildState.entries.find((entry) => entry.id === "migrated-build")).innerWays[0]
    .innerWay === "BreakingPoint",
  "Legacy Inner Way selections must migrate into custom builds.",
);
const migratedSerialized = JSON.parse(gear.serializeBuildState(migratedBuildState));
assert(
  migratedSerialized.entries.length === 1 && migratedSerialized.entries.every((entry) => !("isDefault" in entry)),
  "Bundled default builds must not be persisted.",
);

const legacyBuildList = [
  {
    id: "legacy-a",
    name: "Legacy A",
    inventory: { items: [legacyHengBlade], equipped: { leftWeapon: legacyHengBlade.id } },
  },
  {
    id: "legacy-b",
    name: "Legacy B",
    inventory: { items: [legacyHengBlade], equipped: { leftWeapon: legacyHengBlade.id } },
  },
];
globalThis.localStorage = {
  getItem: (key) =>
    key === gear.buildListStorageKey
      ? JSON.stringify(legacyBuildList)
      : key === gear.activeBuildStorageKey
        ? "legacy-b"
        : null,
};
const migratedPerBuildState = gear.loadBuildState();
const migratedA = migratedPerBuildState.entries.find((entry) => entry.id === "legacy-a");
const migratedB = migratedPerBuildState.entries.find((entry) => entry.id === "legacy-b");
assert(
  migratedPerBuildState.gearItems.length === 2,
  "Every legacy per-build item must be preserved in shared storage.",
);
assert(
  migratedA?.equipped.leftWeapon &&
    migratedB?.equipped.leftWeapon &&
    migratedA.equipped.leftWeapon !== migratedB.equipped.leftWeapon,
  "Legacy gear ID collisions must be remapped without changing either loadout.",
);

const sharedBuildPayload = {
  version: 2,
  gearItems: [hengBlade],
  entries: [
    {
      id: "shared-a",
      name: "Shared A",
      weapons: ["snowparting", "phalanxbane"],
      equipped: { leftWeapon: hengBlade.id },
    },
    {
      id: "shared-b",
      name: "Shared B",
      weapons: ["snowparting", "phalanxbane"],
      equipped: { leftWeapon: hengBlade.id },
    },
  ],
};
globalThis.localStorage = {
  getItem: (key) =>
    key === gear.buildListStorageKey
      ? JSON.stringify(sharedBuildPayload)
      : key === gear.activeBuildStorageKey
        ? "shared-b"
        : null,
};
const sharedBuildState = gear.loadBuildState();
const sharedA = sharedBuildState.entries.find((entry) => entry.id === "shared-a");
const sharedB = sharedBuildState.entries.find((entry) => entry.id === "shared-b");
assert(
  sharedBuildState.gearItems.length === 1 &&
    sharedA?.equipped.leftWeapon === hengBlade.id &&
    sharedB?.equipped.leftWeapon === hengBlade.id &&
    sharedA?.martialArts.join(",") === "snowparting,phalanxbane" &&
    !("weapons" in sharedA),
  "Shared gear must remain reusable while legacy build weapon tags migrate to martialArts.",
);
const serializedBuildState = JSON.parse(gear.serializeBuildState(sharedBuildState));
assert(
  serializedBuildState.version === 8 &&
    serializedBuildState.gearItems.length === 1 &&
    !("slot" in serializedBuildState.gearItems[0]) &&
    serializedBuildState.entries.every(
      (entry) =>
        !("inventory" in entry) &&
        entry.setup?.innerWays?.length === 4 &&
        entry.setup?.weaponSets &&
        entry.setup?.armorSets &&
        entry.martialArts?.length >= 2 &&
        !("weapons" in entry),
    ),
  "Build persistence must include Inner Ways, setup, and martial-art eligibility in the shared-inventory schema.",
);
const exportedBuildState = JSON.parse(gear.exportBuildState(sharedBuildState));
assert(
  exportedBuildState.format === gear.buildExportFormat &&
    exportedBuildState.version === 7 &&
    exportedBuildState.gearItems.length === 1 &&
    !("slot" in exportedBuildState.gearItems[0]) &&
    exportedBuildState.builds.every(
      (entry) =>
        entry.setup?.innerWays?.length === 4 &&
        entry.setup?.weaponSets &&
        entry.setup?.armorSets &&
        entry.martialArts?.length >= 2 &&
        !("weapons" in entry),
    ),
  "Build export must include Inner Ways, setup, and martial-art eligibility with slotless weapons.",
);
const mergedImport = gear.mergeImportedBuildState(sharedBuildState, exportedBuildState);
assert(
  mergedImport.importedGearCount === 1 && mergedImport.importedBuildCount === 2,
  "Import must append shared gear and custom builds while skipping default presets.",
);
assert(
  mergedImport.state.activeBuildId === sharedBuildState.activeBuildId && mergedImport.state.gearItems.length === 2,
  "Import must preserve the active build and existing gear.",
);
const firstImportedBuild = mergedImport.state.entries.find((entry) => entry.id === mergedImport.importedBuildIds[0]);
const secondImportedBuild = mergedImport.state.entries.find((entry) => entry.id === mergedImport.importedBuildIds[1]);
assert(
  firstImportedBuild?.equipped.leftWeapon &&
    firstImportedBuild.equipped.leftWeapon === secondImportedBuild?.equipped.leftWeapon &&
    firstImportedBuild.equipped.leftWeapon !== hengBlade.id,
  "Imported builds must share the same remapped gear without colliding with existing IDs.",
);
assert(
  firstImportedBuild.setup.bowRingSet === sharedA.setup.bowRingSet &&
    firstImportedBuild.setup.arsenal === sharedA.setup.arsenal,
  "Imported builds must preserve their setup selections.",
);
const legacyTransfer = {
  ...exportedBuildState,
  version: 1,
  gearItems: [legacyHengBlade],
  builds: exportedBuildState.builds.map(({ setup: _setup, martialArts, ...entry }) => ({
    ...entry,
    weapons: martialArts,
  })),
};
const migratedTransfer = gear.mergeImportedBuildState(sharedBuildState, legacyTransfer);
assert(
  migratedTransfer.importedGearCount === 1 &&
    !("slot" in migratedTransfer.state.gearItems.at(-1)) &&
    migratedTransfer.state.entries.find((entry) => entry.id === migratedTransfer.importedBuildIds[0]).martialArts
      .length === 2 &&
    migratedTransfer.state.entries.find((entry) => entry.id === migratedTransfer.importedBuildIds[0]).setup.arsenal ===
      gear.defaultBuildSetup.arsenal,
  "Version 1 exports must migrate weapon gear, legacy weapons eligibility, and missing setup data.",
);
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
const baselineDamage = damage.calculateDamageBreakdown(
  { phyCoef: 1 },
  { ...damageContext, skillTags: ["Mystic"] },
).total;
const singleTargetDamage = damage.calculateDamageBreakdown(
  { phyCoef: 1 },
  { ...damageContext, skillTags: ["Mystic", "SingleTargetMystic"] },
).total;
const areaDamage = damage.calculateDamageBreakdown(
  { phyCoef: 1 },
  { ...damageContext, skillTags: ["Mystic", "AreaMystic"] },
).total;
assert(
  Math.abs(singleTargetDamage / baselineDamage - 1.1) < 1e-9,
  "Single-Target Mystic bonus did not apply only to its matching tag.",
);
assert(Math.abs(areaDamage / baselineDamage - 1.2) < 1e-9, "Area Mystic bonus did not apply only to its matching tag.");

const baselineEffects = [
  {
    stat: {
      agility: 20,
      minPhys: { formula: { source: "agility", multiplier: 0.9 } },
    },
  },
];
const locked = statEffects.calculateStatsWithOverrides(statDefinitions.emptyStats, baselineEffects, 0, {
  agility: 100,
  minPhys: 150,
});
assert(
  Math.abs(locked.stats.agility - 100) < 1e-9,
  "A modified source stat must resolve to its requested final value.",
);
assert(Math.abs(locked.stats.minPhys - 150) < 1e-9, "A modified dependent stat must resolve after formula effects.");

const changedBaseline = statEffects.calculateStatsWithOverrides(
  statDefinitions.emptyStats,
  [
    {
      stat: {
        agility: 30,
        minPhys: { formula: { source: "agility", multiplier: 0.9 } },
      },
    },
  ],
  0,
  { agility: 100, minPhys: 150 },
);
assert(
  Math.abs(changedBaseline.stats.agility - 100) < 1e-9 && Math.abs(changedBaseline.stats.minPhys - 150) < 1e-9,
  "Baseline input changes must not move modified stats.",
);

const comparison = statEffects.calculateStatsWithEffects(
  locked.baseStats,
  [
    {
      stat: {
        agility: 30,
        minPhys: { formula: { source: "agility", multiplier: 0.9 } },
      },
    },
  ],
  0,
);
assert(
  Math.abs(comparison.stats.agility - 110) < 1e-9,
  "Comparison variants must still apply their stat delta to a modified stat.",
);
assert(Math.abs(comparison.stats.minPhys - 159) < 1e-9, "Comparison variants must preserve dependent formula deltas.");

const baseAttributeEffects = createBaseAttributeEffects(systemStats.baseAttributes);
const systemEffects = [
  systemStats.baseStats,
  systemStats.levelBonusStats,
  ...systemStats.enhancementStats,
  ...systemStats.talentStats,
  ...systemStats.qingheOddityStats,
  ...systemStats.kaifengOddityStats,
  ...systemStats.imperialPalaceOddityStats,
  ...systemStats.hexiOddityStats,
  ...systemStats.hiddenMountainOddityStats,
  ...baseAttributeEffects,
];
const systemCharacter = statEffects.calculateStatsWithEffects(statDefinitions.emptyStats, systemEffects, 0).stats;
assert(systemStats.baseAttributes.body.maxHp === 60, "Body must grant 60 Max HP per point.");
assert(
  systemStats.baseAttributes.power.minPhys === 0.22 && systemStats.baseAttributes.power.maxPhys === 1.36,
  "Power conversion rates are incorrect.",
);
assert(
  systemStats.baseAttributes.defense.maxHp === 17 && systemStats.baseAttributes.defense.physicalDefense === 0.57,
  "Defense conversion rates are incorrect.",
);
assert(
  systemStats.baseAttributes.agility.minPhys === 0.9 && systemStats.baseAttributes.agility.crit === 0.00076,
  "Agility conversion rates are incorrect.",
);
assert(
  systemStats.baseAttributes.momentum.maxPhys === 0.9 && systemStats.baseAttributes.momentum.affinity === 0.00038,
  "Momentum conversion rates are incorrect.",
);
assert(systemStats.enhancementStats.length === 4, "Enhancement stat entries must remain individually represented.");
assert(
  systemStats.baseStats.stat.minPhys === 263 && systemStats.baseStats.stat.maxPhys === 505,
  "Enhancement Physical Attack must be separated from innate Physical Attack.",
);
const tier96PurpleArmorHp = ["helmet", "chestpiece", "greaves", "bracer"].reduce(
  (total, definitionId) => total + gear.gearData.gear[definitionId].baseStats["96"].Purple.maxHp,
  0,
);
assert(
  tier96PurpleArmorHp === 25980 && systemStats.baseStats.stat.maxHp + tier96PurpleArmorHp === 127909,
  "Innate Max HP must exclude the four Tier 96 Purple armor base values used to derive it.",
);
assert(
  systemStats.enhancementStats.reduce((sum, entry) => sum + (entry.stat.minPhys ?? 0), 0) === 216 &&
    systemStats.enhancementStats.reduce((sum, entry) => sum + (entry.stat.maxPhys ?? 0), 0) === 432,
  "Unexpected Enhancement Physical Attack totals.",
);
assert(systemStats.talentStats.length === 57, "Talent stat entries must remain individually represented.");
assert(systemStats.qingheOddityStats.length === 29, "Qinghe Oddity stat entries must remain individually represented.");
assert(
  systemStats.kaifengOddityStats.length === 39,
  "Kaifeng Oddity stat entries must remain individually represented.",
);
assert(
  systemStats.imperialPalaceOddityStats.length === 10,
  "Imperial Palace Oddity stat entries must remain individually represented.",
);
assert(systemStats.hexiOddityStats.length === 24, "Hexi Oddity stat entries must remain individually represented.");
assert(
  systemStats.hiddenMountainOddityStats.length === 23,
  "Hidden Mountain Oddity stat entries must remain individually represented.",
);
assert(
  systemCharacter.power === 153 &&
    systemCharacter.agility === 153 &&
    systemCharacter.momentum === 153 &&
    systemCharacter.body === 153 &&
    systemCharacter.defense === 153,
  "Unexpected base attribute totals.",
);
assert(
  systemStats.baseStats.stat.precision === 0.65 && systemStats.levelBonusStats.stat.precision === 0.153,
  "Innate and level Precision must remain separate.",
);
assert(
  systemStats.levelBonusStats.stat.agility === 138 &&
    systemStats.levelBonusStats.stat.power === 138 &&
    systemStats.levelBonusStats.stat.momentum === 138 &&
    systemStats.levelBonusStats.stat.body === 138 &&
    systemStats.levelBonusStats.stat.defense === 138,
  "Level attribute bonuses must remain separate from innate stats.",
);
assert(Math.abs(systemCharacter.precision - 0.968) < 1e-9, "Unexpected system Precision total.");
assert(Math.abs(systemCharacter.crit - 0.35628) < 1e-9, "Unexpected system Critical total.");
assert(Math.abs(systemCharacter.affinity - 0.17814) < 1e-9, "Unexpected system Affinity total.");
assert(
  Math.abs(systemCharacter.critDmgBonus - 0.5) < 1e-9 && Math.abs(systemCharacter.affinityDmgBonus - 0.35) < 1e-9,
  "Unexpected innate and talent outcome damage totals.",
);
assert(
  Math.abs(systemCharacter.minPhys - 799.96) < 1e-9 && Math.abs(systemCharacter.maxPhys - 1468.38) < 1e-9,
  "Unexpected innate and system Physical Attack totals.",
);
assert(
  Math.abs(systemCharacter.physicalDefense - 214.41) < 1e-9 && systemCharacter.maxHp === 127860,
  "Unexpected system defensive totals.",
);
assert(
  systemCharacter.maxEndurance === 120 && systemCharacter.maxVitality === 100,
  "Unexpected innate and Oddity resource totals.",
);
const defaultCriticalEffects = [
  ...systemEffects,
  ...phalanxbaneMartialArt.talent.flatMap((talent) => talent.effect ?? []),
  { stat: presetEffects.stats },
  steadfastDevotion.effect.SteadfastDevotionT2.effect[0],
];
const defaultCritical = statEffects.calculateStatsWithEffects(statDefinitions.emptyStats, defaultCriticalEffects, 0)
  .stats.crit;
assert(Math.abs(defaultCritical - 1.13901088) < 1e-9, "Unexpected Fully Relayed Min Build Critical total.");
assert(
  defaultSetup.innerWays.length === 4 &&
    defaultSetup.innerWays.every((row) => row.innerWay !== "BreakingPoint" && row.tier === "T6"),
  "Unexpected default Inner Way selection.",
);
assert(
  defaultSetup.weaponSets.Cleftpeak === 4 &&
    defaultSetup.weaponSets.RainWhisper === 0 &&
    defaultSetup.armorSets.Formbend === 0,
  "Unexpected default set selection.",
);
assert(
  defaultSetup.bowRingSet === "Precision" &&
    defaultSetup.arsenal === "Stonesplit" &&
    defaultSetup.food === "SimmeringFishSlices",
  "Unexpected default setup choices.",
);
const cleftpeakZero = statEffects.calculateStatsWithEffects(
  statDefinitions.emptyStats,
  [gearSetDefinitions.Cleftpeak.options["0"].effect],
  0,
).stats;
const cleftpeakTwo = statEffects.calculateStatsWithEffects(
  statDefinitions.emptyStats,
  [gearSetDefinitions.Cleftpeak.options["2"].effect],
  0,
).stats;
const cleftpeakFour = statEffects.calculateStatsWithEffects(
  statDefinitions.emptyStats,
  [gearSetDefinitions.Cleftpeak.options["4"].effect],
  0,
).stats;
assert(
  cleftpeakTwo.minPhys - cleftpeakZero.minPhys === 78,
  "Cleftpeak 2-piece must add 78 minimum Physical Attack over 0-piece.",
);
assert(
  cleftpeakFour.minPhys === cleftpeakTwo.minPhys,
  "Cleftpeak 4-piece must keep the same static minimum Physical Attack as 2-piece.",
);

console.log("Gear, system-stat, equipped-effect, and stat-override checks passed.");
await viteServer.close();
