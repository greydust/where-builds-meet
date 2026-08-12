import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateRotationBaseline } = await viteServer.ssrLoadModule("/src/calculations/rotationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, precision: 1 };
  const enemy = { name: "Probe", level: 96, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const result = calculateRotationBaseline({
    timeline: {
      rotation: { name: "Cast breakdown probe", steps: [{ type: "skill", skill: "Base" }, { type: "skill", skill: "Base" }] },
      skills: {
        Base: { name: "Base", castTime: 2, action: [{ type: "damage", phyCoef: 1, time: 0 }, { type: "trigger", value: "Child", time: 0.5 }], modifier: [], tags: ["BaseOnly"] },
        Child: { name: "Child", castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }], modifier: [], tags: ["Triggered"] },
        MoraleChant: { name: "Morale Chant", castTime: 0, action: [{ type: "damage", phyCoef: 1, time: 0 }], modifier: [], tags: ["Triggered"] },
      },
      eventDefinitions: {}, dots: {}, effectDefinitions: {}, innerWayConditions: [], setupEffects: [], weapons: [],
      innerWayRules: [{ source: "MoraleChant", tier: 6, requirement: [{ target: "skillTag", value: "BaseOnly" }], effect: {}, trigger: { event: "damage", action: [{ type: "trigger", value: "MoraleChant" }] } }],
    },
    startAnchor: { rowId: "rotation-0" }, stats, attunement: {}, enemy, derivedStats: calculateDerivedStats(stats, 0), weapons: [],
    statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {},
  });
  const baseRows = result.timeline.filter((row) => row.step.type === "skill" && row.step.skill === "Base");
  const childRows = result.timeline.filter((row) => row.step.type === "skill" && row.step.skill === "Child");
  const moraleRows = result.timeline.filter((row) => row.step.type === "skill" && row.step.skill === "MoraleChant");
  const baseCast = result.metrics.breakdown.casts.find((row) => row.skillId === "Base");
  const moraleCast = result.metrics.breakdown.casts.find((row) => row.skillId === "MoraleChant");
  const damage = (row) => row ? result.actionBreakdowns[`${row.id}:0`]?.total ?? 0 : 0;
  const damageSum = (rows) => rows.reduce((total, row) => total + damage(row), 0);
  assert(result.metrics.breakdown.casts.length === 2, "Repeated casts must group into one skill row, with Inner Way triggers in their own group.");
  assert(baseCast?.casts === 2 && Math.abs(baseCast.damage - damageSum(baseRows) - damageSum(childRows)) < 1e-9, "Directly triggered skill damage must sum into its grouped base casts.");
  assert(moraleCast?.casts === 2 && Math.abs(moraleCast.damage - damageSum(moraleRows)) < 1e-9, "Inner Way-triggered Morale Chant damage must remain a separate grouped row.");
  assert(baseCast.averageCastTime === 2 && Math.abs((baseCast.averageDps ?? 0) - baseCast.damage / baseCast.casts / 2) < 1e-9, "Average DPS must average the DPS of each effective cast.");
  assert(result.metrics.breakdown.casts[0].skillId === "Base", "Grouped cast rows must be sorted by average DPS descending.");
  console.log("Per-cast damage attribution checks passed.");
} finally {
  await viteServer.close();
}
