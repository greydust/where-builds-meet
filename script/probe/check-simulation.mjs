import { createServer } from "vite";

const viteServer = await createServer({ root: process.cwd(), configFile: false, server: { middlewareMode: true }, appType: "custom", logLevel: "silent" });

try {
  const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } = await viteServer.ssrLoadModule("/src/calculations/damage.ts");
  const { simulateRotation } = await viteServer.ssrLoadModule("/src/calculations/simulationCalculator.ts");
  const { calculateDerivedStats } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const { emptyStats } = await viteServer.ssrLoadModule("/src/data/statDefinitions.ts");
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const stats = { ...emptyStats, minPhys: 100, maxPhys: 200, precision: 1 };
  const enemy = { name: "Probe", level: 1, defense: 0, physicalResistance: 0, bellstrikeResistance: 0, stonesplitResistance: 0, silkbindResistance: 0, bamboocutResistance: 0, judgementResistance: 0 };
  const context = { stats, attunement: {}, skillTags: [], weapons: [], buffs: [], enemy, derivedStats: calculateDerivedStats(stats, 0), effects: [] };
  const action = { type: "damage", time: 1, phyCoef: 1 };
  const expected = calculateDamageBreakdown(action, context);
  const minimum = calculateSimulatedDamageBreakdown(action, context, () => 0);
  const maximum = calculateSimulatedDamageBreakdown(action, context, () => 1);

  assert(minimum.outcome === "normal" && maximum.outcome === "normal", "The controlled probe should select a normal hit.");
  assert(minimum.total < expected.total && expected.total < maximum.total, "Simulation mode must sample around deterministic average damage.");

  const timeline = {
    rotation: { name: "Simulation probe", steps: [{ type: "skill", skill: "ProbeSkill" }] },
    skills: { ProbeSkill: { name: "Probe Skill", castTime: 1, tags: [], action: [action] } },
    eventDefinitions: {}, dots: {}, effectDefinitions: {}, innerWayConditions: [], innerWayRules: [], setupEffects: [], weapons: [],
  };
  const bundle = { timeline, startAnchor: { rowId: "rotation-0" }, stats, attunement: {}, enemy, derivedStats: context.derivedStats, weapons: [], statPriority: [], attunementPriority: [], innerWayPriority: [], setupComparisons: {} };
  let seed = 123456789;
  const random = () => ((seed = (1664525 * seed + 1013904223) >>> 0) / 4294967296);
  let finalProgress;
  const summary = simulateRotation(bundle, 101, random, (completed, total) => { finalProgress = { completed, total }; });
  const ordered = [summary.results.best, summary.results.p99, summary.results.p95, summary.results.p90, summary.results.p75, summary.results.median];

  assert(summary.runCount === 101, "The simulator must produce the requested number of runs.");
  assert(finalProgress?.completed === 101 && finalProgress.total === 101, "Progress must finish at the requested run count.");
  assert(ordered.every((result, index) => index === 0 || ordered[index - 1].dps >= result.dps), "Displayed DPS percentiles must remain sorted.");
  assert(ordered.every((result) => result.normalPercentage === 100), "Outcome percentages must count the sampled hit outcomes.");
  console.log("Shared simulated-damage mode, progress, and percentile checks passed.");
} finally {
  await viteServer.close();
}
