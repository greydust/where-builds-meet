import { describe, it } from "vitest";
import assert from "node:assert/strict";

// Ported from script/probe/check-fivefold-bleed-grid.mjs.
describe("fivefold-bleed-grid", () => {
  it("Battle-grid probabilities, boundaries, fight anchor, bounded row count, and unchanged sampled timing verified", async () => {
    const { buildRotationTimeline } = await import("../src/calculations/rotationTimeline.ts");
    const { ExpectedPeriodicTracker } = await import("../src/calculations/outcomeTriggeredBuffs.ts");
    const dots = (await import("../data/dot/innerway.json")).default;
    const { innerWayDefinitionForSoloLevel } = await import("../src/data/innerWayDefinitions.ts");
    const way = innerWayDefinitionForSoloLevel((await import("../data/innerway/fivefold-bleed.json")).default, 17);
    const { PiercingDamage } = (await import("../data/skill/general.json")).default;
    const rules = (tier) =>
      Object.values(way.effect)
        .slice(0, tier + 1)
        .flatMap((definition, index) =>
          (definition.effect ?? [])
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
            ),
        );
    const inputFor = (times, end = 11, tier = 0) => ({
      rotation: {
        name: "Battle grid",
        eventTimeReference: "battleStart",
        steps: [
          { type: "skill", skill: "Hits" },
          { type: "event", event: "BattleEnd", startTime: end },
        ],
      },
      skills: {
        PiercingDamage,
        Hits: {
          name: "Hits",
          castTime: end,
          tags: ["DirectDamage"],
          action: times.map((time) => ({ type: "damage", phyCoef: 1, time })),
        },
      },
      dots,
      effectDefinitions: dots,
      eventDefinitions: { BattleEnd: { name: "Battle End", action: [] } },
      innerWayRules: rules(tier),
      innerWayConditions: Object.keys(way.effect).slice(0, tier + 1),
      setupEffects: [],
      weapons: [],
    });
    const ticks = (rows) => rows.filter((row) => row.kind === "dot");
    const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);
    const shared = new ExpectedPeriodicTracker(1, 1.01, 0);
    shared.apply(0.2, 0.4, 5, 5, 1, "first");
    shared.apply(1, 0.5, 5, 5, 1, "boundary");
    close(shared.tickAt(1).probability, 0.4);
    close(shared.tickAt(1).sources.first, 0.2);
    close(shared.tickAt(1).sources.boundary, 0.2);
    close(shared.tickAt(2).probability, 0.7);
    close(shared.nextTick(1, true), 1);
    shared.consumeTick(1);
    close(shared.tickAt(1).probability, 0);
    close(shared.nextTick(1, true), 2);
    close(shared.tickAt(2).probability, 0.7);
    // Restart after an idle gap, at a boundary: no immediate tick or expired mass.
    shared.apply(10, 1, 5, 5, 1, "restart");
    close(shared.tickAt(10).probability, 0);
    close(shared.nextTick(10, true), 11);
    close(shared.tickAt(11).probability, 1);
    close(shared.tickAt(15).probability, 0);
    const exactInput = (input) => {
      const exactDots = structuredClone(input.dots);
      delete exactDots.WeepingBlood.periodic.expectedTickAlignment;
      return { ...input, dots: exactDots, effectDefinitions: exactDots };
    };

    // With fewer than five applications there is no threshold consumption. At a
    // grid boundary, active probability is the chance of any success in the last 5s.
    const hits = [0.2, 1.4, 4.75, 5.2];
    const input = inputFor(hits);
    const expected = ticks(buildRotationTimeline(input));
    assert.deepEqual(
      expected.map((row) => row.startTime),
      Array.from({ length: 10 }, (_, i) => i + 1),
    );
    for (const row of expected) {
      const count = hits.filter((time) => time < row.startTime && time + 5 > row.startTime).length;
      close(row.actions[0].damageScale, 1 - 0.9 ** count);
      close(row.actions[0].hitProbability, row.actions[0].damageScale);
    }
    const boundary = ticks(buildRotationTimeline(inputFor([1], 7)));
    assert.deepEqual(
      boundary.map((row) => row.startTime),
      [2, 3, 4, 5],
      "New applications wait for the next boundary; expiration never ticks",
    );
    assert.deepEqual(
      ticks(buildRotationTimeline(inputFor([0.2], 3))).map((row) => row.startTime),
      [1, 2],
      "Battle End excludes its timestamp",
    );

    const anchored = inputFor(hits);
    anchored.rotation.steps.unshift({ type: "skill", skill: "Prep" });
    anchored.skills.Prep = { name: "Prep", castTime: 0.37, action: [] };
    anchored.rotation.start = { step: 1 };
    const anchoredTicks = ticks(buildRotationTimeline(anchored));
    assert.equal(anchoredTicks.length, expected.length);
    anchoredTicks.forEach((row, i) => {
      close(row.startTime, expected[i].startTime + 0.37);
      close(row.actions[0].damageScale, expected[i].actions[0].damageScale);
    });

    const project = (rows) =>
      rows.map((row) => ({
        kind: row.kind,
        skill: row.step.skill,
        time: row.startTime,
        actions: row.actions,
        resources: row.resources,
      }));
    for (const end of [true, false]) {
      const sampled = inputFor([0.2, 0.4, 0.6, 0.8, 1.1, 5.2], 12, 6);
      if (!end) sampled.rotation.steps.pop();
      for (const roll of [() => 0, () => 0.99, (key) => (key.includes(":PiercingDamage:") ? 0.99 : 0)])
        assert.deepEqual(
          project(buildRotationTimeline(sampled, roll)),
          project(buildRotationTimeline(exactInput(sampled), roll)),
          "Simulation and inferred cutoff ignore grid metadata",
        );
    }
    const dense = inputFor(
      Array.from({ length: 200 }, (_, i) => i * 0.137),
      33,
      6,
    );
    const tickAt = ExpectedPeriodicTracker.prototype.tickAt;
    const checkedTimes = new WeakMap();
    let denseRows;
    try {
      ExpectedPeriodicTracker.prototype.tickAt = function (time) {
        const seen = checkedTimes.get(this) ?? new Set();
        assert.ok(!seen.has(time), "Off-grid applications retain one pending check per global tick");
        seen.add(time);
        checkedTimes.set(this, seen);
        return tickAt.call(this, time);
      };
      denseRows = buildRotationTimeline(dense);
    } finally {
      ExpectedPeriodicTracker.prototype.tickAt = tickAt;
    }
    assert.ok(!denseRows.some((row) => row.expectedExpiration), "Expiration checks are internal, not timeline rows");
    const denseTicks = ticks(denseRows);
    assert.ok(denseTicks.length <= 32, "DOT entries grow with battle seconds, not attack histories");
    assert.equal(
      new Set(denseTicks.map((row) => row.startTime)).size,
      denseTicks.length,
      "At most one Weeping Blood row per grid boundary",
    );
    assert.ok(denseTicks.every((row) => Number.isInteger(row.startTime) && row.actions[0].damageScale <= 1 + 1e-9));
    const removed = inputFor([0.2], 11, 3);
    removed.skills.Hits.action.push({
      type: "consume",
      target: "target",
      value: "WeepingBlood",
      stack: "all",
      time: 1.5,
    });
    const removedRows = buildRotationTimeline(removed);
    assert.deepEqual(
      ticks(removedRows).map((row) => row.startTime),
      [1],
    );
    assert.ok(
      !removedRows.some((row) => row.step.skill === "PiercingDamage"),
      "Stale expiration wakeups cannot burst after removal",
    );
  });
});
