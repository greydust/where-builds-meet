import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const closeTo = (actual, expected, message) => {
    if (Math.abs(actual - expected) > 1e-8) throw new Error(`${message} (${actual} !== ${expected})`);
  };
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = {
    name: "Vitality probe",
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
      name: "Vitality deficit probe",
      steps: [
        { type: "skill", skill: "Mystic" },
        { type: "skill", skill: "General" },
      ],
    },
    skills: {
      Mystic: {
        name: "Mystic",
        castTime: 1,
        action: [
          { type: "consumeResource", value: "Vitality", amount: 30, time: 0 },
          { type: "damage", phyCoef: 1, time: 1 },
          { type: "heal", phyCoef: 1, time: 1 },
        ],
        tags: ["Mystic"],
      },
      General: {
        name: "General",
        castTime: 1,
        action: [{ type: "damage", phyCoef: 1, time: 1 }],
        tags: ["General"],
      },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
    initialResources: { Vitality: 20 },
    resourceMaximums: { Vitality: 40 },
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
  const mysticDamage = result.actionBreakdowns["rotation-0:1"].total;
  const generalDamage = result.actionBreakdowns["rotation-1:0"].total;
  closeTo(
    result.mysticVitalityDamageScale,
    2 / 3,
    "A ten-point deficit on thirty consumed Vitality must retain 2/3 Mystic damage",
  );
  closeTo(
    result.metrics.totalDamage,
    generalDamage + mysticDamage * (2 / 3),
    "Only Mystic damage must be scaled in the final total",
  );
  closeTo(
    result.actionBreakdowns["rotation-0:1"].total,
    mysticDamage,
    "The Mystic action breakdown must retain its unscaled damage",
  );
  closeTo(
    result.metrics.totalHealing,
    result.actionBreakdowns["rotation-0:2"].healing.total,
    "Vitality deficits must not scale healing",
  );
  const resourceSummary = result.timeline[0].timelineResourceSummary.Vitality;
  closeTo(resourceSummary.initial, 20, "The resource ledger must retain initial Vitality");
  closeTo(resourceSummary.consumed, 30, "The resource ledger must total accepted Vitality consumption");
  closeTo(resourceSummary.regenerated, 0, "The resource ledger must not invent Vitality regeneration");
  closeTo(resourceSummary.final, -10, "The resource ledger must retain negative ending Vitality");

  const infinite = calculateRotationBaseline({
    ...{
      timeline: { ...timeline, rotation: { ...timeline.rotation, infiniteVitality: true } },
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
    },
  });
  closeTo(infinite.mysticVitalityDamageScale, 1, "Infinite Vitality must disable the final damage correction");
  closeTo(
    infinite.metrics.totalDamage,
    infinite.actionBreakdowns["rotation-0:1"].total + infinite.actionBreakdowns["rotation-1:0"].total,
    "Infinite Vitality must retain all damage",
  );

  console.log("Vitality resource ledger and final Mystic damage scaling checks passed.");
} finally {
  await viteServer.close();
}
