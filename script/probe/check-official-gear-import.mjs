import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const importer = await viteServer.ssrLoadModule("/src/officialGearImport.ts");
  const bookmarklet = await viteServer.ssrLoadModule("/src/officialGearBookmarklet.ts");
  const gear = await viteServer.ssrLoadModule("/src/gear.ts");
  const affixMap = (await viteServer.ssrLoadModule("/data/official/affix-map.json")).default;
  const profileMap = (await viteServer.ssrLoadModule("/data/official/profile-map.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  assert(
    bookmarklet.officialGearBookmarklet.startsWith("javascript:"),
    "The dashboard exporter must be a draggable JavaScript bookmark.",
  );
  new Function(decodeURIComponent(bookmarklet.officialGearBookmarklet.slice("javascript:".length)));
  const statId = (key) => Object.keys(affixMap).find((id) => affixMap[id] === key);
  const row = (key, value) => ({ equipmentDetails: [statId(key), value, 5, 0, true] });
  const weaponRows = (art) => [
    row("minPhys", 53),
    row("minPhys", 60),
    row("agility", 40),
    row(art, 5.2),
    row("maxStonesplit", 36.2),
    row("physicalPenetration", 9),
  ];
  const accessoryRows = [
    row("minPhys", 60),
    row("minPhys", 60),
    row("agility", 40),
    row("allMartialArts", 2.6),
    row("maxStonesplit", 36.2),
    row("physicalPenetration", 9),
  ];
  const armorRows = [
    row("precision", 6.6),
    row("minPhys", 60),
    row("agility", 40),
    row("crit", 7.4),
    row("maxStonesplit", 36.2),
    row("phalanxbaneChargedBoost", 5),
  ];
  const detail = (baseAttrs, baseAffixes) => ({ exVo: { baseAttrs, baseAffixes } });
  const pasted = {
    source: "wwm-dashboard",
    v: 1,
    roleName: "Probe Character",
    wearEquipsDetailed: {
      1: detail({ MIN_W_ATK: 53, MAX_W_ATK: 124 }, weaponRows("hengBladeDmgBoost")),
      2: detail({ MIN_W_ATK: 53, MAX_W_ATK: 124 }, weaponRows("moBladeDmgBoost")),
      3: detail({ HP_MAX: 4614, W_DEF: 18 }, armorRows),
      4: detail({ HP_MAX: 9227, W_DEF: 18 }, armorRows),
      5: detail({ HP_MAX: 4614, W_DEF: 36 }, armorRows),
      8: detail({ HP_MAX: 4614, W_DEF: 18 }, armorRows),
      10: detail({ MIN_W_ATK: 71 }, accessoryRows),
      11: detail({ MAX_W_ATK: 106 }, accessoryRows),
      21: detail({}, []),
    },
  };

  const parsed = importer.parseOfficialGearExport(pasted, ["snowparting", "phalanxbane"]);
  assert(
    parsed.gearCount === 8 && parsed.roleName === "Probe Character",
    "The official import must include only the eight supported gear slots.",
  );
  assert(parsed.warnings.length === 0, "Known base signatures must infer level and rarity without warnings.");
  const merged = gear.mergeImportedBuildState({ entries: [], activeBuildId: "", gearItems: [] }, parsed.exportValue);
  assert(
    merged.importedGearCount === 8 && merged.importedBuildCount === 1,
    "Official gear must pass the normal build validation pipeline.",
  );
  const build = merged.state.entries[0];
  assert(
    Object.keys(build.equipped).length === 8 && build.name === "Probe Character Import",
    "The imported build must equip every imported piece under the character import name.",
  );
  assert(
    merged.state.gearItems.every((item) => item.level === 91 && item.rarity === "Gold"),
    "Base signatures must infer Tier 91 Gold gear.",
  );
  assert(
    merged.state.gearItems
      .find((item) => item.definitionId === "hengBlade")
      ?.additionalAffixes.some((affix) => affix.key === "hengBladeDmgBoost"),
    "Official stat IDs must translate to internal affix keys.",
  );
  const tier96Purple = importer.parseOfficialGearExport(
    {
      roleName: "Purple Probe",
      wearEquipsDetailed: {
        1: {
          exVo: {
            baseAttrs: { MIN_W_ATK: 59, MAX_W_ATK: 136 },
            baseAffixes: weaponRows("hengBladeDmgBoost"),
            relaying: true,
          },
        },
      },
    },
    ["snowparting", "phalanxbane"],
  );
  assert(
    tier96Purple.exportValue.gearItems[0].level === 96 &&
      tier96Purple.exportValue.gearItems[0].rarity === "Purple" &&
      tier96Purple.exportValue.gearItems[0].relayed === true &&
      tier96Purple.warnings.length === 0,
    "Current Tier 96 base stats and relaying marker must import without a fallback.",
  );
  assert(
    affixMap["9713001"] === "minPhys" &&
      affixMap["9793017"] === "moBladeDmgBoost" &&
      affixMap["280702"] === "physicalResistance",
    "Known dashboard IDs must use this project's canonical keys.",
  );
  assert(
    profileMap.martialArts["20402"].weapon === "phalanxbane" &&
      profileMap.martialArts["20801"].weapon === "snowparting",
    "Observed official martial-art IDs must map to supported weapon definitions.",
  );
  assert(
    profileMap.martialArts["20901"].weapon === "heavenwill" && profileMap.martialArts["20703"].weapon === "skygrasp",
    "Observed Bamboocut - Kite martial-art IDs must map to their supported weapon definitions.",
  );
  assert(
    profileMap.innerWays["551"].innerWay === "FrostCladNight" &&
      profileMap.innerWays["81"].innerWay === "MoraleChant" &&
      profileMap.innerWays["553"].innerWay === "SteadfastDevotion" &&
      profileMap.innerWays["552"].innerWay === "ThroatPiercingArt" &&
      profileMap.innerWays["4"].name === "Shadow Assault" &&
      profileMap.innerWays["6"].name === "Sandswirl Tail",
    "Observed passiveSlots IDs must retain their Inner Way names.",
  );
  assert(
    profileMap.innerWays["42"].name === "Bitter Seasons" &&
      profileMap.innerWays["47"].name === "Light and Shadow Alike" &&
      profileMap.innerWays["5"].name === "Fivefold Bleed" &&
      profileMap.innerWays["41"].innerWay === "EnvigoratedWarrior",
    "Observed Bamboocut - Kite passiveSlots IDs must retain their Inner Way mappings.",
  );
  assert(
    profileMap.innerWays["601"].name === "Soaring High" &&
      profileMap.innerWays["82"].name === "Seasonal Edge" &&
      profileMap.innerWays["603"].name === "Empirical Edge" &&
      profileMap.innerWays["602"].name === "Sky Gripped",
    "The second observed Bamboocut - Kite passiveSlots set must retain its Inner Way names.",
  );
  const actualRow = (id, value) => ({ equipmentDetails: [id, value, 0.94, 3, true] });
  const dashboardShape = importer.parseOfficialGearExport(
    {
      source: "wwm-dashboard",
      v: 2,
      roleInfo: {
        roleName: "Dashboard Shape",
        kongfuMain: 20402,
        kongfuSub: 20801,
        passiveSlots: [551, 81, 553, 552],
        wearEquipsDetailed: {
          1: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [
            actualRow(9713001, 62),
            actualRow(9793004, 46.436),
            actualRow(9793007, 71.9),
            actualRow(9793011, 41.548),
            actualRow(9793017, 0.05828),
            actualRow(280703, 10.2),
          ]),
          10: detail({ MIN_W_ATK: 86 }, [
            actualRow(9733001, 61.8),
            actualRow(9793111, 43.6),
            actualRow(9793112, 41.6),
            actualRow(9793107, 73.8),
            actualRow(9793104, 49.2),
            actualRow(280702, 10),
          ]),
        },
      },
    },
    ["snowparting", "phalanxbane"],
  );
  const importedDisc = dashboardShape.exportValue.gearItems.find((item) => item.definitionId === "disc");
  assert(
    dashboardShape.gearCount === 2 &&
      dashboardShape.exportValue.gearItems.some((item) => item.definitionId === "moBlade") &&
      importedDisc?.attunement.key === "physicalResistance",
    "Dashboard equipmentDetails rows, weapon-specific affixes, and defensive accessory attunements must import.",
  );
  assert(
    JSON.stringify(dashboardShape.exportValue.builds[0].martialArts) === JSON.stringify(["snowparting", "phalanxbane"]),
    "The imported build must preserve the current order when it uses the same weapon pair.",
  );
  assert(
    JSON.stringify(dashboardShape.weapons) === JSON.stringify(["snowparting", "phalanxbane"]),
    "Importing the same weapon pair must not change the global weapon filter.",
  );
  const dashboardBuild = dashboardShape.exportValue.builds[0];
  const dashboardItems = new Map(dashboardShape.exportValue.gearItems.map((item) => [item.id, item]));
  assert(
    dashboardItems.get(dashboardBuild.equipped.rightWeapon)?.definitionId === "moBlade",
    "A dashboard Mo Blade must be equipped in the matching current weapon slot.",
  );
  const unattunedWeapon = importer.parseOfficialGearExport(
    {
      roleName: "Unattuned Probe",
      wearEquipsDetailed: { 1: detail({ MIN_W_ATK: 53, MAX_W_ATK: 124 }, weaponRows("hengBladeDmgBoost").slice(0, 5)) },
    },
    ["snowparting", "phalanxbane"],
  );
  assert(
    unattunedWeapon.exportValue.gearItems[0].additionalAffixes.length === 4 &&
      unattunedWeapon.exportValue.gearItems[0].attunement === undefined,
    "Official gear with no attunement row must import without inventing an attunement.",
  );
  const unattunedMerge = gear.mergeImportedBuildState(
    { entries: [], activeBuildId: "", gearItems: [] },
    unattunedWeapon.exportValue,
  );
  assert(
    unattunedMerge.importedGearCount === 1 && unattunedMerge.state.gearItems[0].attunement === undefined,
    "The normal build validator must preserve imported gear without an attunement.",
  );
  const unsupportedAdditionalAffix = importer.parseOfficialGearExport(
    {
      roleName: "Unsupported Affix Probe",
      wearEquipsDetailed: {
        1: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [
          actualRow(9713001, 62),
          actualRow(9793003, 49.4),
          actualRow(9793004, 46.436),
          actualRow(280703, 10.2),
        ]),
      },
    },
    ["snowparting", "phalanxbane"],
  );
  assert(
    unsupportedAdditionalAffix.exportValue.gearItems[0].additionalAffixes.length === 1 &&
      unsupportedAdditionalAffix.warnings.some((warning) => warning.includes("9793003")),
    "Unsupported additional affixes must be skipped with a diagnostic warning instead of rejecting the import.",
  );
  let unsupportedMartialArtError = "";
  try {
    importer.parseOfficialGearExport(
      {
        source: "wwm-dashboard",
        v: 2,
        roleInfo: {
          roleName: "Unsupported Probe",
          kongfuMain: 20801,
          kongfuSub: 10301,
          wearEquipsDetailed: { 1: detail({ MIN_W_ATK: 53, MAX_W_ATK: 124 }, weaponRows("hengBladeDmgBoost")) },
        },
      },
      ["snowparting", "phalanxbane"],
    );
  } catch (error) {
    unsupportedMartialArtError = error instanceof Error ? error.message : String(error);
  }
  assert(
    unsupportedMartialArtError.includes("Panacea Fan") && unsupportedMartialArtError.includes("not supported"),
    "A known unsupported official martial art must produce a clear import error.",
  );
  const firstOfficialMerge = gear.mergeImportedBuildState(
    { entries: [], activeBuildId: "", gearItems: [] },
    dashboardShape.exportValue,
    { reuseIdenticalGear: true },
  );
  const secondOfficialMerge = gear.mergeImportedBuildState(firstOfficialMerge.state, dashboardShape.exportValue, {
    reuseIdenticalGear: true,
  });
  assert(
    secondOfficialMerge.importedGearCount === 0 &&
      secondOfficialMerge.reusedGearCount === 2 &&
      secondOfficialMerge.importedBuildCount === 1,
    "Repeated official imports must reuse exactly matching shared gear while creating a new build.",
  );
  assert(
    secondOfficialMerge.state.entries[1].equipped.leftWeapon ===
      firstOfficialMerge.state.entries[0].equipped.leftWeapon,
    "A reused gear item must be referenced by the new build.",
  );
  console.log("Official dashboard gear parsing and additive build import checks passed.");
} finally {
  await viteServer.close();
}
