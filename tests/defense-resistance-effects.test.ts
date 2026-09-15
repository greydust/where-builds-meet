import { assert, describe, it } from "vitest";

// Ported from script/probe/check-defense-resistance-effects.mjs.
describe("defense-resistance-effects", () => {
  it("Enemy defense, Physical Resistance, and Qingyi's Charm checks passed", async () => {
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
    const stats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1 };
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 408,
      physicalResistance: 0,
      bellstrikeResistance: 0,
      stonesplitResistance: 0,
      silkbindResistance: 0,
      bamboocutResistance: 0,
      judgementResistance: 0,
    };
    const baseContext = {
      stats,
      attunement: {},
      skillTags: [],
      weapons: [],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(stats, 0),
      effects: [],
    };
    const damage = (effects) =>
      calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...baseContext, effects }).physical;
    const baseline = damage([]);
    const reducedDefense = damage([{ defenseBonus: -0.06 }]);
    const reducedResistance = damage([{ physicalResistance: -10 }]);
    const combined = damage([{ defenseBonus: -0.06, physicalResistance: -10 }]);

    assert(closeTo(baseline, 592), "Probe baseline must use the unadjusted 408 defense.");
    assert(closeTo(reducedDefense, 616.48), "A -6% defense adjustment must reduce 408 defense to 383.52.");
    assert(
      closeTo(reducedResistance / baseline, 1.05),
      "Reducing Physical Resistance by 10 must use the flat resistance formula.",
    );
    assert(
      closeTo(combined, 616.48 * 1.05),
      "Defense and resistance reductions must apply through their separate formula stages.",
    );

    const simulatedBaseline = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext },
      () => 0.5,
    ).physical;
    const simulatedCombined = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext, effects: [{ defenseBonus: -0.06, physicalResistance: -10 }] },
      () => 0.5,
    ).physical;
    assert(
      closeTo(simulatedCombined / simulatedBaseline, combined / baseline),
      "The simulator must use the same defense and resistance adjustments.",
    );
  });
});
