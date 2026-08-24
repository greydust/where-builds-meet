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
  const detail = (baseAttrs, baseAffixes, extra = {}) => ({ exVo: { ...extra, baseAttrs, baseAffixes } });
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
      affixMap["280702"] === "physicalResistance" &&
      affixMap["280201"] === "thundercryShieldBoost" &&
      affixMap["280202"] === "thundercryChargedBoost" &&
      affixMap["280203"] === "thundercrySpecialBoost" &&
      affixMap["280204"] === "stormbreakerChargedBoost" &&
      affixMap["280205"] === "stormbreakerSpecialBoost" &&
      affixMap["280601"] === "everspringMartialBoost",
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
    profileMap.martialArts["20401"].weapon === "thundercry" &&
      profileMap.martialArts["20103"].weapon === "stormbreaker",
    "Observed Stonesplit - Might martial-art IDs must map to their supported weapon definitions.",
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
      profileMap.innerWays["601"].innerWay === "SoaringHigh" &&
      profileMap.innerWays["82"].name === "Seasonal Edge" &&
      profileMap.innerWays["603"].name === "Empirical Edge" &&
      profileMap.innerWays["603"].innerWay === "EmpiricalEdge" &&
      profileMap.innerWays["602"].name === "Sky Gripped" &&
      profileMap.innerWays["602"].innerWay === "SkyGripped" &&
      profileMap.weaponSets["56"].weaponSet === "Etherwrath",
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
  const kiteSetupShape = importer.parseOfficialGearExport(
    {
      roleName: "Kite Setup",
      kongfuMain: 20901,
      kongfuSub: 20703,
      passiveSlots: [81, 601, 602, 603],
      wearEquipsDetailed: {
        1: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [actualRow(9713006, 40.5)], { suffix: 56 }),
        2: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [actualRow(9713002, 72.6)], { suffix: 56 }),
        10: detail({ MIN_W_ATK: 86 }, [actualRow(9733002, 73.1)], { suffix: 56 }),
        11: detail({ MAX_W_ATK: 129 }, [actualRow(9733002, 57.1)], { suffix: 56 }),
      },
    },
    ["snowparting", "phalanxbane"],
  );
  const kiteSetup = kiteSetupShape.exportValue.builds[0].setup;
  assert(
    JSON.stringify(kiteSetup.innerWays) ===
      JSON.stringify([
        { innerWay: "MoraleChant", tier: "T6" },
        { innerWay: "SoaringHigh", tier: "T6" },
        { innerWay: "SkyGripped", tier: "T6" },
        { innerWay: "EmpiricalEdge", tier: "T6" },
      ]) && kiteSetup.weaponSets.Etherwrath === 4,
    "Kite passive slots and four suffix-56 weapon-side pieces must import as T6 Inner Ways and Etherwrath 4-piece.",
  );
  const mightDashboardShape = importer.parseOfficialGearExport(
    {
      source: "wwm-dashboard",
      v: 2,
      roleInfo: {
        roleName: "Might Dashboard Shape",
        kongfuMain: 20401,
        kongfuSub: 20103,
        wearEquipsDetailed: {
          1: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [actualRow(9713002, 73)]),
          2: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [actualRow(9713002, 72.6)]),
          3: detail({ W_DEF: 22, HP_MAX: 5774 }, [actualRow(9743004, 0.0846), actualRow(280202, 0.059)]),
        },
      },
    },
    ["snowparting", "phalanxbane"],
  );
  const mightBuild = mightDashboardShape.exportValue.builds[0];
  const mightItems = new Map(mightDashboardShape.exportValue.gearItems.map((item) => [item.id, item]));
  assert(
    JSON.stringify(mightDashboardShape.weapons) === JSON.stringify(["thundercry", "stormbreaker"]) &&
      JSON.stringify(mightBuild.martialArts) === JSON.stringify(["thundercry", "stormbreaker"]) &&
      mightItems.get(mightBuild.equipped.leftWeapon)?.definitionId === "moBlade" &&
      mightItems.get(mightBuild.equipped.rightWeapon)?.definitionId === "spear" &&
      mightItems.get(mightBuild.equipped.helmet)?.attunement?.key === "thundercryChargedBoost",
    "Official Might IDs must import as left Thundercry Blade, right Stormbreaker Spear, and Thundercry Charged armor.",
  );
  for (const [statId, expectedKey] of [
    [280201, "thundercryShieldBoost"],
    [280202, "thundercryChargedBoost"],
    [280203, "thundercrySpecialBoost"],
    [280204, "stormbreakerChargedBoost"],
    [280205, "stormbreakerSpecialBoost"],
  ]) {
    const parsedAttunement = importer.parseOfficialGearExport(
      {
        roleName: `Might Attunement ${statId}`,
        wearEquipsDetailed: {
          3: detail({ W_DEF: 22, HP_MAX: 5774 }, [actualRow(9743004, 0.0846), actualRow(statId, 0.06)]),
        },
      },
      ["thundercry", "stormbreaker"],
    ).exportValue.gearItems[0]?.attunement?.key;
    assert(parsedAttunement === expectedKey, `Official Might attunement ${statId} must import as ${expectedKey}.`);
  }
  const dustMartialAttunement = importer.parseOfficialGearExport(
    {
      roleName: "Dust Martial Attunement",
      wearEquipsDetailed: {
        3: detail({ W_DEF: 22, HP_MAX: 5774 }, [actualRow(9743004, 0.0846), actualRow(280601, 0.06)]),
      },
    },
    ["everspring", "unfettered"],
  ).exportValue.gearItems[0]?.attunement?.key;
  assert(
    dustMartialAttunement === "everspringMartialBoost",
    "Official Dust attunement 280601 must import as Everspring Martial Art Skill DMG Boost.",
  );
  const relayedHengBlade = importer.parseOfficialGearExport(
    {
      roleInfo: {
        roleName: "Relayed Heng Probe",
        kongfuMain: 20801,
        kongfuSub: 20402,
        wearEquipsDetailed: {
          1: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [
            actualRow(9713001, 73.132),
            actualRow(9793007, 73.132),
            actualRow(9793004, 46.436),
            actualRow(9793012, 0.0752),
            actualRow(9793026, 41.548),
            actualRow(280701, 10.3),
          ]),
        },
      },
    },
    ["snowparting", "phalanxbane"],
  );
  assert(
    relayedHengBlade.exportValue.gearItems[0].relayed === true &&
      relayedHengBlade.exportValue.gearItems[0].additionalAffixes.some(
        (affix) => affix.key === "maxStonesplit" && affix.value === 41.548,
      ) &&
      relayedHengBlade.warnings.length === 0,
    "A relay-only official affix must identify relayed gear even when the dashboard omits an explicit relay field.",
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
  const defensiveAdditionalAffix = importer.parseOfficialGearExport(
    {
      roleName: "Gauntlet Defense Probe",
      wearEquipsDetailed: {
        1: detail({ MIN_W_ATK: 65, MAX_W_ATK: 151 }, [
          actualRow(9713004, 40.6),
          actualRow(9793003, 49.4),
          actualRow(9793004, 46.436),
          actualRow(9793031, 0.06),
          actualRow(280703, 10.2),
        ]),
      },
    },
    ["heavenwill", "skygrasp"],
  );
  assert(
    defensiveAdditionalAffix.exportValue.gearItems[0].additionalAffixes.some((affix) => affix.key === "defense") &&
      defensiveAdditionalAffix.exportValue.gearItems[0].additionalAffixes.some(
        (affix) => affix.key === "gauntletDmgBoost" && affix.value === 0.06,
      ) &&
      defensiveAdditionalAffix.warnings.length === 0,
    "Official weapon Defense and Art of Gauntlet rolls must import as canonical additional affixes.",
  );
  const kiteArmor = importer.parseOfficialGearExport(
    {
      source: "wwm-dashboard",
      v: 2,
      roleInfo: {
        roleName: "Kite Probe",
        kongfuMain: 20901,
        kongfuSub: 20703,
        wearEquipsDetailed: {
          3: detail({ W_DEF: 22, HP_MAX: 5774 }, [
            actualRow(9743004, 0.076),
            actualRow(9793104, 49.3),
            actualRow(279755, 0.055),
          ]),
          4: detail({ W_DEF: 22, HP_MAX: 11547 }, [
            actualRow(9743004, 0.082),
            actualRow(9793107, 74.3),
            actualRow(279751, 0.054),
          ]),
          5: detail({ W_DEF: 44, HP_MAX: 5774 }, [
            actualRow(9753003, 0.08),
            actualRow(9793103, 46.2),
            actualRow(279753, 0.039),
          ]),
          8: detail({ W_DEF: 22, HP_MAX: 5774 }, [
            actualRow(9753003, 0.08),
            actualRow(9793104, 49.3),
            actualRow(279752, 0.054),
          ]),
        },
      },
    },
    ["snowparting", "phalanxbane"],
  );
  const kiteItems = new Map(kiteArmor.exportValue.gearItems.map((item) => [item.slot, item]));
  assert(
    kiteArmor.warnings.length === 0 &&
      kiteItems.get("helmet")?.attunement?.key === "skygraspSpecialBoost" &&
      kiteItems.get("chestpiece")?.attunement?.key === "heavenwillChargedBoost" &&
      kiteItems.get("greaves")?.additionalAffixes.some((affix) => affix.key === "body") &&
      kiteItems.get("greaves")?.attunement?.key === "heavenwillLightVariedComboBoost" &&
      kiteItems.get("bracer")?.attunement?.key === "heavenwillMartialBoost",
    "Observed Kite armor IDs must import as Body and the matching Kite attunements.",
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
