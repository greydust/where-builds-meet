import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

const originalGroup = console.groupCollapsed;
const originalTable = console.table;
const originalGroupEnd = console.groupEnd;

try {
  const { finishCalculationPhase, startCalculationPhase, withCalculationBenchmark } = await viteServer.ssrLoadModule(
    "/src/calculations/calculationBenchmark.ts",
  );
  let groupLabel = "";
  let rows = [];
  console.groupCollapsed = (label) => {
    groupLabel = String(label);
  };
  console.table = (value) => {
    rows = value;
  };
  console.groupEnd = () => {};

  withCalculationBenchmark("probe request", () => {
    const startedAt = startCalculationPhase();
    for (let index = 0; index < 10000; index += 1) Math.sqrt(index);
    finishCalculationPhase("damageCalculation", startedAt);
  });

  if (!groupLabel.includes("[Damage benchmark] probe request"))
    throw new Error("The development benchmark must label its worker request.");
  if (!rows.some((row) => row.phase === "Worker calculation"))
    throw new Error("The benchmark must report total worker calculation time.");
  if (!rows.some((row) => row.phase === "Real damage formula calculation" && row.calls === 1))
    throw new Error("The benchmark must report damage-formula time and call count.");
  if (!rows.some((row) => row.phase === "Per-hit stat/effective-stat resolution"))
    throw new Error("The benchmark must split per-hit stat resolution from the damage formula.");
  if (!rows.some((row) => row.phase === "Stat-effect detection"))
    throw new Error("The benchmark must split stat-effect detection from stat resolution.");
  if (!rows.some((row) => row.phase === "Stat/effective-stat pipeline execution"))
    throw new Error("The benchmark must split the stat pipeline from stat resolution.");
  if (!rows.some((row) => row.phase === "Effect and attunement aggregation"))
    throw new Error("The benchmark must split effect aggregation from the damage formula.");
  if (!rows.some((row) => row.phase === "Damage-effect field aggregation"))
    throw new Error("The benchmark must split damage-effect fields from aggregation.");
  if (!rows.some((row) => row.phase === "Resolved attack-channel snapshot"))
    throw new Error("The benchmark must split attack-channel snapshots from aggregation.");
  if (!rows.some((row) => row.phase === "Matching attunement aggregation"))
    throw new Error("The benchmark must split attunements from effect aggregation.");
  if (!rows.some((row) => row.phase === "Outcome-rate and conversion resolution"))
    throw new Error("The benchmark must split outcome-rate resolution from the damage formula.");
  if (!rows.some((row) => row.phase === "Damage variant evaluation (parent)"))
    throw new Error("The benchmark must report damage-variant evaluation as a parent phase.");
  if (!rows.some((row) => row.phase === "Physical-channel variant math"))
    throw new Error("The benchmark must split physical-channel variant math.");
  if (!rows.some((row) => row.phase === "Attribute-channel variant math"))
    throw new Error("The benchmark must split attribute-channel variant math.");
  if (!rows.some((row) => row.phase === "Outcome weighting and result assembly"))
    throw new Error("The benchmark must split outcome aggregation from the damage formula.");
  if (!rows.some((row) => row.phase === "Target-state propagation"))
    throw new Error("The benchmark must split target-state propagation from traversal.");
  if (!rows.some((row) => row.phase === "Listener cooldown and requirement checks"))
    throw new Error("The benchmark must split listener requirements from dispatch.");
  if (!rows.some((row) => row.phase === "Replay row and damage-entry construction"))
    throw new Error("The benchmark must split replay construction from dispatch.");
  if (!rows.some((row) => row.phase === "Replay ordered-queue insertion"))
    throw new Error("The benchmark must split replay queue insertion from dispatch.");
  if (!rows.some((row) => row.phase === "Post-hit target HP update"))
    throw new Error("The benchmark must split target-HP updates from traversal.");
  if (!rows.some((row) => row.phase === "Worker orchestration and unclassified"))
    throw new Error("The benchmark must expose unclassified worker overhead.");

  console.log("Development calculation-benchmark reporting checks passed.");
} finally {
  console.groupCollapsed = originalGroup;
  console.table = originalTable;
  console.groupEnd = originalGroupEnd;
  await viteServer.close();
}
