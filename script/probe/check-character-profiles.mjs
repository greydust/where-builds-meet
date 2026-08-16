import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { characterProfileMatches, exportCharacterProfiles, mergeImportedCharacterProfiles, parseCharacterProfiles } =
    await viteServer.ssrLoadModule("/src/characterProfiles.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const parsed = parseCharacterProfiles([
    {
      id: "profile-1",
      name: " Test Profile ",
      statOverrides: { minPhys: 123, unknownStat: 999, maxPhys: Number.NaN },
      attunementOverrides: { physicalPenetration: 0.051, unknownAttunement: 2 },
      innerWays: [
        { innerWay: "FrostCladNight", tier: "T6" },
        { innerWay: "MoraleChant", tier: "T5" },
        { innerWay: "SteadfastDevotion", tier: "T4" },
        { innerWay: "ThroatPiercingArt", tier: "T3" },
      ],
      buildSetup: { gearSets: { Cleftpeak: 2, RainWhisper: 2 }, bowRingSet: "Precision", arsenal: "Stonesplit" },
      food: "SimmeringFishSlices",
      divinecraft: "FireWater",
      globalDebuffs: { phantomChime: true },
    },
  ]);
  assert(parsed.length === 1 && parsed[0].name === "Test Profile", "Profiles must load with a trimmed name.");
  assert(
    parsed[0].statOverrides.minPhys === 123 &&
      !("unknownStat" in parsed[0].statOverrides) &&
      !("maxPhys" in parsed[0].statOverrides),
    "Only finite known character overrides may load.",
  );
  assert(
    parsed[0].attunementOverrides.physicalPenetration === 0.051 &&
      !("unknownAttunement" in parsed[0].attunementOverrides),
    "Only finite known attunement overrides may load.",
  );
  assert(
    !("food" in parsed[0]) && !("divinecraft" in parsed[0]) && !("globalDebuffs" in parsed[0]),
    "Legacy independent setup selections must be discarded from character profiles.",
  );
  assert(
    parsed[0].buildSetup.weaponSets.Cleftpeak === 2 && parsed[0].buildSetup.armorSets.Formbend === 0,
    "Legacy gearSets must migrate to weaponSets while armor sets receive their default.",
  );
  assert(
    characterProfileMatches(parsed[0], {
      statOverrides: { minPhys: 123 },
      attunementOverrides: { physicalPenetration: 0.051 },
      innerWays: parsed[0].innerWays.map((row) => ({ ...row })),
      buildSetup: {
        ...parsed[0].buildSetup,
        innerWays: parsed[0].innerWays.map((row) => ({ ...row })),
        weaponSets: { ...parsed[0].buildSetup.weaponSets },
        armorSets: { ...parsed[0].buildSetup.armorSets },
      },
    }),
    "Profile matching must include every profile-owned Main-tab selection.",
  );

  const exported = JSON.parse(exportCharacterProfiles(parsed));
  assert(
    exported.version === 4 &&
      exported.profiles[0].buildSetup.innerWays.length === 4 &&
      exported.profiles[0].buildSetup.weaponSets.Cleftpeak === 2 &&
      exported.profiles[0].buildSetup.armorSets.Formbend === 0 &&
      !("food" in exported.profiles[0]) &&
      !("divinecraft" in exported.profiles[0]) &&
      !("globalDebuffs" in exported.profiles[0]),
    "Profile export v4 must include build-backed setup selections but omit independent session controls.",
  );
  const merged = mergeImportedCharacterProfiles(parsed, exported);
  assert(merged.importedCount === 1 && merged.profiles.length === 2, "Import must append valid profiles.");
  assert(merged.profiles[1].id !== parsed[0].id, "Import must remap a colliding profile ID.");
  const migrated = mergeImportedCharacterProfiles([], {
    format: exported.format,
    version: 1,
    profiles: [{ id: "legacy", name: "Legacy", statOverrides: { minPhys: 99 }, attunementOverrides: {} }],
  });
  assert(
    migrated.profiles[0].innerWays.length === 4 &&
      !("food" in migrated.profiles[0]) &&
      !("divinecraft" in migrated.profiles[0]),
    "Version 1 profiles must migrate while omitting independent session controls.",
  );
  console.log("Character profile validation, matching, export, and collision-safe import checks passed.");
} finally {
  await viteServer.close();
}
