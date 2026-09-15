import { assert, describe, it } from "vitest";

// Ported from script/probe/check-nameless-spear-talents.mjs.
describe("nameless-spear-talents", () => {
  it("Nameless Spear talent calculation checks passed", async () => {
    const namelessSpear = (await import("../data/martial-art/nameless-spear.json")).default;
    const { calculateStatsWithEffects } = await import("../src/calculations/statEffects.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { calculateDamageBreakdown } = await import("../src/calculations/damage.ts");
    const { requirementsPass } = await import("../src/calculations/rotationTimeline.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");

    const assertClose = (actual, expected, message) => {
      assert(
        Number.isFinite(actual) || Math.abs(actual - expected) > 1e-9,
        `${message} Expected ${expected}, received ${actual}.`,
      );
    };
    const effects = namelessSpear.talent[13].flatMap((talent) =>
      (talent.effect ?? []).map((effect) => Object.assign({}, effect, { statStage: "talent" })),
    );
    const statResult = calculateStatsWithEffects(
      { ...emptyStats, momentum: 280, affinity: 0.25744, maxBellstrike: 459 },
      effects,
      0,
    );
    assertClose(statResult.stats.affinity, 0.3, "Momentum scaling must grant at most 4.256% Affinity Rate.");
    assertClose(
      statResult.stats.maxEndurance,
      17,
      "Max Endurance Up must use raw Affinity before the talent's Affinity conversion.",
    );
    assertClose(statResult.stats.minBellstrike, 98, "Bellstrike Attribute Up must grant Min Bellstrike Attack.");
    assertClose(statResult.stats.maxBellstrike, 655, "Bellstrike Attribute Up must grant Max Bellstrike Attack.");
    assertClose(
      statResult.stats.bellstrikeDmgBonus,
      0.11,
      "Bellstrike DMG Bonus must reach its cap at 655 Max Bellstrike Attack.",
    );

    const affinityRule = effects.find((rule) => rule.effect?.affinityDmgBonus);
    assert(affinityRule, "Nameless Spear Affinity damage talent rule was not found.");
    assert(
      requirementsPass(
        affinityRule.requirement,
        [{ name: "EndlessGale" }],
        [],
        [],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        {},
      ) ||
        requirementsPass(affinityRule.requirement, [], [], [], new Set(), ["namelessSword", "namelessSpear"], {}, {}),
      "Affinity DMG Up must work with Endless Gale while low Endurance remains unsimulated.",
    );

    const damageStats = { ...emptyStats, minPhys: 1000, maxPhys: 1000, precision: 1, affinity: 1 };
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
    const context = {
      stats: damageStats,
      attunement: {},
      skillTags: [],
      weapons: ["namelessSword", "namelessSpear"],
      buffs: [{ name: "EndlessGale" }],
      enemy,
      derivedStats: calculateDerivedStats(damageStats, 0),
    };
    const baseline = calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...context, effects: [] });
    const enhanced = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, effects: [affinityRule.effect] },
    );
    assertClose(
      enhanced.physical / baseline.physical,
      1 + baseline.outcomeRates.affinity * 0.18,
      "Affinity DMG Up must cap at 18% above 30% Affinity Rate.",
    );
  });
});
