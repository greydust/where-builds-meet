import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const {
    ExpectedInsightfulStrikeTracker,
    SimulatedInsightfulStrikeTracker,
    insightfulStrikeDirectAffinityBonus,
    insightfulStrikeEffectFor,
  } = await viteServer.ssrLoadModule("/src/calculations/insightfulStrike.ts");
  const { calculateRotationBaseline, calculateRotationDamageSequence } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationCalculator.ts",
  );
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { outcomeBuffTick } = await viteServer.ssrLoadModule("/src/calculations/outcomeTriggeredBuffs.ts");
  const concentration = (await viteServer.ssrLoadModule("/data/buff/bellstrike-umbra.json")).default.Concentration;
  const insightfulStrikeDefinition = (await viteServer.ssrLoadModule("/data/innerway/insightful-strike.json")).default;

  const closeTo = (actual, expected, message, tolerance = 1e-9) => {
    if (Math.abs(actual - expected) > tolerance)
      throw new Error(`${message}: expected ${expected}, received ${actual}`);
  };
  const rule = {
    source: "InsightfulStrike",
    tier: 0,
    effect: {},
    trigger: {
      event: "damageOutcome",
      outcome: "affinity",
      target: "self",
      resource: { name: "Focus", gain: 1, decayRate: -0.25, threshold: 4, resetTo: 0 },
      action: [{ type: "apply", target: "self", value: "Concentration", stack: 1, reapply: true }],
    },
  };
  const insightfulStrike = insightfulStrikeEffectFor([rule], { Concentration: concentration });
  if (!insightfulStrike) throw new Error("Insightful Strike outcome-resource data was not recognized.");

  const simulated = new SimulatedInsightfulStrikeTracker();
  for (const second of [0, 1, 2]) simulated.resolveAffinity(insightfulStrike, outcomeBuffTick(second));
  closeTo(
    Number(simulated.concentrationActive(insightfulStrike, outcomeBuffTick(3))),
    0,
    "Three Affinity hits separated by decay must not activate Concentration",
  );
  simulated.resolveAffinity(insightfulStrike, outcomeBuffTick(3));
  closeTo(
    Number(simulated.concentrationActive(insightfulStrike, outcomeBuffTick(3))),
    0,
    "Four one-second-spaced hits decay below the Focus threshold",
  );

  const immediate = new SimulatedInsightfulStrikeTracker();
  for (let hit = 0; hit < 4; hit += 1) immediate.resolveAffinity(insightfulStrike, outcomeBuffTick(0));
  closeTo(
    Number(immediate.concentrationActive(insightfulStrike, outcomeBuffTick(0))),
    1,
    "Four immediate Affinity hits must activate Concentration",
  );
  for (let hit = 0; hit < 3; hit += 1) immediate.resolveAffinity(insightfulStrike, outcomeBuffTick(1));
  closeTo(
    Number(immediate.concentrationActive(insightfulStrike, outcomeBuffTick(10))),
    0,
    "Three post-conversion hits prove Focus reset to zero and cannot refresh Concentration",
  );

  const t4Modifier = insightfulStrikeDefinition.effect.InsightfulStrikeT4.effect[0];
  const insightfulStrikeT4 = insightfulStrikeEffectFor(
    [rule, { source: "InsightfulStrike", tier: 4, effect: {}, ...t4Modifier }],
    { Concentration: concentration },
  );
  if (!insightfulStrikeT4) throw new Error("Insightful Strike T4 Focus generation was not recognized.");
  const t4Simulation = new SimulatedInsightfulStrikeTracker();
  for (let hit = 0; hit < 3; hit += 1) t4Simulation.resolveAffinity(insightfulStrikeT4, outcomeBuffTick(0));
  closeTo(
    Number(t4Simulation.concentrationActive(insightfulStrikeT4, outcomeBuffTick(0))),
    1,
    "T4 must reach Concentration after three immediate Affinity outcomes",
  );

  const t3Modifier = insightfulStrikeDefinition.effect.InsightfulStrikeT3.effect[0];
  const t3Rule = { source: "InsightfulStrike", tier: 3, effect: {}, ...t3Modifier };
  const insightfulStrikeT3 = insightfulStrikeEffectFor([rule, t3Rule], { Concentration: concentration });
  if (!insightfulStrikeT3) throw new Error("Insightful Strike T3 Concentration modifier was not recognized.");
  closeTo(
    insightfulStrikeDirectAffinityBonus(insightfulStrikeT3, {
      selfHPPercentage: 100,
      targetHPPercentage: 99,
    }),
    0.03,
    "T3 must grant both Direct Affinity bonuses when self HP is higher than target HP",
  );
  closeTo(
    insightfulStrikeDirectAffinityBonus(insightfulStrikeT3, {
      selfHPPercentage: 98,
      targetHPPercentage: 99,
    }),
    0.015,
    "T3 must retain only its base Direct Affinity bonus when self HP is not higher",
  );

  const expected = new ExpectedInsightfulStrikeTracker();
  for (let hit = 0; hit < 4; hit += 1) expected.resolveAffinity(insightfulStrike, outcomeBuffTick(0), 0.5);
  closeTo(
    expected.expectedConcentration(insightfulStrike, outcomeBuffTick(0)),
    0.0625,
    "Expected calculation must preserve the probability of four Affinity outcomes",
  );

  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, directAffinity: 1 };
  const enemy = {
    name: "Insightful Strike probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const timeline = {
    rotation: { name: "Insightful Strike probe", steps: [{ type: "skill", skill: "Probe" }] },
    skills: {
      Probe: {
        name: "Five-hit probe",
        castTime: 0,
        tags: ["MartialArts"],
        action: Array.from({ length: 5 }, (_, index) => ({
          type: "damage",
          phyCoef: 1,
          time: index < 4 ? 0 : 0.0001,
        })),
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { Concentration: concentration },
    innerWayConditions: ["InsightfulStrikeT0"],
    innerWayRules: [rule],
    setupEffects: [],
    weapons: [],
  };
  const result = calculateRotationBaseline({
    timeline,
    startAnchor: { rowId: "rotation-0" },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const concentrations = result.baseline.map((entry) => result.expectedOutcomeBuffSchedule[entry.id]?.Concentration);
  if (JSON.stringify(concentrations) !== JSON.stringify([0, 0, 0, 0, 1]))
    throw new Error(`Concentration must begin after the fourth hit and affect the fifth; received ${concentrations}.`);
  const simulatedDamage = calculateRotationDamageSequence(result.baseline, () => 0.5);
  if (!(simulatedDamage[4].breakdown.total > simulatedDamage[3].breakdown.total))
    throw new Error("Active Concentration must increase the fifth Affinity hit's damage.");

  const probabilisticStats = { ...stats, directAffinity: 0.5 };
  const probabilisticT0 = calculateRotationBaseline({
    timeline,
    startAnchor: { rowId: "rotation-0" },
    stats: probabilisticStats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(probabilisticStats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const probabilisticT3 = calculateRotationBaseline({
    timeline: {
      ...timeline,
      innerWayConditions: ["InsightfulStrikeT0", "InsightfulStrikeT1", "InsightfulStrikeT2", "InsightfulStrikeT3"],
      innerWayRules: [rule, t3Rule],
    },
    startAnchor: { rowId: "rotation-0" },
    stats: probabilisticStats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(probabilisticStats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const t0FifthAffinity = probabilisticT0.actionBreakdowns["rotation-0:4"].outcomeRates.affinity;
  const t3FifthAffinity = probabilisticT3.actionBreakdowns["rotation-0:4"].outcomeRates.affinity;
  closeTo(
    t3FifthAffinity - t0FifthAffinity,
    0.001875,
    "Deterministic T3 damage must weight its 3% Direct Affinity by the 6.25% active Concentration branch",
  );

  console.log("Insightful Strike Focus decay, reset, probability, timing, and damage checks passed.");
} finally {
  await viteServer.close();
}
