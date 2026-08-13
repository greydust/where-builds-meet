import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { characterProfileMatches, exportCharacterProfiles, mergeImportedCharacterProfiles, parseCharacterProfiles } = await viteServer.ssrLoadModule("/src/characterProfiles.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const parsed = parseCharacterProfiles([{
    id: "profile-1",
    name: " Test Profile ",
    statOverrides: { minPhys: 123, unknownStat: 999, maxPhys: Number.NaN },
    attunementOverrides: { physicalPenetration: 0.051, unknownAttunement: 2 },
    innerWays: [{ innerWay: "FrostCladNight", tier: "T6" }, { innerWay: "MoraleChant", tier: "T5" }, { innerWay: "SteadfastDevotion", tier: "T4" }, { innerWay: "ThroatPiercingArt", tier: "T3" }],
    buildSetup: { gearSets: { Cleftpeak: 2, RainWhisper: 2 }, bowRingSet: "Precision", arsenal: "Stonesplit" },
    food: "SimmeringFishSlices",
    divinecraft: "FireWater",
  }]);
  assert(parsed.length === 1 && parsed[0].name === "Test Profile", "Profiles must load with a trimmed name.");
  assert(parsed[0].statOverrides.minPhys === 123 && !("unknownStat" in parsed[0].statOverrides) && !("maxPhys" in parsed[0].statOverrides), "Only finite known character overrides may load.");
  assert(parsed[0].attunementOverrides.physicalPenetration === 0.051 && !("unknownAttunement" in parsed[0].attunementOverrides), "Only finite known attunement overrides may load.");
  assert(characterProfileMatches(parsed[0], { statOverrides: { minPhys: 123 }, attunementOverrides: { physicalPenetration: 0.051 }, innerWays: parsed[0].innerWays.map((row) => ({ ...row })), buildSetup: { ...parsed[0].buildSetup, gearSets: { ...parsed[0].buildSetup.gearSets } }, food: parsed[0].food, divinecraft: parsed[0].divinecraft }), "Profile matching must include overrides and every saved Main-tab selection.");

  const exported = JSON.parse(exportCharacterProfiles(parsed));
  assert(exported.version === 2 && exported.profiles[0].buildSetup.gearSets.Cleftpeak === 2, "Profile export v2 must include Main-tab setup selections.");
  const merged = mergeImportedCharacterProfiles(parsed, exported);
  assert(merged.importedCount === 1 && merged.profiles.length === 2, "Import must append valid profiles.");
  assert(merged.profiles[1].id !== parsed[0].id, "Import must remap a colliding profile ID.");
  const migrated = mergeImportedCharacterProfiles([], { format: exported.format, version: 1, profiles: [{ id: "legacy", name: "Legacy", statOverrides: { minPhys: 99 }, attunementOverrides: {} }] });
  assert(migrated.profiles[0].innerWays.length === 4 && migrated.profiles[0].food === "SimmeringFishSlices" && migrated.profiles[0].divinecraft === "Fire", "Version 1 profiles must migrate with configured default Main-tab setup.");
  console.log("Character profile validation, matching, export, and collision-safe import checks passed.");
} finally {
  await viteServer.close();
}
