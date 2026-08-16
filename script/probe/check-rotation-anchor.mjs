import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline, calculateRotationComparisons, calculateRotationSimulation } =
    await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const attunement = {
    physicalPenetration: 0,
    formlessPenetration: 0,
    phalanxbaneChargedBoost: 0,
    phalanxbaneMartialBoost: 0,
    snowpartingChargedBoost: 0,
    snowpartingVariedComboBoost: 0,
    snowpartingMartialBoost: 0,
  };
  const enemy = {
    name: "Probe",
    level: 1,
    defense: 0,
    physicalResistance: 0,
    bellstrikeResistance: 0,
    stonesplitResistance: 0,
    silkbindResistance: 0,
    bamboocutResistance: 0,
    judgementResistance: 0,
  };
  const timeline = {
    rotation: { name: "Anchor probe", steps: [{ type: "skill", skill: "ProbeSkill" }] },
    skills: {
      ProbeSkill: {
        name: "Probe Skill",
        castTime: 2,
        tags: [],
        action: [
          { type: "damage", time: 0, phyCoef: 1 },
          { type: "damage", time: 1, phyCoef: 1 },
          { type: "damage", time: 1, phyCoef: 1 },
          { type: "damage", time: 2, phyCoef: 1 },
        ],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };
  const bundle = {
    timeline,
    startAnchor: { rowId: "rotation-0", actionIndex: 2 },
    stats,
    attunement,
    enemy,
    derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
    weapons: [],
    statPriority: [{ label: "Maximum Physical Attack", stats: { ...stats, maxPhys: 110 } }],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  };
  const result = calculateRotationSimulation(bundle);
  const cachedBaseline = calculateRotationBaseline(bundle);
  const cachedComparisons = calculateRotationComparisons(bundle, cachedBaseline);

  assert(!result.actionBreakdowns["rotation-0:0"], "An action before the anchor time must be ignored.");
  assert(!result.actionBreakdowns["rotation-0:1"], "An earlier action at the anchor timestamp must be ignored.");
  assert(result.actionBreakdowns["rotation-0:2"], "The starting action must be calculated.");
  assert(result.actionBreakdowns["rotation-0:3"], "Actions after the anchor must be calculated.");
  assert(result.metrics.breakdown.skills[0]?.hits === 2, "Ignored actions must not contribute to hit count.");
  assert(result.metrics.totalDamage > 0, "Calculated actions must still contribute damage.");
  assert(
    cachedBaseline.metrics.statPriority.length === 0,
    "A baseline-only calculation must not calculate comparison rows.",
  );
  assert(
    cachedComparisons.totalDamage === result.metrics.totalDamage,
    "Cached comparison metrics must reuse the baseline total damage.",
  );
  assert(
    cachedComparisons.statPriority[0]?.dpsDifference === result.metrics.statPriority[0]?.dpsDifference,
    "Cached comparison results must match a full simulation.",
  );
  const triggerTimeline = buildRotationTimeline({
    rotation: { name: "Trigger source probe", steps: [{ type: "skill", skill: "SourceSkill" }] },
    skills: {
      SourceSkill: { name: "Source Skill", castTime: 1, tags: [], action: [{ type: "damage", time: 1, phyCoef: 1 }] },
      TriggeredProbe: {
        name: "Triggered Probe",
        castTime: 0,
        cooldown: 10,
        tags: ["Triggered"],
        action: [{ type: "damage", time: 0, phyCoef: 1 }],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [
      {
        source: "Probe",
        tier: 0,
        effect: {},
        trigger: { event: "damage", action: { type: "trigger", value: "TriggeredProbe" } },
      },
    ],
    setupEffects: [],
    weapons: [],
  });
  assert(
    triggerTimeline.find((row) => row.kind === "trigger")?.sourceRowId === "rotation-0",
    "Inner Way-triggered actions must retain their originating base skill row.",
  );
  const durationTimeline = {
    rotation: { name: "Duration probe", steps: [{ type: "skill", skill: "DurationSkill" }] },
    skills: {
      DurationSkill: {
        name: "Duration Skill",
        castTime: 1,
        tags: [],
        action: [{ type: "damage", time: 1, phyCoef: 1 }],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };
  const longerDurationTimeline = {
    ...durationTimeline,
    skills: {
      DurationSkill: {
        name: "Duration Skill",
        castTime: 2,
        tags: [],
        action: [{ type: "damage", time: 2, phyCoef: 1 }],
      },
    },
  };
  const durationBundle = {
    ...bundle,
    timeline: durationTimeline,
    startAnchor: { rowId: "rotation-0" },
    statPriority: [],
    innerWayPriority: [{ label: "Longer timeline", timeline: longerDurationTimeline }],
  };
  const durationBaseline = calculateRotationBaseline(durationBundle);
  const durationComparison = calculateRotationComparisons(durationBundle, durationBaseline);
  assert(durationBaseline.duration === 1, "The duration probe baseline must last one second.");
  assert(
    Math.abs(durationComparison.innerWayPriority[0].dpsDifference + durationBaseline.metrics.dps / 2) < 1e-9,
    "A rebuilt two-second variant must use its own duration instead of the one-second baseline duration.",
  );
  console.log("Rotation start-anchor damage and hit-count checks passed.");
} finally {
  await viteServer.close();
}
