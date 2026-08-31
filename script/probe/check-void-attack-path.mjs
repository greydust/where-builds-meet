import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const stats = {
    ...emptyStats,
    minBellstrike: 10,
    maxBellstrike: 20,
    minStonesplit: 30,
    maxStonesplit: 40,
    minSilkbind: 50,
    maxSilkbind: 60,
    minBamboocut: 70,
    maxBamboocut: 80,
    minVoidAttack: 5,
    maxVoidAttack: 10,
  };
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const strength = calculateDerivedStats(stats, 0, {}, ["snowparting", "phalanxbane"]);
  assert(
    strength.effectiveMinStonesplit === 35 &&
      strength.effectiveMaxStonesplit === 50 &&
      strength.effectiveMinSilkbind === 50 &&
      strength.effectiveMinBamboocut === 70,
    "Stonesplit paths must add Void Attack only to Stonesplit Attack.",
  );

  const kite = calculateDerivedStats(stats, 0, {}, ["heavenwill", "skygrasp"]);
  assert(
    kite.effectiveMinBamboocut === 75 &&
      kite.effectiveMaxBamboocut === 90 &&
      kite.effectiveMinStonesplit === 30 &&
      kite.effectiveMinSilkbind === 50,
    "Bamboocut paths must add Void Attack only to Bamboocut Attack.",
  );

  const deluge = calculateDerivedStats(stats, 0, {}, ["panaceaFan", "soulshadeUmbrella"]);
  assert(
    deluge.effectiveMinSilkbind === 55 &&
      deluge.effectiveMaxSilkbind === 70 &&
      deluge.effectiveMinStonesplit === 30 &&
      deluge.effectiveMinBamboocut === 70,
    "Silkbind paths must add Void Attack only to Silkbind Attack.",
  );

  const splendor = calculateDerivedStats(stats, 0, {}, ["namelessSword", "namelessSpear"]);
  assert(
    splendor.effectiveMinBellstrike === 15 &&
      splendor.effectiveMaxBellstrike === 30 &&
      splendor.effectiveMinStonesplit === 30 &&
      splendor.effectiveMinSilkbind === 50,
    "Bellstrike paths must add Void Attack only to Bellstrike Attack.",
  );

  console.log("Void Attack conversion follows the equipped path's main attribute.");
} finally {
  await viteServer.close();
}
