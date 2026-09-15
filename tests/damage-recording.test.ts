import { describe, it } from "vitest";
import assert from "node:assert/strict";

// Ported from script/probe/check-damage-recording.mjs.
describe("damage-recording", () => {
  it("Rodent Hunt recording, reapply/expiry, boundary, cutoff, HP, and sampled-damage checks passed", async () => {
    const cast = (skill) => ({ type: "skill", skill });
    const delay = (duration) => ({ type: "event", event: "Delay", duration });
    const close = (actual, expected, message) =>
      assert.ok(Math.abs(actual - expected) < 1e-7, `${message}: ${actual} vs ${expected}`);
    const mortal = await import("../data/skill/mortal-rope-dart.json");
    const infernal = await import("../data/skill/infernal-twinblades.json");
    const buffs = await import("../data/buff/bamboocut-wind.json");
    const debuffs = await import("../data/debuff/bamboocut-wind.json");
    const vendetta = await import("../data/innerway/vendetta.json");
    const { calculateRotationBaseline, calculateSimulatedRotationRun, calculateRotationComparisons } =
      await import("../src/calculations/rotationCalculator.ts");
    const { simulateRotation } = await import("../src/calculations/simulationCalculator.ts");
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const stats = {
      ...emptyStats,
      minPhys: 100,
      maxPhys: 300,
      minBamboocut: 80,
      maxBamboocut: 180,
      precision: 1,
      criticalRate: 0.4,
    };
    const weapons = ["mortalRopeDart", "infernalTwinblades"];
    const bundle = (steps) => ({
      timeline: {
        rotation: { name: "Rodent Hunt probe", targetHP: 100000, steps },
        skills: {
          ...mortal,
          ...infernal,
          Extend: {
            castTime: 0,
            action: [{ type: "extend", target: "target", value: "RodentHunt", duration: 10, time: 0 }],
          },
          Token: { castTime: 0, action: [{ type: "apply", target: "self", value: "VendettaToken", time: 0 }] },
        },
        effectDefinitions: { ...buffs, ...debuffs },
        dots: {},
        eventDefinitions: {},
        weapons,
        innerWayConditions: ["VendettaT3", "Flamelash", "EchoesOfOblivionT6"],
        innerWayRules: [0, 1].flatMap((tier) =>
          vendetta.effect["VendettaT" + tier].effect.map((effect) =>
            Object.assign({ effect: {} }, effect, { source: "Vendetta", tier }),
          ),
        ),
        setupEffects: [],
      },
      startAnchor: { rowId: "rotation-0" },
      stats,
      derivedStats: calculateDerivedStats(stats, 0),
      enemy: {
        name: "Recording target",
        level: 96,
        defense: 0,
        physicalResistance: 0,
        bellstrikeResistance: 0,
        stonesplitResistance: 0,
        silkbindResistance: 0,
        bamboocutResistance: 0,
        judgementResistance: 0,
      },
      weapons,
      attunement: {},
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    const payouts = (result) => result.baseline.filter((entry) => entry.replay);
    const rodents = (result) => result.baseline.filter((entry) => entry.context.skillTags.includes("Rodent"));
    const damage = (result, entries) =>
      entries.reduce((sum, entry) => sum + result.actionBreakdowns[entry.id].total, 0);
    const checkPayouts = (result) => {
      for (const entry of payouts(result)) {
        const expected =
          entry.replay.sourceEntryIds.reduce((sum, id) => sum + result.actionBreakdowns[id].total, 0) * 0.3;
        close(result.actionBreakdowns[entry.id].total, expected, "Payout copies the final damage of recorded hits");
        assert.equal(result.actionBreakdowns[entry.id].outcomeRates, undefined, "Payout cannot roll a new outcome");
      }
    };
    const steps = [
      cast("BladeboundThreadCancel"),
      cast("RodentRampage"),
      cast("InfernalLight1"),
      cast("InfernalFlamelashLight5"),
      delay(16),
      cast("InfernalLight1"),
    ];
    const result = calculateRotationBaseline(bundle(steps));
    assert.equal(payouts(result).length, 1, "Expiry settles one window");
    assert.equal(
      payouts(result)[0].replay.sourceEntryIds.length,
      4,
      "One ordinary Rodent plus all three FA5 Rodents are recorded",
    );
    close(payouts(result)[0].timelineTime, 15.385, "Hunt expires independently of the 20-second Token");
    checkPayouts(result);
    assert.equal(rodents(result).length, 5, "A later Rodent still attacks but is outside the recording window");
    const later = result.baseline.find((entry) => entry.id === "rotation-5:0");
    const earlier = result.baseline.filter((entry) => entry.timelineTime < later.timelineTime);
    close(
      later.context.targetHPRatio,
      1 - damage(result, earlier) / 100000,
      "Settlement reduces HP before a subsequent hit",
    );

    const comparisonBundle = bundle(steps);
    const higherStats = { ...stats, minPhys: 200, maxPhys: 500 };
    comparisonBundle.statPriority = [{ label: "Higher attack", stats: higherStats }];
    const comparison = calculateRotationComparisons(comparisonBundle, result);
    const higherBundle = bundle(steps);
    higherBundle.stats = higherStats;
    higherBundle.derivedStats = calculateDerivedStats(higherStats, 0);
    const higher = calculateRotationBaseline(higherBundle);
    close(
      comparison.statPriority[0].dpsDifference,
      higher.metrics.dps - result.metrics.dps,
      "Stat comparisons recalculate both source damage and the recording payout",
    );
    assert.ok(
      damage(higher, payouts(higher)) > damage(result, payouts(result)),
      "Payout increases with variant source damage",
    );

    const reapply = calculateRotationBaseline(
      bundle([
        cast("BladeboundThreadCancel"),
        cast("Rodent"),
        cast("BladeboundThreadCancel"),
        cast("Rodent"),
        delay(20),
      ]),
    );
    assert.equal(payouts(reapply).length, 2, "Reapply settles old hits and expiry settles new hits once");
    close(payouts(reapply)[0].timelineTime, 8.385, "Reapplication settles immediately");
    close(payouts(reapply)[1].timelineTime, 23.385, "Old expiry does not settle the replacement window");
    assert.deepEqual(
      payouts(reapply).map((entry) => entry.replay.sourceEntryIds.length),
      [1, 1],
    );
    checkPayouts(reapply);

    const boundary = calculateRotationBaseline(
      bundle([
        cast("BladeboundThreadCancel"),
        cast("Rodent"),
        delay(14.615),
        cast("BladeboundThreadCancel"),
        cast("Rodent"),
        delay(16),
      ]),
    );
    assert.equal(payouts(boundary).length, 2, "Same-time expiry and reapplication settle each activation once");
    close(payouts(boundary)[0].timelineTime, 15.385, "Old activation settles at the boundary");
    close(payouts(boundary)[1].timelineTime, 30.385, "New activation retains its full window");
    checkPayouts(boundary);
    const exact = calculateRotationBaseline(
      bundle([cast("BladeboundThreadCancel"), cast("Rodent"), delay(15), cast("Rodent"), delay(1)]),
    );
    assert.equal(
      payouts(exact)[0].replay.sourceEntryIds.length,
      1,
      "Hit at the exclusive expiration boundary is not recorded",
    );
    const fixed = calculateRotationBaseline(
      bundle([cast("BladeboundThreadCancel"), cast("Rodent"), delay(5), cast("Extend"), cast("Token"), delay(16)]),
    );
    close(payouts(fixed)[0].timelineTime, 15.385, "Extension and Token refresh do not delay settlement");
    assert.equal(
      payouts(calculateRotationBaseline(bundle([cast("BladeboundThreadCancel"), delay(16)]))).length,
      0,
      "Empty window emits no damage",
    );
    const short = calculateRotationBaseline(bundle([cast("BladeboundThreadCancel"), cast("Rodent"), delay(1)]));
    assert.equal(payouts(short).length, 0, "Recording does not extend combat");
    close(short.duration, 1.385, "Combat ends at the final explicit Delay");
    const ended = bundle([
      cast("BladeboundThreadCancel"),
      cast("Rodent"),
      { type: "event", event: "BattleEnd", startTime: 15.385 },
    ]);
    ended.timeline.eventDefinitions.BattleEnd = { name: "Battle End", action: [] };
    assert.equal(
      payouts(calculateRotationBaseline(ended)).length,
      0,
      "Battle End excludes a settlement at its timestamp",
    );
    const precombat = bundle([cast("BladeboundThreadCancel"), cast("Rodent"), delay(5), cast("Rodent"), delay(16)]);
    precombat.startAnchor = { rowId: "rotation-3" };
    const anchored = calculateRotationBaseline(precombat);
    const full = calculateRotationBaseline(bundle(precombat.timeline.rotation.steps));
    close(
      damage(anchored, payouts(anchored)),
      damage(full, payouts(full)),
      "Payout retains recorded damage from before the selected anchor",
    );
    const precombatSample = calculateSimulatedRotationRun(precombat, () => 0.7);
    const fullSample = calculateSimulatedRotationRun(bundle(precombat.timeline.rotation.steps), () => 0.7);
    close(
      precombatSample.resolvedSequence.find((item) => item.entry.replay).breakdown.total,
      fullSample.resolvedSequence.find((item) => item.entry.replay).breakdown.total,
      "Sampled payout retains precombat source hits",
    );
    const disabled = bundle(steps);
    disabled.timeline.innerWayConditions = [];
    assert.equal(payouts(calculateRotationBaseline(disabled)).length, 0, "Tiers below T3 do not record");

    for (const roll of [0.1, 0.9]) {
      const sampled = calculateSimulatedRotationRun(bundle(steps), () => roll);
      const byId = new Map(sampled.resolvedSequence.map((item) => [item.entry.id, item.breakdown.total]));
      const settlements = sampled.resolvedSequence.filter((item) => item.entry.replay);
      assert.equal(settlements.length, 1);
      for (const { entry, breakdown } of settlements)
        close(
          breakdown.total,
          entry.replay.sourceEntryIds.reduce((sum, id) => sum + byId.get(id), 0) * 0.3,
          "Sampled payout uses this run's source outcomes",
        );
      const total = sampled.resolvedSequence.reduce((sum, item) => sum + item.breakdown.total, 0);
      close(
        simulateRotation(bundle(steps), 1, () => roll).runs[0].totalDamage,
        total,
        "Public simulation uses the same chronological recording calculation",
      );
    }
  });
});
