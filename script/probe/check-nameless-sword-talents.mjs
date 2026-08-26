import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const namelessSword = (await viteServer.ssrLoadModule("/data/martial-art/nameless-sword.json")).default;
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { requirementsPass } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");

  const assertClose = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message} Expected ${expected}, received ${actual}.`);
  };
  const effects = namelessSword.talent.flatMap((talent) => talent.effect ?? []);
  const statResult = calculateStatsWithEffects({ ...emptyStats, momentum: 280, maxBellstrike: 459 }, effects, 0);
  assertClose(statResult.stats.maxPhys, 73.9, "Momentum scaling must grant the capped Max Physical Attack bonus.");
  assertClose(statResult.stats.minBellstrike, 98, "Bellstrike Attribute Up must grant Min Bellstrike Attack.");
  assertClose(statResult.stats.maxBellstrike, 655, "Bellstrike Attribute Up must grant Max Bellstrike Attack.");
  assertClose(
    statResult.stats.bellstrikePenetration,
    22,
    "Bellstrike penetration must reach its cap at 655 Max Bellstrike Attack.",
  );

  const hpRule = effects.find((rule) => rule.effect?.hpDMGBonus);
  const affinityRule = effects.find((rule) => rule.effect?.affinityDmgBonus);
  if (!hpRule || !affinityRule) throw new Error("Nameless Sword conditional damage talent rules were not found.");

  if (
    !requirementsPass(
      affinityRule.requirement,
      [],
      [],
      ["SwordEnergy"],
      new Set(),
      ["namelessSword", "namelessSpear"],
      {},
      { targetQiPercentage: 39.99 },
    ) ||
    !requirementsPass(
      affinityRule.requirement,
      [],
      [{ name: "QiImbalance" }],
      ["SwordEnergy"],
      new Set(),
      ["namelessSword", "namelessSpear"],
      {},
      { targetQiPercentage: 100 },
    ) ||
    requirementsPass(
      affinityRule.requirement,
      [],
      [],
      ["SwordEnergy"],
      new Set(),
      ["namelessSword", "namelessSpear"],
      {},
      { targetQiPercentage: 40 },
    )
  )
    throw new Error("Sword Qi Affinity Enhancement must require sub-40% Qi or Qi Imbalance at hit time.");

  const damageStats = {
    ...emptyStats,
    minPhys: 1500,
    maxPhys: 1500,
    precision: 1,
    affinity: 1,
  };
  const enemy = {
    name: "Probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const context = {
    stats: damageStats,
    attunement: {},
    skillTags: ["SwordEnergy"],
    weapons: ["namelessSword", "namelessSpear"],
    buffs: [],
    enemy,
    derivedStats: calculateDerivedStats(damageStats, 0),
  };
  const baseline = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [] });
  const hpEnhanced = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [hpRule.effect] });
  const affinityEnhanced = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [affinityRule.effect] });
  assertClose(hpEnhanced.physical / baseline.physical, 1.2, "Sword Energy HP damage must cap at 20%.");
  assertClose(
    affinityEnhanced.affinity / baseline.affinity,
    1.18,
    "Sword Energy Affinity damage must cap at 18% at 1500 Max Physical Attack.",
  );

  console.log("Nameless Sword talent calculation checks passed.");
} finally {
  await viteServer.close();
}
