import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };
  const skills = {
    Opening: {
      name: "Opening",
      castTime: 2,
      action: [{ type: "damage", phyCoef: 1, phyBonus: 0, attrBonus: 0, time: 1 }],
      modifier: [{ requirement: [], effect: { castTimeModifier: -1 } }],
      tags: ["DirectDamage"],
    },
    FollowUp: {
      name: "Follow Up",
      castTime: 1,
      action: [{ type: "damage", phyCoef: 1, phyBonus: 0, attrBonus: 0, time: 0.5 }],
      modifier: [],
      tags: ["DirectDamage"],
    },
  };
  const rotation = {
    name: "Delay probe",
    steps: [
      { type: "skill", skill: "Opening" },
      { type: "event", event: "Delay", duration: 3 },
      { type: "skill", skill: "FollowUp" },
    ],
    start: { step: 0, action: 0 },
  };
  const timelineInput = {
    rotation,
    skills,
    eventDefinitions: { Delay: { name: "Delay", castTime: 0, action: [], tags: ["Event"] } },
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [],
    setupEffects: [],
    weapons: [],
  };
  const timeline = buildRotationTimeline(timelineInput);
  const delay = timeline.find((row) => row.step.type === "event" && row.step.event === "Delay");
  const followUp = timeline.find((row) => row.step.type === "skill" && row.step.skill === "FollowUp");
  assert(
    delay?.startTime === 1 && delay.effectiveCastTime === 3,
    "Delay must start after the adjusted preceding cast and retain its duration.",
  );
  assert(followUp?.startTime === 4, "Delay must shift every following skill by its duration.");

  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
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
  const trailingRotation = {
    name: "Trailing delay",
    steps: [
      { type: "skill", skill: "Opening" },
      { type: "event", event: "Delay", duration: 3 },
    ],
    start: { step: 0, action: 0 },
  };
  const result = calculateRotationBaseline({
    timeline: { ...timelineInput, rotation: trailingRotation },
    startAnchor: { rowId: "rotation-0", actionIndex: 0 },
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
  assert(result.duration === 4, "A trailing Delay must extend rotation duration even though it has no actions.");
  console.log("Sequential Delay timing, modifier shifting, and trailing duration checks passed.");
} finally {
  await viteServer.close();
}
