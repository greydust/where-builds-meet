import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const charms = (await viteServer.ssrLoadModule("/data/debuff/innerway.json")).default;
  const phantomChime = (await viteServer.ssrLoadModule("/data/debuff/bamboocut-dust.json")).default.PhantomChime;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 408, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const baseContext = { stats, attunement: {}, skillTags: [], weapons: [], buffs: [], enemy, derivedStats: calculateDerivedStats(stats, 0), effects: [] };
  const damage = (effects) => calculateDamageBreakdown({ phyCoef: 1 }, { ...baseContext, effects }).physical;
  const baseline = damage([]);
  const reducedDefense = damage([{ defenseBonus: -0.06 }]);
  const reducedResistance = damage([{ physicalResistance: -10 }]);
  const combined = damage([{ defenseBonus: -0.06, physicalResistance: -10 }]);

  assert(closeTo(baseline, 592), "Probe baseline must use the unadjusted 408 defense.");
  assert(closeTo(reducedDefense, 616.48), "A -6% defense adjustment must reduce 408 defense to 383.52.");
  assert(closeTo(reducedResistance / baseline, 1.05), "Reducing Physical Resistance by 10 must use the flat resistance formula.");
  assert(closeTo(combined, 616.48 * 1.05), "Defense and resistance reductions must apply through their separate formula stages.");

  const simulatedBaseline = calculateSimulatedDamageBreakdown({ phyCoef: 1 }, { ...baseContext }, () => 0.5).physical;
  const simulatedCombined = calculateSimulatedDamageBreakdown({ phyCoef: 1 }, { ...baseContext, effects: [{ defenseBonus: -0.06, physicalResistance: -10 }] }, () => 0.5).physical;
  assert(closeTo(simulatedCombined / simulatedBaseline, combined / baseline), "The simulator must use the same defense and resistance adjustments.");

  const expectedT0 = [-0.006, -0.012, -0.018, -0.024, -0.03];
  const expectedT1 = [-0.012, -0.024, -0.036, -0.048, -0.06];
  const values = (definition) => definition.stackEffects.map((group) => group[0].effect.defenseBonus);
  assert(JSON.stringify(values(charms.QingyisCharmT0)) === JSON.stringify(expectedT0), "Qingyi's Charm T0 stack progression is incorrect.");
  assert(JSON.stringify(values(charms.QingyisCharmT1)) === JSON.stringify(expectedT1), "Qingyi's Charm T1 stack progression is incorrect.");
  assert(JSON.stringify(values(charms.QingyisCharmT6)) === JSON.stringify(expectedT1), "Qingyi's Charm T6 must retain T1's 1.2% per-stack progression.");
  assert(charms.QingyisCharmT6.stackEffects[4][0].effect.physicalResistance === -10, "Qingyi's Charm T6 must reduce Physical Resistance by 10 only at five stacks.");
  assert(JSON.stringify(phantomChime.stackEffects.map((group) => group[0].effect.physicalResistance)) === JSON.stringify([-2, -4, -6, -8, -10]), "Phantom Chime's cumulative Physical Resistance progression is incorrect.");
  assert(phantomChime.duration === 5 && phantomChime.maxStack === 5, "Phantom Chime must last five seconds and cap at five stacks.");

  console.log("Enemy defense, Physical Resistance, and Qingyi's Charm checks passed.");
} finally {
  await viteServer.close();
}
