import { assert, describe, it } from "vitest";
import { readFile } from "node:fs/promises";
import ts from "typescript-classic";
import { build } from "esbuild";

// Ported from script/probe/check-gear.mjs.
describe("gear", () => {
  it("Gear inventory, equipped-effect, and persistence checks passed", async () => {
    // The build typechecks with TypeScript 7, whose package no longer exposes the
    // classic compiler API. These build-tool scripts keep using it via alias.

    const loadBundledModule = async (entryPoint) => {
      const bundled = await build({
        entryPoints: [entryPoint],
        bundle: true,
        format: "esm",
        platform: "node",
        target: "node22",
        define: { "import.meta.env.DEV": "false" },
        write: false,
      });
      const source = bundled.outputFiles[0].text;
      return import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
    };

    const gear = await import("../src/gear.ts");
    const damage = await loadBundledModule("./src/calculations/damage.ts");
    const statDefinitions = await loadBundledModule("./src/data/statDefinitions.ts");
    const breakthroughProfiles = (await import("../data/breakthrough.json")).default;

    const gearAffixSummary = gear.summarizeGearAffixes([
      {
        baseAffix: { key: "agility", value: 1 },
        additionalAffixes: [
          { key: "agility", value: 1 },
          { key: "minPhys", value: 1 },
        ],
        attunement: { key: "agility", value: 1 },
      },
      {
        baseAffix: { key: "minPhys", value: 1 },
        additionalAffixes: [{ key: "agility", value: 1 }],
        attunement: { key: "minPhys", value: 1 },
      },
    ]);
    assert(
      gearAffixSummary.total === 5 &&
        JSON.stringify(gearAffixSummary.affixes) ===
          JSON.stringify([
            { key: "agility", count: 3 },
            { key: "minPhys", count: 2 },
          ]),
      "Build affix summaries must count and sort equipped base and additional affixes without counting attunements.",
    );
    assert(
      gear.statRollsForLevel(breakthroughProfiles["16"].level) === gear.statRollsForLevel(96),
      "Enemy levels must select the matching stat roll table.",
    );
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
    const damageSource = ts.createSourceFile(
      "damage.ts",
      await readFile("src/calculations/damage.ts", "utf8"),
      ts.ScriptTarget.Latest,
      true,
    );
    const attunementType = damageSource.statements.find(
      (node) => ts.isTypeAliasDeclaration(node) && node.name.text === "AttunementStats",
    );
    assert(
      attunementType && ts.isTypeLiteralNode(attunementType.type),
      "AttunementStats must expose its input fields.",
    );
    const attunementStatKeys = new Set(attunementType.type.members.map((member) => member.name?.getText(damageSource)));

    assert(
      Object.keys(gear.attunementData).every((key) => attunementStatKeys.has(key)),
      "Every attunement definition ID must have a centralized AttunementStats input.",
    );
    assert(
      Object.entries(gear.attunementData)
        .filter(([, definition]) => definition.tags.includes("Armor") && Object.keys(definition.effect.stat).length > 0)
        .every(
          ([, definition]) =>
            (definition.effect.stat.attunementDMGBonus === 1 || definition.effect.stat.healingBonus === 1) &&
            definition.effect.tags.length > 0,
        ),
      "Active armor attunements must target tagged damage or healing bonuses.",
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
      gear.buildEntryAvailableForMartialArts(
        { id: preset.id, name: preset.name, isDefault: true, presetId: preset.id },
        ["snowparting", "phalanxbane"],
      ),
      "The Mixed fully-relayed preset must match its weapon pair.",
    );
    assert(
      gear.buildEntryAvailableForMartialArts(
        { id: preset.id, name: preset.name, isDefault: true, presetId: preset.id },
        ["phalanxbane", "snowparting"],
      ),
      "Build weapon-pair matching must not depend on left/right order.",
    );
    assert(
      !gear.buildEntryAvailableForMartialArts(
        { id: preset.id, name: preset.name, isDefault: true, presetId: preset.id },
        ["everspring", "unfettered"],
      ),
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
    const presetEntry = {
      id: preset.id,
      name: preset.name,
      isDefault: true,
      presetId: preset.id,
      martialArts: [...preset.martialArts],
    };
    const matchingPresetItem = {
      ...presetLeftWeapon,
      id: "existing-preset-match",
      baseAffix: { ...presetLeftWeapon.baseAffix },
      additionalAffixes: presetLeftWeapon.additionalAffixes.map((affix) => ({ ...affix })),
      attunement: { ...presetLeftWeapon.attunement },
    };
    const presetDuplicateState = gear.duplicateBuildState(
      { entries: [presetEntry], activeBuildId: preset.id, gearItems: [matchingPresetItem] },
      preset.id,
      { id: "preset-copy", name: "Preset Copy" },
    );
    const presetCopy = presetDuplicateState.entries.find((entry) => entry.id === "preset-copy");
    assert(
      presetCopy &&
        !presetCopy.isDefault &&
        presetCopy.equipped.leftWeapon === matchingPresetItem.id &&
        presetDuplicateState.gearItems.length === presetInventory.items.length &&
        JSON.stringify(presetCopy.setup) === JSON.stringify(gear.resolveBuildSetup(presetEntry)),
      "Duplicating a preset must create an editable build, reuse exact shared gear, materialize missing gear, and copy setup.",
    );
    const customDuplicateState = gear.duplicateBuildState(presetDuplicateState, presetCopy.id, {
      id: "custom-copy",
      name: "Custom Copy",
    });
    const customCopy = customDuplicateState.entries.find((entry) => entry.id === "custom-copy");
    assert(
      customCopy &&
        JSON.stringify(customCopy.equipped) === JSON.stringify(presetCopy.equipped) &&
        JSON.stringify(customCopy.setup) === JSON.stringify(presetCopy.setup) &&
        customDuplicateState.gearItems.length === presetDuplicateState.gearItems.length,
      "Duplicating a custom build must reuse every equipped item and copy all setup selections without adding gear.",
    );
    assert(
      Math.abs(gear.maxGearRoll("minPhys", "affix", true) - gear.maxGearRoll("minPhys", "affix", false) * 0.94) < 1e-9,
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
      ["minBellstrike", "maxStonesplit", "minSilkbind", "maxBamboocut"].every((key) =>
        relayedWeaponAffixes.includes(key),
      ),
      "Tier 96 relayed weapons must expose every min/max attribute attack.",
    );
    assert(
      gear.maxGearRoll("maxBellstrike", "affix", true, 96) === gear.maxGearRoll("maxVoidAttack", "affix", true, 96),
      "Relayed attribute attack must share the Tier 96 Void Attack roll.",
    );
    assert(
      gear.clampGearRoll("minPhys", 1e6, "affix", false) === gear.maxGearRoll("minPhys", "affix", false),
      "Normal affix input must clamp to its level roll.",
    );
    assert(
      Math.abs(
        gear.clampGearRoll("minPhys", gear.maxGearRoll("minPhys", "affix", false), "affix", true) -
          gear.maxGearRoll("minPhys", "affix", true),
      ) < 1e-9,
      "Enabling Relayed must clamp an existing affix to 94%.",
    );
    assert(
      gear.clampGearRoll("physicalPenetration", 1e6, "attunement", true) ===
        gear.maxGearRoll("physicalPenetration", "attunement", true),
      "Relayed attunement input must retain its full cap.",
    );
    assert(gear.clampGearRoll("minPhys", 60, "affix", true) === 60, "Values below the cap must remain unchanged.");
    assert(
      Math.abs(
        gear.maxGearRoll("minPhys", "affix", true, 91) - gear.maxGearRoll("minPhys", "affix", false, 91) * 0.94,
      ) < 1e-9,
      "Level 91 relayed affixes must use 94% of the level 91 roll.",
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
    const duplicateInventoryJson = JSON.stringify({
      items: [duplicatedItem],
      equipped: { leftWeapon: duplicatedItem.id },
    });
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

    // The persistence boundary reads browser storage through window.
    globalThis.window = {
      get localStorage() {
        return globalThis.localStorage;
      },
      get sessionStorage() {
        return globalThis.sessionStorage;
      },
    };

    const legacyHengBlade = { ...hengBlade, slot: "leftWeapon" };
    const legacyInventoryJson = JSON.stringify({
      items: [legacyHengBlade],
      equipped: { leftWeapon: legacyHengBlade.id },
    });
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
    const firstImportedBuild = mergedImport.state.entries.find(
      (entry) => entry.id === mergedImport.importedBuildIds[0],
    );
    const secondImportedBuild = mergedImport.state.entries.find(
      (entry) => entry.id === mergedImport.importedBuildIds[1],
    );
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
      builds: exportedBuildState.builds.map(({ setup: _setup, martialArts, ...entry }) =>
        Object.assign(entry, { weapons: martialArts }),
      ),
    };
    const migratedTransfer = gear.mergeImportedBuildState(sharedBuildState, legacyTransfer);
    assert(
      migratedTransfer.importedGearCount === 1 &&
        !("slot" in migratedTransfer.state.gearItems.at(-1)) &&
        migratedTransfer.state.entries.find((entry) => entry.id === migratedTransfer.importedBuildIds[0]).martialArts
          .length === 2 &&
        migratedTransfer.state.entries.find((entry) => entry.id === migratedTransfer.importedBuildIds[0]).setup
          .arsenal === gear.defaultBuildSetup.arsenal,
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
      { phyCoef: 1, attrCoef: 1 },
      { ...damageContext, skillTags: ["Mystic"] },
    ).total;
    const singleTargetDamage = damage.calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...damageContext, skillTags: ["Mystic", "SingleTargetMystic"] },
    ).total;
    const areaDamage = damage.calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...damageContext, skillTags: ["Mystic", "AreaMystic"] },
    ).total;
    assert(
      Math.abs(singleTargetDamage / baselineDamage - 1.1) < 1e-9,
      "Single-Target Mystic bonus did not apply only to its matching tag.",
    );
    assert(
      Math.abs(areaDamage / baselineDamage - 1.2) < 1e-9,
      "Area Mystic bonus did not apply only to its matching tag.",
    );

    delete globalThis.window;
  });
});
