import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { createServer } from "vite";
import { fivefoldBenchmarkBundle } from "./fivefold-benchmark-fixture.mjs";

// The committed pre-refactor model is loaded only in this diagnostic server.
const referenceCommit = "78537e2";
const referenceSources = new Map(
  ["src/calculations/outcomeTriggeredBuffs.ts", "src/calculations/rotationTimeline.ts"].map((path) => [
    path,
    execFileSync("git", ["show", `${referenceCommit}:${path}`], { encoding: "utf8", maxBuffer: 2_000_000 }),
  ]),
);
const servers = [];
try {
  const loadRunner = async (reference) => {
    const server = await createServer({
      configFile: false,
      server: { middlewareMode: true },
      appType: "custom",
      logLevel: "silent",
      plugins: reference
        ? [
            {
              name: "committed-probability-reference",
              enforce: "pre",
              transform(code, id) {
                for (const [path, source] of referenceSources)
                  if (id.replaceAll("\\", "/").endsWith(`/${path}`)) return source;
              },
            },
          ]
        : [],
    });
    servers.push(server);
    const { buildRotationTimeline } = await server.ssrLoadModule("/src/calculations/rotationTimeline.ts");
    const { calculateRotationBaseline, calculateSimulatedRotationRun } = await server.ssrLoadModule(
      "/src/calculations/rotationCalculator.ts",
    );
    return { server, buildRotationTimeline, calculateRotationBaseline, calculateSimulatedRotationRun };
  };
  const reference = await loadRunner(true);
  const current = await loadRunner(false);
  const median = (values) => {
    const sorted = [...values].sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
  };
  const counts = process.argv.slice(2).length ? process.argv.slice(2).map(Number) : [400];
  const bundles = await Promise.all(
    counts.map(async (count) => [count, await fivefoldBenchmarkBundle(current.server, count)]),
  );
  for (const [count, bundle] of bundles) {
    const samples = { previous: [], packed: [], indexed: [] };
    const outputs = {};
    for (let run = 0; run < 12; run++) {
      const modes = ["previous", "packed", "indexed"];
      for (let offset = 0; offset < modes.length; offset++) {
        const mode = modes[(run + offset) % modes.length];
        const runner = mode === "previous" ? reference : current;
        const timelineInput = {
          ...bundle.timeline,
          expectedPeriodicStateMerging: true,
          ...(mode === "previous" ? {} : { expectedPeriodicStorage: mode }),
        };
        const started = performance.now();
        const rows = runner.buildRotationTimeline(timelineInput);
        const timelineMs = performance.now() - started;
        const result = runner.calculateRotationBaseline({ ...bundle, timeline: timelineInput }, rows);
        const totalMs = performance.now() - started;
        if (run >= 6) samples[mode].push({ timelineMs, totalMs });
        const entries = result.baseline;
        const damage = entries.reduce((sum, entry) => sum + result.actionBreakdowns[entry.id].total, 0);
        const innerWayDamage = entries
          .filter((entry) => entry.sourceRowId === "innerway-FivefoldBleed")
          .reduce((sum, entry) => sum + result.actionBreakdowns[entry.id].total, 0);
        const bursts = rows.filter((row) => row.kind === "trigger" && row.step.skill === "PiercingDamage");
        outputs[mode] = {
          rows: rows.length,
          damageEntries: entries.length,
          bursts: bursts.length,
          burstWeight: bursts.reduce((sum, row) => sum + Number(row.actions[0].hitProbability ?? 1), 0),
          damage,
          innerWayDamage,
        };
      }
    }
    for (const mode of ["previous", "packed", "indexed"])
      outputs[mode] = {
        ...outputs[mode],
        timelineMedianMs: median(samples[mode].map((sample) => sample.timelineMs)),
        totalMedianMs: median(samples[mode].map((sample) => sample.totalMs)),
        relativeDamageError: outputs[mode].damage / outputs.previous.damage - 1,
        relativeInnerWayError: outputs[mode].innerWayDamage / outputs.previous.innerWayDamage - 1,
      };
    console.log(JSON.stringify({ count, referenceCommit, ...outputs }, null, 2));
    for (const mode of ["packed", "indexed"]) {
      assert.equal(outputs[mode].damageEntries, outputs.previous.damageEntries);
      assert.ok(Math.abs(outputs[mode].relativeDamageError) < 1e-10);
      assert.ok(Math.abs(outputs[mode].relativeInnerWayError) < 1e-10);
    }
    assert.deepEqual(
      current.calculateSimulatedRotationRun(bundle, () => 0.1),
      reference.calculateSimulatedRotationRun(bundle, () => 0.1),
      "Sampled calculation must remain identical to the committed pre-refactor model",
    );
  }
} finally {
  await Promise.all(servers.map((server) => server.close()));
}
