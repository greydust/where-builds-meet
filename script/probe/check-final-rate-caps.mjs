import { createServer } from "vite";

const viteServer = await createServer({
  root: process.cwd(),
  configFile: false,
  server: { middlewareMode: true },
  appType: "custom",
  logLevel: "silent",
});

try {
  const { calculateRates } = await viteServer.ssrLoadModule("/src/calculations/effectiveStats.ts");
  const assert = (condition, message) => {
    if (!condition) throw new Error(message);
  };

  const cappedAffinity = calculateRates({
    effectivePrecision: 1,
    effectiveCrit: 0.8,
    effectiveAffinity: 0.4,
    directCrit: 0.4,
    directAffinity: 0.8,
  });
  assert(cappedAffinity.finalAffinity === 1, "Final Affinity must be capped at 100%.");
  assert(cappedAffinity.affinityRate === 1, "The Affinity outcome rate must use capped Final Affinity.");
  assert(cappedAffinity.finalCrit === 0, "Capped 100% Affinity must leave no Critical outcome rate.");

  const boundedRates = calculateRates({
    effectivePrecision: 2,
    effectiveCrit: 0.8,
    effectiveAffinity: 0,
    directCrit: 0.4,
    directAffinity: 0,
  });
  assert(boundedRates.finalCrit === 1, "Final Critical must be capped at 100%.");
  assert(boundedRates.critRate === 1, "The Critical outcome rate must use capped Final Critical.");

  console.log("Final Critical and Affinity rate cap checks passed.");
} finally {
  await viteServer.close();
}
