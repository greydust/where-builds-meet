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
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const damage = (time) => ({ type: "damage", phyCoef: 1, phyBonus: 0, attrBonus: 0, time });
  const skills = {
    Prefight: {
      name: "Prefight",
      castTime: 1,
      action: [damage(0.5)],
      modifier: [{ effect: { castTimeModifier: 1 } }],
      tags: ["DirectDamage"],
    },
    Starting: {
      name: "Starting",
      castTime: 2,
      action: [damage(0.5), damage(1.5), damage(1.75)],
      modifier: [{ effect: { castTimeMultiplier: 2 } }],
      tags: ["DirectDamage"],
    },
    AfterEnd: { name: "After End", castTime: 1, action: [damage(0.5)], tags: ["DirectDamage"] },
  };
  const rotation = {
    name: "Battle End probe",
    eventTimeReference: "battleStart",
    start: { step: 1, action: 0 },
    steps: [
      { type: "skill", skill: "Prefight" },
      { type: "skill", skill: "Starting" },
      { type: "event", event: "Exhausted", startTime: 2 },
      { type: "event", event: "BattleEnd", startTime: 2.5 },
      { type: "skill", skill: "AfterEnd" },
    ],
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
  const result = calculateRotationBaseline({
    timeline: {
      rotation,
      skills,
      eventDefinitions: {
        Exhausted: { name: "Exhausted", castTime: 0, action: [] },
        BattleEnd: { name: "Battle End", castTime: 0, action: [] },
      },
      dots: {},
      effectDefinitions: {},
      innerWayConditions: [],
      innerWayRules: [],
      setupEffects: [],
      weapons: ["snowparting", "phalanxbane"],
    },
    startAnchor: { rowId: "rotation-1", actionIndex: 0 },
    stats,
    attunement: {},
    enemy,
    derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
    weapons: ["snowparting", "phalanxbane"],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });
  const exhausted = result.timeline.find((row) => row.step.type === "event" && row.step.event === "Exhausted");
  const battleEnd = result.timeline.find((row) => row.step.type === "event" && row.step.event === "BattleEnd");
  assert(
    Math.abs(exhausted.startTime - result.anchorTime - 2) < 1e-9,
    "Exhausted must remain two seconds after the dynamically shifted fight start.",
  );
  assert(
    Math.abs(battleEnd.startTime - result.anchorTime - 2.5) < 1e-9,
    "Battle End must remain 2.5 seconds after the dynamically shifted fight start.",
  );
  assert(
    Math.abs(result.duration - 2.5) < 1e-9,
    `Battle End must cap duration at 2.5 seconds, received ${result.duration}.`,
  );
  assert(
    Object.keys(result.actionBreakdowns).length === 2,
    `Expected two damage actions before Battle End, received ${Object.keys(result.actionBreakdowns).length}.`,
  );
  assert(
    !result.actionBreakdowns["rotation-1:2"],
    "Damage at the same timestamp as Battle End must not be calculated.",
  );
  assert(!result.actionBreakdowns["rotation-4:0"], "Damage after Battle End must not be calculated.");
  const dummyRotationPaths = [
    "/data/rotation/stonesplit-strength/mixed-dummy-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-infinite-vitality-1-min.json",
    "/data/rotation/stonesplit-strength/mixed-dummy-smolder-poet-1-min.json",
  ];
  for (const path of dummyRotationPaths) {
    const preset = (await viteServer.ssrLoadModule(path)).default;
    const battleEnds = preset.steps.filter((step) => step.type === "event" && step.event === "BattleEnd");
    assert(preset.eventTimeReference === "battleStart", `${preset.name} must use battle-start-relative events.`);
    assert(
      battleEnds.length === 1 && battleEnds[0].startTime === 60,
      `${preset.name} must contain exactly one Battle End event at 60 seconds.`,
    );
  }
  console.log("Fight-relative event timing, Battle End cutoff, and dummy preset checks passed.");
} finally {
  await viteServer.close();
}
