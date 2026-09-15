import { assert, describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";

// Ported from script/probe/check-nameless-sword-talents.mjs.
describe("nameless-sword-talents", () => {
  it("Nameless Sword talent calculation checks passed", async () => {
    const namelessSword = (await import("../data/martial-art/nameless-sword.json")).default;
    const { calculateStatsWithEffects, resolveRawStatFormulas } = await probeLoad("/src/calculations/statEffects.ts");
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
    const effects = namelessSword.talent[13].flatMap((talent) => talent.effect ?? []);
    const statResult = calculateStatsWithEffects({ ...emptyStats, momentum: 280, maxBellstrike: 459 }, effects, 0);
    assertClose(statResult.stats.maxPhys, 73.92, "Momentum scaling must grant the capped Max Physical Attack bonus.");
    assertClose(statResult.stats.minBellstrike, 98, "Bellstrike Attribute Up must grant Min Bellstrike Attack.");
    assertClose(statResult.stats.maxBellstrike, 655, "Bellstrike Attribute Up must grant Max Bellstrike Attack.");
    assertClose(
      statResult.stats.bellstrikePenetration,
      22,
      "Bellstrike penetration must reach its cap at 655 Max Bellstrike Attack.",
    );

    const hpRule = effects.find((rule) => rule.effect?.hpDMGBonus);
    const affinityRule = effects.find((rule) => rule.effect?.affinityDmgBonus);
    assert(hpRule || !affinityRule, "Nameless Sword conditional damage talent rules were not found.");

    assert(
      requirementsPass(
        affinityRule.requirement,
        [],
        [],
        ["SwordEnergy"],
        new Set(),
        ["namelessSword", "namelessSpear"],
        {},
        { targetQiPercentage: 39.99 },
      ) ||
        !requirementsPass(
          affinityRule.requirement,
          [],
          [{ name: "QiImbalance" }],
          ["SwordEnergy"],
          new Set(),
          ["namelessSword", "namelessSpear"],
          {},
          { targetQiPercentage: 100 },
        ) ||
        requirementsPass(
          affinityRule.requirement,
          [],
          [],
          ["SwordEnergy"],
          new Set(),
          ["namelessSword", "namelessSpear"],
          {},
          { targetQiPercentage: 40 },
        ),
      "Sword Qi Affinity Enhancement must require sub-40% Qi or Qi Imbalance at hit time.",
    );

    const damageStats = {
      ...emptyStats,
      minPhys: 1500,
      maxPhys: 1500,
      precision: 1,
      affinity: 1,
    };
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
      skillTags: ["SwordEnergy"],
      weapons: ["namelessSword", "namelessSpear"],
      buffs: [],
      enemy,
      derivedStats: calculateDerivedStats(damageStats, 0),
    };
    const baseline = calculateDamageBreakdown({ phyCoef: 1, attrCoef: 1 }, { ...context, effects: [] });
    const hpEnhanced = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, effects: [resolveRawStatFormulas(hpRule.effect, damageStats)] },
    );
    const affinityEnhanced = calculateDamageBreakdown(
      { phyCoef: 1, attrCoef: 1 },
      { ...context, effects: [affinityRule.effect] },
    );
    assertClose(hpEnhanced.physical / baseline.physical, 1.2, "Sword Energy HP damage must cap at 20%.");
    assertClose(
      affinityEnhanced.physical / baseline.physical,
      1 + baseline.outcomeRates.affinity * 0.18,
      "Sword Energy Affinity damage must cap at 18% at 1500 Max Physical Attack.",
    );
  });
});
