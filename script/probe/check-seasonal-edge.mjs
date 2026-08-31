import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline, calculateRotationDamageSequence } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationCalculator.ts",
  );
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { buildRotationTimeline, mergeCalculatedTargetHPState } = await viteServer.ssrLoadModule(
    "/src/calculations/rotationTimeline.ts",
  );
  const { seasonalEdgeEffectFor, seasonalEdgeWindows } = await viteServer.ssrLoadModule(
    "/src/calculations/seasonalEdge.ts",
  );
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const generalBuffs = (await viteServer.ssrLoadModule("/data/buff/general.json")).default;
  const seasonalDefinition = (await viteServer.ssrLoadModule("/data/innerway/seasonal-edge.json")).default;
  const closeTo = (actual, expected, message, tolerance = 1e-8) => {
    if (Math.abs(actual - expected) > tolerance)
      throw new Error(`${message}: expected ${expected}, received ${actual}`);
  };

  const trigger = seasonalDefinition.effect.SeasonalEdgeT0.trigger[0];
  const rule = { source: "SeasonalEdge", tier: 0, effect: {}, trigger };
  const rulesThroughTier = (tier) => [
    rule,
    ...Array.from({ length: tier }, (_, index) => index + 1).flatMap((currentTier) =>
      (seasonalDefinition.effect[`SeasonalEdgeT${currentTier}`].effect ?? []).map((effect) => ({
        source: "SeasonalEdge",
        tier: currentTier,
        effect: effect.stat ? { stat: effect.stat } : (effect.effect ?? {}),
        target: effect.target,
        modify: effect.modify,
      })),
    ),
  ];
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Seasonal Edge probe",
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
    rotation: {
      name: "Seasonal Edge probe",
      steps: [
        { type: "skill", skill: "Conversion" },
        { type: "event", event: "Delay", duration: 5 },
        { type: "skill", skill: "MartialHit" },
        { type: "skill", skill: "MysticHit" },
        { type: "event", event: "Delay", duration: 10 },
        { type: "skill", skill: "Conversion" },
        { type: "skill", skill: "MartialHit" },
      ],
    },
    skills: {
      Conversion: { name: "Conversion", castTime: 1, tags: ["Conversion"], action: [] },
      MartialHit: {
        name: "Martial hit",
        castTime: 0.1,
        tags: ["MartialArts"],
        action: [{ type: "damage", phyCoef: 1, time: 0.1 }],
      },
      MysticHit: {
        name: "Mystic hit",
        castTime: 0.1,
        tags: ["Mystic"],
        action: [
          { type: "consumeResource", value: "Vitality", amount: 20, time: 0 },
          { type: "damage", phyCoef: 1, time: 0.1 },
        ],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: generalBuffs,
    innerWayConditions: ["SeasonalEdgeT0"],
    innerWayRules: [rule],
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 10 },
    resourceMaximums: { Vitality: 100 },
  };
  const t1 = seasonalEdgeEffectFor(rulesThroughTier(1), generalBuffs);
  closeTo(t1.duration, 12, "T1 must extend the shared season duration from eight to twelve seconds");
  const t3 = seasonalEdgeEffectFor(rulesThroughTier(3), generalBuffs);
  closeTo(
    t3.outcomes.filter((outcome) => outcome.buffs.length === 2).reduce((total, outcome) => total + outcome.weight, 0),
    0.3,
    "T3 must grant two distinct seasons in 30% of proc branches",
  );
  if (t3.outcomes.some((outcome) => new Set(outcome.buffs).size !== outcome.buffs.length))
    throw new Error("T3 must roll its second season without replacement.");
  const t4 = seasonalEdgeEffectFor(rulesThroughTier(4), generalBuffs);
  if (!t4.additionalSkills.includes("SereneBreeze"))
    throw new Error("T4 must allow Serene Breeze to trigger Seasonal Edge.");
  const t6 = seasonalEdgeEffectFor(rulesThroughTier(6), generalBuffs);
  if (t6.outcomes.some((outcome) => outcome.buffs.includes("Frost")))
    throw new Error("T6 must remove Frost from every possible outcome.");
  closeTo(
    t6.outcomes.filter((outcome) => outcome.buffs.length === 1).reduce((total, outcome) => total + outcome.weight, 0),
    0.5,
    "T6 must grant one season in 50% of proc branches",
  );
  closeTo(
    t6.outcomes.filter((outcome) => outcome.buffs.length === 2).reduce((total, outcome) => total + outcome.weight, 0),
    0.3,
    "T6 must grant two seasons in 30% of proc branches",
  );
  closeTo(
    t6.outcomes.filter((outcome) => outcome.buffs.length === 3).reduce((total, outcome) => total + outcome.weight, 0),
    0.2,
    "T6 must grant all three remaining seasons in 20% of proc branches",
  );
  const sereneTimeline = buildRotationTimeline({
    ...timeline,
    rotation: { name: "Serene Breeze T4 probe", steps: [{ type: "skill", skill: "SereneBreeze" }] },
    skills: { SereneBreeze: { name: "Serene Breeze", castTime: 1, tags: ["Mystic"], action: [] } },
  });
  if (seasonalEdgeWindows(sereneTimeline, t3).length !== 0 || seasonalEdgeWindows(sereneTimeline, t4).length !== 1)
    throw new Error("Serene Breeze must begin triggering Seasonal Edge at T4, and not before T4.");
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
  closeTo(
    result.actionBreakdowns["rotation-2:0"].total,
    105,
    "The martial hit must average the neutral and 20% Flare branches",
  );
  closeTo(
    result.actionBreakdowns["rotation-3:1"].total,
    102.5,
    "The Mystic hit must average the neutral and 10% Yield branches",
  );
  closeTo(
    result.actionBreakdowns["rotation-6:0"].total,
    100,
    "A Conversion used during the 30-second cooldown must not open a new season window",
  );
  const mysticState = result.timeline[3].actionStates[1];
  closeTo(mysticState.resources.Vitality, -10, "Vitality consumption must be allowed below zero");
  closeTo(mysticState.resourceRanges.Vitality.minimum, -10, "The Vitality lower bound must exclude Yield");
  if (!(mysticState.resourceRanges.Vitality.maximum > -10))
    throw new Error("The Vitality upper bound must include possible Yield regeneration.");
  if (!(
    mysticState.resourceRanges.Vitality.expected > mysticState.resourceRanges.Vitality.minimum &&
    mysticState.resourceRanges.Vitality.expected < mysticState.resourceRanges.Vitality.maximum
  ))
    throw new Error("Expected Vitality must probability-weight Yield between its lower and upper bounds.");
  const displayedTimeline = mergeCalculatedTargetHPState(buildRotationTimeline(timeline), result.timeline);
  closeTo(
    displayedTimeline[3].actionStates[1].resourceRanges.Vitality.minimum,
    -10,
    "Calculated Vitality bounds must survive the editor's structural-timeline merge",
  );

  const flareSimulation = calculateRotationDamageSequence(result.baseline, () => 0.3);
  closeTo(flareSimulation[0].breakdown.total, 120, "A simulated Flare branch must persist through its proc window");
  closeTo(flareSimulation[1].breakdown.total, 100, "Flare must not increase Mystic Skill damage");
  closeTo(flareSimulation[2].breakdown.total, 100, "The cooldown-blocked Conversion must not reroll Flare");
  const yieldSimulation = calculateRotationDamageSequence(result.baseline, () => 0.6);
  closeTo(yieldSimulation[0].breakdown.total, 100, "Yield must not increase Martial Art damage");
  closeTo(yieldSimulation[1].breakdown.total, 110, "A simulated Yield branch must increase Mystic Skill damage");
  closeTo(yieldSimulation[2].breakdown.total, 100, "The cooldown-blocked Conversion must not reroll Yield");

  console.log("Seasonal Edge chance branches, proc window, damage, simulation, and Vitality range checks passed.");
} finally {
  await viteServer.close();
}
