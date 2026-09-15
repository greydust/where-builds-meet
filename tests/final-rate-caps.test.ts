import { assert, describe, it } from "vitest";

// Ported from script/probe/check-final-rate-caps.mjs.
describe("final-rate-caps", () => {
  it("Final Critical and Affinity rate cap checks passed", async () => {
    const { calculateRates } = await import("../src/calculations/effectiveStats.ts");

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
  });
});
