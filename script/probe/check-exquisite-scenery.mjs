import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { requirementsPass } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const exquisiteScenery = (await viteServer.ssrLoadModule("/data/innerway/exquisite-scenery.json")).default;
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const sceneryT6 = exquisiteScenery.effect.ExquisiteSceneryT6.effect[0];
  const sceneryT6Applies = (tags) =>
    requirementsPass(sceneryT6.requirement, [], [], tags, ["ExquisiteSceneryT6"], ["thundercry", "stormbreaker"]);
  assert(
    sceneryT6.effect.dmgBonus === 0.5 &&
      [
        ["Light", "Charged"],
        ["Heavy", "Charged"],
        ["Light", "Charged", "VariedCombo"],
        ["Heavy", "Charged", "VariedCombo"],
      ].every(sceneryT6Applies),
    "Exquisite Scenery T6 must grant 50% damage to all four charged and charged-varied attack categories.",
  );
  assert(
    !sceneryT6Applies(["Light"]) &&
      !sceneryT6Applies(["Charged"]) &&
      !sceneryT6Applies(["Light", "VariedCombo"]) &&
      !sceneryT6Applies(["Heavy", "VariedCombo"]),
    "Exquisite Scenery T6 must not affect attacks outside its charged and varied-combo categories.",
  );

  const t6Rule = {
    requirement: sceneryT6.requirement,
    effect: sceneryT6.effect,
    source: "ExquisiteScenery",
    tier: 6,
  };
  const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
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
  const sceneryDamage = (tags, innerWayRules) =>
    calculateRotationBaseline({
      timeline: {
        rotation: { name: "Scenery T6 probe", steps: [{ type: "skill", skill: "Hit" }] },
        skills: {
          Hit: {
            name: "Hit",
            castTime: 1,
            action: [{ type: "damage", phyCoef: 1, phyBonus: 0, attrBonus: 0, time: 1 }],
            modifier: [],
            tags,
          },
        },
        eventDefinitions: {},
        dots: {},
        effectDefinitions: {},
        innerWayConditions: ["ExquisiteSceneryT6"],
        innerWayRules,
        setupEffects: [],
        weapons: ["thundercry", "stormbreaker"],
      },
      startAnchor: { rowId: "rotation-0", actionIndex: 0 },
      stats,
      attunement: {},
      enemy,
      derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
      weapons: ["thundercry", "stormbreaker"],
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    }).metrics.totalDamage;

  const heavyChargedBase = sceneryDamage(["Heavy", "Charged"], []);
  assert(
    Math.abs(sceneryDamage(["Heavy", "Charged"], [t6Rule]) / heavyChargedBase - 1.5) < 1e-9,
    "Exquisite Scenery T6 must multiply qualifying calculated damage by 1.5 when no other damage bonus is present.",
  );
  assert(
    sceneryDamage(["Heavy", "MartialArts"], [t6Rule]) === sceneryDamage(["Heavy", "MartialArts"], []),
    "Exquisite Scenery T6 must leave non-qualifying calculated damage unchanged.",
  );
  console.log("Exquisite Scenery T6 tagged-damage checks passed.");
} finally {
  await viteServer.close();
}
