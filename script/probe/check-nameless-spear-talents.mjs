import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const namelessSpear = (await viteServer.ssrLoadModule("/data/martial-art/nameless-spear.json")).default;
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { calculateDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { requirementsPass } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");

  const assertClose = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message} Expected ${expected}, received ${actual}.`);
  };
  const effects = namelessSpear.talent.flatMap((talent) => talent.effect ?? []);
  const statResult = calculateStatsWithEffects(
    { ...emptyStats, momentum: 280, affinity: 0.257, maxBellstrike: 459 },
    effects,
    0,
  );
  assertClose(statResult.stats.affinity, 0.3, "Momentum scaling must grant at most 4.3% Affinity Rate.");
  assertClose(
    statResult.stats.maxEndurance,
    20,
    "Max Endurance Up must include its base 10 and its 10-point Affinity cap.",
  );
  assertClose(statResult.stats.minBellstrike, 98, "Bellstrike Attribute Up must grant Min Bellstrike Attack.");
  assertClose(statResult.stats.maxBellstrike, 655, "Bellstrike Attribute Up must grant Max Bellstrike Attack.");
  assertClose(
    statResult.stats.bellstrikeDmgBonus,
    0.11,
    "Bellstrike DMG Bonus must reach its cap at 655 Max Bellstrike Attack.",
  );

  const affinityRule = effects.find((rule) => rule.effect?.affinityDmgBonus);
  if (!affinityRule) throw new Error("Nameless Spear Affinity damage talent rule was not found.");
  if (
    !requirementsPass(
      affinityRule.requirement,
      [{ name: "EndlessGale" }],
      [],
      [],
      new Set(),
      ["namelessSword", "namelessSpear"],
      {},
      {},
    ) ||
    requirementsPass(affinityRule.requirement, [], [], [], new Set(), ["namelessSword", "namelessSpear"], {}, {})
  )
    throw new Error("Affinity DMG Up must work with Endless Gale while low Endurance remains unsimulated.");

  const damageStats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, affinity: 0.3 };
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
    skillTags: [],
    weapons: ["namelessSword", "namelessSpear"],
    buffs: [{ name: "EndlessGale" }],
    enemy,
    derivedStats: calculateDerivedStats(damageStats, 0),
  };
  const baseline = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [] });
  const enhanced = calculateDamageBreakdown({ phyCoef: 1 }, { ...context, effects: [affinityRule.effect] });
  assertClose(enhanced.affinity / baseline.affinity, 1.18, "Affinity DMG Up must cap at 18% at 30% Affinity Rate.");

  console.log("Nameless Spear talent calculation checks passed.");
} finally {
  await viteServer.close();
}
