import { assert, describe, it } from "vitest";

// Ported from script/probe/check-dot-damage.mjs.
describe("dot-damage", () => {
  it("DOT damage and Soul-Shaken checks passed", async () => {
    const { calculateDamageBreakdown, calculateSimulatedDamageBreakdown } =
      await import("../src/calculations/damage.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts");
    const soulShaken = (await import("../data/debuff/bellstrike-umbra.json")).default.SoulShaken;
    const closeTo = (actual, expected) => Math.abs(actual - expected) < 1e-9;
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minBellstrike: 100, maxBellstrike: 100, precision: 1 };
    const enemy = {
      name: "Probe",
      level: 96,
      defense: 0,
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
    const damage = (effects, isDot, skillTags = []) =>
      calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...baseContext, skillTags, effects, isDot });
    const baselineDirect = damage([], false);
    const physicalOnly = calculateDamageBreakdown({ phyCoef: 0.02 }, { ...baseContext, isDot: true });
    const physicalOnlyRolled = calculateSimulatedDamageBreakdown(
      { phyCoef: 0.02 },
      { ...baseContext, isDot: true },
      () => 0.5,
    );
    for (const result of [physicalOnly, physicalOnlyRolled]) {
      assert(
        closeTo(result.physical, 2) && closeTo(result.total, 2),
        "Physical-only DOT must ignore attribute attack when attrCoef is omitted.",
      );
    }
    const independent = calculateDamageBreakdown({ phyCoef: 0.02, attrCoef: 0.5 }, baseContext);
    assert(
      closeTo(independent.physical, 2) && closeTo(independent.bellstrike, 50),
      "Physical and attribute coefficients must resolve independently.",
    );
    const baselineDot = damage([], true);
    const directWithBonus = damage([{ dotDamage: 0.25 }], false);
    const dotWithBonus = damage([{ dotDamage: 0.25 }], true);
    const dotWithTwoBonuses = damage([{ dotDamage: 0.25 }, { dotDamage: 0.25 }], true);

    assert(closeTo(directWithBonus.total, baselineDirect.total), "dotDamage must not affect direct damage.");
    assert(
      closeTo(dotWithBonus.total / baselineDot.total, 1.25),
      "dotDamage must multiply every DOT damage component.",
    );
    assert(
      closeTo(dotWithTwoBonuses.total / baselineDot.total, 1.5),
      "Multiple dotDamage effects must add within the DOT category.",
    );
    const simulatedBaseline = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext, isDot: true },
      () => 0.5,
    );
    const simulatedWithBonus = calculateSimulatedDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...baseContext, effects: [{ dotDamage: 0.25 }], isDot: true },
      () => 0.5,
    );
    assert(
      closeTo(simulatedWithBonus.total / simulatedBaseline.total, 1.25),
      "The simulator must use the same DOT multiplier.",
    );

    const fifthStack = soulShaken.stackEffects[4];
    const umbraRule = fifthStack[1];
    assert(
      requirementsPass(umbraRule.requirement, [], [], ["HeavenQuakerSpear"], new Set()),
      "Heavenquaker Spear must satisfy Soul-Shaken's Umbra requirement.",
    );
    assert(
      requirementsPass(umbraRule.requirement, [], [], ["StrategicSword"], new Set()),
      "Strategic Sword must satisfy Soul-Shaken's Umbra requirement.",
    );
    assert(
      !requirementsPass(umbraRule.requirement, [], [], ["SnowpartingBlade"], new Set()),
      "Non-Umbra martial arts must not receive Soul-Shaken's conditional bonus.",
    );

    for (const [tags, multiplier] of [
      [["StrategicSword", "DOT", "HighBleed"], 2],
      [["Other", "DOT", "HighBleed"], 1.75],
      [["HeavenQuakerSpear", "DOT"], 1.5],
      [["Other", "DOT"], 1.25],
    ]) {
      const selected = fifthStack
        .filter((rule) => requirementsPass(rule.requirement, [], [], tags, new Set()))
        .map((rule) => rule.effect ?? rule);
      assert(
        closeTo(damage(selected, true).total / baselineDot.total, multiplier),
        "Soul-Shaken's High Bleed bonus adds once and respects source tags",
      );
    }
  });
});
