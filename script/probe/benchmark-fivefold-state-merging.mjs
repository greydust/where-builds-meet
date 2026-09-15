import { fivefoldBenchmarkBundle } from "./fivefold-benchmark-fixture.mjs";
import { createServer } from "vite";
import assert from "node:assert/strict";

const server = await createServer({
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});
try {
  const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
  const { calculateRotationBaseline, calculateSimulatedRotationRun } = await server.ssrLoadModule(
    "/src/calculations/rotationCalculator.ts",
  );
  const counts = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [400];
  const bundles = await Promise.all(counts.map(async (count) => [count, await fivefoldBenchmarkBundle(server, count)]));
  for (const [count, bundle] of bundles) {
    const input = bundle.timeline;
    const samples = { exact: [], merged: [] };
    const output = {};
    for (let run = 0; run < 10; run++) {
      for (const merged of run % 2 ? [true, false] : [false, true]) {
        const name = merged ? "merged" : "exact";
        const timelineInput = { ...input, expectedPeriodicStateMerging: merged };
        const start = performance.now();
        const rows = buildRotationTimeline(timelineInput);
        const timelineMs = performance.now() - start;
        const result = calculateRotationBaseline({ ...bundle, timeline: timelineInput }, rows);
        const totalMs = performance.now() - start;
        if (run >= 4) samples[name].push({ timelineMs, totalMs });
        const bursts = rows.filter((row) => row.kind === "trigger" && row.step.skill === "PiercingDamage");
        const damage = result.baseline.reduce((sum, entry) => sum + result.actionBreakdowns[entry.id].total, 0);
        const innerWayDamage = result.baseline
          .filter((entry) => entry.sourceRowId === "innerway-FivefoldBleed")
          .reduce((sum, entry) => sum + result.actionBreakdowns[entry.id].total, 0);
        output[name] = {
          rows: rows.length,
          damageEntries: result.baseline.length,
          bursts: bursts.length,
          thresholdBursts: bursts.filter((row) => row.skill.tags.includes("WeepingBloodMaxStack")).length,
          dotRows: rows.filter((row) => row.kind === "dot").length,
          burstWeight: bursts.reduce((sum, row) => sum + Number(row.actions[0].hitProbability ?? 1), 0),
          damage,
          innerWayDamage,
        };
      }
    }
    const median = (values) => {
      const sorted = [...values].sort((a, b) => a - b);
      return (sorted[2] + sorted[3]) / 2;
    };
    for (const name of ["exact", "merged"])
      output[name] = {
        ...output[name],
        timelineMedianMs: median(samples[name].map((s) => s.timelineMs)),
        totalMedianMs: median(samples[name].map((s) => s.totalMs)),
      };
    console.log(
      JSON.stringify(
        {
          count,
          ...output,
          relativeDamageError: (output.merged.damage - output.exact.damage) / output.exact.damage,
          relativeInnerWayError:
            (output.merged.innerWayDamage - output.exact.innerWayDamage) / output.exact.innerWayDamage,
        },
        null,
        2,
      ),
    );
    assert.ok(
      Math.abs(output.merged.damage / output.exact.damage - 1) < 1e-8,
      "Dense fixture damage stays within the regression tolerance",
    );
    assert.ok(
      Math.abs(output.merged.innerWayDamage / output.exact.innerWayDamage - 1) < 1e-8,
      "Small Inner Way errors must not hide behind ordinary hit damage",
    );
    assert.deepEqual(
      calculateSimulatedRotationRun(
        { ...bundle, timeline: { ...input, expectedPeriodicStateMerging: true } },
        () => 0.1,
      ),
      calculateSimulatedRotationRun(
        { ...bundle, timeline: { ...input, expectedPeriodicStateMerging: false } },
        () => 0.1,
      ),
      "The approximation must not affect sampled timelines or damage",
    );
  }
} finally {
  await server.close();
}
