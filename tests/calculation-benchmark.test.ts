import { assert, describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-calculation-benchmark.mjs.
describe("calculation-benchmark", () => {
  it("Development calculation-benchmark reporting checks passed", async () => {
    const originalGroup = console.groupCollapsed;
    const originalTable = console.table;
    const originalGroupEnd = console.groupEnd;

    try {
      const { finishCalculationPhase, startCalculationPhase, withCalculationBenchmark } = await probeLoad(
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

      assert(
        groupLabel.includes("[Damage benchmark] probe request"),
        "The development benchmark must label its worker request.",
      );
      assert(
        rows.some((row) => row.phase === "Worker calculation"),
        "The benchmark must report total worker calculation time.",
      );
      assert(
        rows.some((row) => row.phase === "Real damage formula calculation" && row.calls === 1),
        "The benchmark must report damage-formula time and call count.",
      );
      assert(
        rows.some((row) => row.phase === "Per-hit stat/effective-stat resolution"),
        "The benchmark must split per-hit stat resolution from the damage formula.",
      );
      assert(
        rows.some((row) => row.phase === "Stat-effect detection"),
        "The benchmark must split stat-effect detection from stat resolution.",
      );
      assert(
        rows.some((row) => row.phase === "Stat/effective-stat pipeline execution"),
        "The benchmark must split the stat pipeline from stat resolution.",
      );
      assert(
        rows.some((row) => row.phase === "Effect and attunement aggregation"),
        "The benchmark must split effect aggregation from the damage formula.",
      );
      assert(
        rows.some((row) => row.phase === "Damage-effect field aggregation"),
        "The benchmark must split damage-effect fields from aggregation.",
      );
      assert(
        rows.some((row) => row.phase === "Skill-static effect aggregation (cache misses)"),
        "The benchmark must report cached skill-static effect aggregation.",
      );
      assert(
        rows.some((row) => row.phase === "Aggregated-effect snapshot initialization"),
        "The benchmark must report initialization from cached and lifecycle-aggregated effects.",
      );
      assert(
        rows.some((row) => row.phase === "Remaining per-hit effect field scan (parent)"),
        "The benchmark must report the remaining per-hit effect scan.",
      );
      assert(
        rows.some((row) => row.phase === "Dynamic damage-effect value resolution"),
        "The benchmark must report dynamic effect-value resolution.",
      );
      assert(
        rows.some((row) => row.phase === "Resolved attack-channel snapshot"),
        "The benchmark must split attack-channel snapshots from aggregation.",
      );
      assert(
        rows.some((row) => row.phase === "Matching attunement aggregation"),
        "The benchmark must split attunements from effect aggregation.",
      );
      assert(
        rows.some((row) => row.phase === "Outcome-rate and conversion resolution"),
        "The benchmark must split outcome-rate resolution from the damage formula.",
      );
      assert(
        rows.some((row) => row.phase === "Damage variant evaluation (parent)"),
        "The benchmark must report damage-variant evaluation as a parent phase.",
      );
      assert(
        rows.some((row) => row.phase === "Physical-channel variant math"),
        "The benchmark must split physical-channel variant math.",
      );
      assert(
        rows.some((row) => row.phase === "Attribute-channel variant math"),
        "The benchmark must split attribute-channel variant math.",
      );
      assert(
        rows.some((row) => row.phase === "Outcome weighting and result assembly"),
        "The benchmark must split outcome aggregation from the damage formula.",
      );
      assert(
        rows.some((row) => row.phase === "Target-state propagation"),
        "The benchmark must split target-state propagation from traversal.",
      );
      assert(
        rows.some((row) => row.phase === "Listener cooldown and requirement checks"),
        "The benchmark must split listener requirements from dispatch.",
      );
      assert(
        rows.some((row) => row.phase === "Replay row and damage-entry construction"),
        "The benchmark must split replay construction from dispatch.",
      );
      assert(
        rows.some((row) => row.phase === "Replay ordered-queue insertion"),
        "The benchmark must split replay queue insertion from dispatch.",
      );
      assert(
        rows.some((row) => row.phase === "Post-hit target HP update"),
        "The benchmark must split target-HP updates from traversal.",
      );
      assert(
        rows.some((row) => row.phase === "Worker orchestration and unclassified"),
        "The benchmark must expose unclassified worker overhead.",
      );
    } finally {
      console.groupCollapsed = originalGroup;
      console.table = originalTable;
      console.groupEnd = originalGroupEnd;
    }
  });
});
