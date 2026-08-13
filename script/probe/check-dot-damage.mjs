import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { requirementsPass } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const soulShaken = (await viteServer.ssrLoadModule("/data/debuff/bellstrike-umbra.json")).default.SoulShaken;
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const baseContext = { stats, attunement: {}, skillTags: [], weapons: [], buffs: [], enemy, derivedStats: calculateDerivedStats(stats, 0), effects: [] };
  const damage = (effects, isDot, skillTags = []) => calculateDamageBreakdown({ phyCoef: 1 }, { ...baseContext, skillTags, effects, isDot });
  const baselineDirect = damage([], false);
  const baselineDot = damage([], true);
  const directWithBonus = damage([{ dotDamage: 0.25 }], false);
  const dotWithBonus = damage([{ dotDamage: 0.25 }], true);
  const dotWithTwoBonuses = damage([{ dotDamage: 0.25 }, { dotDamage: 0.25 }], true);

  assert(closeTo(directWithBonus.total, baselineDirect.total), "dotDamage must not affect direct damage.");
  assert(closeTo(dotWithBonus.total / baselineDot.total, 1.25), "dotDamage must multiply every DOT damage component.");
  assert(closeTo(dotWithTwoBonuses.total / baselineDot.total, 1.5), "Multiple dotDamage effects must add within the DOT category.");
  const simulatedBaseline = calculateSimulatedDamageBreakdown({ phyCoef: 1 }, { ...baseContext, isDot: true }, () => 0.5);
  const simulatedWithBonus = calculateSimulatedDamageBreakdown({ phyCoef: 1 }, { ...baseContext, effects: [{ dotDamage: 0.25 }], isDot: true }, () => 0.5);
  assert(closeTo(simulatedWithBonus.total / simulatedBaseline.total, 1.25), "The simulator must use the same DOT multiplier.");

  const fifthStack = soulShaken.stackEffects[4];
  const generalEffect = fifthStack[0].effect;
  const umbraRule = fifthStack[1];
  assert(generalEffect.dotDamage === 0.25 && umbraRule.effect.dotDamage === 0.25, "Soul-Shaken stack 5 must provide 25% general and 25% Umbra DOT vulnerability.");
  assert(requirementsPass(umbraRule.requirement, [], [], ["HeavenquakerSpear"], new Set()), "Heavenquaker Spear must satisfy Soul-Shaken's Umbra requirement.");
  assert(requirementsPass(umbraRule.requirement, [], [], ["StrategicSword"], new Set()), "Strategic Sword must satisfy Soul-Shaken's Umbra requirement.");
  assert(!requirementsPass(umbraRule.requirement, [], [], ["SnowpartingBlade"], new Set()), "Non-Umbra martial arts must not receive Soul-Shaken's conditional bonus.");

  console.log("DOT damage and Soul-Shaken checks passed.");
} finally {
  await viteServer.close();
}
