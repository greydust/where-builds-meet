import { assert, describe, it } from "vitest";

// Ported from script/probe/check-void-attack-path.mjs.
describe("void-attack-path", () => {
  it("void-attack-path checks", async () => {
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
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
  });
});
