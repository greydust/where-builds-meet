import { describe, it } from "vitest";
import assert from "node:assert/strict";

// Ported from script/probe/check-fivefold-bleed-loops.mjs.
describe("fivefold-bleed-loops", () => {
  it("fivefold-bleed-loops checks", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { innerWayDefinitionForSoloLevel } = await import("../src/data/innerWayDefinitions.ts");
    const way = innerWayDefinitionForSoloLevel((await import("../data/innerway/fivefold-bleed.json")).default, 17);
    const dots = (await import("../data/dot/innerway.json")).default;
    const { PiercingDamage } = (await import("../data/skill/general.json")).default;
    const rules = (tier) =>
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
    const inputFor = (times, end = 12, tier = 6) => ({
      rotation: {
        name: "Feedback",
        steps: [
          { type: "skill", skill: "Hits" },
          ...(end === undefined ? [] : [{ type: "event", event: "BattleEnd", startTime: end }]),
        ],
      },
      skills: {
        PiercingDamage,
        Hits: {
          name: "Hits",
          castTime: 30,
          tags: ["DirectDamage"],
          action: times.map((time) => ({ type: "damage", phyCoef: 1, time })),
        },
      },
      dots,
      effectDefinitions: dots,
      eventDefinitions: { BattleEnd: { name: "Battle End", action: [], tags: ["Event"] } },
      innerWayRules: rules(tier),
      innerWayConditions: Array.from({ length: tier + 1 }, (_, index) => `FivefoldBleedT${index}`),
      setupEffects: [],
      weapons: ["panaceaFan", "soulshadeUmbrella"],
    });
    const tickRows = (rows) => rows.filter((row) => row.kind === "dot");
    const bursts = (rows) => rows.filter((row) => row.step.skill === "PiercingDamage");
    const close = (actual, expected, message) =>
      assert.ok(Math.abs(actual - expected) < 1e-8, `${message}: ${actual} != ${expected}`);
    const input = inputFor(Array(5).fill(0));
    const allSuccess = buildRotationTimeline(input, () => 0);
    assert.deepEqual(
      bursts(allSuccess).map((row) => row.startTime),
      [0, 5, 10],
    );
    assert.ok(
      tickRows(allSuccess).every(
        (row) =>
          row.actions[0].damageScale === 1 &&
          row.actionStates[0].debuffs.find((effect) => effect.name === "WeepingBlood")?.stack ===
            (row.startTime < 5 ? 2 : 1),
      ),
      "Only the threshold burst gets a T6 stack; every burst retains the independent Direct Damage roll",
    );
    const failPiercingApplication = (key) =>
      key.includes(":PiercingDamage:") && key.includes(":innerWay:WeepingBlood:") ? 0.99 : 0;
    const onlyGuaranteed = buildRotationTimeline(input, failPiercingApplication);
    assert.ok(
      tickRows(onlyGuaranteed).every((row) => row.actions[0].damageScale === 1),
      "Failed optional rolls retain the guaranteed T6 stack",
    );
    assert.deepEqual(
      bursts(onlyGuaranteed).map((row) => row.startTime),
      [0, 5],
    );
    assert.ok(
      tickRows(onlyGuaranteed).every((row) => row.startTime < 5),
      "An expiration burst with a failed Direct Damage roll does not reapply a T6 stack",
    );
    const expirationOnly = buildRotationTimeline(inputFor([0]), failPiercingApplication);
    assert.deepEqual(
      bursts(expirationOnly).map((row) => row.startTime),
      [5],
    );
    assert.ok(
      tickRows(expirationOnly).every((row) => row.startTime < 5),
      "T6 does not guarantee a stack on an initial natural-expiration burst either",
    );
    assert.ok(
      bursts(onlyGuaranteed).every((row) => !row.debuffs.some((effect) => effect.name === "WeepingBlood")),
      "The burst deals damage before applying its new stack",
    );
    const tier5 = buildRotationTimeline(inputFor(Array(5).fill(0), 12, 5), () => 0);
    assert.ok(
      tickRows(tier5).every((row) => row.actions[0].damageScale === 1),
      "Piercing Damage has its Direct Damage proc even below T6",
    );
    assert.ok(
      allSuccess.every((row) => row.startTime <= 12),
      "Feedback cannot pass Battle End",
    );

    const noEnd = inputFor([0]);
    noEnd.rotation.steps = [{ type: "skill", skill: "Hits" }];
    const bounded = buildRotationTimeline(noEnd, () => 0);
    assert.deepEqual(
      bursts(bounded).map((row) => row.startTime),
      [5, 10, 15, 20, 25, 30],
      "Without Battle End, feedback runs through final cast completion but not afterward",
    );
    assert.ok(tickRows(bounded).every((row) => row.startTime <= 30));
    const dummy = inputFor([0, 14]);
    dummy.rotation.steps = [
      { type: "skill", skill: "Hits" },
      { type: "event", event: "Delay", duration: 50 },
    ];
    dummy.rotation.dummyAttack = true;
    dummy.eventDefinitions.Delay = { name: "Delay", action: [], tags: ["Event"] };
    const dummyRows = buildRotationTimeline(dummy);
    assert.deepEqual(
      dummyRows.filter((row) => row.step.automatic === "dummyAttack").map((row) => row.startTime),
      Array.from({ length: 13 }, (_, i) => 5.5 + i * 6).flatMap((time) => [time, time]),
      "Dummy attacks continue through the explicit trailing Delay, stopping at ordered completion",
    );

    // Explore the concrete random decision tree, including decisions caused by
    // earlier procs. This independently checks correlation and expiration renewal.
    const verifyProbabilityHistories = (input) => {
      const oracle = new Map();
      const explore = (decisions, mass) => {
        let index = 0;
        let rows;
        try {
          rows = buildRotationTimeline(input, (key) => {
            if (index === decisions.length)
              throw { decisionChance: key.includes(":trigger:PiercingDamage") ? 0.2 : 0.15 };
            return decisions[index++] ? 0 : 0.99;
          });
        } catch (error) {
          if (error.decisionChance === undefined) throw error;
          explore([...decisions, false], mass * (1 - error.decisionChance));
          explore([...decisions, true], mass * error.decisionChance);
          return;
        }
        for (const row of rows) {
          if (row.kind !== "dot" && row.step.skill !== "PiercingDamage") continue;
          const key = `${row.step.skill}:${Math.round(row.startTime * 10000)}`;
          const entry = oracle.get(key) ?? { hits: 0, damage: 0 };
          entry.hits += mass;
          entry.damage += mass * Number(row.actions[0].damageScale ?? 1);
          oracle.set(key, entry);
        }
      };
      explore([], 1);
      const expected = new Map();
      const exactDots = structuredClone(input.dots);
      delete exactDots.WeepingBlood.periodic.expectedTickAlignment;
      for (const row of buildRotationTimeline({ ...input, dots: exactDots, effectDefinitions: exactDots })) {
        if (row.kind !== "dot" && row.step.skill !== "PiercingDamage") continue;
        const key = `${row.step.skill}:${Math.round(row.startTime * 10000)}`;
        const entry = expected.get(key) ?? { hits: 0, damage: 0 };
        entry.hits += row.actions[0].hitProbability;
        entry.damage += row.actions[0].damageScale;
        expected.set(key, entry);
      }
      assert.equal(expected.size, oracle.size);
      for (const [key, result] of oracle) {
        close(expected.get(key).hits, result.hits, `${key} correlated hit probability`);
        close(expected.get(key).damage, result.damage, `${key} correlated tick damage`);
      }
      const gridBursts = new Map();
      for (const row of bursts(buildRotationTimeline(input))) {
        const key = `${row.step.skill}:${Math.round(row.startTime * 10000)}`;
        gridBursts.set(key, (gridBursts.get(key) ?? 0) + row.actions[0].damageScale);
      }
      const oracleBursts = [...oracle].filter(([key]) => key.startsWith("PiercingDamage:"));
      assert.equal(gridBursts.size, oracleBursts.length);
      for (const [key, result] of oracleBursts)
        close(gridBursts.get(key), result.damage, `${key} battle-grid burst probability remains exact`);
    };
    verifyProbabilityHistories(input);
    verifyProbabilityHistories(inputFor([0, 4, 5, 6], 12));
  });
});
