import { describe, it } from "vitest";
import { probeLoad } from "./helpers/probe-loader.js";
import assert from "node:assert/strict";

// Ported from script/probe/check-fivefold-bleed-tiers.mjs.
describe("fivefold-bleed-tiers", () => {
  it("Fivefold Bleed T1/T2 scaling and T3 expiration, refresh, removal, duplicate-schedule, and exhaustive probability checks passed", async () => {
    const load = (file) => probeLoad(file);
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { calculateRotationBaseline, calculateSimulatedRotationRun } = await load(
      "/src/calculations/rotationCalculator.ts",
    );
    const { calculateDerivedStats } = await import("../src/calculations/effectiveStats.ts");
    const { emptyStats } = await import("../src/data/statDefinitions.ts");
    const { innerWayDefinitionForSoloLevel } = await import("../src/data/innerWayDefinitions.ts");
    const way = innerWayDefinitionForSoloLevel((await import("../data/innerway/fivefold-bleed.json")).default, 17);
    const dots = (await import("../data/dot/innerway.json")).default;
    const { PiercingDamage: piercingDefinition } = (await import("../data/skill/general.json")).default;
    // Keep the original independent-history oracle; full feedback is tested separately.
    const PiercingDamage = {
      ...piercingDefinition,
      tags: piercingDefinition.tags.filter((tag) => tag !== "DirectDamage"),
    };
    const rulesFor = (tier) =>
      Array.from({ length: tier + 1 }, (_, index) => {
        const definition = way.effect[`FivefoldBleedT${index}`];
        return (definition.effect ?? [])
          .map((effect) =>
            Object.assign({}, effect, { effect: effect.effect ?? effect, source: "FivefoldBleed", tier: index }),
          )
          .concat(
            (definition.trigger ?? []).map((trigger) => ({
              trigger,
              effect: {},
              source: "FivefoldBleed",
              tier: index,
            })),
          );
      }).flat();
    const inputFor = (tier, times = [0]) => ({
      rotation: { name: "Tier probe", steps: [{ type: "skill", skill: "Hits" }] },
      skills: {
        PiercingDamage,
        Hits: {
          name: "Hits",
          castTime: 12,
          tags: ["DirectDamage"],
          action: times.map((time) => ({ type: "damage", phyCoef: 1, time })),
        },
      },
      dots,
      effectDefinitions: dots,
      eventDefinitions: {},
      innerWayRules: rulesFor(tier),
      innerWayConditions: Array.from({ length: tier + 1 }, (_, index) => `FivefoldBleedT${index}`),
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    });
    const stats = { ...emptyStats, minPhys: 100, maxPhys: 100, minSilkbind: 10000, maxSilkbind: 10000, precision: 1 };
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
    const bundleFor = (timeline) => ({
      timeline,
      startAnchor: { rowId: "rotation-0" },
      stats,
      enemy,
      attunement: {},
      derivedStats: calculateDerivedStats(stats, 0),
      weapons: timeline.weapons,
      statPriority: [],
      attunementPriority: [],
      innerWayPriority: [],
      setupComparisons: {},
    });
    const close = (actual, expected, message) =>
      assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
    const bursts = (rows) => rows.filter((row) => row.step.skill === "PiercingDamage");
    const criticalStats = { ...stats, crit: 0.4, critDmgBonus: 0.5 };
    const criticalBaseline = (tier) =>
      calculateRotationBaseline({
        ...bundleFor(inputFor(tier)),
        stats: criticalStats,
        derivedStats: calculateDerivedStats(criticalStats, 0),
      });
    const tier4Critical = criticalBaseline(4);
    for (const tier of [5, 6]) {
      const result = criticalBaseline(tier);
      for (const before of tier4Critical.metrics.breakdown.skills) {
        const after = result.metrics.breakdown.skills.find((skill) => skill.id === before.id);
        close(
          after.damage / before.damage,
          (1 + 0.4 * 0.535) / (1 + 0.4 * 0.5),
          `T${tier} critical scaling applies to ${before.id}`,
        );
      }
    }
    const burstDamage = (tier) =>
      calculateRotationBaseline(bundleFor(inputFor(tier, Array(5).fill(0)))).metrics.breakdown.skills.find(
        (skill) => skill.id === "PiercingDamage",
      ).damage;
    const originalTrigger = JSON.stringify(way.effect.FivefoldBleedT0.trigger);
    for (const tier of [0, 1, 2, 3, 4, 5, 6, 0]) {
      const input = inputFor(tier);
      const probability = tier >= 4 ? 0.15 : 0.1;
      const result = calculateRotationBaseline(bundleFor(input));
      close(
        result.metrics.breakdown.skills.find((skill) => skill.id === "WeepingBlood").hits,
        4 * probability,
        `T${tier} expected chance`,
      );
      const simulated = calculateSimulatedRotationRun(bundleFor(input), () => 0.125);
      assert.equal(
        simulated.resolvedSequence.filter(({ entry }) => entry.context.isDot).length,
        tier >= 4 ? 4 : 0,
        `T${tier} uses the same conditional chance in simulation`,
      );
      assert.equal(
        buildRotationTimeline(input, () => probability).filter((row) => row.kind === "dot").length,
        0,
        `T${tier} exact chance boundary fails`,
      );
      assert.equal(
        buildRotationTimeline(input, () => probability - 0.0001).filter((row) => row.kind === "dot").length,
        4,
        `T${tier} roll just below the chance succeeds`,
      );
    }
    assert.equal(
      JSON.stringify(way.effect.FivefoldBleedT0.trigger),
      originalTrigger,
      "Chance resolution must not mutate the shared trigger definition",
    );
    close(burstDamage(1), burstDamage(0) * 2, "T1 doubles burst base damage");
    close(burstDamage(2), 262.3 * 0.1 ** 5, "T2 adds 62.3 Max Physical through the shared stat pipeline");
    const natural = calculateRotationBaseline(bundleFor(inputFor(3)));
    close(
      natural.metrics.breakdown.skills.find((skill) => skill.id === "PiercingDamage").damage,
      262.3 * 0.1 * 0.2,
      "T3 weights natural expiration and its chance separately",
    );
    close(bursts(natural.timeline)[0].startTime, 5, "Expiration fires without a later attack");
    let rollIndex = 0;
    const rolled = calculateSimulatedRotationRun(bundleFor(inputFor(3)), () => (++rollIndex <= 2 ? 0 : 0.5));
    close(
      rolled.resolvedSequence.find(({ entry }) => entry.context.skillTags.includes("PiercingDamage")).breakdown.total,
      262.3,
      "Expiration burst receives T1 and T2 in simulations",
    );

    const manual = (...actions) => {
      const input = inputFor(3);
      input.innerWayRules = input.innerWayRules.filter((rule) => !rule.trigger);
      input.skills.Hits.action = actions;
      return input;
    };
    const apply = (time, stack = 1) => ({ type: "apply", target: "target", value: "WeepingBlood", time, stack });
    assert.equal(
      bursts(buildRotationTimeline(manual(apply(0, 3)), () => 0.19)).length,
      1,
      "One roll per expiration, not per stack",
    );
    assert.equal(bursts(buildRotationTimeline(manual(apply(0, 3)), () => 0.2)).length, 0, "The 20% boundary fails");
    assert.deepEqual(
      bursts(buildRotationTimeline(manual(apply(0), apply(1.51)), () => 0)).map((row) => row.startTime),
      [6.51],
      "Refresh invalidates the old expiration",
    );
    assert.equal(
      bursts(buildRotationTimeline(manual(apply(0), apply(0), apply(0)), () => 0)).length,
      1,
      "Identical expiry timestamps do not duplicate rolls",
    );
    assert.equal(
      bursts(
        buildRotationTimeline(
          manual(apply(0), { type: "consume", target: "target", value: "WeepingBlood", stack: "all", time: 2 }),
          () => 0,
        ),
      ).length,
      0,
      "Removal does not trigger expiration",
    );
    assert.deepEqual(
      bursts(buildRotationTimeline(manual(apply(0, 5)), () => 0)).map((row) => row.startTime),
      [0],
      "Five-stack consumption produces no extra expiration burst",
    );
    assert.deepEqual(
      bursts(buildRotationTimeline(manual(apply(0), apply(5)), () => 0)).map((row) => row.startTime),
      [5, 10],
      "A new application at the expiry boundary cannot erase natural expiration",
    );
    const boundaryExpected = bursts(buildRotationTimeline(inputFor(3, [0, 5])));
    close(
      boundaryExpected
        .filter((row) => row.startTime === 5)
        .reduce((sum, row) => sum + row.actions[0].hitProbability, 0),
      0.02,
      "Expected expiration survives a same-time direct hit",
    );

    const times = [0, 0.3, 0.6, 0.9, 1.2, 1.5];
    const input = inputFor(3, times);
    const oracle = new Map();
    for (let mask = 0; mask < 64; mask++) {
      let index = 0;
      let probability = 1;
      const rows = buildRotationTimeline(input, (key) => {
        if (key.includes(":trigger:PiercingDamage")) return 0;
        const success = Boolean(mask & (1 << index++));
        probability *= success ? 0.1 : 0.9;
        return success ? 0 : 0.99;
      });
      for (const row of bursts(rows)) {
        const key = Math.round(row.startTime * 10000);
        oracle.set(key, (oracle.get(key) ?? 0) + probability * (row.startTime >= 5 ? 0.2 : 1));
      }
    }
    const expected = new Map();
    for (const row of bursts(buildRotationTimeline(input))) {
      const key = Math.round(row.startTime * 10000);
      expected.set(key, (expected.get(key) ?? 0) + row.actions[0].hitProbability);
    }
    assert.equal(expected.size, oracle.size);
    for (const [time, probability] of oracle)
      close(expected.get(time), probability, "Exhaustive expiration and threshold probabilities");
  });
});
