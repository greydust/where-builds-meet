import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, minStonesplit: 100, maxStonesplit: 100, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const baseContext = { stats, attunement: {}, skillTags: [], weapons: [], buffs: [], enemy, derivedStats: calculateDerivedStats(stats, 0), effects: [] };
  const damage = (effects, nextStats = stats) => calculateDamageBreakdown({ phyCoef: 1 }, { ...baseContext, stats: nextStats, derivedStats: calculateDerivedStats(nextStats, 0), effects });
  const baseline = damage([]);
  const globalHp = damage([{ globalHPDMGBonus: 0.08 }]);
  assert(closeTo(globalHp.physical / baseline.physical, 1.08) && closeTo(globalHp.bellstrike / baseline.bellstrike, 1.08) && closeTo(globalHp.stonesplit / baseline.stonesplit, 1.08), "Global HP DMG Bonus must multiply every damage component.");
  const bellstrikeOnly = damage([{ globalBellstrikeDMGBonus: 0.08 }]);
  assert(closeTo(bellstrikeOnly.physical, baseline.physical) && closeTo(bellstrikeOnly.stonesplit, baseline.stonesplit) && closeTo(bellstrikeOnly.bellstrike / baseline.bellstrike, 1.08), "Global Bellstrike DMG Bonus must multiply Bellstrike only.");
  const combinedGlobal = damage([{ globalDmgBonus: 0.1, globalHPDMGBonus: 0.08, globalBellstrikeDMGBonus: 0.08 }]);
  assert(closeTo(combinedGlobal.physical / baseline.physical, 1.18) && closeTo(combinedGlobal.bellstrike / baseline.bellstrike, 1.26), "Global-category effects must add before forming their channel multiplier.");
  const bellstrikeStat = damage([], { ...stats, bellstrikeDmgBonus: 0.08 });
  const bothCategories = damage([{ globalBellstrikeDMGBonus: 0.08 }], { ...stats, bellstrikeDmgBonus: 0.08 });
  assert(closeTo(bothCategories.bellstrike / baseline.bellstrike, 1.08 * 1.08) && closeTo(bellstrikeStat.bellstrike / baseline.bellstrike, 1.08), "Character Bellstrike DMG Bonus must multiply separately from its global channel bonus.");
  console.log("Global HP and Bellstrike channel bonus formula checks passed.");
} finally {
  await viteServer.close();
}
