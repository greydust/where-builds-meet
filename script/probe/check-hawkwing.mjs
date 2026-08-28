import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline, calculateRotationComparisons, calculateRotationDamageSequence } =
    await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { calculateStatsWithEffects } = await viteServer.ssrLoadModule("/src/calculations/statEffects.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const { ExpectedHawkwingTracker } = await viteServer.ssrLoadModule("/src/calculations/hawkwing.ts");
  const { outcomeBuffTick } = await viteServer.ssrLoadModule("/src/calculations/outcomeTriggeredBuffs.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const closeTo = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 1e-9) throw new Error(`${message}: expected ${expected}, received ${actual}`);
  };
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1, affinity: 0.2 };
  const enemy = {
    name: "Hawkwing probe",
    level: 96,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const skill = {
    name: "Three-hit probe",
    castTime: 1.5,
    tags: ["MartialArts"],
    action: [0.5, 1, 1.5].map((time) => ({ type: "damage", phyCoef: 1, time })),
  };
  const hawkwingDefinition = {
    name: "Hawkwing",
    duration: 5,
    maxStack: 5,
    refresh: true,
    stackEffects: Array.from({ length: 5 }, (_, index) => [{ effect: { physicalAttackBonus: (index + 1) * 0.02 } }]),
  };
  const timeline = {
    rotation: { name: "Hawkwing probe", steps: [{ type: "skill", skill: "Probe" }] },
    skills: { Probe: skill },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: { Hawkwing: hawkwingDefinition },
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [
      {
        trigger: {
          event: "damageOutcome",
          outcome: "affinity",
          action: { type: "apply", target: "self", value: "Hawkwing", stack: 1, reapply: true },
        },
      },
    ],
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
  const scheduledStacks = result.baseline.map((entry) => result.expectedOutcomeBuffSchedule[entry.id]?.Hawkwing);
  closeTo(scheduledStacks[0], 0, "The first hit must occur before Hawkwing can proc");
  closeTo(scheduledStacks[1], 0.2, "The second hit must use the first hit's Affinity probability");
  closeTo(scheduledStacks[2], 0.4, "Probability branches must merge into the third hit's expected stack");
  closeTo(result.metrics.expectedHawkwingStacks, 0.2, "The displayed stack metric must average the per-hit values");
  result.baseline.forEach((entry, index) =>
    closeTo(
      result.actionBreakdowns[entry.id]?.expectedBuffStacks?.Hawkwing,
      scheduledStacks[index],
      `Action ${index + 1} must expose its expected Hawkwing stack for the timeline buff plate`,
    ),
  );

  const resultWithNonDamageEntries = calculateRotationBaseline({
    timeline: {
      ...timeline,
      rotation: {
        name: "Hawkwing non-damage exclusion probe",
        steps: [
          { type: "event", event: "Delay", duration: 1 },
          { type: "skill", skill: "Heal" },
          { type: "skill", skill: "Probe" },
        ],
      },
      skills: {
        ...timeline.skills,
        Heal: {
          name: "Heal",
          castTime: 0,
          tags: ["Heal"],
          action: [{ type: "heal", phyCoef: 1, time: 0 }],
        },
      },
    },
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
  closeTo(
    resultWithNonDamageEntries.metrics.expectedHawkwingStacks,
    0.2,
    "The displayed stack metric must exclude delays and healing actions from its per-damage average",
  );

  const tracker = new ExpectedHawkwingTracker();
  const buff = {
    name: "Hawkwing",
    outcome: "affinity",
    durationTicks: outcomeBuffTick(5),
    maxStack: 5,
    physicalAttackBonusPerStack: 0.02,
  };
  tracker.resolveAffinity(buff, outcomeBuffTick(0), 1);
  closeTo(tracker.expectedStack(buff, outcomeBuffTick(4.9999)), 1, "A stack must remain active before expiry");
  closeTo(tracker.expectedStack(buff, outcomeBuffTick(5)), 0, "A stack must expire exactly at its 0.1 ms tick");
  assert(result.metrics.totalDamage > 300, "Expected Hawkwing stacks must increase later physical hits.");

  const guaranteedAffinityStats = { ...stats, directAffinity: 1 };
  const guaranteedAffinityResult = calculateRotationBaseline({
    timeline,
    startAnchor: { rowId: "rotation-0" },
    stats: guaranteedAffinityStats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(guaranteedAffinityStats, 0),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const simulatedStacks = calculateRotationDamageSequence(guaranteedAffinityResult.baseline, () => 0.5).map(
    (row) => row.expectedBuffStacks?.Hawkwing,
  );
  assert(
    JSON.stringify(simulatedStacks) === JSON.stringify([0, 1, 2]),
    `Simulation must advance concrete Hawkwing stacks after sampled Affinity hits; received ${simulatedStacks}.`,
  );

  const momentumAffinityEffect = {
    stat: { affinity: { formula: { source: "momentum", multiplier: 0.001 } } },
  };
  const rawFormulaStats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const formulaSetupEffects = [momentumAffinityEffect, timeline.setupEffects[0]];
  const formulaTimeline = { ...timeline, setupEffects: formulaSetupEffects };
  const formulaState = calculateStatsWithEffects(rawFormulaStats, formulaSetupEffects, 0);
  const formulaBundle = {
    timeline: formulaTimeline,
    startAnchor: { rowId: "rotation-0" },
    stats: rawFormulaStats,
    attunement: {},
    enemy,
    derivedStats: formulaState.derivedStats,
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };
  const formulaBaseline = calculateRotationBaseline(formulaBundle);
  const momentumSetupEffects = [...formulaSetupEffects, { stat: { momentum: 200 } }];
  const comparisonMetrics = calculateRotationComparisons(
    {
      ...formulaBundle,
      setupComparisons: {
        momentum: [{ label: "Momentum setup", setupEffects: momentumSetupEffects }],
      },
    },
    formulaBaseline,
  );
  const momentumState = calculateStatsWithEffects(rawFormulaStats, momentumSetupEffects, 0);
  const independentlyRebuilt = calculateRotationBaseline({
    ...formulaBundle,
    timeline: { ...formulaTimeline, setupEffects: momentumSetupEffects },
    derivedStats: momentumState.derivedStats,
  });
  closeTo(
    comparisonMetrics.setupComparisons.momentum[0].dpsDifference,
    independentlyRebuilt.metrics.dps - formulaBaseline.metrics.dps,
    "A setup variant that changes Affinity indirectly through Momentum must rebuild its Hawkwing schedule",
  );

  console.log("Hawkwing probability, expiry, damage, and display-metric checks passed.");
} finally {
  await viteServer.close();
}
