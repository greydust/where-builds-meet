import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateRotationSimulation } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { buildRotationTimeline } = await viteServer.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
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
  const result = calculateRotationSimulation({
    timeline,
    startAnchor: { rowId: "rotation-0", actionIndex: 2 },
    stats,
    attunement,
    enemy,
    derivedStats: calculateDerivedStats(stats, enemy.judgementResistance),
    weapons: [],
    statPriority: [],
    attunementPriority: [],
    innerWayPriority: [],
    setupComparisons: {},
  });

  assert(!result.actionBreakdowns["rotation-0:0"], "An action before the anchor time must be ignored.");
  assert(!result.actionBreakdowns["rotation-0:1"], "An earlier action at the anchor timestamp must be ignored.");
  assert(result.actionBreakdowns["rotation-0:2"], "The starting action must be calculated.");
  assert(result.actionBreakdowns["rotation-0:3"], "Actions after the anchor must be calculated.");
  assert(result.metrics.breakdown.skills[0]?.hits === 2, "Ignored actions must not contribute to hit count.");
  assert(result.metrics.totalDamage > 0, "Calculated actions must still contribute damage.");
  const triggerTimeline = buildRotationTimeline({
    rotation: { name: "Trigger source probe", steps: [{ type: "skill", skill: "SourceSkill" }] },
    skills: {
      SourceSkill: { name: "Source Skill", castTime: 1, tags: [], action: [{ type: "damage", time: 1, phyCoef: 1 }] },
      TriggeredProbe: { name: "Triggered Probe", castTime: 0, cooldown: 10, tags: ["Triggered"], action: [{ type: "damage", time: 0, phyCoef: 1 }] },
    },
    eventDefinitions: {},
    dots: {},
    effectDefinitions: {},
    innerWayConditions: [],
    innerWayRules: [{ source: "Probe", tier: 0, effect: {}, trigger: { event: "damage", action: { type: "trigger", value: "TriggeredProbe" } } }],
    setupEffects: [],
    weapons: [],
  });
  assert(triggerTimeline.find((row) => row.kind === "trigger")?.sourceRowId === "rotation-0", "Inner Way-triggered actions must retain their originating base skill row.");
  console.log("Rotation start-anchor damage and hit-count checks passed.");
} finally {
  await viteServer.close();
}
